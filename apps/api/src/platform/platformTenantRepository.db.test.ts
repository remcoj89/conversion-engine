import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { createTestDb } from "../db.js";
import * as schema from "../db/schema.js";
import { listPlatformTenants } from "./platformTenantRepository.js";

type Tx = NodePgDatabase<typeof schema>;

async function withRollback(fn: (tx: Tx, client: PoolClient) => Promise<void>) {
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

test("platform tenant repository lists synthetic tenants with isolated summaries and stable cursors", async () => {
  await withRollback(async (tx) => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const tenantC = randomUUID();
    const creator = await tx.insert(schema.users).values({ authProviderUserId: `platform-list-${randomUUID()}` }).returning();
    assert.ok(creator[0]);

    await tx.insert(schema.tenants).values([
      { id: tenantA, name: "Synthetic Alpha", status: "active", createdAt: new Date("2026-10-28T13:00:00.000Z") },
      { id: tenantB, name: "Synthetic Beta", status: "active", createdAt: new Date("2026-10-28T12:00:00.000Z") },
      { id: tenantC, name: "Synthetic Gamma", status: "disabled", createdAt: new Date("2026-10-28T11:00:00.000Z") },
    ]);

    const projectA = randomUUID();
    const projectBOlder = randomUUID();
    const projectBCurrent = randomUUID();
    await tx.insert(schema.onboardingProjects).values([
      {
        id: projectA,
        tenantId: tenantA,
        status: "submitted",
        currentVersion: 2,
        createdAt: new Date("2026-10-28T09:00:00.000Z"),
        updatedAt: new Date("2026-10-28T10:00:00.000Z"),
      },
      {
        id: projectBOlder,
        tenantId: tenantB,
        status: "approved",
        currentVersion: 1,
        createdAt: new Date("2026-10-27T09:00:00.000Z"),
        updatedAt: new Date("2026-10-27T10:00:00.000Z"),
      },
      {
        id: projectBCurrent,
        tenantId: tenantB,
        status: "approved",
        currentVersion: 3,
        createdAt: new Date("2026-10-28T09:00:00.000Z"),
        updatedAt: new Date("2026-10-28T11:00:00.000Z"),
      },
    ]);

    await tx.insert(schema.onboardingVersions).values([
      ...[1, 2].map((version) => ({
        tenantId: tenantA,
        projectId: projectA,
        version,
        schemaId: "WESTEND_ONBOARDING",
        schemaVersion: "0.1.0-test",
        answers: {},
        projectBrief: {},
        createdBy: creator[0]!.id,
      })),
      {
        tenantId: tenantB,
        projectId: projectBOlder,
        version: 1,
        schemaId: "WESTEND_ONBOARDING",
        schemaVersion: "0.1.0-test",
        answers: {},
        projectBrief: {},
        createdBy: creator[0]!.id,
      },
      {
        tenantId: tenantB,
        projectId: projectBCurrent,
        version: 3,
        schemaId: "WESTEND_ONBOARDING",
        schemaVersion: "0.1.0-test",
        answers: {},
        projectBrief: {},
        createdBy: creator[0]!.id,
      },
    ]);

    await tx.insert(schema.websites).values([
      { tenantId: tenantA, status: "active" },
      { tenantId: tenantA, status: "disabled" },
      { tenantId: tenantB, status: "active" },
    ]);

    const firstPage = await listPlatformTenants(tx, { limit: 2, q: "Synthetic" });
    assert.deepEqual(firstPage.items.map((item) => item.id), [tenantA, tenantB]);
    assert.deepEqual(firstPage.items[0]?.onboarding, {
      status: "submitted",
      version: 2,
      updatedAt: new Date("2026-10-28T10:00:00.000Z"),
    });
    assert.deepEqual(firstPage.items[0]?.websiteSummary, { total: 2, active: 1 });
    assert.deepEqual(firstPage.items[1]?.onboarding, {
      status: "approved",
      version: 3,
      updatedAt: new Date("2026-10-28T11:00:00.000Z"),
    });
    assert.deepEqual(firstPage.items[1]?.websiteSummary, { total: 1, active: 1 });
    assert.ok(firstPage.nextCursor);

    const secondPage = await listPlatformTenants(tx, { limit: 2, q: "Synthetic", cursor: firstPage.nextCursor! });
    assert.deepEqual(secondPage.items.map((item) => item.id), [tenantC]);
    assert.equal(secondPage.nextCursor, null);

    const filtered = await listPlatformTenants(tx, { limit: 25, q: "Alpha", status: "active", onboardingStatus: "submitted" });
    assert.deepEqual(filtered.items.map((item) => item.id), [tenantA]);
    assert.deepEqual((await listPlatformTenants(tx, { limit: 25, q: "Synthetic", onboardingStatus: "approved" })).items.map((item) => item.id), [tenantB]);
    assert.deepEqual((await listPlatformTenants(tx, { limit: 25, q: "Synthetic", status: "disabled" })).items.map((item) => item.id), [tenantC]);
    assert.deepEqual((await listPlatformTenants(tx, { limit: 25, q: "Synthetic", onboardingStatus: "not_started" })).items.map((item) => item.id), [tenantC]);

    for (const item of firstPage.items) {
      assert.equal("answers" in item, false);
      assert.equal("projectBrief" in item, false);
      assert.equal("authProviderUserId" in item, false);
    }
  });
});
