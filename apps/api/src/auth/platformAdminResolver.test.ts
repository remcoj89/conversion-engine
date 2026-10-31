import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { findActivePlatformAdminAssignments } from "./platformAdminResolver.js";
import type { ExternalIdentity } from "./types.js";
import { createTestDb } from "../db.js";
import * as schema from "../db/schema.js";

type Db = NodePgDatabase<typeof schema>;

const identityFor = (subject: string): ExternalIdentity => ({
  issuer: "https://issuer.test",
  subject,
  assurance: { level: "aal2" },
});

async function withRollback(fn: (db: Db, client: PoolClient) => Promise<void>) {
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

async function expectConstraintError(client: PoolClient, fn: () => Promise<unknown>) {
  await client.query("savepoint platform_admin_constraint");
  await assert.rejects(fn, (error: { code?: string; cause?: { code?: string } }) => {
    assert.equal(error.cause?.code ?? error.code, "23514");
    return true;
  });
  await client.query("rollback to savepoint platform_admin_constraint");
}

test("findActivePlatformAdminAssignments geeft alleen actieve rechten van actieve users terug", async () => {
  await withRollback(async (db) => {
    const [activeUser] = await db
      .insert(schema.users)
      .values({ authProviderUserId: `platform-active-${randomUUID()}` })
      .returning();
    const [disabledUser] = await db
      .insert(schema.users)
      .values({ authProviderUserId: `platform-disabled-${randomUUID()}`, status: "disabled" })
      .returning();
    const [grantor] = await db
      .insert(schema.users)
      .values({ authProviderUserId: `platform-grantor-${randomUUID()}` })
      .returning();
    assert.ok(activeUser);
    assert.ok(disabledUser);
    assert.ok(grantor);

    await db.insert(schema.platformAdminAssignments).values([
      { userId: activeUser.id, permission: "platform_admin", grantedBy: grantor.id },
      {
        userId: disabledUser.id,
        permission: "platform_admin",
        status: "active",
        grantedBy: grantor.id,
      },
    ]);

    assert.deepEqual(
      await findActivePlatformAdminAssignments(db, identityFor(activeUser.authProviderUserId)),
      [{ userId: activeUser.id, permission: "platform_admin" }],
    );
    assert.deepEqual(
      await findActivePlatformAdminAssignments(db, identityFor(disabledUser.authProviderUserId)),
      [],
    );
  });
});

test("findActivePlatformAdminAssignments negeert ingetrokken rechten en onbekende subjects", async () => {
  await withRollback(async (db) => {
    const [user] = await db
      .insert(schema.users)
      .values({ authProviderUserId: `platform-revoked-${randomUUID()}` })
      .returning();
    const [grantor] = await db
      .insert(schema.users)
      .values({ authProviderUserId: `platform-grantor-${randomUUID()}` })
      .returning();
    assert.ok(user);
    assert.ok(grantor);

    await db.insert(schema.platformAdminAssignments).values({
      userId: user.id,
      permission: "platform_admin",
      status: "revoked",
      grantedBy: grantor.id,
      revokedAt: new Date(),
    });

    assert.deepEqual(
      await findActivePlatformAdminAssignments(db, identityFor(user.authProviderUserId)),
      [],
    );
    assert.deepEqual(
      await findActivePlatformAdminAssignments(db, identityFor(`unknown-${randomUUID()}`)),
      [],
    );
  });
});

test("platform admin assignments handhaven permission- en revoked_at-consistentie", async () => {
  await withRollback(async (db, client) => {
    const [user] = await db
      .insert(schema.users)
      .values({ authProviderUserId: `platform-constraints-${randomUUID()}` })
      .returning();
    const [grantor] = await db
      .insert(schema.users)
      .values({ authProviderUserId: `platform-grantor-${randomUUID()}` })
      .returning();
    assert.ok(user);
    assert.ok(grantor);

    await expectConstraintError(client, () =>
      client.query(
        `insert into platform_admin_assignments (user_id, permission, granted_by)
         values ($1, 'other_permission', $2)`,
        [user.id, grantor.id],
      ),
    );
    await expectConstraintError(client, () =>
      client.query(
        `insert into platform_admin_assignments (user_id, permission, status, granted_by, revoked_at)
         values ($1, 'platform_admin', 'active', $2, now())`,
        [user.id, grantor.id],
      ),
    );
    await expectConstraintError(client, () =>
      client.query(
        `insert into platform_admin_assignments (user_id, permission, status, granted_by)
         values ($1, 'platform_admin', 'revoked', $2)`,
        [user.id, grantor.id],
      ),
    );
  });
});
