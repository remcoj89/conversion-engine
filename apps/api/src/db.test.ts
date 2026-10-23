import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { buildApp } from "./app.js";
import { findActiveMemberships } from "./auth/membershipResolver.js";
import type { ExternalIdentity } from "./auth/types.js";
import { createDb } from "./db.js";
import * as schema from "./db/schema.js";
import { createLead, findLead, InvalidLeadTenantError, type NewLead } from "./leads/leadRepository.js";
import { findTenant } from "./tenants/tenantLoader.js";

test("database connection reaches conversion_engine_test", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");

  const { pool } = createDb(databaseUrl);

  try {
    const result = await pool.query<{
      database: string;
      user: string;
    }>("select current_database() as database, current_user as user");

    assert.equal(result.rows[0]?.database, "conversion_engine_test");
    assert.equal(result.rows[0]?.user, "conversion_engine");
  } finally {
    await pool.end();
  }
});

test("tenants: tabel bestaat en vult id, status en created_at automatisch", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");

  const { pool } = createDb(databaseUrl);
  const client = await pool.connect();
  const name = `test-tenant-${Date.now()}`;

  try {
    const table = await client.query<{ name: string | null }>(
      "select to_regclass('public.tenants')::text as name",
    );
    assert.equal(table.rows[0]?.name, "tenants");

    // Alles binnen één transactie die altijd wordt teruggedraaid.
    await client.query("begin");
    const tx = drizzle(client, { schema });
    const [tenant] = await tx
      .insert(schema.tenants)
      .values({ name })
      .returning();

    assert.ok(tenant);
    assert.match(
      tenant.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.equal(tenant.name, name);
    assert.equal(tenant.status, "active");
    assert.ok(tenant.createdAt instanceof Date);
    assert.ok(Math.abs(Date.now() - tenant.createdAt.getTime()) < 60_000);
  } finally {
    await client.query("rollback");
    client.release();
  }

  try {
    const left = await pool.query(
      "select count(*)::int as count from tenants where name = $1",
      [name],
    );
    assert.equal(left.rows[0]?.count, 0, "testdata is teruggedraaid");
  } finally {
    await pool.end();
  }
});

type Tx = NodePgDatabase<typeof schema>;

// Draait fn in een transactie die altijd wordt teruggedraaid.
async function withRollback(fn: (tx: Tx, client: PoolClient) => Promise<void>) {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");

  const { pool } = createDb(databaseUrl);
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

// Verwacht een PostgreSQL-fout met deze SQLSTATE; de savepoint houdt de transactie bruikbaar.
async function expectPgError(client: PoolClient, code: string, fn: () => Promise<unknown>) {
  await client.query("savepoint expected_error");
  await assert.rejects(fn, (error: { code?: string; cause?: { code?: string } }) => {
    assert.equal(error.cause?.code ?? error.code, code);
    return true;
  });
  await client.query("rollback to savepoint expected_error");
}

const uniqueId = (prefix: string) => `${prefix}-${randomUUID()}`;

test("users: user kan worden aangemaakt", async () => {
  await withRollback(async (tx, client) => {
    const authProviderUserId = uniqueId("auth");
    const [user] = await tx.insert(schema.users).values({ authProviderUserId }).returning();

    assert.ok(user);
    assert.match(user.id, /^[0-9a-f-]{36}$/);
    assert.equal(user.authProviderUserId, authProviderUserId);
    assert.ok(user.createdAt instanceof Date);

    // auth_provider_user_id is uniek.
    await expectPgError(client, "23505", () =>
      tx.insert(schema.users).values({ authProviderUserId }),
    );
  });
});

test("memberships: koppelt user aan tenant", async () => {
  await withRollback(async (tx, client) => {
    const [tenant] = await tx.insert(schema.tenants).values({ name: uniqueId("tenant") }).returning();
    const [user] = await tx.insert(schema.users).values({ authProviderUserId: uniqueId("auth") }).returning();
    assert.ok(tenant && user);

    const [membership] = await tx
      .insert(schema.memberships)
      .values({ tenantId: tenant.id, userId: user.id, role: "owner" })
      .returning();

    assert.ok(membership);
    assert.equal(membership.tenantId, tenant.id);
    assert.equal(membership.userId, user.id);
    assert.equal(membership.role, "owner");
    assert.equal(membership.status, "active");
    assert.ok(membership.createdAt instanceof Date);

    // Foreign keys: geen membership naar een niet-bestaande tenant of user.
    await expectPgError(client, "23503", () =>
      tx.insert(schema.memberships).values({ tenantId: randomUUID(), userId: user.id, role: "owner" }),
    );
    await expectPgError(client, "23503", () =>
      tx.insert(schema.memberships).values({ tenantId: tenant.id, userId: randomUUID(), role: "owner" }),
    );
  });
});

test("memberships: dezelfde user kan aan twee tenants gekoppeld worden", async () => {
  await withRollback(async (tx) => {
    const [tenantA, tenantB] = await tx
      .insert(schema.tenants)
      .values([{ name: uniqueId("tenant-a") }, { name: uniqueId("tenant-b") }])
      .returning();
    const [user] = await tx.insert(schema.users).values({ authProviderUserId: uniqueId("auth") }).returning();
    assert.ok(tenantA && tenantB && user);

    await tx.insert(schema.memberships).values([
      { tenantId: tenantA.id, userId: user.id, role: "owner" },
      { tenantId: tenantB.id, userId: user.id, role: "team_member" },
    ]);

    const rows = await tx
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, user.id));
    assert.deepEqual(
      rows.map((row) => row.tenantId).sort(),
      [tenantA.id, tenantB.id].sort(),
    );
  });
});

test("memberships: dezelfde user kan niet twee keer aan dezelfde tenant gekoppeld worden", async () => {
  await withRollback(async (tx, client) => {
    const [tenant] = await tx.insert(schema.tenants).values({ name: uniqueId("tenant") }).returning();
    const [user] = await tx.insert(schema.users).values({ authProviderUserId: uniqueId("auth") }).returning();
    assert.ok(tenant && user);

    await tx.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" });
    await expectPgError(client, "23505", () =>
      tx.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, role: "team_member" }),
    );
  });
});

test("memberships: toegestane rollen en statussen werken, andere worden geweigerd", async () => {
  await withRollback(async (tx, client) => {
    const [user] = await tx.insert(schema.users).values({ authProviderUserId: uniqueId("auth") }).returning();
    assert.ok(user);

    for (const role of ["owner", "team_member"] as const) {
      for (const status of ["active", "invited", "disabled"] as const) {
        const [tenant] = await tx.insert(schema.tenants).values({ name: uniqueId("tenant") }).returning();
        assert.ok(tenant);
        const [membership] = await tx
          .insert(schema.memberships)
          .values({ tenantId: tenant.id, userId: user.id, role, status })
          .returning();
        assert.equal(membership?.role, role);
        assert.equal(membership?.status, status);
      }
    }

    // Ongeldige waarden via ruwe SQL, omdat de TypeScript-types ze al tegenhouden.
    const [tenant] = await tx.insert(schema.tenants).values({ name: uniqueId("tenant") }).returning();
    assert.ok(tenant);
    await expectPgError(client, "23514", () =>
      client.query("insert into memberships (tenant_id, user_id, role) values ($1, $2, 'admin')", [tenant.id, user.id]),
    );
    await expectPgError(client, "23514", () =>
      client.query(
        "insert into memberships (tenant_id, user_id, role, status) values ($1, $2, 'owner', 'deleted')",
        [tenant.id, user.id],
      ),
    );
  });
});

const TEST_ISSUER = "https://issuer.test";
const identityFor = (subject: string): ExternalIdentity => ({ issuer: TEST_ISSUER, subject });

// Maakt een user aan en geeft zijn identity terug.
async function createUser(tx: Tx) {
  const [user] = await tx.insert(schema.users).values({ authProviderUserId: uniqueId("auth") }).returning();
  assert.ok(user);
  return { user, identity: identityFor(user.authProviderUserId) };
}

async function createTenant(tx: Tx, status = "active") {
  const [tenant] = await tx.insert(schema.tenants).values({ name: uniqueId("tenant"), status }).returning();
  assert.ok(tenant);
  return tenant;
}

test("findActiveMemberships: onbekende user geeft geen memberships", async () => {
  await withRollback(async (tx) => {
    // Een bestaande tenant met membership mag niet lekken naar een onbekend subject.
    const { user } = await createUser(tx);
    const tenant = await createTenant(tx);
    await tx.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" });

    assert.deepEqual(await findActiveMemberships(tx, identityFor(uniqueId("unknown"))), []);
  });
});

test("findActiveMemberships: user zonder membership geeft een lege lijst", async () => {
  await withRollback(async (tx) => {
    const { identity } = await createUser(tx);
    await createTenant(tx);

    assert.deepEqual(await findActiveMemberships(tx, identity), []);
  });
});

test("findActiveMemberships: actieve owner en team_member worden gevonden", async () => {
  await withRollback(async (tx) => {
    for (const role of ["owner", "team_member"] as const) {
      const { user, identity } = await createUser(tx);
      const tenant = await createTenant(tx);
      await tx.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, role });

      assert.deepEqual(await findActiveMemberships(tx, identity), [
        { tenantId: tenant.id, userId: user.id, role, status: "active" },
      ]);
    }
  });
});

test("findActiveMemberships: disabled en invited memberships worden niet gevonden", async () => {
  await withRollback(async (tx) => {
    for (const status of ["disabled", "invited"] as const) {
      const { user, identity } = await createUser(tx);
      const tenant = await createTenant(tx);
      await tx.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner", status });

      assert.deepEqual(await findActiveMemberships(tx, identity), [], `status ${status}`);
    }
  });
});

test("findActiveMemberships: membership in inactieve tenant wordt niet gevonden", async () => {
  await withRollback(async (tx) => {
    const { user, identity } = await createUser(tx);
    const tenant = await createTenant(tx, "suspended");
    await tx.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" });

    assert.deepEqual(await findActiveMemberships(tx, identity), []);
  });
});

test("findActiveMemberships: user met memberships in twee actieve tenants", async () => {
  await withRollback(async (tx) => {
    const { user, identity } = await createUser(tx);
    const tenantA = await createTenant(tx);
    const tenantB = await createTenant(tx);
    // Een membership van een andere user in tenant A mag niet meekomen.
    const { user: other } = await createUser(tx);
    await tx.insert(schema.memberships).values([
      { tenantId: tenantA.id, userId: user.id, role: "owner" },
      { tenantId: tenantB.id, userId: user.id, role: "team_member" },
      { tenantId: tenantA.id, userId: other.id, role: "team_member" },
    ]);

    const byTenant = (a: { tenantId: string }, b: { tenantId: string }) => a.tenantId.localeCompare(b.tenantId);
    assert.deepEqual(
      (await findActiveMemberships(tx, identity)).sort(byTenant),
      [
        { tenantId: tenantA.id, userId: user.id, role: "owner", status: "active" },
        { tenantId: tenantB.id, userId: user.id, role: "team_member", status: "active" },
      ].sort(byTenant),
    );
  });
});

test("findTenant: geeft alleen id, naam en status van precies die tenant", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const other = await createTenant(tx);

    assert.deepEqual(await findTenant(tx, tenant.id), { id: tenant.id, name: tenant.name, status: "active" });
    assert.deepEqual(await findTenant(tx, other.id), { id: other.id, name: other.name, status: "active" });
  });
});

test("findTenant: onbekende tenant geeft null", async () => {
  await withRollback(async (tx) => {
    await createTenant(tx);

    assert.equal(await findTenant(tx, randomUUID()), null);
  });
});

test("findTenant: geeft de opgeslagen status terug", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx, "suspended");

    assert.deepEqual(await findTenant(tx, tenant.id), { id: tenant.id, name: tenant.name, status: "suspended" });
  });
});

const exampleLead = (overrides: Partial<NewLead> = {}): NewLead => ({
  name: "Voorbeeld Persoon",
  email: "voorbeeld@example.test",
  phone: "0612345678",
  message: "Ik wil graag kennismaken.",
  source: "contact_form",
  ...overrides,
});

// Verwacht InvalidLeadTenantError; de savepoint houdt de transactie bruikbaar na de databasefout.
async function expectInvalidTenant(client: PoolClient, fn: () => Promise<unknown>) {
  await client.query("savepoint expected_error");
  await assert.rejects(fn, InvalidLeadTenantError);
  await client.query("rollback to savepoint expected_error");
}

test("createLead: slaat de lead op bij de tenant met standaardstatus new", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const lead = await createLead(tx, tenant.id, exampleLead());

    assert.match(lead.id, /^[0-9a-f-]{36}$/);
    assert.equal(lead.tenantId, tenant.id);
    assert.equal(lead.name, "Voorbeeld Persoon");
    assert.equal(lead.email, "voorbeeld@example.test");
    assert.equal(lead.phone, "0612345678");
    assert.equal(lead.message, "Ik wil graag kennismaken.");
    assert.equal(lead.source, "contact_form");
    assert.equal(lead.status, "new");
    assert.ok(lead.createdAt instanceof Date);
    assert.ok(lead.updatedAt instanceof Date);
    assert.deepEqual(await findLead(tx, tenant.id, lead.id), lead);
  });
});

test("createLead: telefoonnummer is optioneel", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);

    assert.equal((await createLead(tx, tenant.id, exampleLead({ phone: undefined }))).phone, null);
    assert.equal((await createLead(tx, tenant.id, exampleLead({ phone: null }))).phone, null);
  });
});

test("createLead: onbekende, ongeldige of lege tenant wordt geweigerd", async () => {
  await withRollback(async (tx, client) => {
    for (const tenantId of [randomUUID(), "abc", ""]) {
      await expectInvalidTenant(client, () => createLead(tx, tenantId, exampleLead()));
    }
    const { rows } = await client.query<{ count: number }>("select count(*)::int as count from leads");
    assert.equal(rows[0]?.count, 0);
  });
});

test("leads: database weigert een lead zonder tenant of met onbekende status", async () => {
  await withRollback(async (tx, client) => {
    const tenant = await createTenant(tx);
    // Ruwe SQL, omdat de TypeScript-types deze waarden al tegenhouden.
    await expectPgError(client, "23502", () =>
      client.query("insert into leads (name, email, message, source) values ('n', 'e', 'm', 's')"),
    );
    await expectPgError(client, "23514", () =>
      client.query(
        "insert into leads (tenant_id, name, email, message, source, status) values ($1, 'n', 'e', 'm', 's', 'won')",
        [tenant.id],
      ),
    );
  });
});

test("findLead: lead van tenant A is nooit zichtbaar voor tenant B", async () => {
  await withRollback(async (tx) => {
    const tenantA = await createTenant(tx);
    const tenantB = await createTenant(tx);
    const leadA = await createLead(tx, tenantA.id, exampleLead({ name: "Lead A" }));
    const leadB = await createLead(tx, tenantB.id, exampleLead({ name: "Lead B" }));

    assert.equal((await findLead(tx, tenantA.id, leadA.id))?.name, "Lead A");
    assert.equal((await findLead(tx, tenantB.id, leadB.id))?.name, "Lead B");
    assert.equal(await findLead(tx, tenantB.id, leadA.id), null);
    assert.equal(await findLead(tx, tenantA.id, leadB.id), null);
  });
});

test("findLead: onbekende lead of onbekende tenant geeft null", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const lead = await createLead(tx, tenant.id, exampleLead());

    assert.equal(await findLead(tx, tenant.id, randomUUID()), null);
    assert.equal(await findLead(tx, randomUUID(), lead.id), null);
  });
});

test("HTTP met echte resolver en loader: eigen tenant 200, andere tenant en disabled membership 403", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const otherTenant = await createTenant(tx);
    const active = await createUser(tx);
    const disabled = await createUser(tx);
    await tx.insert(schema.memberships).values([
      { tenantId: tenant.id, userId: active.user.id, role: "owner" },
      { tenantId: tenant.id, userId: disabled.user.id, role: "owner", status: "disabled" },
    ]);

    // Test-only adapter: subject uit een testheader.
    const app = buildApp(
      {
        authAdapter: {
          authenticate: async (request) => {
            const subject = request.headers["x-test-identity"];
            return typeof subject === "string"
              ? { status: "authenticated", identity: identityFor(subject) }
              : { status: "anonymous" };
          },
        },
        membershipResolver: (identity) => findActiveMemberships(tx, identity),
        tenantLoader: (tenantId) => findTenant(tx, tenantId),
      },
      { logger: false },
    );

    try {
      const ok = await app.inject({
        method: "GET",
        url: "/v1/dashboard/today",
        headers: { "x-test-identity": active.identity.subject, "x-tenant-id": tenant.id },
      });
      assert.equal(ok.statusCode, 200);
      assert.deepEqual(ok.json().tenant, { id: tenant.id, name: tenant.name, status: "active" });
      assert.ok(!ok.body.includes(otherTenant.name));

      // Een bestaande tenant zonder membership levert geen data op.
      const otherResponse = await app.inject({
        method: "GET",
        url: "/v1/dashboard/today",
        headers: { "x-test-identity": active.identity.subject, "x-tenant-id": otherTenant.id },
      });
      assert.equal(otherResponse.statusCode, 403);
      assert.ok(!otherResponse.body.includes(otherTenant.name));

      const forbidden = await app.inject({
        method: "GET",
        url: "/v1/dashboard/today",
        headers: { "x-test-identity": disabled.identity.subject, "x-tenant-id": tenant.id },
      });
      assert.equal(forbidden.statusCode, 403);
      assert.deepEqual(forbidden.json(), { error: "forbidden" });
    } finally {
      await app.close();
    }
  });
});

test("testdata is na de tests teruggedraaid", async () => {
  const { pool } = createDb(process.env.DATABASE_TEST_URL);
  try {
    const { rows } = await pool.query<{ tenants: number; users: number; memberships: number; leads: number }>(
      `select (select count(*)::int from tenants) as tenants,
              (select count(*)::int from users) as users,
              (select count(*)::int from memberships) as memberships,
              (select count(*)::int from leads) as leads`,
    );
    assert.deepEqual(rows[0], { tenants: 0, users: 0, memberships: 0, leads: 0 });
  } finally {
    await pool.end();
  }
});

test("memberships: index memberships_user_id_idx bestaat op user_id", async () => {
  const { pool } = createDb(process.env.DATABASE_TEST_URL);
  try {
    const { rows } = await pool.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where schemaname = 'public' and tablename = 'memberships' and indexname = 'memberships_user_id_idx'",
    );
    assert.equal(rows.length, 1);
    assert.match(rows[0]?.indexdef ?? "", /^CREATE INDEX .* USING btree \(user_id\)$/);
  } finally {
    await pool.end();
  }
});
