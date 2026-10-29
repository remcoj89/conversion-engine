import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { createDb } from "../db.js";
import * as schema from "../db/schema.js";
import { listPlatformAuditEvents } from "./platformAuditEventRepository.js";

type Tx = NodePgDatabase<typeof schema>;

async function withRollback(fn: (tx: Tx) => Promise<void>) {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");

  const { pool } = createDb(databaseUrl);
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

test("platform audit repository combineert veilige status- en inzage-events", async () => {
  await withRollback(async (tx) => {
    const tenantId = randomUUID();
    const projectId = randomUUID();
    const memberId = randomUUID();
    const reviewerId = randomUUID();
    const createdAt = new Date("2026-10-29T09:00:00.000Z");

    await tx.insert(schema.tenants).values({ id: tenantId, name: "Synthetic audit tenant" });
    await tx.insert(schema.users).values([
      { id: memberId, authProviderUserId: `audit-member-${randomUUID()}` },
      { id: reviewerId, authProviderUserId: `audit-reviewer-${randomUUID()}` },
    ]);
    await tx.insert(schema.memberships).values({ tenantId, userId: memberId, role: "owner" });
    await tx.insert(schema.onboardingReviewerAssignments).values({
      tenantId,
      userId: reviewerId,
      grantedBy: memberId,
    });
    await tx.insert(schema.onboardingProjects).values({
      id: projectId,
      tenantId,
      status: "submitted",
      currentVersion: 1,
      createdAt,
      updatedAt: createdAt,
    });
    await tx.insert(schema.onboardingVersions).values({
      tenantId,
      projectId,
      version: 1,
      schemaId: "WESTEND_ONBOARDING",
      schemaVersion: "0.1.0-test",
      answers: {},
      projectBrief: {},
      createdBy: memberId,
      createdAt,
    });
    const [statusEvent] = await tx.insert(schema.onboardingAuditEvents).values({
      tenantId,
      projectId,
      memberUserId: memberId,
      eventType: "submitted",
      fromStatus: "draft",
      toStatus: "submitted",
      version: 1,
      createdAt,
    }).returning();
    const [accessEvent] = await tx.insert(schema.onboardingReviewAccessEvents).values({
      tenantId,
      projectId,
      reviewerUserId: reviewerId,
      version: 1,
      purpose: "onboarding_review",
      action: "read_onboarding_content",
      requestOrCorrelationId: "request-audit-test",
      createdAt: new Date("2026-10-29T10:00:00.000Z"),
    }).returning();
    assert.ok(statusEvent && accessEvent);

    const result = await listPlatformAuditEvents(tx, { tenantId, limit: 10 });
    assert.deepEqual(result.items.map((item) => item.id), [accessEvent.id, statusEvent.id]);
    assert.equal(result.items[0]?.eventType, "read_onboarding_content");
    assert.equal(result.items[0]?.actorType, "reviewer");
    assert.equal(result.items[1]?.eventType, "submitted");
    assert.equal(result.items[1]?.actorType, "member");
    assert.equal("answers" in result.items[0]!, false);
    assert.equal("projectBrief" in result.items[0]!, false);

    const filtered = await listPlatformAuditEvents(tx, {
      tenantId,
      eventType: "submitted",
      limit: 10,
    });
    assert.deepEqual(filtered.items.map((item) => item.id), [statusEvent.id]);
  });
});
