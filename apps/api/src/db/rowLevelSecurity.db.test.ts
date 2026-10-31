import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTestDb, createTestObserverDb } from "../db.js";
import { runWithDatabaseContext } from "./requestContext.js";

const EXPLICIT_TEST_RLS_MIGRATION = readFileSync(
  new URL("../../drizzle/0028_explicit_test_rls_mode.sql", import.meta.url),
  "utf8",
);

const RLS_TABLES = [
  "tenants",
  "users",
  "memberships",
  "team_member_crm_permissions",
  "tenant_owner_invitations",
  "websites",
  "organizations",
  "contacts",
  "leads",
  "lead_assignments",
  "onboarding_projects",
  "onboarding_versions",
  "onboarding_reviewer_assignments",
  "platform_admin_assignments",
  "onboarding_audit_events",
  "onboarding_review_requests",
  "onboarding_review_actions",
  "onboarding_review_access_events",
] as const;

test("tenant RLS is forced on every tenant-bound table", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  const { pool } = createTestDb(databaseUrl);

  try {
    const result = await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1::text[])
        order by c.relname`,
      [RLS_TABLES],
    );

    assert.deepEqual(result.rows.map((row) => row.relname), [...RLS_TABLES].sort());
    assert.ok(result.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity));
  } finally {
    await pool.end();
  }
});

test("database context is applied to standalone pooled queries", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  const { pool } = createTestDb(databaseUrl);

  try {
    await runWithDatabaseContext(
      { scope: "customer", subject: "standalone-subject", tenantId: randomUUID() },
      async () => {
        const result = await pool.query<{ scope: string; subject: string }>(
          "select current_setting('app.rls_scope') as scope, current_setting('app.rls_subject') as subject",
        );
        assert.deepEqual(result.rows[0], { scope: "customer", subject: "standalone-subject" });
      },
    );
  } finally {
    await pool.end();
  }
});

test("test-only user write policy is absent from development and present in test", async () => {
  const testDatabaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(testDatabaseUrl, "DATABASE_TEST_URL is required");
  const developmentDatabaseUrl = process.env.DATABASE_URL;
  const testDatabase = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
  assert.equal(testDatabase, "conversion_engine_test");
  assert.ok(developmentDatabaseUrl, "DATABASE_URL is required");
  const developmentDatabase = new URL(developmentDatabaseUrl).pathname.replace(/^\//, "");
  assert.notEqual(
    developmentDatabase,
    testDatabase,
    "DATABASE_URL and DATABASE_TEST_URL must target different databases",
  );

  const testPool = createTestDb(testDatabaseUrl).pool;
  try {
    const testPolicy = await testPool.query<{ policyName: string | null }>(
      `select policyname as "policyName"
         from pg_policies
        where schemaname = 'public'
          and tablename = 'users'
          and policyname = 'users_privileged_write'`,
    );
    assert.deepEqual(testPolicy.rows.map((row) => row.policyName), ["users_privileged_write"]);

    const observerUrl = new URL(testDatabaseUrl);
    observerUrl.searchParams.delete("options");
    const observerPool = createTestObserverDb(observerUrl.toString()).pool;
    try {
      const testMode = await observerPool.query<{
        mode: string | null;
        bypass: boolean;
        policy: boolean;
      }>(
        `select
           current_setting('app.rls_test_mode', true) as mode,
           ce_rls_test_bypass() as bypass,
           exists (
             select 1
             from pg_policies
             where schemaname = 'public'
               and tablename = 'users'
               and policyname = 'users_privileged_write'
           ) as policy`,
      );
      assert.deepEqual(testMode.rows[0], { mode: null, bypass: false, policy: true });
    } finally {
      await observerPool.end();
    }
  } finally {
    await testPool.end();
  }

  const developmentPool = createTestObserverDb(developmentDatabaseUrl).pool;
  try {
    const developmentPolicy = await developmentPool.query<{ policyName: string | null }>(
      `select policyname as "policyName"
         from pg_policies
        where schemaname = 'public'
          and tablename = 'users'
          and policyname = 'users_privileged_write'`,
    );
    assert.deepEqual(developmentPolicy.rows, []);
  } finally {
    await developmentPool.end();
  }
});

test("normal migration removes the test policy and explicit test mode recreates it", async () => {
  const testDatabaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(testDatabaseUrl, "DATABASE_TEST_URL is required");
  const migratorDatabaseUrl = process.env.MIGRATOR_DATABASE_TEST_URL;
  assert.ok(migratorDatabaseUrl, "MIGRATOR_DATABASE_TEST_URL is required");
  const configuredMigratorDatabaseUrl = migratorDatabaseUrl;

  const configuredMigrator = new URL(configuredMigratorDatabaseUrl);
  const configuredTestDatabase = new URL(testDatabaseUrl);
  assert.equal(decodeURIComponent(configuredMigrator.username), "ce_migrator");
  assert.equal(configuredMigrator.pathname, configuredTestDatabase.pathname);

  async function runMigration(mode: "off" | "on"): Promise<boolean> {
    // The migration fixture is intentionally write-capable, but remains locked
    // to the explicit test database and approved test role by createTestDb.
    const { pool } = createTestDb(configuredMigratorDatabaseUrl);
    const client = await pool.connect();

    try {
      await client.query("begin");
      await client.query("select set_config('app.rls_test_mode', $1, true)", [mode]);
      await client.query(EXPLICIT_TEST_RLS_MIGRATION);
      const result = await client.query<{ policy: boolean }>(
        `select exists (
           select 1
           from pg_policies
           where schemaname = 'public'
             and tablename = 'users'
             and policyname = 'users_privileged_write'
         ) as policy`,
      );
      await client.query("rollback");
      return result.rows[0]?.policy ?? false;
    } finally {
      client.release();
      await pool.end();
    }
  }

  assert.equal(await runMigration("off"), false);
  assert.equal(await runMigration("on"), true);
});

test("maintenance scope is not privileged for the regular database principal", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  const { pool } = createTestDb(databaseUrl);
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query("set local app.rls_test_mode = 'off'");

    await runWithDatabaseContext({ scope: "maintenance" }, async () => {
      const principal = await client.query<{ currentUser: string; platformAccess: boolean }>(
        `select current_user as "currentUser", ce_rls_platform_access() as "platformAccess"`,
      );
      assert.equal(principal.rows[0]?.currentUser, decodeURIComponent(new URL(databaseUrl).username));
      assert.equal(principal.rows[0]?.platformAccess, false);

      const tenants = await client.query("select id from tenants");
      assert.deepEqual(tenants.rows, []);

      await assert.rejects(
        client.query("insert into tenants (name) values ('unauthorized maintenance write')"),
        (error: { code?: string }) => error.code === "42501",
      );
    });
  } finally {
    await client.query("rollback");
    client.release();
    await pool.end();
  }
});

test("RLS isolates customers, rejects missing context and preserves platform scope", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  const { pool } = createTestDb(databaseUrl);
  const client = await pool.connect();
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const teamUser = randomUUID();
  const platformUser = randomUUID();
  const invitationId = randomUUID();
  const invitationUser = randomUUID();
  const leadA = randomUUID();
  const leadB = randomUUID();
  const invitationTokenHash = "a".repeat(64);

  try {
    await client.query("begin");
    await client.query(
      `insert into tenants (id, name, status) values
        ($1, 'RLS tenant A', 'active'), ($2, 'RLS tenant B', 'active')`,
      [tenantA, tenantB],
    );
    await client.query(
      `insert into users (id, auth_provider_user_id, status) values
        ($1, 'rls-subject-a', 'active'),
        ($2, 'rls-subject-b', 'active'),
        ($3, 'rls-team', 'active'),
        ($4, 'rls-platform', 'active')`,
      [userA, userB, teamUser, platformUser],
    );
    await client.query(
      `insert into memberships (tenant_id, user_id, role, status) values
        ($1, $3, 'owner', 'active'), ($1, $4, 'team_member', 'active'), ($2, $5, 'owner', 'active')`,
      [tenantA, tenantB, userA, teamUser, userB],
    );
    await client.query(
      `insert into platform_admin_assignments (user_id, permission, status, granted_by)
       values ($1, 'platform_admin', 'active', $1)`,
      [platformUser],
    );
    await client.query(
      `insert into tenant_owner_invitations
         (id, tenant_id, email, token_hash, status, expires_at, created_by)
       values ($1, $2, 'invitee@example.test', $3, 'pending', now() + interval '1 day', $4)`,
      [invitationId, tenantA, invitationTokenHash, userA],
    );
    await client.query(
      `insert into leads (id, tenant_id, name, email, message, source, status) values
        ($1, $3, 'Lead A', 'a@example.test', 'A', 'test', 'new'),
        ($2, $4, 'Lead B', 'b@example.test', 'B', 'test', 'new')`,
      [leadA, leadB, tenantA, tenantB],
    );
    await client.query(
      `insert into lead_assignments (tenant_id, lead_id, user_id, assigned_by, status)
       values ($1, $2, $3, $3, 'active')`,
      [tenantA, leadA, teamUser],
    );

    await client.query("set local app.rls_test_mode = 'off'");

    const withoutContext = await client.query<{ count: string }>("select count(*)::text as count from tenants");
    assert.equal(withoutContext.rows[0]?.count, "0");

    await runWithDatabaseContext(
      { scope: "customer", subject: "rls-subject-a", tenantId: tenantA },
      async () => {
        const tenants = await client.query<{ id: string }>("select id from tenants order by id");
        assert.deepEqual(tenants.rows.map((row) => row.id), [tenantA].sort());

        const leads = await client.query<{ id: string }>("select id from leads order by id");
        assert.deepEqual(leads.rows.map((row) => row.id), [leadA].sort());

        await client.query("savepoint cross_tenant_insert");
        try {
          await assert.rejects(
            client.query(
              `insert into leads (tenant_id, name, email, message, source, status)
               values ($1, 'Cross tenant', 'cross@example.test', 'x', 'test', 'new')`,
              [tenantB],
            ),
            (error: { code?: string }) => error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint cross_tenant_insert");
        }
      },
    );

    await runWithDatabaseContext(
      { scope: "customer", subject: "rls-team", tenantId: tenantA },
      async () => {
        const leads = await client.query<{ id: string }>("select id from leads order by id");
        assert.deepEqual(leads.rows.map((row) => row.id), [leadA].sort());
      },
    );

    await runWithDatabaseContext(
      { scope: "platform_admin", subject: "rls-platform" },
      async () => {
        const tenants = await client.query<{ id: string }>(
          "select id from tenants where id = any($1::uuid[]) order by id",
          [[tenantA, tenantB]],
        );
        assert.deepEqual(tenants.rows.map((row) => row.id), [tenantA, tenantB].sort());
        const leads = await client.query<{ id: string }>("select id from leads order by id");
        assert.deepEqual(leads.rows, []);
        const assignments = await client.query("select lead_id from lead_assignments");
        assert.deepEqual(assignments.rows, []);

        await client.query("savepoint platform_lead_insert");
        try {
          await assert.rejects(
            client.query(
              `insert into leads (tenant_id, name, email, message, source, status)
               values ($1, 'Platform lead', 'platform@example.test', 'x', 'test', 'new')`,
              [tenantA],
            ),
            (error: { code?: string }) => error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint platform_lead_insert");
        }

        await client.query("savepoint platform_assignment_insert");
        try {
          await assert.rejects(
            client.query(
              `insert into lead_assignments (tenant_id, lead_id, user_id, assigned_by, status)
               values ($1, $2, $3, $3, 'active')`,
              [tenantA, leadA, userA],
            ),
            (error: { code?: string }) => error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint platform_assignment_insert");
        }
      },
    );

    await runWithDatabaseContext(
      { scope: "reviewer", subject: "rls-subject-a", tenantId: tenantA },
      async () => {
        const leads = await client.query<{ id: string }>("select id from leads order by id");
        assert.deepEqual(leads.rows, []);
        await client.query("savepoint reviewer_lead_insert");
        try {
          await assert.rejects(
            client.query(
              `insert into leads (tenant_id, name, email, message, source, status)
               values ($1, 'Reviewer lead', 'reviewer@example.test', 'x', 'test', 'new')`,
              [tenantA],
            ),
            (error: { code?: string }) => error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint reviewer_lead_insert");
        }
      },
    );

    await runWithDatabaseContext(
      {
        scope: "identity_only",
        subject: "rls-invitee",
        invitationTokenHash,
      },
      async () => {
        await client.query(
          "insert into users (id, auth_provider_user_id, status) values ($1, 'rls-invitee', 'active')",
          [invitationUser],
        );
        const invitation = await client.query<{ id: string }>(
          "select id from tenant_owner_invitations where token_hash = $1",
          [invitationTokenHash],
        );
        assert.deepEqual(invitation.rows.map((row) => row.id), [invitationId]);
        await client.query(
          `insert into memberships (tenant_id, user_id, role, status)
           values ($1, $2, 'owner', 'active')`,
          [tenantA, invitationUser],
        );
        await client.query(
          `update tenant_owner_invitations
              set status = 'accepted', accepted_at = now(), accepted_by = $2
            where id = $1`,
          [invitationId, invitationUser],
        );
      },
    );
  } finally {
    await client.query("rollback");
    client.release();
    await pool.end();
  }
});

