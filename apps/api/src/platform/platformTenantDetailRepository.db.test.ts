import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { createTestDb } from "../db.js";
import * as schema from "../db/schema.js";
import { findPlatformTenantDetail } from "./platformTenantDetailRepository.js";

type Tx = NodePgDatabase<typeof schema>;

async function withRollback(fn: (tx: Tx) => Promise<void>) {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");

  const { pool } = createTestDb(databaseUrl);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await fn(drizzle(client, { schema }));
  } finally {
    await client.query("rollback");
    client.release();
    await pool.end();
  }
}

test("platform tenant detail isoleert tenant, onboarding en websites exact", async () => {
  await withRollback(async (tx) => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const projectA = randomUUID();
    const projectB = randomUUID();
    const creator = await tx.insert(schema.users)
      .values({ authProviderUserId: `platform-detail-${randomUUID()}` })
      .returning();
    assert.ok(creator[0]);

    await tx.insert(schema.tenants).values([
      { id: tenantA, name: "Synthetic Alpha", status: "active", createdAt: new Date("2026-10-28T10:00:00.000Z") },
      { id: tenantB, name: "Synthetic Beta", status: "disabled", createdAt: new Date("2026-10-27T10:00:00.000Z") },
    ]);
    await tx.insert(schema.onboardingProjects).values([
      {
        id: projectA,
        tenantId: tenantA,
        status: "submitted",
        currentVersion: 2,
        createdAt: new Date("2026-10-28T09:00:00.000Z"),
        updatedAt: new Date("2026-10-28T11:00:00.000Z"),
      },
      {
        id: projectB,
        tenantId: tenantB,
        status: "approved",
        currentVersion: 1,
        createdAt: new Date("2026-10-27T09:00:00.000Z"),
        updatedAt: new Date("2026-10-27T11:00:00.000Z"),
      },
    ]);
    await tx.insert(schema.onboardingVersions).values([
      ...[1, 2].map((version) => ({
        tenantId: tenantA,
        projectId: projectA,
        version,
        schemaId: "WESTEND_ONBOARDING",
        schemaVersion: "0.1.0-test",
        answers: { secret: "tenant-a-answer" },
        projectBrief: { secret: "tenant-a-brief" },
        createdBy: creator[0]!.id,
      })),
      {
        tenantId: tenantB,
        projectId: projectB,
        version: 1,
        schemaId: "WESTEND_ONBOARDING",
        schemaVersion: "0.1.0-test",
        answers: { secret: "tenant-b-answer" },
        projectBrief: { secret: "tenant-b-brief" },
        createdBy: creator[0]!.id,
      },
    ]);
    await tx.insert(schema.websites).values([
      { tenantId: tenantA, status: "active" },
      { tenantId: tenantA, status: "disabled" },
      { tenantId: tenantB, status: "active" },
    ]);

    const detail = await findPlatformTenantDetail(tx, tenantA);
    assert.ok(detail);
    assert.deepEqual(detail, {
      id: tenantA,
      name: "Synthetic Alpha",
      status: "active",
      createdAt: new Date("2026-10-28T10:00:00.000Z"),
      onboarding: {
        status: "submitted",
        version: 2,
        updatedAt: new Date("2026-10-28T11:00:00.000Z"),
      },
      websiteSummary: { total: 2, active: 1 },
    });
    assert.equal("answers" in detail, false);
    assert.equal("projectBrief" in detail, false);
    assert.equal("tenantB" in detail, false);

    assert.equal(await findPlatformTenantDetail(tx, randomUUID()), null);
  });
});
