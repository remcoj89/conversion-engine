import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { createTestDb } from "../db.js";
import * as schema from "../db/schema.js";
import { runWithDatabaseContext } from "../db/requestContext.js";
import {
  createLeadInTransaction,
  InvalidLeadStatusTransitionError,
  updateLeadStatusInTransaction,
  type NewLead,
} from "./leadRepository.js";

type Tx = NodePgDatabase<typeof schema>;

async function withRollback(fn: (tx: Tx, client: PoolClient) => Promise<void>): Promise<void> {
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

const newLead = (email: string): NewLead => ({
  name: "Lifecycle test lead",
  email,
  phone: null,
  message: "Lifecycle test",
  source: "manual",
});

async function tenantWithOwner(tx: Tx, label: string) {
  const [tenant] = await tx.insert(schema.tenants).values({ name: label }).returning();
  assert.ok(tenant);
  const [user] = await tx.insert(schema.users).values({
    authProviderUserId: `lifecycle-${randomUUID()}`,
  }).returning();
  assert.ok(user);
  await tx.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" });
  return { tenant, user, subject: user.authProviderUserId };
}

test("lead lifecycle update is tenant-bound, transactional and immutable-audited", async () => {
  await withRollback(async (tx, client) => {
    const first = await tenantWithOwner(tx, "Lifecycle A");
    const second = await tenantWithOwner(tx, "Lifecycle B");
    const leadA = await createLeadInTransaction(
      tx,
      first.tenant.id,
      newLead(`a-${randomUUID()}@example.test`),
      first.user.id,
    );
    const leadB = await createLeadInTransaction(
      tx,
      second.tenant.id,
      newLead(`b-${randomUUID()}@example.test`),
      second.user.id,
    );

    await client.query("set local app.rls_test_mode = 'off'");

    await runWithDatabaseContext(
      { scope: "customer", subject: first.subject, tenantId: first.tenant.id },
      async () => {
        const updated = await updateLeadStatusInTransaction(tx, {
          tenantId: first.tenant.id,
          leadId: leadA.id,
          actorUserId: first.user.id,
          toStatus: "qualified",
        });
        assert.deepEqual([updated.id, updated.status, updated.nextAction], [leadA.id, "qualified", null]);

        await assert.rejects(
          updateLeadStatusInTransaction(tx, {
            tenantId: first.tenant.id,
            leadId: leadB.id,
            actorUserId: first.user.id,
            toStatus: "qualified",
          }),
          (error: unknown) => error instanceof Error && error.message === "lead_not_found",
        );

        await assert.rejects(
          updateLeadStatusInTransaction(tx, {
            tenantId: first.tenant.id,
            leadId: leadA.id,
            actorUserId: first.user.id,
            toStatus: "won",
          }),
          InvalidLeadStatusTransitionError,
        );

        const visibleEvents = await tx
          .select()
          .from(schema.leadLifecycleAuditEvents)
          .where(eq(schema.leadLifecycleAuditEvents.tenantId, first.tenant.id));
        assert.deepEqual(visibleEvents.map((event) => [
          event.tenantId,
          event.leadId,
          event.actorUserId,
          event.eventType,
          event.fromStatus,
          event.toStatus,
        ]), [[first.tenant.id, leadA.id, first.user.id, "status_changed", "new", "qualified"]]);

        const current = await tx
          .select({ status: schema.leads.status })
          .from(schema.leads)
          .where(and(eq(schema.leads.tenantId, first.tenant.id), eq(schema.leads.id, leadA.id)));
        assert.deepEqual(current.map((row) => row.status), ["qualified"]);

        await client.query("savepoint lifecycle_audit_immutable");
        try {
          await assert.rejects(
            client.query("update lead_lifecycle_audit_events set to_status = 'won' where tenant_id = $1", [first.tenant.id]),
            (error: { code?: string }) => error.code === "P0001" || error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint lifecycle_audit_immutable");
        }

        await client.query("savepoint lifecycle_audit_delete_immutable");
        try {
          await assert.rejects(
            client.query("delete from lead_lifecycle_audit_events where tenant_id = $1", [first.tenant.id]),
            (error: { code?: string }) => error.code === "P0001" || error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint lifecycle_audit_delete_immutable");
        }
      },
    );
  });
});
