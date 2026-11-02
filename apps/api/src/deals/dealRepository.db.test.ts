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
  createDealInTransaction,
  InvalidDealStageTransitionError,
  updateDealInTransaction,
  type CreateDealInput,
} from "./dealRepository.js";

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

async function tenantFixture(tx: Tx, label: string) {
  const [tenant] = await tx.insert(schema.tenants).values({ name: label }).returning();
  assert.ok(tenant);
  const ownerSubject = `deal-owner-${randomUUID()}`;
  const [owner] = await tx.insert(schema.users).values({ authProviderUserId: ownerSubject }).returning();
  const [teamMember] = await tx.insert(schema.users).values({ authProviderUserId: `deal-team-${randomUUID()}` }).returning();
  assert.ok(owner && teamMember);
  await tx.insert(schema.memberships).values([
    { tenantId: tenant.id, userId: owner.id, role: "owner", status: "active" },
    { tenantId: tenant.id, userId: teamMember.id, role: "team_member", status: "active" },
  ]);
  const [contact] = await tx.insert(schema.contacts).values({
    tenantId: tenant.id,
    fullName: `${label} contact`,
    email: `${randomUUID()}@example.test`,
  }).returning();
  assert.ok(contact);
  return { tenant, owner, teamMember, contact, subject: ownerSubject };
}

function createInput(fixture: Awaited<ReturnType<typeof tenantFixture>>, overrides: Partial<CreateDealInput> = {}): CreateDealInput {
  return {
    tenantId: fixture.tenant.id,
    actorUserId: fixture.owner.id,
    contactId: fixture.contact.id,
    title: "Website traject",
    amountEur: "1250.00",
    ...overrides,
  };
}

test("deal repository enforces tenant contact/owner boundaries and audits stage changes", async () => {
  await withRollback(async (tx, client) => {
    const first = await tenantFixture(tx, "Deal A");
    const second = await tenantFixture(tx, "Deal B");
    await client.query("set local app.rls_test_mode = 'off'");

    const deal = await runWithDatabaseContext(
      { scope: "customer", subject: first.subject, tenantId: first.tenant.id },
      () => createDealInTransaction(tx, createInput(first, { ownerUserId: first.teamMember.id })),
    );
    assert.equal(deal.stage, "new");
    assert.equal(deal.ownerUserId, first.teamMember.id);

    const qualified = await runWithDatabaseContext(
      { scope: "customer", subject: first.subject, tenantId: first.tenant.id },
      () => updateDealInTransaction(tx, {
        tenantId: first.tenant.id,
        dealId: deal.id,
        actorUserId: first.owner.id,
        stage: "qualified",
      }),
    );
    assert.equal(qualified?.stage, "qualified");

    await assert.rejects(
      updateDealInTransaction(tx, {
        tenantId: first.tenant.id,
        dealId: deal.id,
        actorUserId: first.owner.id,
        stage: "won",
      }),
      InvalidDealStageTransitionError,
    );

    const crossTenantContact = await assert.rejects(
      createDealInTransaction(tx, createInput(first, { contactId: second.contact.id })),
      (error: unknown) => error instanceof Error && error.message === "invalid_deal_contact",
    );
    assert.equal(crossTenantContact, undefined);

    const events = await tx
      .select()
      .from(schema.dealLifecycleAuditEvents)
      .where(and(
        eq(schema.dealLifecycleAuditEvents.tenantId, first.tenant.id),
        eq(schema.dealLifecycleAuditEvents.dealId, deal.id),
      ));
    assert.deepEqual(events.map((event) => [event.fromStage, event.toStage, event.actorUserId]), [
      ["new", "qualified", first.owner.id],
    ]);
  });
});

test("deal repository houdt verliesreden, bedrag en owner-invarianten strikt", async () => {
  await withRollback(async (tx, client) => {
    const fixture = await tenantFixture(tx, "Deal invariants");
    await client.query("set local app.rls_test_mode = 'off'");

    await runWithDatabaseContext(
      { scope: "customer", subject: fixture.subject, tenantId: fixture.tenant.id },
      async () => {
        const deal = await createDealInTransaction(tx, createInput(fixture));
        await assert.rejects(
          updateDealInTransaction(tx, {
            tenantId: fixture.tenant.id,
            dealId: deal.id,
            actorUserId: fixture.owner.id,
            lossReason: "Mag niet op een open deal",
          }),
          (error: unknown) => error instanceof Error && error.message === "invalid_deal_loss_reason",
        );

        await assert.rejects(
          createDealInTransaction(tx, createInput(fixture, { ownerUserId: randomUUID() })),
          (error: unknown) => error instanceof Error && error.message === "invalid_deal_owner",
        );

        const qualified = await updateDealInTransaction(tx, {
          tenantId: fixture.tenant.id,
          dealId: deal.id,
          actorUserId: fixture.owner.id,
          stage: "qualified",
        });
        assert.equal(qualified?.stage, "qualified");
      },
    );
  });
});

test("deal RLS toont alleen de actieve tenant en blokkeert platformdata", async () => {
  await withRollback(async (tx, client) => {
    const first = await tenantFixture(tx, "Deal RLS A");
    const second = await tenantFixture(tx, "Deal RLS B");
    await client.query("set local app.rls_test_mode = 'off'");

    await runWithDatabaseContext(
      { scope: "customer", subject: first.subject, tenantId: first.tenant.id },
      async () => {
        await client.query(
          `insert into deals (tenant_id, contact_id, title) values ($1, $2, 'Visible deal')`,
          [first.tenant.id, first.contact.id],
        );
        await client.query("savepoint cross_tenant_deal");
        try {
          await assert.rejects(
            client.query(
              `insert into deals (tenant_id, contact_id, title) values ($1, $2, 'Cross tenant deal')`,
              [second.tenant.id, second.contact.id],
            ),
            (error: { code?: string }) => error.code === "42501",
          );
        } finally {
          await client.query("rollback to savepoint cross_tenant_deal");
        }
        const visible = await client.query<{ tenant_id: string }>("select tenant_id from deals");
        assert.deepEqual(visible.rows.map((row) => row.tenant_id), [first.tenant.id]);
      },
    );
  });
});
