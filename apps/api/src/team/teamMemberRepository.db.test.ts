import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { createTestDb } from "../db.js";
import * as schema from "../db/schema.js";
import { runWithDatabaseContext } from "../db/requestContext.js";
import { createTeamMemberRepository, listTeamMembers } from "./teamMemberRepository.js";

type Db = NodePgDatabase<typeof schema>;

async function withRollback(fn: (db: Db, client: PoolClient) => Promise<void>): Promise<void> {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  const { pool } = createTestDb(databaseUrl);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await fn(drizzle(client, { schema }), client);
  } finally {
    await client.query("rollback");
    client.release();
    await pool.end();
  }
}

test("team-member repository persists explicit CRM grants and keeps safe labels", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  const { db, pool } = createTestDb(databaseUrl);
  const tenantId = randomUUID();
  const ownerId = randomUUID();
  const teamId = randomUUID();

  try {
    await db.insert(schema.tenants).values({ id: tenantId, name: "CRM permissions tenant" });
    await db.insert(schema.users).values([
      { id: ownerId, authProviderUserId: `owner-${randomUUID()}` },
      { id: teamId, authProviderUserId: `team-${randomUUID()}` },
    ]);
    await db.insert(schema.memberships).values([
      { tenantId, userId: ownerId, role: "owner" },
      { tenantId, userId: teamId, role: "team_member" },
    ]);
    await db.insert(schema.teamMemberCrmPermissions).values({
      tenantId,
      userId: teamId,
      permission: "crm:read",
      enabled: true,
    });

    const members = await listTeamMembers(db, tenantId);
    const owner = members.find((member) => member.role === "owner");
    const teamMember = members.find((member) => member.role === "team_member");
    assert.equal(owner?.label, "Eigenaar");
    assert.equal(teamMember?.label, "Teamlid 1");
    assert.equal(owner?.permissions["crm:archive"], true);
    assert.equal(teamMember?.permissions["crm:read"], true);
    assert.equal(teamMember?.permissions["crm:create"], false);
    assert.doesNotMatch(JSON.stringify(members), /owner-|team-/);

    const repository = createTeamMemberRepository(db);
    const updated = await repository.updatePermission({
      tenantId,
      memberId: teamId,
      permission: "crm:update",
      enabled: true,
    });
    assert.equal(updated.status, "updated");
    if (updated.status === "updated") assert.equal(updated.member.permissions["crm:update"], true);

    const invalidRoleTarget = await repository.updatePermission({
      tenantId,
      memberId: ownerId,
      permission: "crm:read",
      enabled: false,
    });
    assert.deepEqual(invalidRoleTarget, { status: "conflict", reason: "owner_not_changeable" });
  } finally {
    await pool.query("delete from team_member_crm_permissions where tenant_id = $1", [tenantId]);
    await pool.query("delete from memberships where tenant_id = $1", [tenantId]);
    await pool.query("delete from users where id in ($1, $2)", [ownerId, teamId]);
    await pool.query("delete from tenants where id = $1", [tenantId]);
    await pool.end();
  }
});

test("team-member permissions RLS is tenant-bound and team members can read only their own grants", async () => {
  await withRollback(async (_db, client) => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const ownerA = randomUUID();
    const teamA = randomUUID();
    const teamB = randomUUID();
    const ownerASubject = `permissions-owner-a-${randomUUID()}`;
    const teamASubject = `permissions-team-a-${randomUUID()}`;
    const teamBSubject = `permissions-team-b-${randomUUID()}`;
    await client.query(
      `insert into tenants (id, name, status) values ($1, 'Permissions A', 'active'), ($2, 'Permissions B', 'active')`,
      [tenantA, tenantB],
    );
    await client.query(
      `insert into users (id, auth_provider_user_id, status) values
        ($1, $4, 'active'), ($2, $5, 'active'), ($3, $6, 'active')`,
      [ownerA, teamA, teamB, ownerASubject, teamASubject, teamBSubject],
    );
    await client.query(
      `insert into memberships (tenant_id, user_id, role, status) values
        ($1, $3, 'owner', 'active'), ($1, $4, 'team_member', 'active'), ($2, $5, 'team_member', 'active')`,
      [tenantA, tenantB, ownerA, teamA, teamB],
    );
    await client.query(
      `insert into team_member_crm_permissions (tenant_id, user_id, permission, enabled) values
        ($1, $2, 'crm:read', true), ($3, $4, 'crm:create', true)`,
      [tenantA, teamA, tenantB, teamB],
    );
    await client.query("set local app.rls_test_mode = 'off'");

    await runWithDatabaseContext({ scope: "customer", subject: teamASubject, tenantId: tenantA }, async () => {
      const ownRows = await client.query<{ tenant_id: string; user_id: string }>(
        "select tenant_id, user_id from team_member_crm_permissions order by tenant_id, user_id",
      );
      assert.deepEqual(ownRows.rows, [{ tenant_id: tenantA, user_id: teamA }]);
      await client.query("savepoint team_member_permission_insert");
      try {
        await assert.rejects(
          client.query(
            "insert into team_member_crm_permissions (tenant_id, user_id, permission, enabled) values ($1, $2, 'crm:update', true)",
            [tenantA, teamA],
          ),
          (error: { code?: string }) => error.code === "42501",
        );
      } finally {
        await client.query("rollback to savepoint team_member_permission_insert");
      }
    });

    await runWithDatabaseContext({ scope: "customer", subject: ownerASubject, tenantId: tenantA }, async () => {
      const ownerRows = await client.query<{ tenant_id: string; user_id: string }>(
        "select tenant_id, user_id from team_member_crm_permissions order by tenant_id, user_id",
      );
      assert.deepEqual(ownerRows.rows, [{ tenant_id: tenantA, user_id: teamA }]);
      await client.query(
        "insert into team_member_crm_permissions (tenant_id, user_id, permission, enabled) values ($1, $2, 'crm:update', true)",
        [tenantA, teamA],
      );
    });
  });
});

test("team-member permission writes roll back atomically on failure", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  const { db, pool } = createTestDb(databaseUrl);
  const tenantId = randomUUID();
  const userId = randomUUID();

  try {
    await db.insert(schema.tenants).values({ id: tenantId, name: "Rollback tenant" });
    await db.insert(schema.users).values({ id: userId, authProviderUserId: `rollback-${randomUUID()}` });
    await db.insert(schema.memberships).values({ tenantId, userId, role: "team_member" });

    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.insert(schema.teamMemberCrmPermissions).values({ tenantId, userId, permission: "crm:read", enabled: true });
        throw new Error("forced permission rollback");
      }),
      /forced permission rollback/,
    );
    const rows = await db
      .select()
      .from(schema.teamMemberCrmPermissions)
      .where(eq(schema.teamMemberCrmPermissions.tenantId, tenantId));
    assert.deepEqual(rows, []);
  } finally {
    await pool.query("delete from team_member_crm_permissions where tenant_id = $1", [tenantId]);
    await pool.query("delete from memberships where tenant_id = $1", [tenantId]);
    await pool.query("delete from users where id = $1", [userId]);
    await pool.query("delete from tenants where id = $1", [tenantId]);
    await pool.end();
  }
});
