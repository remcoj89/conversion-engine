import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { test } from "node:test";
import { createApiRuntimeDb, createTestDb, createTestMaintenanceDb } from "../db.js";
import * as schema from "../db/schema.js";
import { runWithDatabaseContext } from "../db/requestContext.js";
import {
  createPublicLead,
  createPublicLeadInTransaction,
  PublicLeadIdempotencyConflictError,
} from "./publicLeadRepository.js";
import type { PublicLeadInput } from "./publicLeadInput.js";

const key = "site_abcdefghijklmnopqrstuvwxyz123456";
const input: PublicLeadInput = {
  name: "Ada Lovelace",
  email: "ada@example.test",
  message: "Ik wil graag kennismaken.",
  phone: "+31 6 1234 5678",
  organization: "Analytical Engines",
  privacyConsent: true,
  marketingConsent: false,
};

test("public lead repository dedupliceert contacten, replayt idempotent en schrijft outbox atomair", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  const { pool } = createTestDb(databaseUrl);
  const client = await pool.connect();
  const tenantId = randomUUID();
  const websiteId = randomUUID();
  const website = { tenantId, websiteId };

  try {
    await client.query("begin");
    await client.query("set local app.rls_test_mode = 'on'");
    await client.query(
      `insert into tenants (id, name, status) values ($1, 'Public repository tenant', 'active')`,
      [tenantId],
    );
    await client.query(
      `insert into websites (id, tenant_id, public_key, status) values ($1, $2, $3, 'active')`,
      [websiteId, tenantId, key],
    );
    await client.query("set local app.rls_test_mode = 'off'");

    await runWithDatabaseContext(
      { scope: "public", tenantId, websitePublicKey: key, publicContactEmail: input.email },
      async () => {
        const db = drizzle(client, { schema });
        const accepted = await createPublicLeadInTransaction(db, website, "request-1", input);
        assert.equal(accepted.status, "accepted");
        const replay = await createPublicLeadInTransaction(db, website, "request-1", input);
        assert.equal(replay.status, "replayed");
        await assert.rejects(
          createPublicLeadInTransaction(db, website, "request-1", { ...input, message: "Andere aanvraag" }),
          PublicLeadIdempotencyConflictError,
        );

        const second = await createPublicLeadInTransaction(db, website, "request-2", input);
        assert.equal(second.status, "duplicate");
        await client.query("set local app.rls_test_mode = 'on'");
        const counts = await client.query<{ contacts: string; leads: string; outbox: string; keys: string }>(
          `select
             (select count(*) from contacts where tenant_id = $1) as contacts,
             (select count(*) from leads where tenant_id = $1) as leads,
             (select count(*) from public_lead_outbox where tenant_id = $1) as outbox,
             (select count(*) from public_lead_idempotency_keys where tenant_id = $1) as keys`,
          [tenantId],
        );
        assert.deepEqual(counts.rows[0], { contacts: "1", leads: "1", outbox: "1", keys: "1" });
        await client.query("set local app.rls_test_mode = 'off'");
      },
    );
  } finally {
    await client.query("rollback");
    client.release();
    await pool.end();
  }
});

test("public lead repository dedupliceert hetzelfde e-mailadres bij gelijktijdige aanvragen", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  const { pool } = createTestDb(databaseUrl);
  const cleanupPool = createTestMaintenanceDb(databaseUrl).pool;
  const setupClient = await pool.connect();
  const firstClient = await pool.connect();
  const secondClient = await pool.connect();
  const tenantId = randomUUID();
  const websiteId = randomUUID();
  const websiteKey = `site_${randomUUID().replaceAll("-", "").slice(0, 32)}`;
  const concurrentInput = { ...input, email: "concurrent@example.test" };

  try {
    await setupClient.query("set app.rls_test_mode = 'on'");
    await setupClient.query(
      `insert into tenants (id, name, status) values ($1, 'Concurrent repository tenant', 'active')`,
      [tenantId],
    );
    await setupClient.query(
      `insert into websites (id, tenant_id, public_key, status) values ($1, $2, $3, 'active')`,
      [websiteId, tenantId, websiteKey],
    );

    await firstClient.query("set app.rls_test_mode = 'off'");
    await secondClient.query("set app.rls_test_mode = 'off'");
    const firstDb = drizzle(firstClient, { schema });
    const secondDb = drizzle(secondClient, { schema });
    const context = {
      scope: "public" as const,
      tenantId,
      websitePublicKey: websiteKey,
      publicContactEmail: concurrentInput.email,
    };

    const [first, second] = await Promise.all([
      runWithDatabaseContext(context, () =>
        createPublicLead(firstDb, { tenantId, websiteId }, "concurrent-1", concurrentInput),
      ),
      runWithDatabaseContext(context, () =>
        createPublicLead(secondDb, { tenantId, websiteId }, "concurrent-2", concurrentInput),
      ),
    ]);

    assert.deepEqual([first.status, second.status].sort(), ["accepted", "duplicate"].sort());
    const counts = await setupClient.query<{ contacts: string; leads: string; outbox: string }>(
      `select
         (select count(*) from contacts where tenant_id = $1 and email = $2) as contacts,
         (select count(*) from leads where tenant_id = $1 and email = $2) as leads,
         (select count(*) from public_lead_outbox where tenant_id = $1) as outbox`,
      [tenantId, concurrentInput.email],
    );
    assert.deepEqual(counts.rows[0], { contacts: "1", leads: "1", outbox: "1" });
  } finally {
    const cleanupClient = await cleanupPool.connect();
    try {
      await cleanupClient.query("begin");
      await cleanupClient.query("delete from public_lead_outbox where tenant_id = $1", [tenantId]);
      await cleanupClient.query("delete from public_lead_idempotency_keys where tenant_id = $1", [tenantId]);
      await cleanupClient.query("delete from public_lead_rate_limits where website_id = $1", [websiteId]);
      await cleanupClient.query("delete from leads where tenant_id = $1", [tenantId]);
      await cleanupClient.query("delete from contacts where tenant_id = $1", [tenantId]);
      await cleanupClient.query("delete from websites where id = $1", [websiteId]);
      await cleanupClient.query("delete from tenants where id = $1", [tenantId]);
      await cleanupClient.query("commit");
    } finally {
      await cleanupClient.query("rollback").catch(() => undefined);
      cleanupClient.release();
      await cleanupPool.end();
    }
    setupClient.release();
    firstClient.release();
    secondClient.release();
    await pool.end();
  }
});

test("public lead repository rolt contact, lead, outbox en idempotency terug bij een fout", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  const { pool } = createTestDb(databaseUrl);
  const client = await pool.connect();
  const tenantId = randomUUID();
  const websiteId = randomUUID();

  try {
    await client.query("begin");
    await client.query("set local app.rls_test_mode = 'on'");
    await client.query(
      `insert into tenants (id, name, status) values ($1, 'Atomicity tenant', 'active')`,
      [tenantId],
    );
    await client.query(
      `insert into websites (id, tenant_id, public_key, status) values ($1, $2, $3, 'active')`,
      [websiteId, tenantId, key],
    );
    await client.query("set local app.rls_test_mode = 'off'");

    await runWithDatabaseContext(
      { scope: "public", tenantId, websitePublicKey: key, publicContactEmail: input.email },
      async () => {
        const db = drizzle(client, { schema });
        await client.query("select ce_test_add_forced_failure('leads')");
        await client.query("savepoint public_lead_failure");
        await assert.rejects(
          createPublicLeadInTransaction(db, { tenantId, websiteId }, "atomic-failure", input),
        );
        await client.query("rollback to savepoint public_lead_failure");
        await client.query("set local app.rls_test_mode = 'on'");
        const counts = await client.query<{ contacts: string; leads: string; outbox: string; keys: string }>(
          `select
             (select count(*) from contacts where tenant_id = $1) as contacts,
             (select count(*) from leads where tenant_id = $1) as leads,
             (select count(*) from public_lead_outbox where tenant_id = $1) as outbox,
             (select count(*) from public_lead_idempotency_keys where tenant_id = $1) as keys`,
          [tenantId],
        );
        assert.deepEqual(counts.rows[0], { contacts: "0", leads: "0", outbox: "0", keys: "0" });
        await client.query("set local app.rls_test_mode = 'off'");
      },
    );
  } finally {
    await client.query("rollback");
    client.release();
    await pool.end();
  }
});

test("public lead repository serialiseert gelijktijdige retries met dezelfde Idempotency-Key via de runtime-verbinding", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  // The real API runtime factory: ce_api_runtime, no test mode, so no RLS bypass.
  const runtime = await createApiRuntimeDb(databaseUrl, { ...process.env, EXPECTED_API_DATABASE: "conversion_engine_test" });
  const { pool: fixturePool } = createTestDb(databaseUrl);
  const cleanupPool = createTestMaintenanceDb(databaseUrl).pool;
  const fixtureClient = await fixturePool.connect();
  const tenantId = randomUUID();
  const websiteId = randomUUID();
  const websiteKey = `site_${randomUUID().replaceAll("-", "").slice(0, 32)}`;
  const retryInput = { ...input, email: "retry@example.test" };
  const context = { scope: "public" as const, tenantId, websitePublicKey: websiteKey, publicContactEmail: retryInput.email };

  try {
    await fixtureClient.query(
      `insert into tenants (id, name, status) values ($1, 'Idempotency retry tenant', 'active')`,
      [tenantId],
    );
    await fixtureClient.query(
      `insert into websites (id, tenant_id, public_key, status) values ($1, $2, $3, 'active')`,
      [websiteId, tenantId, websiteKey],
    );

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        runWithDatabaseContext(context, () =>
          createPublicLead(runtime.db, { tenantId, websiteId }, "same-retry-key", retryInput),
        ),
      ),
    );

    const statuses = results.map((result) => result.status).sort();
    assert.deepEqual(statuses, ["accepted", "replayed", "replayed", "replayed"]);
    assert.equal(new Set(results.map((result) => "leadId" in result ? result.leadId : undefined)).size, 1);

    // Counted through the test-only cleanup session, which may see these internal tables.
    const counts = await cleanupPool.query<{ leads: string; outbox: string; keys: string }>(
      `select
         (select count(*) from leads where tenant_id = $1) as leads,
         (select count(*) from public_lead_outbox where tenant_id = $1) as outbox,
         (select count(*) from public_lead_idempotency_keys where tenant_id = $1) as keys`,
      [tenantId],
    );
    assert.deepEqual(counts.rows[0], { leads: "1", outbox: "1", keys: "1" });
  } finally {
    const cleanupClient = await cleanupPool.connect();
    try {
      await cleanupClient.query("begin");
      await cleanupClient.query("delete from public_lead_outbox where tenant_id = $1", [tenantId]);
      await cleanupClient.query("delete from public_lead_idempotency_keys where tenant_id = $1", [tenantId]);
      await cleanupClient.query("delete from public_lead_rate_limits where website_id = $1", [websiteId]);
      await cleanupClient.query("delete from leads where tenant_id = $1", [tenantId]);
      await cleanupClient.query("delete from contacts where tenant_id = $1", [tenantId]);
      await cleanupClient.query("delete from websites where id = $1", [websiteId]);
      await cleanupClient.query("delete from tenants where id = $1", [tenantId]);
      await cleanupClient.query("commit");
    } finally {
      await cleanupClient.query("rollback").catch(() => undefined);
      cleanupClient.release();
      await cleanupPool.end();
    }
    fixtureClient.release();
    await fixturePool.end();
    await runtime.pool.end();
  }
});
