import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { createMaintenanceDb } from "../db.js";
import * as schema from "../db/schema.js";
import { runWithDatabaseContext } from "../db/requestContext.js";
import { POSTGRES_ROLE_NAMES } from "./postgresRoleContract.js";
import { LOCAL_MAINTENANCE_FUNCTION_ALLOWLIST, RUNTIME_FUNCTION_ALLOWLISTS } from "./bootstrapLocalDatabaseRoles.js";
import { LOCAL_TENANT_NAME, drizzleProvisioningTx, provisionLocalUser } from "./localProvisioning.js";
import { drizzlePlatformAdminTx, provisionCurrentPlatformAdmin } from "./platformAdminProvisioning.js";
import { drizzleReviewerAssignmentTx, provisionReviewerAssignment } from "./reviewerAssignmentProvisioning.js";
import { drizzleReviewerAssignmentRevocationTx, revokeReviewerAssignment } from "./reviewerAssignmentRevocation.js";

// Every test runs as ce_maintenance through the real maintenance factory (no test mode, so
// ce_rls_test_bypass() is false) and ends with a forced rollback: nothing is committed.

type MaintenanceConnection = Awaited<ReturnType<typeof createMaintenanceDb>>;
type Db = MaintenanceConnection["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const TEST_DATABASE = "conversion_engine_test";
let maintenance: MaintenanceConnection;

class ForcedRollback extends Error {}

function maintenanceTestUrl(): string {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  const password = process.env.CE_MAINTENANCE_PASSWORD?.trim();
  assert.ok(password, "CE_MAINTENANCE_PASSWORD is required");
  const url = new URL(databaseUrl);
  url.username = POSTGRES_ROLE_NAMES.maintenance;
  url.password = password;
  return url.toString();
}

// Runs fn inside one maintenance transaction and always rolls it back.
async function inRolledBackMaintenanceTransaction(fn: (tx: Tx) => Promise<void>): Promise<void> {
  await assert.rejects(
    runWithDatabaseContext({ scope: "maintenance" }, () =>
      maintenance.db.transaction(async (tx) => {
        await fn(tx);
        throw new ForcedRollback("rollback");
      }),
    ),
    ForcedRollback,
  );
}

async function createUser(tx: Tx, subject: string): Promise<string> {
  return runWithDatabaseContext({ scope: "identity_only", subject }, async () => {
    const [user] = await tx.insert(schema.users).values({ authProviderUserId: subject }).returning({ id: schema.users.id });
    assert.ok(user);
    return user.id;
  });
}

async function createTenant(tx: Tx): Promise<string> {
  const [tenant] = await tx.insert(schema.tenants).values({ name: `Maintenance test ${randomUUID()}` }).returning({ id: schema.tenants.id });
  assert.ok(tenant);
  return tenant.id;
}

before(async () => {
  maintenance = await createMaintenanceDb(maintenanceTestUrl(), { ...process.env, EXPECTED_API_DATABASE: TEST_DATABASE });
});

after(async () => {
  await maintenance.pool.end();
});

test("maintenance-verbinding draait als ce_maintenance zonder test-bypass", async () => {
  const result = await runWithDatabaseContext({ scope: "maintenance" }, async () =>
    await maintenance.db.execute(sql`select current_user::text as role, ce_rls_test_bypass() as bypass`),
  );
  assert.deepEqual(result.rows[0], { role: "ce_maintenance", bypass: false });
});

test("tenants_select_access leest websites niet meer rechtstreeks; de helper is SECURITY DEFINER van ce_owner", async () => {
  const policy = await maintenance.db.execute(sql`
    select qual from pg_policies where schemaname = 'public' and tablename = 'tenants' and policyname = 'tenants_select_access'`);
  assert.equal(policy.rows.length, 1);
  assert.doesNotMatch(String(policy.rows[0].qual), /websites/);
  assert.match(String(policy.rows[0].qual), /ce_rls_public_website_tenant_allowed/);

  const helper = await maintenance.db.execute(sql`
    select pg_get_userbyid(p.proowner)::text as owner, p.prosecdef as secdef, p.proconfig::text as config,
           has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
           has_function_privilege('ce_api_runtime', p.oid, 'EXECUTE') as api_execute,
           has_function_privilege('ce_bff_runtime', p.oid, 'EXECUTE') as bff_execute
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'ce_rls_public_website_tenant_allowed'`);
  assert.deepEqual(helper.rows[0], {
    owner: "ce_owner",
    secdef: true,
    config: "{\"search_path=pg_catalog, public\"}",
    public_execute: false,
    api_execute: true,
    bff_execute: false,
  });
});

test("provision:local maakt als ce_maintenance user, tenant en owner-membership aan en rolt volledig terug", async () => {
  const subject = `maintenance-local-${randomUUID()}`;
  let tenantId: string | undefined;

  await inRolledBackMaintenanceTransaction(async (tx) => {
    const provisioningTx = { ...drizzleProvisioningTx(tx), findLatestActiveSessionSubject: async () => subject };
    const result = await provisionLocalUser((fn) => fn(provisioningTx));
    assert.equal(result.status, "provisioned");
    assert.equal(result.createdUser, true);
    tenantId = result.status === "provisioned" ? result.tenantId : undefined;
    assert.ok(tenantId);

    const [membership] = await tx
      .select({ role: schema.memberships.role, status: schema.memberships.status, name: schema.tenants.name })
      .from(schema.memberships)
      .innerJoin(schema.tenants, eq(schema.tenants.id, schema.memberships.tenantId))
      .where(eq(schema.memberships.tenantId, tenantId));
    assert.deepEqual(membership, { role: "owner", status: "active", name: LOCAL_TENANT_NAME });

    // Idempotent within the same transaction: the active membership is recognised.
    const again = await provisionLocalUser((fn) => fn(provisioningTx));
    assert.equal(again.status, "already_provisioned");
  });

  const remaining = await runWithDatabaseContext({ scope: "maintenance" }, async () =>
    await maintenance.db.execute(sql`select
      (select count(*)::int from tenants where id = ${tenantId}) as tenants,
      (select count(*)::int from users where auth_provider_user_id = ${subject}) as users`),
  );
  assert.deepEqual(remaining.rows[0], { tenants: 0, users: 0 });
});

test("provision:local: een fout na het aanmaken van de tenant laat niets achter", async () => {
  const subject = `maintenance-partial-${randomUUID()}`;
  let createdTenantId: string | undefined;

  await assert.rejects(
    runWithDatabaseContext({ scope: "maintenance" }, () =>
      maintenance.db.transaction(async (tx) => {
        const realTx = drizzleProvisioningTx(tx);
        await provisionLocalUser((fn) => fn({
          ...realTx,
          findLatestActiveSessionSubject: async () => subject,
          createTenant: async (name) => {
            createdTenantId = await realTx.createTenant(name);
            return createdTenantId;
          },
          createOwnerMembership: async () => {
            throw new Error("simulated membership failure");
          },
        }));
      }),
    ),
    /simulated membership failure/,
  );

  assert.ok(createdTenantId);
  const remaining = await runWithDatabaseContext({ scope: "maintenance" }, async () =>
    await maintenance.db.execute(sql`select
      (select count(*)::int from tenants where id = ${createdTenantId}) as tenants,
      (select count(*)::int from users where auth_provider_user_id = ${subject}) as users`),
  );
  assert.deepEqual(remaining.rows[0], { tenants: 0, users: 0 });
});

test("provision:platform-admin werkt als ce_maintenance, inclusief de row-lock op users", async () => {
  const subject = `maintenance-admin-${randomUUID()}`;

  await inRolledBackMaintenanceTransaction(async (tx) => {
    const userId = await createUser(tx, subject);
    const adminTx = { ...drizzlePlatformAdminTx(tx), findActiveSessionSubjects: async () => [subject] };

    assert.deepEqual(await provisionCurrentPlatformAdmin((fn) => fn(adminTx)), { status: "created" });
    assert.deepEqual(await provisionCurrentPlatformAdmin((fn) => fn(adminTx)), { status: "already_active" });

    const [assignment] = await tx
      .select({ status: schema.platformAdminAssignments.status, grantedBy: schema.platformAdminAssignments.grantedBy })
      .from(schema.platformAdminAssignments)
      .where(eq(schema.platformAdminAssignments.userId, userId));
    assert.deepEqual(assignment, { status: "active", grantedBy: userId });
  });
});

test("provision:reviewer en revoke:reviewer werken als ce_maintenance", async () => {
  await inRolledBackMaintenanceTransaction(async (tx) => {
    const tenantId = await createTenant(tx);
    const reviewerId = await createUser(tx, `maintenance-reviewer-${randomUUID()}`);
    const operatorId = await createUser(tx, `maintenance-operator-${randomUUID()}`);
    const provisionTx = drizzleReviewerAssignmentTx(tx);
    const revokeTx = drizzleReviewerAssignmentRevocationTx(tx);

    const input = { tenantId, reviewerId, grantedBy: operatorId };
    assert.deepEqual(await provisionReviewerAssignment((fn) => fn(provisionTx), input), { status: "created" });
    assert.deepEqual(await provisionReviewerAssignment((fn) => fn(provisionTx), input), { status: "already_active" });

    const revokeInput = { tenantId, reviewerId, revokedBy: operatorId };
    assert.deepEqual(await revokeReviewerAssignment((fn) => fn(revokeTx), revokeInput), { status: "revoked" });
    assert.deepEqual(await revokeReviewerAssignment((fn) => fn(revokeTx), revokeInput), { status: "already_revoked" });
    assert.deepEqual(await provisionReviewerAssignment((fn) => fn(provisionTx), input), { status: "reactivated" });

    const [assignment] = await tx
      .select({ status: schema.onboardingReviewerAssignments.status })
      .from(schema.onboardingReviewerAssignments)
      .where(and(
        eq(schema.onboardingReviewerAssignments.tenantId, tenantId),
        eq(schema.onboardingReviewerAssignments.userId, reviewerId),
      ));
    assert.deepEqual(assignment, { status: "active" });
  });
});

test("ce_maintenance heeft buiten de lokale CLI-grantset geen schrijfrechten op klant- of CRM-data", async () => {
  const result = await maintenance.db.execute(sql`
    select c.relname::text as table_name, p.privilege
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join unnest(array['INSERT', 'UPDATE']) as p(privilege)
    where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('ce_maintenance', c.oid, p.privilege)
    order by 1, 2`);
  assert.deepEqual(result.rows, [
    { table_name: "memberships", privilege: "INSERT" },
    { table_name: "onboarding_reviewer_assignments", privilege: "INSERT" },
    { table_name: "onboarding_reviewer_assignments", privilege: "UPDATE" },
    { table_name: "platform_admin_assignments", privilege: "INSERT" },
    { table_name: "platform_admin_assignments", privilege: "UPDATE" },
    { table_name: "tenants", privilege: "INSERT" },
    { table_name: "users", privilege: "INSERT" },
    { table_name: "users", privilege: "UPDATE" },
  ]);
});

test("functie-EXECUTE-rechten volgen exact de allowlists (plus de test-only helpers in de testdatabase)", async () => {
  const result = await maintenance.db.execute(sql`
    select r.role, p.proname::text as name, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join unnest(array['ce_api_runtime', 'ce_bff_runtime', 'ce_maintenance']) as r(role)
    where n.nspname = 'public' and has_function_privilege(r.role, p.oid, 'EXECUTE')
    order by 1, 2`);
  const granted = (role: string) => new Set(
    result.rows.filter((row) => row.role === role).map((row) => `${String(row.name)}(${String(row.args)})`),
  );

  const testOnlyApi = ["ce_test_add_forced_failure(target_table text)"];
  assert.deepEqual(
    [...granted("ce_api_runtime")].sort(),
    [...RUNTIME_FUNCTION_ALLOWLISTS.api.map(withArgumentNames), ...testOnlyApi].sort(),
  );
  assert.deepEqual([...granted("ce_bff_runtime")], []);

  const maintenanceGranted = granted("ce_maintenance");
  for (const signature of LOCAL_MAINTENANCE_FUNCTION_ALLOWLIST.map(withArgumentNames)) {
    assert.ok(maintenanceGranted.has(signature), `ce_maintenance misses ${signature}`);
  }
  // Extra maintenance helpers exist only through the test-only fixture-cleanup grants.
  const testOnlyMaintenance = new Set([
    "ce_rls_public_tenant_active(target_tenant_id uuid)",
    "ce_rls_website_public_key()",
    "ce_rls_crm_scope_allowed(target_tenant_id uuid)",
    "ce_rls_public_website_allowed(target_tenant_id uuid)",
    "ce_rls_public_contact_email()",
    "ce_rls_customer_can_read_lead(target_tenant_id uuid, target_lead_id uuid)",
    "ce_rls_public_lead_allowed(target_tenant_id uuid, target_lead_id uuid)",
    "ce_rls_public_website_id_allowed(target_website_id uuid)",
  ]);
  const allowedMaintenance = new Set([...LOCAL_MAINTENANCE_FUNCTION_ALLOWLIST.map(withArgumentNames), ...testOnlyMaintenance]);
  assert.deepEqual([...maintenanceGranted].filter((signature) => !allowedMaintenance.has(signature)), []);
});

// pg_get_function_identity_arguments includes argument names; the allowlists use types only.
function withArgumentNames(signature: string): string {
  return signature
    .replace("ce_rls_tenant_allowed(uuid)", "ce_rls_tenant_allowed(target_tenant_id uuid)")
    .replace("ce_rls_lead_scope_allowed(uuid)", "ce_rls_lead_scope_allowed(target_tenant_id uuid)")
    .replace("ce_rls_customer_can_read_lead(uuid, uuid)", "ce_rls_customer_can_read_lead(target_tenant_id uuid, target_lead_id uuid)")
    .replace("ce_rls_crm_scope_allowed(uuid)", "ce_rls_crm_scope_allowed(target_tenant_id uuid)")
    .replace("ce_rls_team_member_crm_permission_allowed(uuid, uuid)", "ce_rls_team_member_crm_permission_allowed(target_tenant_id uuid, target_user_id uuid)")
    .replace("ce_rls_team_member_crm_permission_manage_allowed(uuid)", "ce_rls_team_member_crm_permission_manage_allowed(target_tenant_id uuid)")
    .replace("ce_rls_public_website_allowed(uuid)", "ce_rls_public_website_allowed(target_tenant_id uuid)")
    .replace("ce_rls_public_website_id_allowed(uuid)", "ce_rls_public_website_id_allowed(target_website_id uuid)")
    .replace("ce_rls_public_tenant_active(uuid)", "ce_rls_public_tenant_active(target_tenant_id uuid)")
    .replace("ce_rls_public_lead_allowed(uuid, uuid)", "ce_rls_public_lead_allowed(target_tenant_id uuid, target_lead_id uuid)")
    .replace("ce_rls_public_website_tenant_allowed(uuid)", "ce_rls_public_website_tenant_allowed(target_tenant_id uuid)");
}
