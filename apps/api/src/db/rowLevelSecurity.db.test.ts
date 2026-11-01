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
  "crm_settings",
  "crm_settings_audit_events",
  "public_lead_idempotency_keys",
  "public_lead_rate_limits",
  "public_lead_outbox",
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

test("public scope is limited to the active opaque website and does not expose broad CRM rows", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  const { pool } = createTestDb(databaseUrl);
  const client = await pool.connect();
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const websiteA = randomUUID();
  const websiteAOther = randomUUID();
  const websiteB = randomUUID();
  const contactA = randomUUID();
  const contactB = randomUUID();
  const leadA = randomUUID();
  const leadB = randomUUID();
  const keyA = "site_abcdefghijklmnopqrstuvwxyz123456";
  const keyAOther = "site_abcdefghijklmnopqrstuvwxyz654321";
  const keyB = "site_zyxwvutsrqponmlkjihgfedcba654321";

  try {
    await client.query("begin");
    await client.query(
      `insert into tenants (id, name, status) values ($1, 'Public A', 'active'), ($2, 'Public B', 'active')`,
      [tenantA, tenantB],
    );
    await client.query(
      `insert into websites (id, tenant_id, public_key, status) values
        ($1, $3, $6, 'active'), ($2, $3, $7, 'active'), ($4, $5, $8, 'active')`,
      [websiteA, websiteAOther, tenantA, websiteB, tenantB, keyA, keyAOther, keyB],
    );
    await client.query(
      `insert into contacts (id, tenant_id, full_name, email, status) values
        ($1, $3, 'Contact A', 'a@example.test', 'active'),
        ($2, $4, 'Contact B', 'b@example.test', 'active')`,
      [contactA, contactB, tenantA, tenantB],
    );
    await client.query(
      `insert into leads (id, tenant_id, website_id, contact_id, name, email, message, source, status)
       values ($1, $3, $5, $7, 'Lead A', 'a@example.test', 'A', 'website_contact', 'new'),
              ($2, $4, $6, $8, 'Lead B', 'b@example.test', 'B', 'website_contact', 'new')`,
      [leadA, leadB, tenantA, tenantB, websiteA, websiteB, contactA, contactB],
    );
    await client.query(
      `insert into public_lead_idempotency_keys (tenant_id, website_id, idempotency_key, request_hash, lead_id)
       values ($1, $3, 'public-a', repeat('a', 64), $5), ($2, $4, 'public-b', repeat('b', 64), $6)`,
      [tenantA, tenantB, websiteA, websiteB, leadA, leadB],
    );
    await client.query("set local app.rls_test_mode = 'off'");

    await runWithDatabaseContext(
      {
        scope: "public",
        tenantId: tenantA,
        websitePublicKey: keyA,
        publicContactEmail: "a@example.test",
      },
      async () => {
        const tenants = await client.query<{ id: string }>("select id from tenants order by id");
        assert.deepEqual(tenants.rows.map((row) => row.id), [tenantA]);
        const websites = await client.query<{ id: string }>("select id from websites order by id");
        assert.deepEqual(websites.rows.map((row) => row.id), [websiteA]);
        const contacts = await client.query<{ id: string }>("select id from contacts order by id");
        assert.deepEqual(contacts.rows.map((row) => row.id), [contactA]);
        const leads = await client.query<{ id: string }>("select id from leads order by id");
        assert.deepEqual(leads.rows.map((row) => row.id), [leadA]);
        const keys = await client.query<{ websiteId: string }>("select website_id as \"websiteId\" from public_lead_idempotency_keys");
        assert.deepEqual(keys.rows.map((row) => row.websiteId), [websiteA]);
        assert.deepEqual((await client.query("select id from public_lead_outbox")).rows, []);
        assert.deepEqual((await client.query("select website_id from public_lead_rate_limits")).rows, []);

        await client.query("savepoint public_cross_tenant_contact");
        try {
          await assert.rejects(
            client.query(
              `insert into contacts (tenant_id, full_name, email, status) values ($1, 'Cross tenant', 'cross@example.test', 'active')`,
              [tenantB],
            ),
            (error: { code?: string }) => error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint public_cross_tenant_contact");
        }

        await client.query("savepoint public_wrong_email_contact");
        try {
          await assert.rejects(
            client.query(
              `insert into contacts (tenant_id, full_name, email, status)
               values ($1, 'Wrong email', 'wrong@example.test', 'active')`,
              [tenantA],
            ),
            (error: { code?: string }) => error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint public_wrong_email_contact");
        }

        await client.query("savepoint public_cross_tenant_lead");
        try {
          await assert.rejects(
            client.query(
              `insert into leads (tenant_id, website_id, name, email, message, source, status)
               values ($1, $2, 'Cross tenant', 'cross@example.test', 'x', 'website_contact', 'new')`,
              [tenantB, websiteB],
            ),
            (error: { code?: string }) => error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint public_cross_tenant_lead");
        }

        await client.query("savepoint public_other_website_lead");
        try {
          await assert.rejects(
            client.query(
              `insert into leads (tenant_id, website_id, contact_id, name, email, message, source, status)
               values ($1, $2, $3, 'Other website', $4, 'x', 'website_contact', 'new')`,
              [tenantA, websiteAOther, contactA, "a@example.test"],
            ),
            (error: { code?: string }) => error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint public_other_website_lead");
        }

        await client.query("savepoint public_wrong_email_lead");
        try {
          await assert.rejects(
            client.query(
              `insert into leads (tenant_id, website_id, contact_id, name, email, message, source, status)
               values ($1, $2, $3, 'Wrong email', $4, 'x', 'website_contact', 'new')`,
              [tenantA, websiteA, contactA, "wrong@example.test"],
            ),
            (error: { code?: string }) => error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint public_wrong_email_lead");
        }

        await client.query("savepoint public_wrong_contact_lead");
        try {
          await assert.rejects(
            client.query(
              `insert into leads (tenant_id, website_id, contact_id, name, email, message, source, status)
               values ($1, $2, $3, 'Wrong contact', $4, 'x', 'website_contact', 'new')`,
              [tenantA, websiteA, contactB, "a@example.test"],
            ),
            (error: { code?: string }) => error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint public_wrong_contact_lead");
        }

        await client.query("savepoint public_untrusted_lead_metadata");
        try {
          await assert.rejects(
            client.query(
              `insert into leads (tenant_id, website_id, contact_id, name, email, message, source, privacy_consent, status)
               values ($1, $2, $3, 'Untrusted metadata', $4, 'x', 'manual', false, 'new')`,
              [tenantA, websiteA, contactA, "a@example.test"],
            ),
            (error: { code?: string }) => error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint public_untrusted_lead_metadata");
        }
      },
    );

    await client.query("set local app.rls_test_mode = 'on'");
    await client.query("update tenants set status = 'disabled' where id = $1", [tenantA]);
    await client.query("set local app.rls_test_mode = 'off'");
    await runWithDatabaseContext(
      {
        scope: "public",
        tenantId: tenantA,
        websitePublicKey: keyA,
        publicContactEmail: "a@example.test",
      },
      async () => {
        assert.deepEqual((await client.query("select id from tenants")).rows, []);
        assert.deepEqual((await client.query("select id from websites")).rows, []);
        assert.deepEqual((await client.query("select id from leads")).rows, []);
        await assert.rejects(
          client.query(
            `insert into leads (tenant_id, website_id, name, email, message, source, status)
             values ($1, $2, 'Disabled tenant', 'disabled@example.test', 'x', 'website_contact', 'new')`,
            [tenantA, websiteA],
          ),
          (error: { code?: string }) => error.code === "42501",
        );
      },
    );
  } finally {
    await client.query("rollback");
    client.release();
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
    await client.query(
      `insert into crm_settings (tenant_id, settings) values
        ($1, '{"timezone":"Europe/Amsterdam"}'::jsonb),
        ($2, '{"timezone":"UTC"}'::jsonb)`,
      [tenantA, tenantB],
    );
    await client.query(
      `insert into crm_settings_audit_events (tenant_id, actor_user_id, event_type, settings)
       values ($1, $2, 'updated', '{"timezone":"Europe/Amsterdam"}'::jsonb)`,
      [tenantA, userA],
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

        const settings = await client.query<{ tenantId: string }>("select tenant_id as \"tenantId\" from crm_settings order by tenant_id");
        assert.deepEqual(settings.rows.map((row) => row.tenantId), [tenantA]);
        const auditEvents = await client.query<{ tenantId: string }>("select tenant_id as \"tenantId\" from crm_settings_audit_events");
        assert.deepEqual(auditEvents.rows.map((row) => row.tenantId), [tenantA]);

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

        await client.query("savepoint cross_tenant_settings_insert");
        try {
          await assert.rejects(
            client.query(
              `insert into crm_settings (tenant_id, settings)
               values ($1, '{"timezone":"UTC"}'::jsonb)`,
              [tenantB],
            ),
            (error: { code?: string }) => error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint cross_tenant_settings_insert");
        }

        await client.query("savepoint cross_tenant_audit_insert");
        try {
          await assert.rejects(
            client.query(
              `insert into crm_settings_audit_events (tenant_id, actor_user_id, event_type, settings)
               values ($1, $2, 'updated', '{"timezone":"UTC"}'::jsonb)`,
              [tenantB, userA],
            ),
            (error: { code?: string }) => error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint cross_tenant_audit_insert");
        }
      },
    );

    await runWithDatabaseContext(
      { scope: "customer", subject: "rls-team", tenantId: tenantA },
      async () => {
        const leads = await client.query<{ id: string }>("select id from leads order by id");
        assert.deepEqual(leads.rows.map((row) => row.id), [leadA].sort());

        await client.query("savepoint audit_actor_binding");
        try {
          await assert.rejects(
            client.query(
              `insert into crm_settings_audit_events (tenant_id, actor_user_id, event_type, settings)
               values ($1, $2, 'updated', '{"timezone":"UTC"}'::jsonb)`,
              [tenantA, userA],
            ),
            (error: { code?: string }) => error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint audit_actor_binding");
        }
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
        const settings = await client.query<{ tenantId: string }>("select tenant_id as \"tenantId\" from crm_settings order by tenant_id");
        assert.deepEqual(settings.rows, []);
        const auditEvents = await client.query<{ tenantId: string }>("select tenant_id as \"tenantId\" from crm_settings_audit_events");
        assert.deepEqual(auditEvents.rows, []);

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
        const settings = await client.query("select tenant_id from crm_settings");
        assert.deepEqual(settings.rows, []);
        const auditEvents = await client.query("select tenant_id from crm_settings_audit_events");
        assert.deepEqual(auditEvents.rows, []);
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

