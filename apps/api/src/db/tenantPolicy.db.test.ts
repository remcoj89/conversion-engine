import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import { createApiRuntimeDb, createMaintenanceDb, createTestDb } from "../db.js";
import { POSTGRES_ROLE_NAMES } from "../dev/postgresRoleContract.js";
import { runWithDatabaseContext, type DatabaseRequestContext } from "./requestContext.js";

// tenants_select_access after migration 0041, evaluated by the real runtime and maintenance
// connections without the test bypass. Only fixtures use the bypass test connection.

const TEST_DATABASE = "conversion_engine_test";
const tenantA = randomUUID();
const tenantB = randomUUID();
const inactiveTenant = randomUUID();
const websiteA = randomUUID();
const websiteInactiveTenant = randomUUID();
const keyA = `site_${randomUUID().replaceAll("-", "")}`;
const keyInactiveTenant = `site_${randomUUID().replaceAll("-", "")}`;
const customerUser = randomUUID();
const customerSubject = `tenant-policy-customer-${randomUUID()}`;
const adminUser = randomUUID();
const adminSubject = `tenant-policy-admin-${randomUUID()}`;
const fixtureTenants = [tenantA, tenantB, inactiveTenant];

let runtime: Awaited<ReturnType<typeof createApiRuntimeDb>>;
let maintenance: Awaited<ReturnType<typeof createMaintenanceDb>>;
let fixturePool: ReturnType<typeof createTestDb>["pool"];
let fixtureClient: PoolClient;

function requiredDatabaseTestUrl(): string {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  return databaseUrl;
}

async function visibleFixtureTenants(db: typeof runtime.db, context: DatabaseRequestContext): Promise<string[]> {
  const result = await runWithDatabaseContext(context, async () =>
    await db.execute(sql`select id::text as id from tenants where id = any(${`{${fixtureTenants.join(",")}}`}::uuid[]) order by id`),
  );
  return result.rows.map((row) => String(row.id));
}

const sorted = (ids: string[]) => [...ids].sort();

before(async () => {
  const databaseUrl = requiredDatabaseTestUrl();
  const env = { ...process.env, EXPECTED_API_DATABASE: TEST_DATABASE };
  runtime = await createApiRuntimeDb(databaseUrl, env);
  const maintenanceUrl = new URL(databaseUrl);
  maintenanceUrl.username = POSTGRES_ROLE_NAMES.maintenance;
  maintenanceUrl.password = process.env.CE_MAINTENANCE_PASSWORD?.trim() ?? "";
  maintenance = await createMaintenanceDb(maintenanceUrl.toString(), env);

  fixturePool = createTestDb(databaseUrl).pool;
  fixtureClient = await fixturePool.connect();
  await fixtureClient.query(
    `insert into tenants (id, name, status) values ($1, 'Policy A', 'active'), ($2, 'Policy B', 'active'), ($3, 'Policy inactive', 'disabled')`,
    [tenantA, tenantB, inactiveTenant],
  );
  await fixtureClient.query(
    `insert into websites (id, tenant_id, public_key, status) values ($1, $2, $3, 'active'), ($4, $5, $6, 'active')`,
    [websiteA, tenantA, keyA, websiteInactiveTenant, inactiveTenant, keyInactiveTenant],
  );
  await fixtureClient.query(
    `insert into users (id, auth_provider_user_id) values ($1, $2), ($3, $4)`,
    [customerUser, customerSubject, adminUser, adminSubject],
  );
  await fixtureClient.query(
    `insert into memberships (tenant_id, user_id, role, status) values ($1, $2, 'owner', 'active')`,
    [tenantA, customerUser],
  );
  await fixtureClient.query(
    `insert into platform_admin_assignments (user_id, permission, status, granted_by) values ($1, 'platform_admin', 'active', $1)`,
    [adminUser],
  );
});

after(async () => {
  const cleanupClient = await maintenance.pool.connect();
  try {
    await cleanupClient.query("begin");
    await runWithDatabaseContext({ scope: "maintenance" }, async () => {
      await cleanupClient.query("delete from platform_admin_assignments where user_id = $1", [adminUser]);
      await cleanupClient.query("delete from memberships where tenant_id = any($1::uuid[])", [fixtureTenants]);
      await cleanupClient.query("delete from websites where id = any($1::uuid[])", [[websiteA, websiteInactiveTenant]]);
      await cleanupClient.query("delete from users where id = any($1::uuid[])", [[customerUser, adminUser]]);
      await cleanupClient.query("delete from tenants where id = any($1::uuid[])", [fixtureTenants]);
    });
    await cleanupClient.query("commit");
  } finally {
    await cleanupClient.query("rollback").catch(() => undefined);
    cleanupClient.release();
    fixtureClient.release();
    await fixturePool.end();
    await runtime.pool.end();
    await maintenance.pool.end();
  }
});

test("public: een actieve website-key toont alleen de eigen actieve tenant, ook tijdens de lookup", async () => {
  assert.deepEqual(await visibleFixtureTenants(runtime.db, { scope: "public", websitePublicKey: keyA }), [tenantA]);
  assert.deepEqual(
    await visibleFixtureTenants(runtime.db, { scope: "public", websitePublicKey: keyA, tenantId: tenantA }),
    [tenantA],
  );
});

test("public: een website van een inactieve tenant of een onbekende key toont geen tenant", async () => {
  assert.deepEqual(await visibleFixtureTenants(runtime.db, { scope: "public", websitePublicKey: keyInactiveTenant }), []);
  assert.deepEqual(await visibleFixtureTenants(runtime.db, { scope: "public", websitePublicKey: `site_${randomUUID()}` }), []);
  assert.deepEqual(await visibleFixtureTenants(runtime.db, { scope: "public" }), []);
});

test("customer: alleen de tenant uit de context; een andere tenant-ID geeft niets van A", async () => {
  assert.deepEqual(
    await visibleFixtureTenants(runtime.db, { scope: "customer", subject: customerSubject, tenantId: tenantA }),
    [tenantA],
  );
  assert.deepEqual(
    await visibleFixtureTenants(runtime.db, { scope: "customer", subject: customerSubject, tenantId: tenantB }),
    [tenantB],
  );
  // A website key in a customer context grants nothing extra.
  assert.deepEqual(
    await visibleFixtureTenants(runtime.db, { scope: "customer", subject: customerSubject, tenantId: tenantB, websitePublicKey: keyA }),
    [tenantB],
  );
});

test("platform-admin: alleen met een actieve assignment zichtbaar, zonder assignment niets", async () => {
  assert.deepEqual(
    await visibleFixtureTenants(runtime.db, { scope: "platform_admin", subject: adminSubject }),
    sorted(fixtureTenants),
  );
  assert.deepEqual(await visibleFixtureTenants(runtime.db, { scope: "platform_admin", subject: customerSubject }), []);
});

test("maintenance: alleen de echte ce_maintenance-sessie ziet tenants; de API-runtime met maintenance-scope niet", async () => {
  assert.deepEqual(await visibleFixtureTenants(runtime.db, { scope: "maintenance" }), []);
  assert.deepEqual(await visibleFixtureTenants(maintenance.db, { scope: "maintenance" }), sorted(fixtureTenants));
  // A public website key does not widen anything for the maintenance session.
  assert.deepEqual(await visibleFixtureTenants(maintenance.db, { scope: "public", websitePublicKey: keyA }), [tenantA]);
});
