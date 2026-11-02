import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { createApiRuntimeDb, createTestDb } from "../db.js";
import * as schema from "./schema.js";
import { runWithDatabaseContext, type DatabaseRequestContext } from "./requestContext.js";

// These tests use the real API runtime factory (ce_api_runtime, no test mode), so RLS and
// the test bypass behave exactly as in the running API. Only fixture setup and cleanup use
// the explicit test connection with the bypass.

type RuntimeConnection = Awaited<ReturnType<typeof createApiRuntimeDb>>;

const TEST_DATABASE = "conversion_engine_test";
let runtime: RuntimeConnection;
let fixtureClient: PoolClient;
let fixturePool: ReturnType<typeof createTestDb>["pool"];
const tenantId = randomUUID();
const userId = randomUUID();
const subject = `transaction-context-${randomUUID()}`;
const customerContext: DatabaseRequestContext = { scope: "customer", subject, tenantId };

function requiredDatabaseTestUrl(): string {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  return databaseUrl;
}

function pgCode(error: unknown): string | undefined {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  if (typeof candidate?.code === "string") return candidate.code;
  return typeof candidate?.cause?.code === "string" ? candidate.cause.code : undefined;
}

before(async () => {
  const databaseUrl = requiredDatabaseTestUrl();
  runtime = await createApiRuntimeDb(databaseUrl, { ...process.env, EXPECTED_API_DATABASE: TEST_DATABASE });
  fixturePool = createTestDb(databaseUrl).pool;
  fixtureClient = await fixturePool.connect();
  await fixtureClient.query(`insert into tenants (id, name, status) values ($1, 'Transaction context tenant', 'active')`, [tenantId]);
  await fixtureClient.query(`insert into users (id, auth_provider_user_id) values ($1, $2)`, [userId, subject]);
  await fixtureClient.query(
    `insert into memberships (tenant_id, user_id, role, status) values ($1, $2, 'owner', 'active')`,
    [tenantId, userId],
  );
});

after(async () => {
  try {
    await fixtureClient.query("delete from organizations where tenant_id = $1", [tenantId]);
    await fixtureClient.query("delete from memberships where tenant_id = $1", [tenantId]);
    await fixtureClient.query("delete from users where id = $1", [userId]);
    await fixtureClient.query("delete from tenants where id = $1", [tenantId]);
  } finally {
    fixtureClient.release();
    await fixturePool.end();
    await runtime.pool.end();
  }
});

test("runtime-rol zonder test-bypass: de test-bypass is uit", async () => {
  const result = await runWithDatabaseContext(customerContext, async () =>
    await runtime.db.execute(sql`select ce_rls_test_bypass() as bypass, current_user::text as role`),
  );
  assert.deepEqual(result.rows[0], { bypass: false, role: "ce_api_runtime" });
});

test("db.transaction onder RLS-context gebruikt één PostgreSQL-transactie met de context", async () => {
  const rows = await runWithDatabaseContext(customerContext, () =>
    runtime.db.transaction(async (tx) => {
      const first = await tx.execute(sql`select txid_current()::text as txid, current_setting('app.rls_scope', true) as scope, current_setting('app.rls_tenant_id', true) as tenant`);
      const second = await tx.execute(sql`select txid_current()::text as txid`);
      return { first: first.rows[0], second: second.rows[0] };
    }),
  );
  assert.equal(rows.first.txid, rows.second.txid);
  assert.equal(rows.first.scope, "customer");
  assert.equal(rows.first.tenant, tenantId);
});

test("een fout halverwege een contexttransactie draait alle wijzigingen terug", async () => {
  const marker = `rollback-${randomUUID()}`;
  await assert.rejects(
    runWithDatabaseContext(customerContext, () =>
      runtime.db.transaction(async (tx) => {
        await tx.insert(schema.organizations).values({ tenantId, name: marker });
        const visible = await tx.execute(sql`select count(*)::int as count from organizations where name = ${marker}`);
        assert.equal(visible.rows[0].count, 1);
        throw new Error("forced failure");
      }),
    ),
    /forced failure/,
  );

  const remaining = await runWithDatabaseContext(customerContext, async () =>
    await runtime.db.execute(sql`select count(*)::int as count from organizations where name = ${marker}`),
  );
  assert.equal(remaining.rows[0].count, 0);
});

test("FOR UPDATE-lock blijft staan tot het einde van de contexttransactie", async () => {
  await runWithDatabaseContext(customerContext, () =>
    runtime.db.transaction(async (tx) => {
      await tx.execute(sql`select id from tenants where id = ${tenantId} for update`);

      // A second runtime connection must not obtain the same row lock meanwhile.
      await assert.rejects(
        runtime.db.transaction((other) => other.execute(sql`select id from tenants where id = ${tenantId} for update nowait`)),
        (error) => pgCode(error) === "55P03",
      );
    }),
  );

  // After commit the lock is released.
  const relocked = await runWithDatabaseContext(customerContext, () =>
    runtime.db.transaction((tx) => tx.execute(sql`select id from tenants where id = ${tenantId} for update nowait`)),
  );
  assert.equal(relocked.rows.length, 1);
});

test("pg_advisory_xact_lock blijft transactioneel onder RLS-context", async () => {
  const lockKey = `transaction-context:${randomUUID()}`;
  await runWithDatabaseContext(customerContext, () =>
    runtime.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const other = await runtime.db.transaction((otherTx) =>
        otherTx.execute(sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as acquired`),
      );
      assert.equal(other.rows[0].acquired, false);
    }),
  );

  const afterCommit = await runWithDatabaseContext(customerContext, () =>
    runtime.db.transaction((tx) =>
      tx.execute(sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as acquired`),
    ),
  );
  assert.equal(afterCommit.rows[0].acquired, true);
});

test("RLS-context lekt niet naar een volgende transactie op dezelfde verbinding", async () => {
  const client = await runtime.pool.connect();
  try {
    const connectionDb = drizzle(client, { schema });
    await runWithDatabaseContext(customerContext, () =>
      connectionDb.transaction((tx) => tx.execute(sql`select 1`)),
    );

    const withoutContext = await client.query<{ scope: string | null; tenant: string | null }>(
      "select current_setting('app.rls_scope', true) as scope, current_setting('app.rls_tenant_id', true) as tenant",
    );
    assert.ok(!withoutContext.rows[0].scope);
    assert.ok(!withoutContext.rows[0].tenant);

    const otherTenantId = randomUUID();
    const otherContext = await runWithDatabaseContext({ scope: "customer", subject, tenantId: otherTenantId }, () =>
      connectionDb.transaction((tx) =>
        tx.execute(sql`select current_setting('app.rls_tenant_id', true) as tenant, (select count(*)::int from tenants where id = ${tenantId}) as visible`),
      ),
    );
    assert.equal(otherContext.rows[0].tenant, otherTenantId);
    assert.equal(otherContext.rows[0].visible, 0);
  } finally {
    client.release();
  }
});

test("een gewijzigde context binnen één transactie wordt opnieuw toegepast", async () => {
  const rows = await runWithDatabaseContext({ scope: "maintenance" }, () =>
    runtime.db.transaction(async (tx) => {
      const outer = await tx.execute(sql`select current_setting('app.rls_scope', true) as scope, txid_current()::text as txid`);
      // Drizzle queries are lazy: await inside the callback so the query runs in this context.
      const inner = await runWithDatabaseContext(customerContext, async () =>
        await tx.execute(sql`select current_setting('app.rls_scope', true) as scope, txid_current()::text as txid`),
      );
      const restored = await tx.execute(sql`select current_setting('app.rls_scope', true) as scope`);
      return { outer: outer.rows[0], inner: inner.rows[0], restored: restored.rows[0] };
    }),
  );
  assert.equal(rows.outer.scope, "maintenance");
  assert.equal(rows.inner.scope, "customer");
  assert.equal(rows.inner.txid, rows.outer.txid);
  assert.equal(rows.restored.scope, "maintenance");
});

test("cross-tenant: een andere tenantcontext ziet de fixture-tenant en zijn organisaties niet", async () => {
  const rows = await runWithDatabaseContext({ scope: "customer", subject, tenantId: randomUUID() }, async () =>
    await runtime.db.execute(sql`select (select count(*)::int from tenants where id = ${tenantId}) as tenants, (select count(*)::int from organizations where tenant_id = ${tenantId}) as organizations`),
  );
  assert.deepEqual(rows.rows[0], { tenants: 0, organizations: 0 });

  // Positive control: the owning tenant context does see its own tenant.
  const own = await runWithDatabaseContext(customerContext, async () =>
    await runtime.db.execute(sql`select count(*)::int as tenants from tenants where id = ${tenantId}`),
  );
  assert.equal(own.rows[0].tenants, 1);
});
