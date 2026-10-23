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
import { findCurrentOnboarding, saveOnboardingDraftInTransaction, submitOnboardingInTransaction } from "./onboarding/onboardingRepository.js";
import type { OnboardingStore } from "./routes/onboarding.js";
import { completeAnswers } from "../../../packages/onboarding-contract/src/testFixtures.ts";
import { findActiveWebsiteContext } from "./websites/websiteResolver.js";
import { generateWebsitePublicKey, WEBSITE_PUBLIC_KEY_PATTERN } from "./websites/websitePublicKey.js";

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

// Echte repository binnen de rollback-transactie van de test.
const onboardingStoreFor = (tx: Tx): OnboardingStore => ({
  findCurrent: (tenantId) => findCurrentOnboarding(tx, tenantId),
  saveDraft: (input) => saveOnboardingDraftInTransaction(tx, input),
  submit: (input) => submitOnboardingInTransaction(tx, input),
});

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
        leadCreator: (tenantId, lead) => createLead(tx, tenantId, lead),
        onboardingStore: onboardingStoreFor(tx),
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

test("HTTP POST /v1/leads met echte repository: lead komt bij de eigen tenant, niet bij een andere", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const otherTenant = await createTenant(tx);
    const owner = await createUser(tx);
    await tx.insert(schema.memberships).values({ tenantId: tenant.id, userId: owner.user.id, role: "owner" });

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
        leadCreator: (tenantId, lead) => createLead(tx, tenantId, lead),
        onboardingStore: onboardingStoreFor(tx),
      },
      { logger: false },
    );

    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/leads",
        headers: { "x-test-identity": owner.identity.subject },
        payload: exampleLead(),
      });
      assert.equal(response.statusCode, 201);
      const { id, status } = response.json();
      assert.equal(status, "new");

      const stored = await findLead(tx, tenant.id, id);
      assert.equal(stored?.tenantId, tenant.id);
      assert.equal(stored?.status, "new");
      assert.equal(await findLead(tx, otherTenant.id, id), null);
    } finally {
      await app.close();
    }
  });
});

async function createWebsite(tx: Tx, tenantId: string, status: "active" | "disabled" = "active") {
  const [website] = await tx.insert(schema.websites).values({ tenantId, status }).returning();
  assert.ok(website);
  return website;
}

test("websites: public key wordt gegenereerd, is opaque en bevat geen tenant-ID", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const first = await createWebsite(tx, tenant.id);
    const second = await createWebsite(tx, tenant.id);

    for (const website of [first, second]) {
      assert.match(website.publicKey, new RegExp(WEBSITE_PUBLIC_KEY_PATTERN));
      assert.ok(!website.publicKey.includes(tenant.id));
      assert.ok(!website.publicKey.includes(tenant.id.replaceAll("-", "")));
      assert.ok(!website.publicKey.includes(website.id));
    }
    assert.notEqual(first.publicKey, second.publicKey);
  });
});

test("websites: nieuwe website staat standaard op disabled", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const [website] = await tx.insert(schema.websites).values({ tenantId: tenant.id }).returning();

    assert.equal(website?.status, "disabled");
    assert.equal(await findActiveWebsiteContext(tx, website?.publicKey), null);
  });
});

test("findActiveWebsiteContext: actieve website geeft alleen website- en tenant-ID van de juiste tenant", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const website = await createWebsite(tx, tenant.id);

    assert.deepEqual(await findActiveWebsiteContext(tx, website.publicKey), {
      websiteId: website.id,
      tenantId: tenant.id,
    });
  });
});

test("findActiveWebsiteContext: onbekende key geeft null", async () => {
  await withRollback(async (tx) => {
    await createWebsite(tx, (await createTenant(tx)).id);

    assert.equal(await findActiveWebsiteContext(tx, generateWebsitePublicKey()), null);
  });
});

test("findActiveWebsiteContext: disabled website geeft null", async () => {
  await withRollback(async (tx) => {
    const website = await createWebsite(tx, (await createTenant(tx)).id, "disabled");

    assert.equal(await findActiveWebsiteContext(tx, website.publicKey), null);
  });
});

test("findActiveWebsiteContext: website van een inactieve tenant geeft null", async () => {
  await withRollback(async (tx) => {
    const website = await createWebsite(tx, (await createTenant(tx, "suspended")).id);

    assert.equal(await findActiveWebsiteContext(tx, website.publicKey), null);
  });
});

test("findActiveWebsiteContext: lege of ongeldige key geeft null", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const website = await createWebsite(tx, tenant.id);

    for (const key of ["", "   ", "abc", tenant.id, website.id, ` ${website.publicKey}`, `${website.publicKey}x`, website.publicKey.toUpperCase(), null, undefined, 123, {}]) {
      assert.equal(await findActiveWebsiteContext(tx, key), null, String(key));
    }
  });
});

test("findActiveWebsiteContext: tenant A wordt nooit teruggegeven via een key van tenant B", async () => {
  await withRollback(async (tx) => {
    const tenantA = await createTenant(tx);
    const tenantB = await createTenant(tx);
    const websiteA = await createWebsite(tx, tenantA.id);
    const websiteB = await createWebsite(tx, tenantB.id);

    assert.deepEqual(await findActiveWebsiteContext(tx, websiteA.publicKey), { websiteId: websiteA.id, tenantId: tenantA.id });
    assert.deepEqual(await findActiveWebsiteContext(tx, websiteB.publicKey), { websiteId: websiteB.id, tenantId: tenantB.id });
  });
});

test("websites: twee tenants kunnen niet dezelfde public key hebben", async () => {
  await withRollback(async (tx, client) => {
    const tenantA = await createTenant(tx);
    const tenantB = await createTenant(tx);
    const websiteA = await createWebsite(tx, tenantA.id);

    await expectPgError(client, "23505", () =>
      tx.insert(schema.websites).values({ tenantId: tenantB.id, publicKey: websiteA.publicKey, status: "active" }),
    );
    assert.deepEqual(await findActiveWebsiteContext(tx, websiteA.publicKey), { websiteId: websiteA.id, tenantId: tenantA.id });
  });
});

test("websites: database weigert een website zonder geldige tenant, met ongeldige key of status", async () => {
  await withRollback(async (tx, client) => {
    const tenant = await createTenant(tx);

    await expectPgError(client, "23503", () => tx.insert(schema.websites).values({ tenantId: randomUUID() }));
    // Ruwe SQL, omdat de TypeScript-types deze waarden al tegenhouden.
    await expectPgError(client, "23502", () =>
      client.query("insert into websites (public_key) values ($1)", [generateWebsitePublicKey()]),
    );
    for (const publicKey of [tenant.id, "site_kort", ""]) {
      await expectPgError(client, "23514", () =>
        client.query("insert into websites (tenant_id, public_key) values ($1, $2)", [tenant.id, publicKey]),
      );
    }
    await expectPgError(client, "23514", () =>
      client.query("insert into websites (tenant_id, public_key, status) values ($1, $2, 'deleted')", [
        tenant.id,
        generateWebsitePublicKey(),
      ]),
    );
  });
});

// ---------- Onboarding ----------

const draftInput = (tenantId: string, userId: string, baseVersion: number, answers: Record<string, unknown> = {}) => ({
  tenantId,
  userId,
  baseVersion,
  schemaId: "WESTEND_ONBOARDING",
  schemaVersion: "0.1.0-design",
  answers,
  projectBrief: { status: "incomplete_draft" },
});

test("onboarding: tenant zonder project heeft geen draft", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    assert.equal(await findCurrentOnboarding(tx, tenant.id), null);
  });
});

test("onboarding: eerste opslag maakt project en versie 1; hervatten geeft dezelfde antwoorden", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const { user } = await createUser(tx);
    const result = await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 0, { company_name: "Bedrijf" }));
    assert.equal(result.status, "saved");

    const draft = await findCurrentOnboarding(tx, tenant.id);
    assert.ok(draft);
    assert.equal(draft.version, 1);
    assert.equal(draft.status, "draft");
    assert.deepEqual(draft.answers, { company_name: "Bedrijf" });
    assert.deepEqual(draft.projectBrief, { status: "incomplete_draft" });
    assert.equal(draft.schemaVersion, "0.1.0-design");
  });
});

test("onboarding: elke opslag is een nieuwe, onveranderlijke versie", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const { user } = await createUser(tx);
    for (let base = 0; base < 3; base++) {
      const result = await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, base, { company_name: `Versie ${base + 1}` }));
      assert.equal(result.status === "saved" && result.draft.version, base + 1);
    }
    const versions = await tx
      .select({ version: schema.onboardingVersions.version, answers: schema.onboardingVersions.answers, createdBy: schema.onboardingVersions.createdBy })
      .from(schema.onboardingVersions)
      .where(eq(schema.onboardingVersions.tenantId, tenant.id));
    assert.deepEqual(versions.map((row) => row.version).sort(), [1, 2, 3]);
    assert.ok(versions.every((row) => row.createdBy === user.id));
    assert.deepEqual((await findCurrentOnboarding(tx, tenant.id))?.answers, { company_name: "Versie 3" });
  });
});

test("onboarding: een verouderde base_version geeft een conflict en wijzigt niets", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const { user } = await createUser(tx);
    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 0, { company_name: "Eerste" }));
    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 1, { company_name: "Tweede" }));

    assert.deepEqual(await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 1, { company_name: "Oud" })), {
      status: "conflict",
      currentVersion: 2,
    });
    assert.deepEqual(await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 0)), { status: "conflict", currentVersion: 2 });
    const other = await createTenant(tx);
    assert.deepEqual(await saveOnboardingDraftInTransaction(tx, draftInput(other.id, user.id, 3)), { status: "conflict", currentVersion: 0 });
    assert.deepEqual((await findCurrentOnboarding(tx, tenant.id))?.answers, { company_name: "Tweede" });
  });
});

test("onboarding: een niet-concept project kan niet worden gewijzigd", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const { user } = await createUser(tx);
    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 0));
    await tx.update(schema.onboardingProjects).set({ status: "submitted" }).where(eq(schema.onboardingProjects.tenantId, tenant.id));
    assert.deepEqual(await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 1)), { status: "not_editable" });
  });
});

test("onboarding: tenant A ziet en wijzigt nooit de draft van tenant B", async () => {
  await withRollback(async (tx) => {
    const tenantA = await createTenant(tx);
    const tenantB = await createTenant(tx);
    const { user } = await createUser(tx);
    await saveOnboardingDraftInTransaction(tx, draftInput(tenantB.id, user.id, 0, { company_name: "Geheim B" }));

    assert.equal(await findCurrentOnboarding(tx, tenantA.id), null);
    const savedA = await saveOnboardingDraftInTransaction(tx, draftInput(tenantA.id, user.id, 0, { company_name: "A" }));
    assert.equal(savedA.status === "saved" && savedA.draft.version, 1, "A begint een eigen project");
    assert.deepEqual((await findCurrentOnboarding(tx, tenantB.id))?.answers, { company_name: "Geheim B" });
  });
});

test("onboarding: database bewaakt tenantkoppeling, unieke versies, één lopend project en geldige waarden", async () => {
  await withRollback(async (tx, client) => {
    const tenantA = await createTenant(tx);
    const tenantB = await createTenant(tx);
    const { user } = await createUser(tx);
    const saved = await saveOnboardingDraftInTransaction(tx, draftInput(tenantA.id, user.id, 0));
    assert.equal(saved.status, "saved");
    const projectId = saved.status === "saved" ? saved.draft.projectId : "";
    const insertVersion = (tenantId: string, version: number, answers = "{}") =>
      client.query(
        `insert into onboarding_versions (tenant_id, project_id, version, schema_id, schema_version, answers, project_brief, created_by)
         values ($1, $2, $3, 'WESTEND_ONBOARDING', '0.1.0-design', $4::jsonb, '{}'::jsonb, $5)`,
        [tenantId, projectId, version, answers, user.id],
      );

    // Versie van tenant B die naar het project van tenant A wijst.
    await expectPgError(client, "23503", () => insertVersion(tenantB.id, 2));
    await expectPgError(client, "23505", () => insertVersion(tenantA.id, 1));
    await expectPgError(client, "23514", () => insertVersion(tenantA.id, 0));
    await expectPgError(client, "23514", () => insertVersion(tenantA.id, 2, "[]"));
    await expectPgError(client, "23505", () =>
      client.query("insert into onboarding_projects (tenant_id, current_version) values ($1, 1)", [tenantA.id]),
    );
    await expectPgError(client, "23514", () =>
      client.query("insert into onboarding_projects (tenant_id, status, current_version) values ($1, 'live', 1)", [tenantB.id]),
    );
    await expectPgError(client, "23503", () =>
      client.query("insert into onboarding_projects (tenant_id, current_version) values ($1, 1)", [randomUUID()]),
    );
  });
});

test("HTTP onboarding met echte repository: Owner bewaart en hervat, Team Member krijgt 403", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const owner = await createUser(tx);
    const member = await createUser(tx);
    await tx.insert(schema.memberships).values([
      { tenantId: tenant.id, userId: owner.user.id, role: "owner" },
      { tenantId: tenant.id, userId: member.user.id, role: "team_member" },
    ]);
    const app = buildApp(
      {
        authAdapter: {
          authenticate: async (request) => {
            const subject = request.headers["x-test-identity"];
            return typeof subject === "string" ? { status: "authenticated", identity: identityFor(subject) } : { status: "anonymous" };
          },
        },
        membershipResolver: (identity) => findActiveMemberships(tx, identity),
        tenantLoader: (tenantId) => findTenant(tx, tenantId),
        leadCreator: (tenantId, lead) => createLead(tx, tenantId, lead),
        onboardingStore: onboardingStoreFor(tx),
      },
      { logger: false },
    );
    const payload = {
      schema_id: "WESTEND_ONBOARDING",
      schema_version: "0.1.0-design",
      base_version: 0,
      answers: { company_name: "Sterk & Fit Coaching", domain_status: "new", domain_name: "verborgen.nl" },
    };
    try {
      const put = await app.inject({ method: "PUT", url: "/v1/onboarding/current", headers: { "x-test-identity": owner.identity.subject }, payload });
      assert.equal(put.statusCode, 200);
      assert.equal(put.json().version, 1);

      const get = await app.inject({ method: "GET", url: "/v1/onboarding/current", headers: { "x-test-identity": owner.identity.subject } });
      assert.deepEqual(get.json().answers, { company_name: "Sterk & Fit Coaching", domain_status: "new" });
      assert.equal(get.json().project_brief.client_supplied.business.name, "Sterk & Fit Coaching");
      assert.ok(!get.body.includes("verborgen.nl"));

      const conflict = await app.inject({ method: "PUT", url: "/v1/onboarding/current", headers: { "x-test-identity": owner.identity.subject }, payload });
      assert.equal(conflict.statusCode, 409);

      const forbidden = await app.inject({ method: "GET", url: "/v1/onboarding/current", headers: { "x-test-identity": member.identity.subject } });
      assert.equal(forbidden.statusCode, 403);
    } finally {
      await app.close();
    }
  });
});

const projectRow = async (tx: Tx, tenantId: string) => {
  const [row] = await tx.select().from(schema.onboardingProjects).where(eq(schema.onboardingProjects.tenantId, tenantId));
  return row;
};
const versionCount = async (tx: Tx, tenantId: string) =>
  (await tx.select().from(schema.onboardingVersions).where(eq(schema.onboardingVersions.tenantId, tenantId))).length;

test("onboarding submit: concept wordt ingediend als nieuwe versie met status submitted", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const { user } = await createUser(tx);
    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 0, { company_name: "Concept" }));

    const result = await submitOnboardingInTransaction(tx, draftInput(tenant.id, user.id, 1, { company_name: "Definitief" }));
    assert.equal(result.status, "saved");
    assert.equal(result.status === "saved" && result.draft.status, "submitted");
    assert.equal(result.status === "saved" && result.draft.version, 2);

    const current = await findCurrentOnboarding(tx, tenant.id);
    assert.equal(current?.status, "submitted");
    assert.deepEqual(current?.answers, { company_name: "Definitief" });
    assert.equal(await versionCount(tx, tenant.id), 2);
  });
});

test("onboarding submit: zonder bestaand concept wordt het project direct als submitted aangemaakt", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const { user } = await createUser(tx);
    const result = await submitOnboardingInTransaction(tx, draftInput(tenant.id, user.id, 0, { company_name: "Direct" }));
    assert.equal(result.status === "saved" && result.draft.version, 1);
    assert.equal((await projectRow(tx, tenant.id))?.status, "submitted");
  });
});

test("onboarding submit: verouderde base_version geeft conflict zonder wijziging", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const { user } = await createUser(tx);
    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 0));
    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 1));

    assert.deepEqual(await submitOnboardingInTransaction(tx, draftInput(tenant.id, user.id, 1)), { status: "conflict", currentVersion: 2 });
    const project = await projectRow(tx, tenant.id);
    assert.deepEqual([project?.status, project?.currentVersion], ["draft", 2]);
    assert.equal(await versionCount(tx, tenant.id), 2);
  });
});

test("onboarding submit: na indienen kunnen submit en conceptopslag niets meer wijzigen", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const { user } = await createUser(tx);
    await submitOnboardingInTransaction(tx, draftInput(tenant.id, user.id, 0, { company_name: "Ingediend" }));

    assert.deepEqual(await submitOnboardingInTransaction(tx, draftInput(tenant.id, user.id, 1)), { status: "not_editable" });
    assert.deepEqual(await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 1, { company_name: "Later" })), {
      status: "not_editable",
    });
    assert.equal(await versionCount(tx, tenant.id), 1);
    assert.deepEqual((await findCurrentOnboarding(tx, tenant.id))?.answers, { company_name: "Ingediend" });
  });
});

test("onboarding submit: een fout halverwege laat geen gedeeltelijke wijziging achter", async () => {
  await withRollback(async (tx, client) => {
    const tenant = await createTenant(tx);
    const { user } = await createUser(tx);
    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 0, { company_name: "Concept" }));

    // De versie-insert faalt (onbekende gebruiker); de savepoint speelt de rol van de transactie in submitOnboarding.
    await client.query("savepoint submit_attempt");
    await assert.rejects(submitOnboardingInTransaction(tx, draftInput(tenant.id, randomUUID(), 1)));
    await client.query("rollback to savepoint submit_attempt");

    const project = await projectRow(tx, tenant.id);
    assert.deepEqual([project?.status, project?.currentVersion], ["draft", 1]);
    assert.equal(await versionCount(tx, tenant.id), 1);
  });
});

test("onboarding submit: indienen bij tenant A laat tenant B ongemoeid", async () => {
  await withRollback(async (tx) => {
    const tenantA = await createTenant(tx);
    const tenantB = await createTenant(tx);
    const { user } = await createUser(tx);
    await saveOnboardingDraftInTransaction(tx, draftInput(tenantB.id, user.id, 0, { company_name: "B" }));
    await submitOnboardingInTransaction(tx, draftInput(tenantA.id, user.id, 0, { company_name: "A" }));

    assert.equal((await projectRow(tx, tenantA.id))?.status, "submitted");
    assert.equal((await projectRow(tx, tenantB.id))?.status, "draft");
  });
});

test("HTTP submit met echte repository: Owner dient in, daarna is PUT geblokkeerd; Team Member krijgt 403", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const owner = await createUser(tx);
    const member = await createUser(tx);
    await tx.insert(schema.memberships).values([
      { tenantId: tenant.id, userId: owner.user.id, role: "owner" },
      { tenantId: tenant.id, userId: member.user.id, role: "team_member" },
    ]);
    const app = buildApp(
      {
        authAdapter: {
          authenticate: async (request) => {
            const subject = request.headers["x-test-identity"];
            return typeof subject === "string" ? { status: "authenticated", identity: identityFor(subject) } : { status: "anonymous" };
          },
        },
        membershipResolver: (identity) => findActiveMemberships(tx, identity),
        tenantLoader: (tenantId) => findTenant(tx, tenantId),
        leadCreator: (tenantId, lead) => createLead(tx, tenantId, lead),
        onboardingStore: onboardingStoreFor(tx),
      },
      { logger: false },
    );
    const payload = (baseVersion: number, answers: Record<string, unknown>) => ({
      schema_id: "WESTEND_ONBOARDING",
      schema_version: "0.1.0-design",
      base_version: baseVersion,
      answers,
    });
    const ownerHeaders = { "x-test-identity": owner.identity.subject };
    try {
      const forbidden = await app.inject({ method: "POST", url: "/v1/onboarding/current/submit", headers: { "x-test-identity": member.identity.subject }, payload: payload(0, completeAnswers()) });
      assert.equal(forbidden.statusCode, 403);

      const submitted = await app.inject({ method: "POST", url: "/v1/onboarding/current/submit", headers: ownerHeaders, payload: payload(0, completeAnswers()) });
      assert.equal(submitted.statusCode, 200);
      assert.equal(submitted.json().status, "submitted");

      const get = await app.inject({ method: "GET", url: "/v1/onboarding/current", headers: ownerHeaders });
      assert.equal(get.json().status, "submitted");
      assert.equal(get.json().project_brief.submitted_for_review, true);

      const put = await app.inject({ method: "PUT", url: "/v1/onboarding/current", headers: ownerHeaders, payload: payload(1, { company_name: "Later" }) });
      assert.equal(put.statusCode, 409);
      assert.deepEqual(put.json(), { error: "not_editable" });
    } finally {
      await app.close();
    }
  });
});

test("testdata is na de tests teruggedraaid", async () => {
  const { pool } = createDb(process.env.DATABASE_TEST_URL);
  try {
    const { rows } = await pool.query<Record<string, number>>(
      `select (select count(*)::int from tenants) as tenants,
              (select count(*)::int from users) as users,
              (select count(*)::int from memberships) as memberships,
              (select count(*)::int from leads) as leads,
              (select count(*)::int from websites) as websites,
              (select count(*)::int from onboarding_projects) as onboarding_projects,
              (select count(*)::int from onboarding_versions) as onboarding_versions`,
    );
    assert.deepEqual(rows[0], { tenants: 0, users: 0, memberships: 0, leads: 0, websites: 0, onboarding_projects: 0, onboarding_versions: 0 });
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
