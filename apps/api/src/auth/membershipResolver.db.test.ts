import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { createTestDb } from "../db.js";
import * as schema from "../db/schema.js";
import { runWithDatabaseContext } from "../db/requestContext.js";
import { findActiveMemberships } from "./membershipResolver.js";

test("findActiveMemberships loads only active persisted CRM grants", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  const { pool } = createTestDb(databaseUrl);
  const client = await pool.connect();
  const tenantId = randomUUID();
  const userId = randomUUID();
  try {
    await client.query("begin");
    const db = drizzle(client, { schema });
    await db.insert(schema.tenants).values({ id: tenantId, name: "Membership resolver tenant" });
    await db.insert(schema.users).values({ id: userId, authProviderUserId: "membership-resolver-team", status: "active" });
    await db.insert(schema.memberships).values({ tenantId, userId, role: "team_member", status: "active" });
    await db.insert(schema.teamMemberCrmPermissions).values([
      { tenantId, userId, permission: "crm:read", enabled: true },
      { tenantId, userId, permission: "crm:update", enabled: false },
    ]);
    await client.query("set local app.rls_test_mode = 'off'");

    const memberships = await runWithDatabaseContext(
      { scope: "identity", subject: "membership-resolver-team" },
      () => findActiveMemberships(db, {
        issuer: "https://issuer.test",
        subject: "membership-resolver-team",
        assurance: { level: "aal2" },
      }),
    );
    assert.deepEqual(memberships, [{
      tenantId,
      userId,
      role: "team_member",
      status: "active",
      teamMemberPermissions: { "crm:read": true },
    }]);
  } finally {
    await client.query("rollback");
    client.release();
    await pool.end();
  }
});
