import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createDb } from "../db.js";
import { runWithDatabaseContext } from "./requestContext.js";

const RLS_TABLES = [
  "tenants",
  "users",
  "memberships",
  "tenant_owner_invitations",
  "websites",
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
  const { pool } = createDb(databaseUrl);

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
  const { pool } = createDb(databaseUrl);

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

test("RLS isolates customers, rejects missing context and preserves platform scope", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  const { pool } = createDb(databaseUrl);
  const client = await pool.connect();
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
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
        ($3, 'rls-platform', 'active')`,
      [userA, userB, platformUser],
    );
    await client.query(
      `insert into memberships (tenant_id, user_id, role, status) values
        ($1, $3, 'owner', 'active'), ($2, $4, 'owner', 'active')`,
      [tenantA, tenantB, userA, userB],
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
      { scope: "platform_admin", subject: "rls-platform" },
      async () => {
        const tenants = await client.query<{ id: string }>("select id from tenants order by id");
        assert.deepEqual(tenants.rows.map((row) => row.id), [tenantA, tenantB].sort());
        const leads = await client.query<{ id: string }>("select id from leads order by id");
        assert.deepEqual(leads.rows.map((row) => row.id), [leadA, leadB].sort());
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

