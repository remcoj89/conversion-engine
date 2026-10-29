import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { buildApp } from "./app.js";
import { findActiveMemberships } from "./auth/membershipResolver.js";
import { findActiveReviewerAssignments } from "./auth/reviewerAssignmentResolver.js";
import type { ExternalIdentity } from "./auth/types.js";
import { createDb } from "./db.js";
import * as schema from "./db/schema.js";
import {
  createLead,
  createLeadInTransaction,
  findLead,
  findLeadDetail,
  InvalidLeadTenantError,
  listLeads,
  type NewLead,
} from "./leads/leadRepository.js";
import { findTenant } from "./tenants/tenantLoader.js";
import {
  findCurrentOnboarding,
  saveOnboardingDraft,
  saveOnboardingDraftInTransaction,
  submitOnboarding,
  submitOnboardingInTransaction,
  type SaveDraftInput,
} from "./onboarding/onboardingRepository.js";
import {
  approveOnboarding,
  approveOnboardingInTransaction,
  blockOnboarding,
  blockOnboardingInTransaction,
  findReviewableOnboarding,
  readReviewableOnboardingContentInTransaction,
  reopenOnboarding,
  reopenOnboardingInTransaction,
  requestOnboardingChangesInTransaction,
  unblockOnboardingInTransaction,
  type BlockInput,
  type ReopenInput,
  type RequestChangesInput,
  type UnblockInput,
} from "./onboarding/onboardingReviewRepository.js";
import type { OnboardingStore } from "./routes/onboarding.js";
import type { ReviewStore } from "./routes/review.js";
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

// Real review repository inside the test's rollback transaction.
const reviewStoreFor = (tx: Tx): ReviewStore => ({
  findReviewable: (tenantId) => findReviewableOnboarding(tx, tenantId),
  // The test already owns the outer rollback transaction; do not open and commit a nested top-level transaction here.
  readContent: (input) => readReviewableOnboardingContentInTransaction(tx, input),
  requestChanges: (input) => requestOnboardingChangesInTransaction(tx, input),
  block: (input) => blockOnboardingInTransaction(tx, input),
  unblock: (input) => unblockOnboardingInTransaction(tx, input),
  approve: (input) => approveOnboardingInTransaction(tx, input),
  reopen: (input) => reopenOnboardingInTransaction(tx, input),
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
const identityFor = (subject: string): ExternalIdentity => ({ issuer: TEST_ISSUER, subject, assurance: { level: "aal2" } });

// Maakt een user aan en geeft zijn identity terug.
async function createUser(tx: Tx) {
  const [user] = await tx.insert(schema.users).values({ authProviderUserId: uniqueId("auth") }).returning();
  assert.ok(user);
  return { user, identity: identityFor(user.authProviderUserId) };
}

// Maakt een user aan met een Owner-membership in elk van de opgegeven tenants.
async function createMember(tx: Tx, ...tenantIds: string[]) {
  const created = await createUser(tx);
  await tx.insert(schema.memberships).values(tenantIds.map((tenantId) => ({ tenantId, userId: created.user.id, role: "owner" as const })));
  return created;
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

test("findActiveMemberships: een disabled user krijgt geen actieve memberships", async () => {
  await withRollback(async (tx) => {
    const { user, identity } = await createUser(tx);
    const tenant = await createTenant(tx);
    await tx.update(schema.users).set({ status: "disabled" }).where(eq(schema.users.id, user.id));
    await tx.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" });

    assert.deepEqual(await findActiveMemberships(tx, identity), []);
  });
});

test("findActiveMemberships: membership in inactieve tenant wordt niet gevonden", async () => {
  await withRollback(async (tx) => {
    const { user, identity } = await createUser(tx);
    const tenant = await createTenant(tx, "disabled");
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
    const tenant = await createTenant(tx, "disabled");

    assert.deepEqual(await findTenant(tx, tenant.id), { id: tenant.id, name: tenant.name, status: "disabled" });
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
    const before = await client.query<{ count: number }>("select count(*)::int as count from leads");
    for (const tenantId of [randomUUID(), "abc", ""]) {
      await expectInvalidTenant(client, () => createLead(tx, tenantId, exampleLead()));
    }
    const { rows } = await client.query<{ count: number }>("select count(*)::int as count from leads");
    assert.equal(rows[0]?.count, before.rows[0]?.count);
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

test("listLeads: tenantisolatie, server-side zoekvelden en stabiele cursorpaginering", async () => {
  await withRollback(async (tx) => {
    const tenantA = await createTenant(tx);
    const tenantB = await createTenant(tx);
    await createLead(tx, tenantA.id, exampleLead({ name: "Alpha", message: "eerste aanvraag" }));
    await createLead(tx, tenantA.id, exampleLead({ name: "Bravo", source: "website" }));
    const foreignLead = await createLead(tx, tenantB.id, exampleLead({ name: "Tenant B geheim" }));

    const firstPage = await listLeads(tx, { tenantId: tenantA.id, limit: 1 });
    assert.equal(firstPage.items.length, 1);
    assert.equal("tenantId" in firstPage.items[0]!, false);
    assert.ok(firstPage.nextCursor);

    const secondPage = await listLeads(tx, {
      tenantId: tenantA.id,
      q: "website",
      status: "new",
      limit: 10,
    });
    assert.deepEqual(secondPage.items.map((item) => item.name), ["Bravo"]);
    assert.ok(!secondPage.items.some((item) => item.id === foreignLead.id));

    const afterCursor = await listLeads(tx, {
      tenantId: tenantA.id,
      limit: 10,
      cursor: firstPage.nextCursor!,
    });
    assert.equal(afterCursor.items.length, 1);
    assert.notEqual(afterCursor.items[0]?.id, firstPage.items[0]?.id);
  });
});

test("findLeadDetail: geeft alleen expliciete leadvelden en weigert cross-tenant detail", async () => {
  await withRollback(async (tx) => {
    const tenantA = await createTenant(tx);
    const tenantB = await createTenant(tx);
    const lead = await createLead(tx, tenantA.id, exampleLead());

    const detail = await findLeadDetail(tx, tenantA.id, lead.id);
    assert.ok(detail);
    assert.equal("tenantId" in detail, false);
    assert.equal(detail.email, lead.email);
    assert.equal(await findLeadDetail(tx, tenantB.id, lead.id), null);
    assert.equal(await findLeadDetail(tx, tenantA.id, randomUUID()), null);
  });
});

test("lead assignments: team member ziet alleen actieve toegewezen leads", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const owner = await createUser(tx);
    const teamMember = await createUser(tx);
    await tx.insert(schema.memberships).values([
      { tenantId: tenant.id, userId: owner.user.id, role: "owner" },
      { tenantId: tenant.id, userId: teamMember.user.id, role: "team_member" },
    ]);

    const assigned = await createLeadInTransaction(tx, tenant.id, exampleLead({ name: "Toegewezen" }), teamMember.user.id);
    const ownerLead = await createLeadInTransaction(tx, tenant.id, exampleLead({ name: "Owner lead" }), owner.user.id);

    const visibleToTeamMember = await listLeads(tx, {
      tenantId: tenant.id,
      role: "team_member",
      userId: teamMember.user.id,
      limit: 10,
    });
    assert.deepEqual(visibleToTeamMember.items.map((lead) => lead.name), ["Toegewezen"]);
    assert.equal(await findLeadDetail(tx, tenant.id, assigned.id, "team_member", teamMember.user.id) !== null, true);
    assert.equal(await findLeadDetail(tx, tenant.id, ownerLead.id, "team_member", teamMember.user.id), null);

    const visibleToOwner = await listLeads(tx, {
      tenantId: tenant.id,
      role: "owner",
      userId: owner.user.id,
      limit: 10,
    });
    assert.deepEqual(new Set(visibleToOwner.items.map((lead) => lead.name)), new Set(["Toegewezen", "Owner lead"]));
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
        leadCreator: (tenantId, lead, actorUserId) => actorUserId
          ? createLeadInTransaction(tx, tenantId, lead, actorUserId)
          : createLead(tx, tenantId, lead),
        onboardingStore: onboardingStoreFor(tx),
        reviewerAssignmentResolver: (identity) => findActiveReviewerAssignments(tx, identity),
        reviewStore: reviewStoreFor(tx),
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
        leadCreator: (tenantId, lead, actorUserId) => actorUserId
          ? createLeadInTransaction(tx, tenantId, lead, actorUserId)
          : createLead(tx, tenantId, lead),
        onboardingStore: onboardingStoreFor(tx),
        reviewerAssignmentResolver: (identity) => findActiveReviewerAssignments(tx, identity),
        reviewStore: reviewStoreFor(tx),
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
    const website = await createWebsite(tx, (await createTenant(tx, "disabled")).id);

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

// Fastify-app met de echte resolver, loader en repositories binnen de rollback-transactie van de test.
const appWithRealRepositories = (tx: Tx) =>
  buildApp(
    {
      authAdapter: {
        authenticate: async (request) => {
          const subject = request.headers["x-test-identity"];
          return typeof subject === "string" ? { status: "authenticated", identity: identityFor(subject) } : { status: "anonymous" };
        },
      },
      membershipResolver: (identity) => findActiveMemberships(tx, identity),
      tenantLoader: (tenantId) => findTenant(tx, tenantId),
      leadCreator: (tenantId, lead, actorUserId) => actorUserId
        ? createLeadInTransaction(tx, tenantId, lead, actorUserId)
        : createLead(tx, tenantId, lead),
      onboardingStore: onboardingStoreFor(tx),
      reviewerAssignmentResolver: (identity) => findActiveReviewerAssignments(tx, identity),
      reviewStore: reviewStoreFor(tx),
    },
    { logger: false },
  );

const onboardingPayload = (baseVersion: number, answers: Record<string, unknown>) => ({
  schema_id: "WESTEND_ONBOARDING",
  schema_version: "0.1.0-design",
  base_version: baseVersion,
  answers,
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
    const app = appWithRealRepositories(tx);
    const payload = onboardingPayload(0, { company_name: "Sterk & Fit Coaching", domain_status: "new", domain_name: "verborgen.nl" });
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
    const { user } = await createMember(tx, tenant.id);
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
    const { user } = await createMember(tx, tenant.id);
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
    const { user } = await createMember(tx, tenant.id);
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
    const { user } = await createMember(tx, tenantA.id);
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
    const app = appWithRealRepositories(tx);
    const ownerHeaders = { "x-test-identity": owner.identity.subject };
    try {
      const forbidden = await app.inject({ method: "POST", url: "/v1/onboarding/current/submit", headers: { "x-test-identity": member.identity.subject }, payload: onboardingPayload(0, completeAnswers()) });
      assert.equal(forbidden.statusCode, 403);

      const submitted = await app.inject({ method: "POST", url: "/v1/onboarding/current/submit", headers: ownerHeaders, payload: onboardingPayload(0, completeAnswers()) });
      assert.equal(submitted.statusCode, 200);
      assert.equal(submitted.json().status, "submitted");

      const get = await app.inject({ method: "GET", url: "/v1/onboarding/current", headers: ownerHeaders });
      assert.equal(get.json().status, "submitted");
      assert.equal(get.json().project_brief.submitted_for_review, true);

      const put = await app.inject({ method: "PUT", url: "/v1/onboarding/current", headers: ownerHeaders, payload: onboardingPayload(1, { company_name: "Later" }) });
      assert.equal(put.statusCode, 409);
      assert.deepEqual(put.json(), { error: "not_editable" });
    } finally {
      await app.close();
    }
  });
});

// ---------- Onboarding audit-events ----------

const auditEvents = (tx: Tx, tenantId: string) =>
  tx.select().from(schema.onboardingAuditEvents).where(eq(schema.onboardingAuditEvents.tenantId, tenantId));

test("onboarding audit: submit legt één event vast met tenant, project, actor en statusovergang, zonder inhoud", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const { user } = await createMember(tx, tenant.id);
    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 0, { company_name: "Concept" }));
    assert.deepEqual(await auditEvents(tx, tenant.id), [], "conceptopslag is geen auditevent");

    const result = await submitOnboardingInTransaction(tx, draftInput(tenant.id, user.id, 1, { company_name: "Geheime Inhoud BV" }));
    assert.equal(result.status, "saved");

    const [event, ...rest] = await auditEvents(tx, tenant.id);
    assert.ok(event);
    assert.deepEqual(rest, []);
    // Alleen deze kolommen: geen antwoorden, Project Brief of andere klantdata.
    assert.deepEqual(Object.keys(event).sort(), [
      "createdAt", "eventType", "fromStatus", "id", "memberUserId", "projectId", "reviewerUserId", "tenantId", "toStatus", "version",
    ]);
    assert.match(event.id, /^[0-9a-f-]{36}$/);
    assert.equal(event.tenantId, tenant.id);
    assert.equal(event.projectId, result.status === "saved" ? result.draft.projectId : "");
    assert.equal(event.memberUserId, user.id, "submitted uses the member actor");
    assert.equal(event.reviewerUserId, null);
    assert.equal(event.version, 2, "the submitted version");
    assert.equal(event.eventType, "submitted");
    assert.equal(event.fromStatus, "draft");
    assert.equal(event.toStatus, "submitted");
    assert.ok(event.createdAt instanceof Date);
    assert.ok(!JSON.stringify(event).includes("Geheime Inhoud"));
  });
});

test("onboarding audit: direct indienen zonder concept heeft geen vorige status", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const { user } = await createMember(tx, tenant.id);
    await submitOnboardingInTransaction(tx, draftInput(tenant.id, user.id, 0));

    const events = await auditEvents(tx, tenant.id);
    assert.deepEqual(events.map((event) => [event.fromStatus, event.toStatus]), [[null, "submitted"]]);
  });
});

test("onboarding audit: verouderde base_version, tweede submit en submit na een eerdere statusovergang leggen geen event vast", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const { user } = await createMember(tx, tenant.id);
    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 0));
    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 1));

    assert.deepEqual(await submitOnboardingInTransaction(tx, draftInput(tenant.id, user.id, 1)), { status: "conflict", currentVersion: 2 });
    assert.equal((await auditEvents(tx, tenant.id)).length, 0);

    assert.equal((await submitOnboardingInTransaction(tx, draftInput(tenant.id, user.id, 2))).status, "saved");
    assert.deepEqual(await submitOnboardingInTransaction(tx, draftInput(tenant.id, user.id, 3)), { status: "not_editable" });
    assert.equal((await auditEvents(tx, tenant.id)).length, 1, "alleen de geslaagde submit");

    // A project after another status transition cannot be submitted again (resubmitting from
    // review_needed is allowed and covered by the resubmit tests).
    for (const status of ["blocked"] as const) {
      const other = await createTenant(tx);
      await saveOnboardingDraftInTransaction(tx, draftInput(other.id, user.id, 0));
      await tx.update(schema.onboardingProjects).set({ status }).where(eq(schema.onboardingProjects.tenantId, other.id));
      assert.deepEqual(await submitOnboardingInTransaction(tx, draftInput(other.id, user.id, 1)), { status: "not_editable" }, status);
      assert.equal((await auditEvents(tx, other.id)).length, 0, status);
    }
  });
});

test("onboarding audit: een fout tijdens de transactie laat geen event, versie of statuswijziging achter", async () => {
  await withRollback(async (tx, client) => {
    const tenant = await createTenant(tx);
    const { user } = await createMember(tx, tenant.id);
    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 0));

    // De savepoint speelt de rol van de transactie in submitOnboarding.
    const expectRolledBackSubmit = async (input: SaveDraftInput, setup?: string) => {
      await client.query("savepoint submit_attempt");
      if (setup) await client.query(setup);
      await assert.rejects(submitOnboardingInTransaction(tx, input));
      await client.query("rollback to savepoint submit_attempt");

      const project = await projectRow(tx, tenant.id);
      assert.deepEqual([project?.status, project?.currentVersion], ["draft", 1]);
      assert.equal(await versionCount(tx, tenant.id), 1);
      assert.equal((await auditEvents(tx, tenant.id)).length, 0);
    };

    // Fout vóór het event: de versie-insert faalt op een onbekende gebruiker.
    await expectRolledBackSubmit(draftInput(tenant.id, randomUUID(), 1));
    // Fout bij het event zelf, nadat versie en statusovergang al zijn geschreven. De tijdelijke
    // constraint valt binnen de savepoint en verdwijnt bij de rollback.
    await expectRolledBackSubmit(
      draftInput(tenant.id, user.id, 1),
      "alter table onboarding_audit_events add constraint test_forced_failure check (false) not valid",
    );
  });
});

type AuditEventValues = {
  tenantId?: string;
  memberUserId?: string | null;
  reviewerUserId?: string | null;
  eventType?: string;
  fromStatus?: string | null;
  toStatus?: string;
  version?: number | null;
};

// Ingediend project van tenant A met een Owner, plus een helper die rechtstreeks (buiten de repository)
// een audit-event invoegt. Standaard is dat een geldig submitted-event van die Owner voor dat project.
async function auditFixture(tx: Tx, client: PoolClient) {
  const tenantA = await createTenant(tx);
  const tenantB = await createTenant(tx);
  const { user } = await createMember(tx, tenantA.id);
  const submitted = await submitOnboardingInTransaction(tx, draftInput(tenantA.id, user.id, 0));
  const projectId = submitted.status === "saved" ? submitted.draft.projectId : "";
  const insertEvent = (values: AuditEventValues = {}) => {
    const {
      tenantId = tenantA.id,
      memberUserId = user.id,
      reviewerUserId = null,
      eventType = "submitted",
      fromStatus = "draft",
      toStatus = "submitted",
      version = 1,
    } = values;
    return client.query(
      `insert into onboarding_audit_events (tenant_id, project_id, member_user_id, reviewer_user_id, event_type, from_status, to_status, version)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, projectId, memberUserId, reviewerUserId, eventType, fromStatus, toStatus, version],
    );
  };
  return { tenantA, tenantB, user, insertEvent };
}

test("onboarding audit: database bewaakt tenantkoppeling, geldige waarden en onveranderlijkheid", async () => {
  await withRollback(async (tx, client) => {
    const { tenantA, tenantB, insertEvent } = await auditFixture(tx, client);

    // Event van tenant B dat naar het project van tenant A wijst.
    await expectPgError(client, "23503", () => insertEvent({ tenantId: tenantB.id }));
    await expectPgError(client, "23503", () => insertEvent({ memberUserId: randomUUID() }));
    await expectPgError(client, "23514", () => insertEvent({ eventType: "reopened" }));
    await expectPgError(client, "23514", () => insertEvent({ fromStatus: "live" }));
    await expectPgError(client, "23514", () => insertEvent({ toStatus: "draft" }));

    // Onveranderlijk: bijwerken en verwijderen worden door de trigger geweigerd.
    await expectPgError(client, "23001", () => client.query("update onboarding_audit_events set to_status = 'approved' where tenant_id = $1", [tenantA.id]));
    await expectPgError(client, "23001", () => client.query("delete from onboarding_audit_events where tenant_id = $1", [tenantA.id]));
    assert.equal((await auditEvents(tx, tenantA.id)).length, 1);
  });
});

test("onboarding audit: een submitted-event heeft alleen draft of geen vorige status", async () => {
  await withRollback(async (tx, client) => {
    const { tenantA, insertEvent } = await auditFixture(tx, client);

    for (const fromStatus of ["approved", "submitted", "blocked", "review_needed"]) {
      await expectPgError(client, "23514", () => insertEvent({ fromStatus }));
    }
    await insertEvent({ fromStatus: null });
    await insertEvent({ fromStatus: "draft" });

    const fromStatuses = (await auditEvents(tx, tenantA.id)).map((event) => event.fromStatus);
    // De echte submit in de fixture (zonder concept, dus null) plus de twee toegestane inserts.
    assert.deepEqual(fromStatuses.sort(), ["draft", null, null]);
  });
});

test("onboarding audit: de actor moet een membership hebben in de tenant van het event", async () => {
  await withRollback(async (tx, client) => {
    const { tenantA, tenantB, insertEvent } = await auditFixture(tx, client);
    const outsider = await createMember(tx, tenantB.id);
    const colleague = await createMember(tx, tenantA.id);

    // Een gebruiker van tenant B kan geen event voor tenant A veroorzaken.
    await expectPgError(client, "23503", () => insertEvent({ memberUserId: outsider.user.id }));
    await insertEvent({ memberUserId: colleague.user.id });

    const actors = (await auditEvents(tx, tenantA.id)).map((event) => event.memberUserId);
    assert.ok(actors.includes(colleague.user.id));
    assert.ok(!actors.includes(outsider.user.id));
  });
});

test("HTTP submit met echte repository: auditevent met tenant en actor uit de auth-context; foutpaden laten geen event achter", async () => {
  await withRollback(async (tx) => {
    const tenantA = await createTenant(tx);
    const tenantB = await createTenant(tx);
    const owner = await createUser(tx);
    const outsider = await createUser(tx);
    await tx.insert(schema.memberships).values([
      { tenantId: tenantA.id, userId: owner.user.id, role: "owner" },
      { tenantId: tenantB.id, userId: owner.user.id, role: "owner" },
      { tenantId: tenantA.id, userId: outsider.user.id, role: "owner" },
    ]);
    const app = appWithRealRepositories(tx);
    const submit = (subject: string, tenantId: string, payload: object) =>
      app.inject({ method: "POST", url: "/v1/onboarding/current/submit", headers: { "x-test-identity": subject, "x-tenant-id": tenantId }, payload });
    const incomplete = { ...completeAnswers() };
    delete incomplete.contact_email;
    try {
      const failures: [number, string, () => Promise<{ statusCode: number; json: () => { error: string } }>][] = [
        [400, "incomplete_answers", () => submit(owner.identity.subject, tenantB.id, onboardingPayload(0, incomplete))],
        [400, "invalid_answers", () => submit(owner.identity.subject, tenantB.id, onboardingPayload(0, { ...completeAnswers(), brand_status: "rebranding" }))],
        [400, "invalid_body", () => submit(owner.identity.subject, tenantB.id, { ...onboardingPayload(0, completeAnswers()), tenant_id: tenantA.id })],
        [403, "forbidden", () => submit(outsider.identity.subject, tenantB.id, onboardingPayload(0, completeAnswers()))],
      ];
      for (const [status, error, request] of failures) {
        const response = await request();
        assert.equal(response.statusCode, status, error);
        assert.equal(response.json().error, error);
      }

      // Verouderde base_version: eerst een concept (versie 1), dan indienen op basis van versie 0.
      await app.inject({ method: "PUT", url: "/v1/onboarding/current", headers: { "x-test-identity": owner.identity.subject, "x-tenant-id": tenantB.id }, payload: onboardingPayload(0, { company_name: "B" }) });
      const stale = await submit(owner.identity.subject, tenantB.id, onboardingPayload(0, completeAnswers()));
      assert.equal(stale.statusCode, 409);
      assert.equal((await auditEvents(tx, tenantB.id)).length, 0, "geen event na een foutpad");

      const submitted = await submit(owner.identity.subject, tenantB.id, onboardingPayload(1, completeAnswers()));
      assert.equal(submitted.statusCode, 200);
      const second = await submit(owner.identity.subject, tenantB.id, onboardingPayload(2, completeAnswers()));
      assert.deepEqual([second.statusCode, second.json().error], [409, "not_editable"]);

      const events = await auditEvents(tx, tenantB.id);
      assert.deepEqual(
        events.map((event) => [event.tenantId, event.memberUserId, event.eventType, event.fromStatus, event.toStatus]),
        [[tenantB.id, owner.user.id, "submitted", "draft", "submitted"]],
      );
      assert.equal(events[0]?.projectId, (await projectRow(tx, tenantB.id))?.id);
      assert.equal((await auditEvents(tx, tenantA.id)).length, 0, "de andere tenant van de Owner blijft leeg");
    } finally {
      await app.close();
    }
  });
});

// ---------- Westend-reviewer assignments ----------

type AssignmentOverrides = Partial<Pick<typeof schema.onboardingReviewerAssignments.$inferInsert, "status" | "revokedAt">>;

// Assigns userId as reviewer of tenantId, granted by a separate synthetic user.
async function assignReviewer(tx: Tx, tenantId: string, userId: string, overrides: AssignmentOverrides = {}) {
  const granter = await createUser(tx);
  const [row] = await tx
    .insert(schema.onboardingReviewerAssignments)
    .values({ tenantId, userId, grantedBy: granter.user.id, ...overrides })
    .returning();
  assert.ok(row);
  return row;
}

test("reviewer assignments: assignment wordt aangemaakt als active, zonder revoked_at", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const { user } = await createUser(tx);
    const row = await assignReviewer(tx, tenant.id, user.id);
    assert.equal(row.tenantId, tenant.id);
    assert.equal(row.userId, user.id);
    assert.equal(row.status, "active");
    assert.equal(row.revokedAt, null);
    assert.ok(row.createdAt instanceof Date);
    assert.match(row.grantedBy, /^[0-9a-f-]{36}$/);
  });
});

test("reviewer assignments: database bewaakt uniciteit, koppelingen, status en revoked_at", async () => {
  await withRollback(async (tx, client) => {
    const tenant = await createTenant(tx);
    const { user } = await createUser(tx);
    const granter = await createUser(tx);
    await assignReviewer(tx, tenant.id, user.id);
    const insert = (tenantId: string, userId: string, grantedBy: string, status = "active", revokedAt: string | null = null) =>
      client.query(
        "insert into onboarding_reviewer_assignments (tenant_id, user_id, granted_by, status, revoked_at) values ($1, $2, $3, $4, $5)",
        [tenantId, userId, grantedBy, status, revokedAt],
      );
    const other = await createUser(tx);

    await expectPgError(client, "23505", () => insert(tenant.id, user.id, granter.user.id));
    await expectPgError(client, "23503", () => insert(randomUUID(), other.user.id, granter.user.id));
    await expectPgError(client, "23503", () => insert(tenant.id, randomUUID(), granter.user.id));
    await expectPgError(client, "23503", () => insert(tenant.id, other.user.id, randomUUID()));
    await expectPgError(client, "23514", () => insert(tenant.id, other.user.id, granter.user.id, "pending"));
    // revoked_at is set exactly when the assignment is revoked.
    await expectPgError(client, "23514", () => insert(tenant.id, other.user.id, granter.user.id, "revoked", null));
    await expectPgError(client, "23514", () => insert(tenant.id, other.user.id, granter.user.id, "active", new Date().toISOString()));
    await insert(tenant.id, other.user.id, granter.user.id, "revoked", new Date().toISOString());
  });
});

test("findActiveReviewerAssignments: alleen actieve assignments in actieve tenants, alleen tenant- en user-ID", async () => {
  await withRollback(async (tx) => {
    const active = await createTenant(tx);
    const revoked = await createTenant(tx);
    const inactive = await createTenant(tx, "disabled");
    const reviewer = await createUser(tx);
    const otherReviewer = await createUser(tx);
    await assignReviewer(tx, active.id, reviewer.user.id);
    await assignReviewer(tx, revoked.id, reviewer.user.id, { status: "revoked", revokedAt: new Date() });
    await assignReviewer(tx, inactive.id, reviewer.user.id);
    await assignReviewer(tx, revoked.id, otherReviewer.user.id);

    assert.deepEqual(await findActiveReviewerAssignments(tx, reviewer.identity), [{ tenantId: active.id, userId: reviewer.user.id }]);
    assert.deepEqual(await findActiveReviewerAssignments(tx, otherReviewer.identity), [{ tenantId: revoked.id, userId: otherReviewer.user.id }]);
    assert.deepEqual(await findActiveReviewerAssignments(tx, identityFor(uniqueId("onbekend"))), []);
  });
});

test("findActiveReviewerAssignments: een disabled user krijgt geen actieve reviewer assignments", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const reviewer = await createUser(tx);
    await tx.update(schema.users).set({ status: "disabled" }).where(eq(schema.users.id, reviewer.user.id));
    await assignReviewer(tx, tenant.id, reviewer.user.id);

    assert.deepEqual(await findActiveReviewerAssignments(tx, reviewer.identity), []);
  });
});

test("findReviewableOnboarding: geen project of draft geeft null; submitted en latere statussen geven metadata", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const { user } = await createMember(tx, tenant.id);
    assert.equal(await findReviewableOnboarding(tx, tenant.id), null);

    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 0, { company_name: "Concept" }));
    assert.equal(await findReviewableOnboarding(tx, tenant.id), null, "een draft is niet reviewbaar");

    await submitOnboardingInTransaction(tx, draftInput(tenant.id, user.id, 1, { company_name: "Ingediend" }));
    const submitted = await findReviewableOnboarding(tx, tenant.id);
    assert.deepEqual([submitted?.status, submitted?.version, submitted?.answers], ["submitted", 2, { company_name: "Ingediend" }]);
    assert.ok(submitted?.updatedAt instanceof Date);

    // Later statuses are not written by the application yet; set them as fixtures.
    for (const status of ["review_needed", "blocked", "approved"] as const) {
      await tx.update(schema.onboardingProjects).set({ status }).where(eq(schema.onboardingProjects.tenantId, tenant.id));
      assert.equal((await findReviewableOnboarding(tx, tenant.id))?.status, status);
    }
    assert.equal(await findReviewableOnboarding(tx, (await createTenant(tx)).id), null, "andere tenant ziet niets");
  });
});

test("findReviewableOnboarding: een open project gaat voor een eerder goedgekeurd project (bestaande data van vóór O-5)", async () => {
  await withRollback(async (tx) => {
    const tenant = await createTenant(tx);
    const { user } = await createMember(tx, tenant.id);
    await submitOnboardingInTransaction(tx, draftInput(tenant.id, user.id, 0));
    await tx.update(schema.onboardingProjects).set({ status: "approved" }).where(eq(schema.onboardingProjects.tenantId, tenant.id));
    assert.equal((await findReviewableOnboarding(tx, tenant.id))?.status, "approved");

    // Decision O-5: the Owner cannot start a second project after approval.
    assert.deepEqual(await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, user.id, 0)), { status: "not_editable" });

    // Data from before O-5 may still hold an open project next to an approved one; the open one is current.
    const [legacy] = await tx.insert(schema.onboardingProjects).values({ tenantId: tenant.id, status: "draft", currentVersion: 1 }).returning();
    assert.ok(legacy);
    await tx.insert(schema.onboardingVersions).values({
      tenantId: tenant.id,
      projectId: legacy.id,
      version: 1,
      schemaId: "WESTEND_ONBOARDING",
      schemaVersion: "0.1.0-design",
      answers: {},
      projectBrief: {},
      createdBy: user.id,
    });
    assert.equal(await findReviewableOnboarding(tx, tenant.id), null, "het actuele project is de open draft");
    assert.equal((await findCurrentOnboarding(tx, tenant.id))?.projectId, legacy.id);
  });
});

const reviewAccessEvents = (tx: Tx, tenantId: string) =>
  tx.select().from(schema.onboardingReviewAccessEvents).where(eq(schema.onboardingReviewAccessEvents.tenantId, tenantId));

test("review content: leest alleen de actuele reviewbare versie en schrijft een content-vrij access-event", async () => {
  await withRollback(async (tx, client) => {
    const tenantA = await createTenant(tx);
    const tenantB = await createTenant(tx);
    const ownerA = await createMember(tx, tenantA.id);
    const ownerB = await createMember(tx, tenantB.id);
    const reviewer = await createUser(tx);
    await assignReviewer(tx, tenantA.id, reviewer.user.id);
    await assignReviewer(tx, tenantB.id, reviewer.user.id, { status: "revoked", revokedAt: new Date() });

    await submitOnboardingInTransaction(tx, draftInput(tenantA.id, ownerA.user.id, 0, { company_name: "Geheim A" }));
    await submitOnboardingInTransaction(tx, draftInput(tenantB.id, ownerB.user.id, 0, { company_name: "Geheim B" }));
    const projectA = await projectRow(tx, tenantA.id);
    assert.ok(projectA);

    const result = await readReviewableOnboardingContentInTransaction(tx, {
      tenantId: tenantA.id,
      reviewerUserId: reviewer.user.id,
      requestId: "req-review-content-1",
    });
    assert.equal(result.status, "success");
    if (result.status !== "success") return;
    assert.deepEqual(result.content.answers, { company_name: "Geheim A" });
    assert.deepEqual(result.content.projectBrief, { status: "incomplete_draft" });
    assert.deepEqual([result.content.status, result.content.version], ["submitted", 1]);

    const [event] = await reviewAccessEvents(tx, tenantA.id);
    assert.ok(event);
    assert.deepEqual(Object.keys(event).sort(), [
      "action", "createdAt", "id", "projectId", "purpose", "requestOrCorrelationId", "reviewerUserId", "tenantId", "version",
    ]);
    assert.deepEqual(
      [event.tenantId, event.projectId, event.reviewerUserId, event.version, event.purpose, event.action, event.requestOrCorrelationId],
      [tenantA.id, projectA.id, reviewer.user.id, 1, "onboarding_review", "read_onboarding_content", "req-review-content-1"],
    );
    assert.ok(!JSON.stringify(event).includes("Geheim A"));
    assert.ok(!JSON.stringify(event).includes("incomplete_draft"));

    // A reviewer assignment for tenant B is revoked: the repository must fail closed without creating an event.
    assert.deepEqual(
      await readReviewableOnboardingContentInTransaction(tx, {
        tenantId: tenantB.id,
        reviewerUserId: reviewer.user.id,
        requestId: "req-review-content-b",
      }),
      { status: "reviewer_forbidden" },
    );
    assert.equal((await reviewAccessEvents(tx, tenantB.id)).length, 0);

    // A forced event constraint error rolls back the access attempt; no second event remains.
    await client.query("savepoint access_content_attempt");
    await assert.rejects(
      readReviewableOnboardingContentInTransaction(tx, {
        tenantId: tenantA.id,
        reviewerUserId: reviewer.user.id,
        requestId: "x".repeat(256),
      }),
    );
    await client.query("rollback to savepoint access_content_attempt");
    assert.equal((await reviewAccessEvents(tx, tenantA.id)).length, 1);

    // The database trigger protects the event from UPDATE and DELETE.
    await expectPgError(client, "23001", () =>
      client.query("update onboarding_review_access_events set action = 'read_onboarding_content' where tenant_id = $1", [tenantA.id]),
    );
    await expectPgError(client, "23001", () =>
      client.query("delete from onboarding_review_access_events where tenant_id = $1", [tenantA.id]),
    );
  });
});

test("review content: draft, missing onboarding, self-review en ontbrekende tenant-scope geven geen content of event", async () => {
  await withRollback(async (tx) => {
    const draftTenant = await createTenant(tx);
    const emptyTenant = await createTenant(tx);
    const owner = await createMember(tx, draftTenant.id);
    const reviewer = await createUser(tx);
    const selfReviewer = await createMember(tx, draftTenant.id);
    await assignReviewer(tx, draftTenant.id, reviewer.user.id);
    await assignReviewer(tx, emptyTenant.id, reviewer.user.id);
    await assignReviewer(tx, draftTenant.id, selfReviewer.user.id);
    await saveOnboardingDraftInTransaction(tx, draftInput(draftTenant.id, owner.user.id, 0, { company_name: "Concept" }));

    for (const tenantId of [draftTenant.id, emptyTenant.id]) {
      assert.deepEqual(
        await readReviewableOnboardingContentInTransaction(tx, {
          tenantId,
          reviewerUserId: reviewer.user.id,
          requestId: `req-${tenantId}`,
        }),
        { status: "not_found" },
      );
    }
    assert.deepEqual(
      await readReviewableOnboardingContentInTransaction(tx, {
        tenantId: draftTenant.id,
        reviewerUserId: selfReviewer.user.id,
        requestId: "req-self-review",
      }),
      { status: "self_review_forbidden" },
    );
    assert.equal((await reviewAccessEvents(tx, draftTenant.id)).length, 0);
    assert.equal((await reviewAccessEvents(tx, emptyTenant.id)).length, 0);
  });
});

test("HTTP review met echte repositories: toegang alleen met actieve assignment in een actieve tenant, zonder zelfreview", async () => {
  await withRollback(async (tx) => {
    const tenantA = await createTenant(tx);
    const tenantB = await createTenant(tx);
    const inactive = await createTenant(tx, "disabled");
    const owner = await createMember(tx, tenantA.id);
    const reviewer = await createUser(tx);
    const revokedReviewer = await createUser(tx);
    const selfReviewer = await createMember(tx, tenantA.id);
    await assignReviewer(tx, tenantA.id, reviewer.user.id);
    await assignReviewer(tx, inactive.id, reviewer.user.id);
    await assignReviewer(tx, tenantA.id, revokedReviewer.user.id, { status: "revoked", revokedAt: new Date() });
    await assignReviewer(tx, tenantA.id, selfReviewer.user.id);
    await submitOnboardingInTransaction(tx, draftInput(tenantA.id, owner.user.id, 0, completeAnswers()));

    const app = appWithRealRepositories(tx);
    const review = (subject: string, tenantId: string) =>
      app.inject({ method: "GET", url: "/v1/review/onboarding", headers: { "x-test-identity": subject, "x-tenant-id": tenantId } });
    try {
      const ok = await review(reviewer.identity.subject, tenantA.id);
      assert.equal(ok.statusCode, 200);
      assert.deepEqual(Object.keys(ok.json()).sort(), ["missing_required_fields", "status", "updated_at", "version"]);
      assert.deepEqual([ok.json().status, ok.json().version, ok.json().missing_required_fields], ["submitted", 1, 0]);
      assert.ok(!ok.body.includes(String(completeAnswers().company_name)), "geen antwoorden in de response");

      const content = await app.inject({
        method: "GET",
        url: "/v1/review/onboarding/content",
        headers: { "x-test-identity": reviewer.identity.subject, "x-tenant-id": tenantA.id },
      });
      assert.equal(content.statusCode, 200);
      assert.deepEqual(Object.keys(content.json()).sort(), ["answers", "project_brief", "status", "updated_at", "version"]);
      assert.deepEqual([content.json().status, content.json().version], ["submitted", 1]);
      assert.equal(content.json().answers.company_name, completeAnswers().company_name);
      assert.ok(content.json().project_brief);
      assert.ok(content.headers["cache-control"] === "no-store");
      assert.equal((await reviewAccessEvents(tx, tenantA.id)).length, 1);

      const denied: [string, string, number, string][] = [
        [reviewer.identity.subject, tenantB.id, 403, "forbidden"],
        [reviewer.identity.subject, inactive.id, 403, "forbidden"],
        [revokedReviewer.identity.subject, tenantA.id, 403, "forbidden"],
        [owner.identity.subject, tenantA.id, 403, "forbidden"],
        [selfReviewer.identity.subject, tenantA.id, 403, "self_review_forbidden"],
      ];
      for (const [subject, tenantId, status, error] of denied) {
        const response = await review(subject, tenantId);
        assert.equal(response.statusCode, status, error);
        assert.deepEqual(response.json(), { error });
      }

      const deniedContent: [string, string, number, string][] = [
        [reviewer.identity.subject, tenantB.id, 403, "forbidden"],
        [reviewer.identity.subject, inactive.id, 403, "forbidden"],
        [revokedReviewer.identity.subject, tenantA.id, 403, "forbidden"],
        [owner.identity.subject, tenantA.id, 403, "forbidden"],
        [selfReviewer.identity.subject, tenantA.id, 403, "self_review_forbidden"],
      ];
      for (const [subject, tenantId, status, error] of deniedContent) {
        const response = await app.inject({
          method: "GET",
          url: "/v1/review/onboarding/content",
          headers: { "x-test-identity": subject, "x-tenant-id": tenantId },
        });
        assert.equal(response.statusCode, status, error);
        assert.deepEqual(response.json(), { error });
      }

      // A reviewer without membership still cannot use the client onboarding routes.
      const clientRoute = await app.inject({
        method: "GET",
        url: "/v1/onboarding/current",
        headers: { "x-test-identity": reviewer.identity.subject, "x-tenant-id": tenantA.id },
      });
      assert.equal(clientRoute.statusCode, 403);
    } finally {
      await app.close();
    }
  });
});

test("HTTP review met echte repositories: draft en ontbrekende onboarding geven 404", async () => {
  await withRollback(async (tx) => {
    const withDraft = await createTenant(tx);
    const empty = await createTenant(tx);
    const owner = await createMember(tx, withDraft.id);
    const reviewer = await createUser(tx);
    await assignReviewer(tx, withDraft.id, reviewer.user.id);
    await assignReviewer(tx, empty.id, reviewer.user.id);
    await saveOnboardingDraftInTransaction(tx, draftInput(withDraft.id, owner.user.id, 0, { company_name: "Concept" }));

    const app = appWithRealRepositories(tx);
    try {
      for (const tenant of [withDraft, empty]) {
        for (const url of ["/v1/review/onboarding", "/v1/review/onboarding/content"]) {
          const response = await app.inject({
            method: "GET",
            url,
            headers: { "x-test-identity": reviewer.identity.subject, "x-tenant-id": tenant.id },
          });
          assert.equal(response.statusCode, 404);
          assert.deepEqual(response.json(), { error: "onboarding_not_found" });
          assert.ok(!response.body.includes("Concept"));
        }
      }
      assert.equal((await reviewAccessEvents(tx, withDraft.id)).length, 0);
      assert.equal((await reviewAccessEvents(tx, empty.id)).length, 0);
    } finally {
      await app.close();
    }
  });
});

// ---------- Review requests en reviewer-actor (submitted → review_needed) ----------

const reviewRequests = (tx: Tx, tenantId: string) =>
  tx.select().from(schema.onboardingReviewRequests).where(eq(schema.onboardingReviewRequests.tenantId, tenantId));
const reviewRequestedEvents = async (tx: Tx, tenantId: string) =>
  (await auditEvents(tx, tenantId)).filter((event) => event.eventType === "review_requested");

const changesInput = (tenantId: string, reviewerUserId: string, baseVersion = 1): RequestChangesInput => ({
  tenantId,
  reviewerUserId,
  baseVersion,
  reasonCode: "missing_information",
  note: "Lever de ontbrekende informatie over de dienstverlening aan.",
});

// Tenant with a submitted onboarding (version 1) and an assigned reviewer without membership.
async function submittedForReview(tx: Tx, answers: Record<string, unknown> = { company_name: "Ingediend" }) {
  const tenant = await createTenant(tx);
  const owner = await createMember(tx, tenant.id);
  const reviewer = await createUser(tx);
  await assignReviewer(tx, tenant.id, reviewer.user.id);
  await submitOnboardingInTransaction(tx, draftInput(tenant.id, owner.user.id, 0, answers));
  const project = await projectRow(tx, tenant.id);
  assert.ok(project);
  return { tenant, owner, reviewer, project };
}

test("review access events: database bewaakt tenantkoppeling, vaste waarden en append-only gedrag", async () => {
  await withRollback(async (tx, client) => {
    const own = await submittedForReview(tx, { company_name: "Geheim A" });
    const other = await submittedForReview(tx, { company_name: "Geheim B" });
    const insert = (values: Partial<{
      tenantId: string;
      projectId: string;
      reviewerUserId: string;
      version: number;
      purpose: string;
      action: string;
      requestId: string;
    }> = {}) => {
      const {
        tenantId = own.tenant.id,
        projectId = own.project.id,
        reviewerUserId = own.reviewer.user.id,
        version = 1,
        purpose = "onboarding_review",
        action = "read_onboarding_content",
        requestId = "req-access-event",
      } = values;
      return client.query(
        "insert into onboarding_review_access_events (tenant_id, reviewer_user_id, project_id, version, purpose, action, request_or_correlation_id) values ($1, $2, $3, $4, $5, $6, $7)",
        [tenantId, reviewerUserId, projectId, version, purpose, action, requestId],
      );
    };

    await expectPgError(client, "23503", () => insert({ tenantId: other.tenant.id }));
    await expectPgError(client, "23503", () => insert({ projectId: other.project.id }));
    await expectPgError(client, "23503", () => insert({ reviewerUserId: other.reviewer.user.id }));
    await expectPgError(client, "23514", () => insert({ version: 0 }));
    await expectPgError(client, "23514", () => insert({ purpose: "other_purpose" }));
    await expectPgError(client, "23514", () => insert({ action: "other_action" }));
    await expectPgError(client, "23514", () => insert({ requestId: "   " }));
    await expectPgError(client, "23514", () => insert({ requestId: "x".repeat(256) }));
    await insert();

    await expectPgError(client, "23001", () =>
      client.query("update onboarding_review_access_events set request_or_correlation_id = 'changed' where tenant_id = $1", [own.tenant.id]),
    );
    await expectPgError(client, "23001", () =>
      client.query("delete from onboarding_review_access_events where tenant_id = $1", [own.tenant.id]),
    );
    assert.equal((await reviewAccessEvents(tx, own.tenant.id)).length, 1);
  });
});

test("review requests: verzoek wordt opgeslagen met id, versie, reden, notitie en created_at", async () => {
  await withRollback(async (tx) => {
    const { tenant, reviewer, project } = await submittedForReview(tx);
    const [row] = await tx
      .insert(schema.onboardingReviewRequests)
      .values({ tenantId: tenant.id, projectId: project.id, reviewerUserId: reviewer.user.id, version: 1, reasonCode: "rights_unclear", note: "Wie heeft de foto's gemaakt?" })
      .returning();
    assert.ok(row);
    assert.match(row.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual([row.version, row.reasonCode, row.note], [1, "rights_unclear", "Wie heeft de foto's gemaakt?"]);
    assert.ok(row.createdAt instanceof Date);
  });
});

test("review requests: database bewaakt tenant, project, reviewer-tenant, reason_code, notitie en versie", async () => {
  await withRollback(async (tx, client) => {
    const { tenant, reviewer, project } = await submittedForReview(tx);
    const other = await submittedForReview(tx);
    const insert = (values: { tenantId?: string; projectId?: string; reviewerUserId?: string; version?: number; reasonCode?: string; note?: string } = {}) => {
      const { tenantId = tenant.id, projectId = project.id, reviewerUserId = reviewer.user.id, version = 1, reasonCode = "out_of_scope", note = "Notitie" } = values;
      return client.query(
        "insert into onboarding_review_requests (tenant_id, project_id, reviewer_user_id, version, reason_code, note) values ($1, $2, $3, $4, $5, $6)",
        [tenantId, projectId, reviewerUserId, version, reasonCode, note],
      );
    };

    await expectPgError(client, "23503", () => insert({ tenantId: randomUUID() }));
    await expectPgError(client, "23503", () => insert({ projectId: randomUUID() }));
    // Project of the other tenant, and a reviewer who is only assigned to the other tenant.
    await expectPgError(client, "23503", () => insert({ projectId: other.project.id }));
    await expectPgError(client, "23503", () => insert({ reviewerUserId: other.reviewer.user.id }));
    await expectPgError(client, "23514", () => insert({ reasonCode: "approved" }));
    await expectPgError(client, "23514", () => insert({ note: "" }));
    await expectPgError(client, "23514", () => insert({ note: "   " }));
    await expectPgError(client, "23514", () => insert({ note: "x".repeat(2001) }));
    await expectPgError(client, "23514", () => insert({ version: 0 }));
    await insert({ note: "x".repeat(2000) });
    assert.equal((await reviewRequests(tx, tenant.id)).length, 1);
  });
});

test("review_requested: database weigert from_status NULL en accepteert submitted → review_needed met reviewer en bestaande versie", async () => {
  await withRollback(async (tx, client) => {
    const { tenantA, insertEvent } = await auditFixture(tx, client);
    const reviewer = await createUser(tx);
    await assignReviewer(tx, tenantA.id, reviewer.user.id);
    const reviewRequested = { memberUserId: null, reviewerUserId: reviewer.user.id, eventType: "review_requested", fromStatus: "submitted", toStatus: "review_needed", version: 1 };

    // Regression: a NULL comparison used to make the check pass instead of fail.
    await expectPgError(client, "23514", () => insertEvent({ ...reviewRequested, fromStatus: null }));

    await insertEvent(reviewRequested);
    assert.deepEqual(
      (await reviewRequestedEvents(tx, tenantA.id)).map((event) => [event.fromStatus, event.toStatus, event.reviewerUserId, event.version]),
      [["submitted", "review_needed", reviewer.user.id, 1]],
    );
  });
});

test("audit actors: precies één actor, de juiste actorsoort per eventtype, en de trigger blijft werken", async () => {
  await withRollback(async (tx, client) => {
    const { tenantA, tenantB, user, insertEvent } = await auditFixture(tx, client);
    const reviewer = await createUser(tx);
    await assignReviewer(tx, tenantA.id, reviewer.user.id);
    const otherReviewer = await createUser(tx);
    await assignReviewer(tx, tenantB.id, otherReviewer.user.id);
    const reviewRequested = { memberUserId: null, reviewerUserId: reviewer.user.id, eventType: "review_requested", fromStatus: "submitted", toStatus: "review_needed" };

    await expectPgError(client, "23514", () => insertEvent({ reviewerUserId: reviewer.user.id }));
    await expectPgError(client, "23514", () => insertEvent({ memberUserId: null }));
    await expectPgError(client, "23514", () => insertEvent({ memberUserId: null, reviewerUserId: reviewer.user.id }));
    await expectPgError(client, "23514", () => insertEvent({ ...reviewRequested, memberUserId: user.id, reviewerUserId: null }));
    await expectPgError(client, "23514", () => insertEvent({ ...reviewRequested, fromStatus: "draft" }));
    await expectPgError(client, "23514", () => insertEvent({ ...reviewRequested, toStatus: "approved" }));
    await expectPgError(client, "23514", () => insertEvent({ ...reviewRequested, version: null }));
    await expectPgError(client, "23514", () => insertEvent({ version: 0 }));
    // A reviewer assigned to another tenant cannot be the actor of this tenant's event.
    await expectPgError(client, "23503", () => insertEvent({ ...reviewRequested, reviewerUserId: otherReviewer.user.id }));

    await insertEvent(reviewRequested);
    // A submitted event without version, as written before migration 0010, stays valid.
    await insertEvent({ fromStatus: null, version: null });

    await expectPgError(client, "23001", () => client.query("update onboarding_audit_events set version = 9 where tenant_id = $1", [tenantA.id]));
    await expectPgError(client, "23001", () => client.query("delete from onboarding_audit_events where event_type = 'review_requested' and tenant_id = $1", [tenantA.id]));
    assert.equal((await reviewRequestedEvents(tx, tenantA.id)).length, 1);
  });
});

test("requestOnboardingChanges: submitted wordt review_needed met precies één review request en één audit-event, zonder antwoorden", async () => {
  await withRollback(async (tx) => {
    const { tenant, reviewer, project } = await submittedForReview(tx, { company_name: "Geheime Inhoud BV" });
    const result = await requestOnboardingChangesInTransaction(tx, changesInput(tenant.id, reviewer.user.id));
    assert.deepEqual(result, { status: "review_needed", version: 1 });

    const updated = await projectRow(tx, tenant.id);
    assert.deepEqual([updated?.status, updated?.currentVersion], ["review_needed", 1]);
    assert.ok(updated!.updatedAt >= project.updatedAt);

    const [request, ...moreRequests] = await reviewRequests(tx, tenant.id);
    assert.ok(request);
    assert.deepEqual(moreRequests, []);
    assert.deepEqual(Object.keys(request).sort(), ["createdAt", "id", "note", "projectId", "reasonCode", "reviewerUserId", "tenantId", "version"]);
    assert.deepEqual([request.projectId, request.reviewerUserId, request.version, request.reasonCode], [project.id, reviewer.user.id, 1, "missing_information"]);

    const [event, ...moreEvents] = await reviewRequestedEvents(tx, tenant.id);
    assert.ok(event);
    assert.deepEqual(moreEvents, []);
    assert.deepEqual(
      [event.projectId, event.memberUserId, event.reviewerUserId, event.fromStatus, event.toStatus, event.version],
      [project.id, null, reviewer.user.id, "submitted", "review_needed", 1],
    );
    // Neither the request nor the event contains answers or Project Brief content; the event has no note.
    assert.ok(!JSON.stringify([request, event]).includes("Geheime Inhoud"));
    assert.ok(!JSON.stringify(event).includes(request.note));
  });
});

test("requestOnboardingChanges: geen project, niet-submitted status en verouderde versie wijzigen niets", async () => {
  await withRollback(async (tx) => {
    const reviewer = await createUser(tx);
    const empty = await createTenant(tx);
    await assignReviewer(tx, empty.id, reviewer.user.id);
    assert.deepEqual(await requestOnboardingChangesInTransaction(tx, changesInput(empty.id, reviewer.user.id)), { status: "not_found" });

    const draftTenant = await createTenant(tx);
    const draftOwner = await createMember(tx, draftTenant.id);
    await assignReviewer(tx, draftTenant.id, reviewer.user.id);
    await saveOnboardingDraftInTransaction(tx, draftInput(draftTenant.id, draftOwner.user.id, 0));
    assert.deepEqual(await requestOnboardingChangesInTransaction(tx, changesInput(draftTenant.id, reviewer.user.id)), { status: "not_reviewable" });

    for (const status of ["review_needed", "blocked", "approved"] as const) {
      const { tenant, reviewer: assigned } = await submittedForReview(tx);
      await tx.update(schema.onboardingProjects).set({ status }).where(eq(schema.onboardingProjects.tenantId, tenant.id));
      assert.deepEqual(await requestOnboardingChangesInTransaction(tx, changesInput(tenant.id, assigned.user.id)), { status: "not_reviewable" }, status);
      assert.equal((await projectRow(tx, tenant.id))?.status, status);
      assert.equal((await reviewRequests(tx, tenant.id)).length, 0, status);
    }

    // Stale version: the client saved version 2 after the reviewer looked at version 1.
    const stale = await createTenant(tx);
    const staleOwner = await createMember(tx, stale.id);
    await assignReviewer(tx, stale.id, reviewer.user.id);
    await saveOnboardingDraftInTransaction(tx, draftInput(stale.id, staleOwner.user.id, 0));
    await submitOnboardingInTransaction(tx, draftInput(stale.id, staleOwner.user.id, 1));
    assert.deepEqual(await requestOnboardingChangesInTransaction(tx, changesInput(stale.id, reviewer.user.id, 1)), { status: "conflict", currentVersion: 2 });
    assert.equal((await projectRow(tx, stale.id))?.status, "submitted");

    for (const tenantId of [empty.id, draftTenant.id, stale.id]) {
      assert.equal((await reviewRequests(tx, tenantId)).length, 0);
      assert.equal((await reviewRequestedEvents(tx, tenantId)).length, 0);
    }
  });
});

test("requestOnboardingChanges: een tweede verzoek geeft not_reviewable en geen tweede overgang", async () => {
  await withRollback(async (tx) => {
    const { tenant, reviewer } = await submittedForReview(tx);
    assert.equal((await requestOnboardingChangesInTransaction(tx, changesInput(tenant.id, reviewer.user.id))).status, "review_needed");
    assert.deepEqual(await requestOnboardingChangesInTransaction(tx, changesInput(tenant.id, reviewer.user.id)), { status: "not_reviewable" });
    assert.equal((await reviewRequests(tx, tenant.id)).length, 1);
    assert.equal((await reviewRequestedEvents(tx, tenant.id)).length, 1);
  });
});

test("requestOnboardingChanges: een fout bij review request of audit-event rolt status, verzoek en event samen terug", async () => {
  await withRollback(async (tx, client) => {
    const { tenant, reviewer } = await submittedForReview(tx);

    // The savepoint plays the role of the transaction in requestOnboardingChanges.
    const expectRolledBack = async (input: RequestChangesInput, setup?: string) => {
      await client.query("savepoint request_changes_attempt");
      if (setup) await client.query(setup);
      await assert.rejects(requestOnboardingChangesInTransaction(tx, input));
      await client.query("rollback to savepoint request_changes_attempt");

      assert.equal((await projectRow(tx, tenant.id))?.status, "submitted");
      assert.equal((await reviewRequests(tx, tenant.id)).length, 0);
      assert.equal((await reviewRequestedEvents(tx, tenant.id)).length, 0);
    };

    // Failure at the first write, after authorization passed and the project was locked.
    await expectRolledBack(
      changesInput(tenant.id, reviewer.user.id),
      "alter table onboarding_review_requests add constraint test_forced_failure check (false) not valid",
    );
    // Failure at the last write, after request and status change were written.
    await expectRolledBack(
      changesInput(tenant.id, reviewer.user.id),
      "alter table onboarding_audit_events add constraint test_forced_failure check (false) not valid",
    );
  });
});

// Nothing changed: still submitted, no review request and no review_requested event.
async function assertNoReviewChange(tx: Tx, tenantId: string, label: string) {
  assert.equal((await projectRow(tx, tenantId))?.status, "submitted", label);
  assert.equal((await reviewRequests(tx, tenantId)).length, 0, label);
  assert.equal((await reviewRequestedEvents(tx, tenantId)).length, 0, label);
}

test("requestOnboardingChanges: de repository controleert assignment en zelfreview opnieuw, los van de HTTP-hook", async () => {
  await withRollback(async (tx) => {
    // Revoked after the hook would have run: a direct repository call must still be refused.
    const revoked = await submittedForReview(tx);
    await tx
      .update(schema.onboardingReviewerAssignments)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(schema.onboardingReviewerAssignments.tenantId, revoked.tenant.id));
    assert.deepEqual(await requestOnboardingChangesInTransaction(tx, changesInput(revoked.tenant.id, revoked.reviewer.user.id)), { status: "reviewer_forbidden" });
    await assertNoReviewChange(tx, revoked.tenant.id, "revoked");

    // No assignment at all, and an assignment that only exists for another tenant.
    const missing = await submittedForReview(tx);
    const stranger = await createUser(tx);
    assert.deepEqual(await requestOnboardingChangesInTransaction(tx, changesInput(missing.tenant.id, stranger.user.id)), { status: "reviewer_forbidden" });
    assert.deepEqual(await requestOnboardingChangesInTransaction(tx, changesInput(missing.tenant.id, revoked.reviewer.user.id)), { status: "reviewer_forbidden" });
    await assertNoReviewChange(tx, missing.tenant.id, "missing");

    // Active membership in the same tenant: self-review.
    const self = await submittedForReview(tx);
    await tx.insert(schema.memberships).values({ tenantId: self.tenant.id, userId: self.reviewer.user.id, role: "team_member" });
    assert.deepEqual(await requestOnboardingChangesInTransaction(tx, changesInput(self.tenant.id, self.reviewer.user.id)), { status: "self_review_forbidden" });
    await assertNoReviewChange(tx, self.tenant.id, "self-review");
  });
});

test("requestOnboardingChanges: een disabled of invited membership blokkeert niet; een actieve assignment gaat door", async () => {
  await withRollback(async (tx) => {
    for (const status of ["disabled", "invited"] as const) {
      const { tenant, reviewer } = await submittedForReview(tx);
      await tx.insert(schema.memberships).values({ tenantId: tenant.id, userId: reviewer.user.id, role: "owner", status });
      assert.deepEqual(await requestOnboardingChangesInTransaction(tx, changesInput(tenant.id, reviewer.user.id)), { status: "review_needed", version: 1 }, status);
      assert.equal((await reviewRequestedEvents(tx, tenant.id)).length, 1, status);
    }
  });
});

test("versies: review requests en audit-events verwijzen naar een bestaande onboardingversie van hetzelfde project", async () => {
  await withRollback(async (tx, client) => {
    const { tenantA, insertEvent } = await auditFixture(tx, client);
    const reviewer = await createUser(tx);
    await assignReviewer(tx, tenantA.id, reviewer.user.id);
    const [projectA] = await tx.select().from(schema.onboardingProjects).where(eq(schema.onboardingProjects.tenantId, tenantA.id));
    assert.ok(projectA);
    // Another project that does have a version 2.
    const other = await createTenant(tx);
    const otherOwner = await createMember(tx, other.id);
    await saveOnboardingDraftInTransaction(tx, draftInput(other.id, otherOwner.user.id, 0));
    await submitOnboardingInTransaction(tx, draftInput(other.id, otherOwner.user.id, 1));

    const insertRequest = (version: number) =>
      client.query(
        "insert into onboarding_review_requests (tenant_id, project_id, reviewer_user_id, version, reason_code, note) values ($1, $2, $3, $4, 'missing_information', 'Notitie')",
        [tenantA.id, projectA.id, reviewer.user.id, version],
      );
    await insertRequest(1);
    // Project A only has version 1; version 2 exists for the other project, which must not count.
    await expectPgError(client, "23503", () => insertRequest(2));
    await expectPgError(client, "23503", () => insertRequest(99));

    const reviewRequested = { memberUserId: null, reviewerUserId: reviewer.user.id, eventType: "review_requested", fromStatus: "submitted", toStatus: "review_needed" };
    await insertEvent({ ...reviewRequested, version: 1 });
    await expectPgError(client, "23503", () => insertEvent({ ...reviewRequested, version: 2 }));
    await expectPgError(client, "23503", () => insertEvent({ version: 2 }));
    // Legacy submitted event without version stays valid.
    await insertEvent({ fromStatus: null, version: null });
  });
});

test("HTTP request-changes met echte repositories: alleen de toegewezen reviewer wijzigt de eigen tenant", async () => {
  await withRollback(async (tx) => {
    const a = await submittedForReview(tx);
    const b = await submittedForReview(tx);
    const revoked = await createUser(tx);
    await assignReviewer(tx, a.tenant.id, revoked.user.id, { status: "revoked", revokedAt: new Date() });
    const selfReviewer = await createMember(tx, a.tenant.id);
    await assignReviewer(tx, a.tenant.id, selfReviewer.user.id);

    const app = appWithRealRepositories(tx);
    const post = (subject: string, tenantId: string, payload: object = { base_version: 1, reason_code: "missing_information", note: "Graag aanvullen." }) =>
      app.inject({ method: "POST", url: "/v1/review/onboarding/request-changes", headers: { "x-test-identity": subject, "x-tenant-id": tenantId }, payload });
    try {
      const denied: [string, string, number, string][] = [
        [a.reviewer.identity.subject, b.tenant.id, 403, "forbidden"],
        [a.owner.identity.subject, a.tenant.id, 403, "forbidden"],
        [revoked.identity.subject, a.tenant.id, 403, "forbidden"],
        [selfReviewer.identity.subject, a.tenant.id, 403, "self_review_forbidden"],
      ];
      for (const [subject, tenantId, status, error] of denied) {
        const response = await post(subject, tenantId);
        assert.equal(response.statusCode, status, error);
        assert.deepEqual(response.json(), { error });
      }

      const invalid = await post(a.reviewer.identity.subject, a.tenant.id, { base_version: 1, reason_code: "missing_information", note: "x", tenant_id: b.tenant.id });
      assert.deepEqual([invalid.statusCode, invalid.json()], [400, { error: "invalid_body" }]);
      const stale = await post(a.reviewer.identity.subject, a.tenant.id, { base_version: 2, reason_code: "missing_information", note: "Graag aanvullen." });
      assert.deepEqual([stale.statusCode, stale.json()], [409, { error: "version_conflict", current_version: 1 }]);
      assert.equal((await reviewRequests(tx, a.tenant.id)).length, 0, "geen verzoek na een foutpad");

      const ok = await post(a.reviewer.identity.subject, a.tenant.id);
      assert.deepEqual([ok.statusCode, ok.json()], [200, { status: "review_needed", version: 1 }]);
      const again = await post(a.reviewer.identity.subject, a.tenant.id);
      assert.deepEqual([again.statusCode, again.json()], [409, { error: "not_reviewable" }]);

      assert.equal((await projectRow(tx, a.tenant.id))?.status, "review_needed");
      assert.deepEqual((await reviewRequests(tx, a.tenant.id)).map((row) => row.reviewerUserId), [a.reviewer.user.id]);
      assert.equal((await reviewRequestedEvents(tx, a.tenant.id)).length, 1);
      assert.equal((await projectRow(tx, b.tenant.id))?.status, "submitted", "tenant B blijft ongewijzigd");
      assert.equal((await reviewRequests(tx, b.tenant.id)).length, 0);

      const metadata = await app.inject({ method: "GET", url: "/v1/review/onboarding", headers: { "x-test-identity": a.reviewer.identity.subject, "x-tenant-id": a.tenant.id } });
      assert.equal(metadata.json().status, "review_needed");
    } finally {
      await app.close();
    }
  });
});

// ---------- Concept opslaan in review_needed (O-6) ----------

// Tenant whose onboarding went through the real flow: submitted (v1), then review_needed by a reviewer.
async function inReviewNeeded(tx: Tx) {
  const setup = await submittedForReview(tx, { company_name: "Versie 1" });
  assert.equal((await requestOnboardingChangesInTransaction(tx, changesInput(setup.tenant.id, setup.reviewer.user.id))).status, "review_needed");
  return setup;
}

const versionsOf = (tx: Tx, tenantId: string) =>
  tx
    .select({ version: schema.onboardingVersions.version, answers: schema.onboardingVersions.answers, createdBy: schema.onboardingVersions.createdBy })
    .from(schema.onboardingVersions)
    .where(eq(schema.onboardingVersions.tenantId, tenantId))
    .orderBy(schema.onboardingVersions.version);

test("review_needed: Owner slaat een nieuwe onveranderlijke versie op; status blijft review_needed en er komt geen audit-event bij", async () => {
  await withRollback(async (tx) => {
    const { tenant, owner } = await inReviewNeeded(tx);
    const eventsBefore = await auditEvents(tx, tenant.id);

    const result = await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, owner.user.id, 1, { company_name: "Aangevuld" }));
    assert.equal(result.status, "saved");
    assert.deepEqual(result.status === "saved" && [result.draft.status, result.draft.version], ["review_needed", 2]);

    const project = await projectRow(tx, tenant.id);
    assert.deepEqual([project?.status, project?.currentVersion], ["review_needed", 2]);
    assert.deepEqual(await versionsOf(tx, tenant.id), [
      { version: 1, answers: { company_name: "Versie 1" }, createdBy: owner.user.id },
      { version: 2, answers: { company_name: "Aangevuld" }, createdBy: owner.user.id },
    ]);
    assert.deepEqual((await auditEvents(tx, tenant.id)).map((event) => event.id), eventsBefore.map((event) => event.id), "concept opslaan is geen audit-event");
    assert.equal((await findCurrentOnboarding(tx, tenant.id))?.status, "review_needed");
  });
});

test("review_needed: een verouderde base_version geeft conflict bij opslaan en opnieuw indienen; niets wijzigt", async () => {
  await withRollback(async (tx) => {
    const { tenant, owner } = await inReviewNeeded(tx);
    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, owner.user.id, 1, { company_name: "Versie 2" }));
    const eventCount = (await auditEvents(tx, tenant.id)).length;

    assert.deepEqual(await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, owner.user.id, 1, { company_name: "Verouderd" })), {
      status: "conflict",
      currentVersion: 2,
    });
    assert.deepEqual(await submitOnboardingInTransaction(tx, draftInput(tenant.id, owner.user.id, 1)), { status: "conflict", currentVersion: 2 });

    const project = await projectRow(tx, tenant.id);
    assert.deepEqual([project?.status, project?.currentVersion], ["review_needed", 2]);
    assert.equal(await versionCount(tx, tenant.id), 2);
    assert.equal((await auditEvents(tx, tenant.id)).length, eventCount);
  });
});

test("review_needed: blocked blijft niet bewerkbaar, en opslaan in review_needed raakt een andere tenant niet", async () => {
  await withRollback(async (tx) => {
    const blocked = await submittedForReview(tx);
    await tx.update(schema.onboardingProjects).set({ status: "blocked" }).where(eq(schema.onboardingProjects.tenantId, blocked.tenant.id));
    assert.deepEqual(await saveOnboardingDraftInTransaction(tx, draftInput(blocked.tenant.id, blocked.owner.user.id, 1)), { status: "not_editable" });
    assert.equal(await versionCount(tx, blocked.tenant.id), 1);

    const a = await inReviewNeeded(tx);
    const b = await inReviewNeeded(tx);
    await saveOnboardingDraftInTransaction(tx, draftInput(a.tenant.id, a.owner.user.id, 1, { company_name: "Alleen A" }));
    assert.deepEqual([(await projectRow(tx, b.tenant.id))?.currentVersion, await versionCount(tx, b.tenant.id)], [1, 1]);
    assert.deepEqual((await findCurrentOnboarding(tx, b.tenant.id))?.answers, { company_name: "Versie 1" });
  });
});

test("HTTP PUT in review_needed met echte repositories: Owner 200, verouderd 409; Team Member en reviewer 403", async () => {
  await withRollback(async (tx) => {
    const { tenant, owner, reviewer } = await inReviewNeeded(tx);
    const member = await createUser(tx);
    await tx.insert(schema.memberships).values({ tenantId: tenant.id, userId: member.user.id, role: "team_member" });
    const eventCount = (await auditEvents(tx, tenant.id)).length;

    const app = appWithRealRepositories(tx);
    const put = (subject: string, baseVersion: number, url = "/v1/onboarding/current") =>
      app.inject({ method: "PUT", url, headers: { "x-test-identity": subject, "x-tenant-id": tenant.id }, payload: onboardingPayload(baseVersion, { company_name: "Aangevuld" }) });
    try {
      for (const subject of [member.identity.subject, reviewer.identity.subject]) {
        const denied = await put(subject, 1);
        assert.deepEqual([denied.statusCode, denied.json()], [403, { error: "forbidden" }]);
      }

      const saved = await put(owner.identity.subject, 1);
      assert.equal(saved.statusCode, 200);
      assert.deepEqual([saved.json().status, saved.json().version], ["review_needed", 2]);
      const stale = await put(owner.identity.subject, 1);
      assert.deepEqual([stale.statusCode, stale.json()], [409, { error: "version_conflict", current_version: 2 }]);

      const metadata = await app.inject({ method: "GET", url: "/v1/review/onboarding", headers: { "x-test-identity": reviewer.identity.subject, "x-tenant-id": tenant.id } });
      assert.deepEqual([metadata.json().status, metadata.json().version], ["review_needed", 2]);
      assert.equal((await auditEvents(tx, tenant.id)).length, eventCount);
    } finally {
      await app.close();
    }
  });
});

// ---------- Opnieuw indienen vanuit review_needed ----------

const resubmittedEvents = async (tx: Tx, tenantId: string) =>
  (await auditEvents(tx, tenantId)).filter((event) => event.eventType === "resubmitted");

test("resubmit: review_needed wordt submitted als nieuwe versie met precies één resubmitted-event zonder klantdata", async () => {
  await withRollback(async (tx) => {
    const { tenant, owner } = await inReviewNeeded(tx);
    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, owner.user.id, 1, { company_name: "Aangevuld" }));

    const result = await submitOnboardingInTransaction(tx, draftInput(tenant.id, owner.user.id, 2, { company_name: "Geheime Aanvulling BV" }));
    assert.deepEqual(result.status === "saved" && [result.draft.status, result.draft.version], ["submitted", 3]);

    const project = await projectRow(tx, tenant.id);
    assert.deepEqual([project?.status, project?.currentVersion], ["submitted", 3]);
    assert.deepEqual((await versionsOf(tx, tenant.id)).map((row) => [row.version, row.answers]), [
      [1, { company_name: "Versie 1" }],
      [2, { company_name: "Aangevuld" }],
      [3, { company_name: "Geheime Aanvulling BV" }],
    ]);

    const events = await auditEvents(tx, tenant.id);
    assert.deepEqual(events.map((event) => event.eventType).sort(), ["resubmitted", "review_requested", "submitted"]);
    const [resubmitted] = await resubmittedEvents(tx, tenant.id);
    assert.ok(resubmitted);
    assert.deepEqual(
      [resubmitted.memberUserId, resubmitted.reviewerUserId, resubmitted.fromStatus, resubmitted.toStatus, resubmitted.version],
      [owner.user.id, null, "review_needed", "submitted", 3],
    );
    assert.ok(!JSON.stringify(events).includes("Geheime Aanvulling"));

    // A second submit from submitted stays blocked and writes nothing.
    assert.deepEqual(await submitOnboardingInTransaction(tx, draftInput(tenant.id, owner.user.id, 3)), { status: "not_editable" });
    assert.equal((await resubmittedEvents(tx, tenant.id)).length, 1);
    assert.equal(await versionCount(tx, tenant.id), 3);
  });
});

test("resubmit: database accepteert resubmitted alleen als review_needed → submitted met member-actor en bestaande versie", async () => {
  await withRollback(async (tx, client) => {
    const { tenantA, insertEvent } = await auditFixture(tx, client);
    const reviewer = await createUser(tx);
    await assignReviewer(tx, tenantA.id, reviewer.user.id);
    const resubmitted = { eventType: "resubmitted", fromStatus: "review_needed", toStatus: "submitted", version: 1 };

    await expectPgError(client, "23514", () => insertEvent({ ...resubmitted, fromStatus: "draft" }));
    await expectPgError(client, "23514", () => insertEvent({ ...resubmitted, fromStatus: "submitted" }));
    await expectPgError(client, "23514", () => insertEvent({ ...resubmitted, fromStatus: null }));
    await expectPgError(client, "23514", () => insertEvent({ ...resubmitted, toStatus: "review_needed" }));
    await expectPgError(client, "23514", () => insertEvent({ ...resubmitted, version: null }));
    await expectPgError(client, "23514", () => insertEvent({ ...resubmitted, memberUserId: null, reviewerUserId: reviewer.user.id }));
    // The version must exist for this project.
    await expectPgError(client, "23503", () => insertEvent({ ...resubmitted, version: 5 }));
    // The submitted rule is unchanged: a submitted event cannot come from review_needed.
    await expectPgError(client, "23514", () => insertEvent({ fromStatus: "review_needed" }));

    await insertEvent(resubmitted);
    await expectPgError(client, "23001", () => client.query("update onboarding_audit_events set version = 1 where event_type = 'resubmitted' and tenant_id = $1", [tenantA.id]));
    await expectPgError(client, "23001", () => client.query("delete from onboarding_audit_events where event_type = 'resubmitted' and tenant_id = $1", [tenantA.id]));
    assert.equal((await resubmittedEvents(tx, tenantA.id)).length, 1);
  });
});

test("resubmit: een fout bij versie of audit-event laat status, versies en events ongewijzigd", async () => {
  await withRollback(async (tx, client) => {
    const { tenant, owner } = await inReviewNeeded(tx);
    const eventCount = (await auditEvents(tx, tenant.id)).length;

    // The savepoint plays the role of the transaction in submitOnboarding.
    const expectRolledBack = async (userId: string, setup?: string) => {
      await client.query("savepoint resubmit_attempt");
      if (setup) await client.query(setup);
      await assert.rejects(submitOnboardingInTransaction(tx, draftInput(tenant.id, userId, 1)));
      await client.query("rollback to savepoint resubmit_attempt");

      const project = await projectRow(tx, tenant.id);
      assert.deepEqual([project?.status, project?.currentVersion], ["review_needed", 1]);
      assert.equal(await versionCount(tx, tenant.id), 1);
      assert.equal((await auditEvents(tx, tenant.id)).length, eventCount);
    };

    // Failure at the version insert (unknown user), and at the audit insert after version and status were written.
    await expectRolledBack(randomUUID());
    await expectRolledBack(owner.user.id, "alter table onboarding_audit_events add constraint test_forced_failure check (false) not valid");
  });
});

test("HTTP resubmit met echte repositories: Owner dient opnieuw in; Team Member en reviewer 403; andere tenant ongemoeid", async () => {
  await withRollback(async (tx) => {
    const a = await inReviewNeeded(tx);
    const b = await inReviewNeeded(tx);
    const member = await createUser(tx);
    await tx.insert(schema.memberships).values({ tenantId: a.tenant.id, userId: member.user.id, role: "team_member" });

    const app = appWithRealRepositories(tx);
    const submit = (subject: string, baseVersion: number) =>
      app.inject({
        method: "POST",
        url: "/v1/onboarding/current/submit",
        headers: { "x-test-identity": subject, "x-tenant-id": a.tenant.id },
        payload: onboardingPayload(baseVersion, completeAnswers()),
      });
    try {
      for (const subject of [member.identity.subject, a.reviewer.identity.subject]) {
        const denied = await submit(subject, 1);
        assert.deepEqual([denied.statusCode, denied.json()], [403, { error: "forbidden" }]);
      }
      const stale = await submit(a.owner.identity.subject, 0);
      assert.deepEqual([stale.statusCode, stale.json()], [409, { error: "version_conflict", current_version: 1 }]);
      assert.equal((await resubmittedEvents(tx, a.tenant.id)).length, 0, "geen event na een foutpad");

      const ok = await submit(a.owner.identity.subject, 1);
      assert.equal(ok.statusCode, 200);
      assert.deepEqual([ok.json().status, ok.json().version, typeof ok.json().updated_at], ["submitted", 2, "string"]);

      const current = await app.inject({ method: "GET", url: "/v1/onboarding/current", headers: { "x-test-identity": a.owner.identity.subject } });
      assert.deepEqual([current.json().status, current.json().version, current.json().project_brief.submitted_for_review], ["submitted", 2, true]);
      const [event] = await resubmittedEvents(tx, a.tenant.id);
      assert.deepEqual([event?.memberUserId, event?.version], [a.owner.user.id, 2]);

      const again = await submit(a.owner.identity.subject, 2);
      assert.deepEqual([again.statusCode, again.json()], [409, { error: "not_editable" }]);

      assert.deepEqual([(await projectRow(tx, b.tenant.id))?.status, await versionCount(tx, b.tenant.id)], ["review_needed", 1]);
      assert.equal((await resubmittedEvents(tx, b.tenant.id)).length, 0);
    } finally {
      await app.close();
    }
  });
});

// ---------- Reviewnotitie voor de Owner ----------

test("findCurrentOnboarding: review_needed geeft de laatste review request van het eigen project, ook na conceptopslag; daarna niet meer", async () => {
  await withRollback(async (tx) => {
    const a = await inReviewNeeded(tx);
    const b = await inReviewNeeded(tx);

    const current = await findCurrentOnboarding(tx, a.tenant.id);
    assert.deepEqual(current?.reviewRequest && Object.keys(current.reviewRequest).sort(), ["createdAt", "kind", "note", "reasonCode", "version"]);
    assert.equal(current?.reviewRequest?.kind, "changes_requested");
    assert.deepEqual([current?.reviewRequest?.reasonCode, current?.reviewRequest?.note, current?.reviewRequest?.version], [
      "missing_information",
      "Lever de ontbrekende informatie over de dienstverlening aan.",
      1,
    ]);

    // Draft saves raise the version while the request stays open, so it remains visible.
    await saveOnboardingDraftInTransaction(tx, draftInput(a.tenant.id, a.owner.user.id, 1, { company_name: "Aangevuld" }));
    assert.equal((await findCurrentOnboarding(tx, a.tenant.id))?.reviewRequest?.version, 1);

    // Tenant B's own request belongs to B's project; A's resubmission does not touch it.
    await submitOnboardingInTransaction(tx, draftInput(a.tenant.id, a.owner.user.id, 2));
    assert.equal((await findCurrentOnboarding(tx, a.tenant.id))?.reviewRequest, null, "submitted shows no request");
    assert.equal((await findCurrentOnboarding(tx, b.tenant.id))?.reviewRequest?.version, 1);
  });
});

test("findCurrentOnboarding: geen review request bij draft, en nooit die van een andere tenant", async () => {
  await withRollback(async (tx) => {
    const other = await inReviewNeeded(tx);
    const tenant = await createTenant(tx);
    const owner = await createMember(tx, tenant.id);
    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, owner.user.id, 0));

    assert.equal((await findCurrentOnboarding(tx, tenant.id))?.reviewRequest, null);
    assert.ok((await findCurrentOnboarding(tx, other.tenant.id))?.reviewRequest, "the other tenant does have one");
  });
});

test("HTTP GET met echte repositories: Owner ziet de reviewnotitie van de eigen tenant zonder reviewer-ID", async () => {
  await withRollback(async (tx) => {
    const a = await inReviewNeeded(tx);
    const b = await inReviewNeeded(tx);
    await tx.insert(schema.onboardingReviewRequests).values({
      tenantId: b.tenant.id,
      projectId: b.project.id,
      reviewerUserId: b.reviewer.user.id,
      version: 1,
      reasonCode: "out_of_scope",
      note: "Notitie die alleen bij tenant B hoort.",
    });

    const app = appWithRealRepositories(tx);
    try {
      const response = await app.inject({ method: "GET", url: "/v1/onboarding/current", headers: { "x-test-identity": a.owner.identity.subject } });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().status, "review_needed");
      assert.deepEqual(Object.keys(response.json().review_request).sort(), ["created_at", "kind", "note", "reason_code", "version"]);
      assert.equal(response.json().review_request.reason_code, "missing_information");
      assert.ok(!response.body.includes(a.reviewer.user.id), "no reviewer ID");
      assert.ok(!response.body.includes("reviewer_user_id"));
      assert.ok(!response.body.includes("alleen bij tenant B"));
    } finally {
      await app.close();
    }
  });
});

// ---------- Blokkeren en blokkade opheffen ----------

const reviewActions = (tx: Tx, tenantId: string) =>
  tx.select().from(schema.onboardingReviewActions).where(eq(schema.onboardingReviewActions.tenantId, tenantId));
const eventsOfType = async (tx: Tx, tenantId: string, eventType: string) =>
  (await auditEvents(tx, tenantId)).filter((event) => event.eventType === eventType);

const blockInput = (tenantId: string, reviewerUserId: string, baseVersion = 1): BlockInput => ({
  tenantId,
  reviewerUserId,
  baseVersion,
  reasonCode: "critical_basis_missing",
  note: "Bestaande branding ontbreekt binnen het standaardpakket.",
});
const unblockInput = (tenantId: string, reviewerUserId: string, baseVersion = 1): UnblockInput => ({
  tenantId,
  reviewerUserId,
  baseVersion,
  reasonCode: "basis_provided",
  note: "Branding is alsnog aangeleverd.",
});

// Nothing changed for this tenant: same status, no review action and no blocked/unblocked event.
async function assertNoBlockChange(tx: Tx, tenantId: string, status: string, label: string) {
  assert.equal((await projectRow(tx, tenantId))?.status, status, label);
  assert.equal((await reviewActions(tx, tenantId)).length, 0, label);
  assert.equal((await eventsOfType(tx, tenantId, "blocked")).length + (await eventsOfType(tx, tenantId, "unblocked")).length, 0, label);
}

test("block en unblock: submitted → blocked → review_needed zonder nieuwe versie, met reviewactie en audit-event per stap", async () => {
  await withRollback(async (tx) => {
    const { tenant, owner, reviewer, project } = await submittedForReview(tx, { company_name: "Geheime Inhoud BV" });

    assert.deepEqual(await blockOnboardingInTransaction(tx, blockInput(tenant.id, reviewer.user.id)), { status: "blocked", version: 1 });
    assert.deepEqual([(await projectRow(tx, tenant.id))?.status, await versionCount(tx, tenant.id)], ["blocked", 1]);

    assert.deepEqual(await unblockOnboardingInTransaction(tx, unblockInput(tenant.id, reviewer.user.id)), { status: "review_needed", version: 1 });
    const after = await projectRow(tx, tenant.id);
    assert.deepEqual([after?.status, after?.currentVersion, await versionCount(tx, tenant.id)], ["review_needed", 1, 1]);

    const actions = (await reviewActions(tx, tenant.id)).sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime() || x.action.localeCompare(y.action));
    assert.deepEqual(
      actions.map((action) => [action.action, action.reasonCode, action.note, action.version, action.projectId, action.reviewerUserId]),
      [
        ["blocked", "critical_basis_missing", "Bestaande branding ontbreekt binnen het standaardpakket.", 1, project.id, reviewer.user.id],
        ["unblocked", "basis_provided", "Branding is alsnog aangeleverd.", 1, project.id, reviewer.user.id],
      ],
    );
    const [blocked] = await eventsOfType(tx, tenant.id, "blocked");
    const [unblocked] = await eventsOfType(tx, tenant.id, "unblocked");
    assert.deepEqual([blocked?.reviewerUserId, blocked?.memberUserId, blocked?.fromStatus, blocked?.toStatus, blocked?.version], [reviewer.user.id, null, "submitted", "blocked", 1]);
    assert.deepEqual([unblocked?.reviewerUserId, unblocked?.fromStatus, unblocked?.toStatus, unblocked?.version], [reviewer.user.id, "blocked", "review_needed", 1]);
    // Audit events hold neither the note nor client content.
    const serialized = JSON.stringify(await auditEvents(tx, tenant.id));
    for (const text of ["branding", "Branding", "Geheime Inhoud"]) assert.ok(!serialized.includes(text), text);

    const feedback = (await findCurrentOnboarding(tx, tenant.id))?.reviewRequest;
    assert.deepEqual(
      feedback && { kind: feedback.kind, reasonCode: feedback.reasonCode, note: feedback.note, version: feedback.version, hasCreatedAt: feedback.createdAt instanceof Date },
      { kind: "unblocked", reasonCode: "basis_provided", note: "Branding is alsnog aangeleverd.", version: 1, hasCreatedAt: true },
    );

    // After unblocking, the Owner uses the existing flow again: save a draft and resubmit.
    const saved = await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, owner.user.id, 1, { company_name: "Aangevuld" }));
    assert.deepEqual(saved.status === "saved" && [saved.draft.status, saved.draft.version], ["review_needed", 2]);
    const resubmitted = await submitOnboardingInTransaction(tx, draftInput(tenant.id, owner.user.id, 2));
    assert.deepEqual(resubmitted.status === "saved" && [resubmitted.draft.status, resubmitted.draft.version], ["submitted", 3]);
    assert.equal((await findCurrentOnboarding(tx, tenant.id))?.reviewRequest, null, "resubmission hides unblock feedback");
  });
});

test("Owner-feedback na unblock is tenantgebonden en alleen actief bij review_needed", async () => {
  await withRollback(async (tx) => {
    const own = await submittedForReview(tx);
    const other = await submittedForReview(tx);
    await blockOnboardingInTransaction(tx, blockInput(own.tenant.id, own.reviewer.user.id));
    await unblockOnboardingInTransaction(tx, { ...unblockInput(own.tenant.id, own.reviewer.user.id), note: "Eigen unblock-notitie." });
    await blockOnboardingInTransaction(tx, blockInput(other.tenant.id, other.reviewer.user.id));
    await unblockOnboardingInTransaction(tx, { ...unblockInput(other.tenant.id, other.reviewer.user.id), note: "Notitie van een andere tenant." });

    const ownFeedback = (await findCurrentOnboarding(tx, own.tenant.id))?.reviewRequest;
    assert.deepEqual([ownFeedback?.kind, ownFeedback?.reasonCode, ownFeedback?.note, ownFeedback?.version], ["unblocked", "basis_provided", "Eigen unblock-notitie.", 1]);
    assert.ok(!(JSON.stringify(ownFeedback) ?? "").includes("andere tenant"));

    for (const status of ["draft", "submitted", "blocked", "approved"] as const) {
      await tx.update(schema.onboardingProjects).set({ status }).where(eq(schema.onboardingProjects.tenantId, own.tenant.id));
      assert.equal((await findCurrentOnboarding(tx, own.tenant.id))?.reviewRequest, null, status);
    }
  });
});

test("block en unblock: ongeldige overgangen, dubbele acties en een verouderde versie wijzigen niets", async () => {
  await withRollback(async (tx) => {
    const reviewer = await createUser(tx);
    const draftTenant = await createTenant(tx);
    const draftOwner = await createMember(tx, draftTenant.id);
    await assignReviewer(tx, draftTenant.id, reviewer.user.id);
    await saveOnboardingDraftInTransaction(tx, draftInput(draftTenant.id, draftOwner.user.id, 0));
    assert.deepEqual(await blockOnboardingInTransaction(tx, blockInput(draftTenant.id, reviewer.user.id)), { status: "not_reviewable" }, "draft → blocked");
    await assertNoBlockChange(tx, draftTenant.id, "draft", "draft");

    for (const status of ["review_needed", "approved"] as const) {
      const { tenant, reviewer: assigned } = await submittedForReview(tx);
      await tx.update(schema.onboardingProjects).set({ status }).where(eq(schema.onboardingProjects.tenantId, tenant.id));
      assert.deepEqual(await blockOnboardingInTransaction(tx, blockInput(tenant.id, assigned.user.id)), { status: "not_reviewable" }, `${status} → blocked`);
      await assertNoBlockChange(tx, tenant.id, status, status);
    }

    const submitted = await submittedForReview(tx);
    assert.deepEqual(await unblockOnboardingInTransaction(tx, unblockInput(submitted.tenant.id, submitted.reviewer.user.id)), { status: "not_reviewable" }, "submitted → unblocked");
    assert.deepEqual(await blockOnboardingInTransaction(tx, blockInput(submitted.tenant.id, submitted.reviewer.user.id, 2)), { status: "conflict", currentVersion: 1 }, "stale");
    await assertNoBlockChange(tx, submitted.tenant.id, "submitted", "submitted");

    // A second block and a second unblock are refused; exactly one action and event each.
    assert.equal((await blockOnboardingInTransaction(tx, blockInput(submitted.tenant.id, submitted.reviewer.user.id))).status, "blocked");
    assert.deepEqual(await blockOnboardingInTransaction(tx, blockInput(submitted.tenant.id, submitted.reviewer.user.id)), { status: "not_reviewable" });
    assert.equal((await unblockOnboardingInTransaction(tx, unblockInput(submitted.tenant.id, submitted.reviewer.user.id))).status, "review_needed");
    assert.deepEqual(await unblockOnboardingInTransaction(tx, unblockInput(submitted.tenant.id, submitted.reviewer.user.id)), { status: "not_reviewable" });
    assert.equal((await reviewActions(tx, submitted.tenant.id)).length, 2);
    assert.equal((await eventsOfType(tx, submitted.tenant.id, "blocked")).length, 1);
    assert.equal((await eventsOfType(tx, submitted.tenant.id, "unblocked")).length, 1);
  });
});

test("block en unblock: de repository weigert een ingetrokken of ontbrekende assignment en zelfreview", async () => {
  await withRollback(async (tx) => {
    const revoked = await submittedForReview(tx);
    await tx.update(schema.onboardingReviewerAssignments).set({ status: "revoked", revokedAt: new Date() }).where(eq(schema.onboardingReviewerAssignments.tenantId, revoked.tenant.id));
    assert.deepEqual(await blockOnboardingInTransaction(tx, blockInput(revoked.tenant.id, revoked.reviewer.user.id)), { status: "reviewer_forbidden" });
    await assertNoBlockChange(tx, revoked.tenant.id, "submitted", "revoked");

    const missing = await submittedForReview(tx);
    assert.deepEqual(await blockOnboardingInTransaction(tx, blockInput(missing.tenant.id, revoked.reviewer.user.id)), { status: "reviewer_forbidden" });

    const self = await submittedForReview(tx);
    await tx.insert(schema.memberships).values({ tenantId: self.tenant.id, userId: self.reviewer.user.id, role: "team_member" });
    assert.deepEqual(await blockOnboardingInTransaction(tx, blockInput(self.tenant.id, self.reviewer.user.id)), { status: "self_review_forbidden" });
    await assertNoBlockChange(tx, self.tenant.id, "submitted", "self-review");
  });
});

test("block en unblock: een fout bij reviewactie of audit-event rolt alles terug", async () => {
  await withRollback(async (tx, client) => {
    const { tenant, reviewer } = await submittedForReview(tx);
    const expectRolledBack = async (setup: string) => {
      await client.query("savepoint block_attempt");
      await client.query(setup);
      await assert.rejects(blockOnboardingInTransaction(tx, blockInput(tenant.id, reviewer.user.id)));
      await client.query("rollback to savepoint block_attempt");
      await assertNoBlockChange(tx, tenant.id, "submitted", setup);
    };
    await expectRolledBack("alter table onboarding_review_actions add constraint test_forced_failure check (false) not valid");
    await expectRolledBack("alter table onboarding_audit_events add constraint test_forced_failure check (false) not valid");
  });
});

test("block en unblock: database bewaakt redencodes per actie, notitie, versie, tenant en audit-overgangen", async () => {
  await withRollback(async (tx, client) => {
    const { tenantA, insertEvent } = await auditFixture(tx, client);
    const reviewer = await createUser(tx);
    await assignReviewer(tx, tenantA.id, reviewer.user.id);
    const [projectA] = await tx.select().from(schema.onboardingProjects).where(eq(schema.onboardingProjects.tenantId, tenantA.id));
    assert.ok(projectA);
    const other = await submittedForReview(tx);
    const insertAction = (values: { action?: string; reasonCode?: string; note?: string; version?: number; projectId?: string; reviewerUserId?: string } = {}) => {
      const { action = "blocked", reasonCode = "critical_basis_missing", note = "Notitie", version = 1, projectId = projectA.id, reviewerUserId = reviewer.user.id } = values;
      return client.query(
        "insert into onboarding_review_actions (tenant_id, project_id, reviewer_user_id, action, version, reason_code, note) values ($1, $2, $3, $4, $5, $6, $7)",
        [tenantA.id, projectId, reviewerUserId, action, version, reasonCode, note],
      );
    };

    await insertAction();
    await insertAction({ action: "unblocked", reasonCode: "extra_work_agreed" });
    await expectPgError(client, "23514", () => insertAction({ reasonCode: "basis_provided" }));
    await expectPgError(client, "23514", () => insertAction({ action: "unblocked", reasonCode: "rights_not_cleared" }));
    await expectPgError(client, "23514", () => insertAction({ reasonCode: "missing_information" }));
    await expectPgError(client, "23514", () => insertAction({ action: "approved" }));
    await expectPgError(client, "23514", () => insertAction({ note: "   " }));
    await expectPgError(client, "23514", () => insertAction({ note: "x".repeat(2001) }));
    await expectPgError(client, "23503", () => insertAction({ version: 2 }));
    await expectPgError(client, "23503", () => insertAction({ projectId: other.project.id }));
    await expectPgError(client, "23503", () => insertAction({ reviewerUserId: other.reviewer.user.id }));

    const blocked = { memberUserId: null, reviewerUserId: reviewer.user.id, eventType: "blocked", fromStatus: "submitted", toStatus: "blocked", version: 1 };
    const unblocked = { ...blocked, eventType: "unblocked", fromStatus: "blocked", toStatus: "review_needed" };
    await insertEvent(blocked);
    await insertEvent(unblocked);
    for (const invalid of [
      { ...blocked, fromStatus: "review_needed" },
      { ...blocked, fromStatus: null },
      { ...blocked, toStatus: "review_needed" },
      { ...blocked, version: null },
      { ...blocked, memberUserId: tenantA.id, reviewerUserId: null },
      { ...unblocked, fromStatus: "submitted" },
      { ...unblocked, fromStatus: null },
      { ...unblocked, toStatus: "submitted" },
    ]) {
      await expectPgError(client, "23514", () => insertEvent(invalid));
    }
    await expectPgError(client, "23001", () => client.query("update onboarding_audit_events set version = 1 where event_type = 'blocked' and tenant_id = $1", [tenantA.id]));
    await expectPgError(client, "23001", () => client.query("delete from onboarding_audit_events where event_type = 'unblocked' and tenant_id = $1", [tenantA.id]));
  });
});

test("HTTP block en unblock met echte repositories: alleen de toegewezen reviewer, daarna kan de Owner aanvullen", async () => {
  await withRollback(async (tx) => {
    const a = await submittedForReview(tx, completeAnswers());
    const b = await submittedForReview(tx);
    const member = await createUser(tx);
    await tx.insert(schema.memberships).values({ tenantId: a.tenant.id, userId: member.user.id, role: "team_member" });
    const revoked = await createUser(tx);
    await assignReviewer(tx, a.tenant.id, revoked.user.id, { status: "revoked", revokedAt: new Date() });
    const selfReviewer = await createMember(tx, a.tenant.id);
    await assignReviewer(tx, a.tenant.id, selfReviewer.user.id);

    const app = appWithRealRepositories(tx);
    const post = (url: string, subject: string | undefined, tenantId: string, payload: object) =>
      app.inject({ method: "POST", url, headers: subject ? { "x-test-identity": subject, "x-tenant-id": tenantId } : {}, payload });
    const block = { base_version: 1, reason_code: "requires_extra_work", note: "Nieuwe fotoshoot nodig." };
    const unblock = { base_version: 1, reason_code: "extra_work_agreed", note: "Meerwerk is akkoord." };
    try {
      const denied: [string | undefined, string, number, string][] = [
        [undefined, a.tenant.id, 401, "unauthorized"],
        [a.owner.identity.subject, a.tenant.id, 403, "forbidden"],
        [member.identity.subject, a.tenant.id, 403, "forbidden"],
        [revoked.identity.subject, a.tenant.id, 403, "forbidden"],
        [a.reviewer.identity.subject, b.tenant.id, 403, "forbidden"],
        [selfReviewer.identity.subject, a.tenant.id, 403, "self_review_forbidden"],
      ];
      for (const [subject, tenantId, status, error] of denied) {
        const response = await post("/v1/review/onboarding/block", subject, tenantId, block);
        assert.deepEqual([response.statusCode, response.json()], [status, { error }], `${subject} ${error}`);
      }
      const extra = await post("/v1/review/onboarding/block", a.reviewer.identity.subject, a.tenant.id, { ...block, project_id: b.project.id });
      assert.deepEqual([extra.statusCode, extra.json()], [400, { error: "invalid_body" }]);
      assert.equal((await reviewActions(tx, a.tenant.id)).length, 0, "nothing after the failure paths");

      const blocked = await post("/v1/review/onboarding/block", a.reviewer.identity.subject, a.tenant.id, block);
      assert.deepEqual([blocked.statusCode, blocked.json()], [200, { status: "blocked", version: 1 }]);
      const ownerUnblock = await post("/v1/review/onboarding/unblock", a.owner.identity.subject, a.tenant.id, unblock);
      assert.equal(ownerUnblock.statusCode, 403);
      const unblocked = await post("/v1/review/onboarding/unblock", a.reviewer.identity.subject, a.tenant.id, unblock);
      assert.deepEqual([unblocked.statusCode, unblocked.json()], [200, { status: "review_needed", version: 1 }]);

      const put = await app.inject({
        method: "PUT",
        url: "/v1/onboarding/current",
        headers: { "x-test-identity": a.owner.identity.subject },
        payload: onboardingPayload(1, { ...completeAnswers(), company_name: "Aangevuld" }),
      });
      assert.deepEqual([put.statusCode, put.json().status, put.json().version], [200, "review_needed", 2]);
      assert.deepEqual([(await projectRow(tx, b.tenant.id))?.status, (await reviewActions(tx, b.tenant.id)).length], ["submitted", 0]);
    } finally {
      await app.close();
    }
  });
});

test("block: twee gelijktijdige blokkades op aparte verbindingen leveren precies één geslaagde overgang op", async () => {
  // Real concurrency needs committed data visible to two connections; the test removes exactly its own rows afterwards.
  const url = process.env.DATABASE_TEST_URL;
  const setup = createDb(url);
  const first = createDb(url);
  const second = createDb(url);
  const userIds: string[] = [];
  let tenantId: string | undefined;
  try {
    const [tenant] = await setup.db.insert(schema.tenants).values({ name: uniqueId("concurrency-tenant") }).returning();
    assert.ok(tenant);
    tenantId = tenant.id;
    const users = await setup.db
      .insert(schema.users)
      .values([{ authProviderUserId: uniqueId("owner") }, { authProviderUserId: uniqueId("reviewer") }, { authProviderUserId: uniqueId("granter") }])
      .returning();
    const [owner, reviewer, granter] = users;
    assert.ok(owner && reviewer && granter);
    userIds.push(owner.id, reviewer.id, granter.id);
    await setup.db.insert(schema.memberships).values({ tenantId: tenant.id, userId: owner.id, role: "owner" });
    await setup.db.insert(schema.onboardingReviewerAssignments).values({ tenantId: tenant.id, userId: reviewer.id, grantedBy: granter.id });
    await submitOnboarding(setup.db, draftInput(tenant.id, owner.id, 0));

    const results = await Promise.all([blockOnboarding(first.db, blockInput(tenant.id, reviewer.id)), blockOnboarding(second.db, blockInput(tenant.id, reviewer.id))]);
    assert.deepEqual(results.map((result) => result.status).sort(), ["blocked", "not_reviewable"]);

    const { rows } = await setup.pool.query<{ actions: number; events: number; status: string }>(
      `select (select count(*)::int from onboarding_review_actions where tenant_id = $1) as actions,
              (select count(*)::int from onboarding_audit_events where tenant_id = $1 and event_type = 'blocked') as events,
              (select status from onboarding_projects where tenant_id = $1) as status`,
      [tenant.id],
    );
    assert.deepEqual(rows[0], { actions: 1, events: 1, status: "blocked" });
  } finally {
    if (tenantId) await removeCommittedFixture(setup.pool, tenantId, userIds);
    await Promise.all([setup.pool.end(), first.pool.end(), second.pool.end()]);
  }
});

// Test-only cleanup of a committed fixture: the immutability trigger is lifted only inside this transaction,
// and only this tenant's rows and these users are removed.
async function removeCommittedFixture(pool: Pool, tenantId: string, userIds: readonly string[]) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("alter table onboarding_audit_events disable trigger onboarding_audit_events_no_update_delete");
    for (const table of ["onboarding_audit_events", "onboarding_review_actions", "onboarding_review_requests", "onboarding_versions", "onboarding_projects", "onboarding_reviewer_assignments", "memberships"]) {
      await client.query(`delete from ${table} where tenant_id = $1`, [tenantId]);
    }
    await client.query("delete from tenants where id = $1", [tenantId]);
    await client.query("delete from users where id = any($1::uuid[])", [userIds]);
    await client.query("alter table onboarding_audit_events enable trigger onboarding_audit_events_no_update_delete");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

// ---------- Goedkeuren (submitted → approved) en besluit O-5 ----------

const approveInput = (tenantId: string, reviewerUserId: string, baseVersion = 1) => ({ tenantId, reviewerUserId, baseVersion });
const projectCount = async (tx: Tx, tenantId: string) =>
  (await tx.select().from(schema.onboardingProjects).where(eq(schema.onboardingProjects.tenantId, tenantId))).length;

test("approve: submitted → approved zonder nieuwe versie, met precies één approved-event van de reviewer", async () => {
  await withRollback(async (tx) => {
    const { tenant, reviewer, project } = await submittedForReview(tx, { company_name: "Geheime Inhoud BV" });
    assert.deepEqual(await approveOnboardingInTransaction(tx, approveInput(tenant.id, reviewer.user.id)), { status: "approved", version: 1 });

    const after = await projectRow(tx, tenant.id);
    assert.deepEqual([after?.status, after?.currentVersion, await versionCount(tx, tenant.id)], ["approved", 1, 1]);
    const approved = await eventsOfType(tx, tenant.id, "approved");
    assert.deepEqual(
      approved.map((event) => [event.tenantId, event.projectId, event.reviewerUserId, event.memberUserId, event.fromStatus, event.toStatus, event.version]),
      [[tenant.id, project.id, reviewer.user.id, null, "submitted", "approved", 1]],
    );
    assert.ok(!JSON.stringify(approved).includes("Geheime Inhoud"));
  });
});

test("approve: verkeerde bronstatus, tweede goedkeuring, verouderde versie, ingetrokken assignment en zelfreview wijzigen niets", async () => {
  await withRollback(async (tx) => {
    const reviewer = await createUser(tx);
    const draftTenant = await createTenant(tx);
    const draftOwner = await createMember(tx, draftTenant.id);
    await assignReviewer(tx, draftTenant.id, reviewer.user.id);
    await saveOnboardingDraftInTransaction(tx, draftInput(draftTenant.id, draftOwner.user.id, 0));
    assert.deepEqual(await approveOnboardingInTransaction(tx, approveInput(draftTenant.id, reviewer.user.id)), { status: "not_reviewable" }, "draft");

    for (const status of ["review_needed", "blocked"] as const) {
      const { tenant, reviewer: assigned } = await submittedForReview(tx);
      await tx.update(schema.onboardingProjects).set({ status }).where(eq(schema.onboardingProjects.tenantId, tenant.id));
      assert.deepEqual(await approveOnboardingInTransaction(tx, approveInput(tenant.id, assigned.user.id)), { status: "not_reviewable" }, status);
      assert.equal((await eventsOfType(tx, tenant.id, "approved")).length, 0, status);
    }

    const twice = await submittedForReview(tx);
    assert.deepEqual(await approveOnboardingInTransaction(tx, approveInput(twice.tenant.id, twice.reviewer.user.id, 2)), { status: "conflict", currentVersion: 1 }, "stale");
    assert.equal((await approveOnboardingInTransaction(tx, approveInput(twice.tenant.id, twice.reviewer.user.id))).status, "approved");
    assert.deepEqual(await approveOnboardingInTransaction(tx, approveInput(twice.tenant.id, twice.reviewer.user.id)), { status: "not_reviewable" }, "second approval");
    assert.equal((await eventsOfType(tx, twice.tenant.id, "approved")).length, 1);

    const revoked = await submittedForReview(tx);
    await tx.update(schema.onboardingReviewerAssignments).set({ status: "revoked", revokedAt: new Date() }).where(eq(schema.onboardingReviewerAssignments.tenantId, revoked.tenant.id));
    assert.deepEqual(await approveOnboardingInTransaction(tx, approveInput(revoked.tenant.id, revoked.reviewer.user.id)), { status: "reviewer_forbidden" });
    const self = await submittedForReview(tx);
    await tx.insert(schema.memberships).values({ tenantId: self.tenant.id, userId: self.reviewer.user.id, role: "team_member" });
    assert.deepEqual(await approveOnboardingInTransaction(tx, approveInput(self.tenant.id, self.reviewer.user.id)), { status: "self_review_forbidden" });
    for (const tenantId of [revoked.tenant.id, self.tenant.id]) {
      assert.equal((await projectRow(tx, tenantId))?.status, "submitted");
      assert.equal((await eventsOfType(tx, tenantId, "approved")).length, 0);
    }
  });
});

test("approve: een fout bij de statusupdate of het audit-event rolt de hele transactie terug", async () => {
  await withRollback(async (tx, client) => {
    const { tenant, reviewer } = await submittedForReview(tx);
    for (const setup of [
      "alter table onboarding_projects add constraint test_forced_failure check (status <> 'approved') not valid",
      "alter table onboarding_audit_events add constraint test_forced_failure check (false) not valid",
    ]) {
      await client.query("savepoint approve_attempt");
      await client.query(setup);
      await assert.rejects(approveOnboardingInTransaction(tx, approveInput(tenant.id, reviewer.user.id)));
      await client.query("rollback to savepoint approve_attempt");
      assert.equal((await projectRow(tx, tenant.id))?.status, "submitted", setup);
      assert.equal((await eventsOfType(tx, tenant.id, "approved")).length, 0, setup);
    }
  });
});

test("approve: database accepteert approved alleen als submitted → approved met reviewer-actor en bestaande versie", async () => {
  await withRollback(async (tx, client) => {
    const { tenantA, user, insertEvent } = await auditFixture(tx, client);
    const reviewer = await createUser(tx);
    await assignReviewer(tx, tenantA.id, reviewer.user.id);
    const approved = { memberUserId: null, reviewerUserId: reviewer.user.id, eventType: "approved", fromStatus: "submitted", toStatus: "approved", version: 1 };

    for (const invalid of [
      { ...approved, fromStatus: null },
      { ...approved, fromStatus: "review_needed" },
      { ...approved, fromStatus: "draft" },
      { ...approved, toStatus: "review_needed" },
      { ...approved, version: null },
      { ...approved, memberUserId: user.id, reviewerUserId: null },
      { ...approved, memberUserId: user.id },
    ]) {
      await expectPgError(client, "23514", () => insertEvent(invalid));
    }
    await expectPgError(client, "23503", () => insertEvent({ ...approved, version: 5 }));
    await insertEvent(approved);
    await expectPgError(client, "23001", () => client.query("update onboarding_audit_events set version = 1 where event_type = 'approved' and tenant_id = $1", [tenantA.id]));
    await expectPgError(client, "23001", () => client.query("delete from onboarding_audit_events where event_type = 'approved' and tenant_id = $1", [tenantA.id]));
  });
});

test("O-5: na goedkeuring leest de Owner het goedgekeurde project, maar opslaan, indienen of een tweede project kan niet", async () => {
  await withRollback(async (tx) => {
    const { tenant, owner, reviewer, project } = await submittedForReview(tx, { company_name: "Goedgekeurd BV" });
    await approveOnboardingInTransaction(tx, approveInput(tenant.id, reviewer.user.id));

    const current = await findCurrentOnboarding(tx, tenant.id);
    assert.deepEqual([current?.projectId, current?.status, current?.version, current?.answers], [project.id, "approved", 1, { company_name: "Goedgekeurd BV" }]);

    for (const [label, attempt] of [
      ["save v1", () => saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, owner.user.id, 1))],
      ["save v0 (new project)", () => saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, owner.user.id, 0))],
      ["submit v1", () => submitOnboardingInTransaction(tx, draftInput(tenant.id, owner.user.id, 1))],
      ["submit v0 (new project)", () => submitOnboardingInTransaction(tx, draftInput(tenant.id, owner.user.id, 0))],
    ] as const) {
      assert.deepEqual(await attempt(), { status: "not_editable" }, label);
    }
    assert.deepEqual([await projectCount(tx, tenant.id), await versionCount(tx, tenant.id), (await projectRow(tx, tenant.id))?.status], [1, 1, "approved"]);
  });
});

test("HTTP approve met echte repositories: alleen de toegewezen reviewer; daarna is de onboarding voor de Owner alleen-lezen", async () => {
  await withRollback(async (tx) => {
    const a = await submittedForReview(tx, completeAnswers());
    const b = await submittedForReview(tx);
    const member = await createUser(tx);
    await tx.insert(schema.memberships).values({ tenantId: a.tenant.id, userId: member.user.id, role: "team_member" });

    const app = appWithRealRepositories(tx);
    const approve = (subject: string, tenantId: string, payload: object = { base_version: 1 }) =>
      app.inject({ method: "POST", url: "/v1/review/onboarding/approve", headers: { "x-test-identity": subject, "x-tenant-id": tenantId }, payload });
    const owner = { "x-test-identity": a.owner.identity.subject };
    try {
      for (const [subject, tenantId] of [[a.owner.identity.subject, a.tenant.id], [member.identity.subject, a.tenant.id], [a.reviewer.identity.subject, b.tenant.id]]) {
        assert.equal((await approve(subject!, tenantId!)).statusCode, 403);
      }
      const extra = await approve(a.reviewer.identity.subject, a.tenant.id, { base_version: 1, note: "x" });
      assert.deepEqual([extra.statusCode, extra.json()], [400, { error: "invalid_body" }]);

      const ok = await approve(a.reviewer.identity.subject, a.tenant.id);
      assert.deepEqual([ok.statusCode, ok.json()], [200, { status: "approved", version: 1 }]);
      const again = await approve(a.reviewer.identity.subject, a.tenant.id);
      assert.deepEqual([again.statusCode, again.json()], [409, { error: "not_reviewable" }]);

      const current = await app.inject({ method: "GET", url: "/v1/onboarding/current", headers: owner });
      assert.deepEqual([current.statusCode, current.json().status, current.json().version], [200, "approved", 1]);
      assert.equal(current.json().answers.company_name, completeAnswers().company_name);
      // The Owner reads exactly the stored Project Brief of the approved version (the fixture stores this one).
      assert.deepEqual(current.json().project_brief, { status: "incomplete_draft" });

      for (const [method, url, baseVersion] of [
        ["PUT", "/v1/onboarding/current", 1],
        ["PUT", "/v1/onboarding/current", 0],
        ["POST", "/v1/onboarding/current/submit", 1],
      ] as const) {
        const response = await app.inject({ method, url, headers: owner, payload: onboardingPayload(baseVersion, completeAnswers()) });
        assert.deepEqual([response.statusCode, response.json()], [409, { error: "not_editable" }], `${method} ${baseVersion}`);
      }
      assert.deepEqual([await projectCount(tx, a.tenant.id), await versionCount(tx, a.tenant.id)], [1, 1]);
      assert.equal((await projectRow(tx, b.tenant.id))?.status, "submitted", "tenant B ongewijzigd");
    } finally {
      await app.close();
    }
  });
});

test("O-5: twee gelijktijdige Owner-writes op aparte verbindingen na goedkeuring wijzigen niets", async () => {
  // Real concurrency needs committed data visible to two connections; the test removes exactly its own rows afterwards.
  const url = process.env.DATABASE_TEST_URL;
  const setup = createDb(url);
  const first = createDb(url);
  const second = createDb(url);
  const userIds: string[] = [];
  let tenantId: string | undefined;
  try {
    const [tenant] = await setup.db.insert(schema.tenants).values({ name: uniqueId("approved-tenant") }).returning();
    assert.ok(tenant);
    tenantId = tenant.id;
    const [owner, reviewer, granter] = await setup.db
      .insert(schema.users)
      .values([{ authProviderUserId: uniqueId("owner") }, { authProviderUserId: uniqueId("reviewer") }, { authProviderUserId: uniqueId("granter") }])
      .returning();
    assert.ok(owner && reviewer && granter);
    userIds.push(owner.id, reviewer.id, granter.id);
    await setup.db.insert(schema.memberships).values({ tenantId: tenant.id, userId: owner.id, role: "owner" });
    await setup.db.insert(schema.onboardingReviewerAssignments).values({ tenantId: tenant.id, userId: reviewer.id, grantedBy: granter.id });
    await submitOnboarding(setup.db, draftInput(tenant.id, owner.id, 0));
    assert.equal((await approveOnboarding(setup.db, approveInput(tenant.id, reviewer.id))).status, "approved");

    // One write tries to start a new project (base_version 0), the other to edit the approved one.
    const results = await Promise.all([
      saveOnboardingDraft(first.db, draftInput(tenant.id, owner.id, 0)),
      saveOnboardingDraft(second.db, draftInput(tenant.id, owner.id, 1)),
    ]);
    assert.deepEqual(results, [{ status: "not_editable" }, { status: "not_editable" }]);

    const { rows } = await setup.pool.query<{ projects: number; versions: number; status: string }>(
      `select (select count(*)::int from onboarding_projects where tenant_id = $1) as projects,
              (select count(*)::int from onboarding_versions where tenant_id = $1) as versions,
              (select status from onboarding_projects where tenant_id = $1) as status`,
      [tenant.id],
    );
    assert.deepEqual(rows[0], { projects: 1, versions: 1, status: "approved" });
  } finally {
    if (tenantId) await removeCommittedFixture(setup.pool, tenantId, userIds);
    await Promise.all([setup.pool.end(), first.pool.end(), second.pool.end()]);
  }
});

// ---------- Gecontroleerd heropenen (approved → review_needed) ----------

const reopenInput = (tenantId: string, reviewerUserId: string, baseVersion = 1): ReopenInput => ({
  tenantId,
  reviewerUserId,
  baseVersion,
  reasonCode: "material_input_change",
  note: "De intake bevat een materiële wijziging die opnieuw beoordeeld moet worden.",
});

// Tenant whose onboarding went through the real flow: submitted (v1), then approved by the assigned reviewer.
async function approvedForReview(tx: Tx, answers: Record<string, unknown> = { company_name: "Goedgekeurd BV" }) {
  const setup = await submittedForReview(tx, answers);
  assert.equal((await approveOnboardingInTransaction(tx, approveInput(setup.tenant.id, setup.reviewer.user.id))).status, "approved");
  return setup;
}

test("reopen: approved → review_needed zonder nieuwe versie, met reviewactie en één reopened-event; de goedkeuring blijft staan", async () => {
  await withRollback(async (tx) => {
    const { tenant, owner, reviewer, project } = await approvedForReview(tx, { company_name: "Geheime Inhoud BV" });
    const [approvedBefore] = await eventsOfType(tx, tenant.id, "approved");
    assert.ok(approvedBefore);

    assert.deepEqual(await reopenOnboardingInTransaction(tx, reopenInput(tenant.id, reviewer.user.id)), { status: "review_needed", version: 1 });
    const after = await projectRow(tx, tenant.id);
    assert.deepEqual([after?.status, after?.currentVersion, await versionCount(tx, tenant.id)], ["review_needed", 1, 1]);

    const reopened = await eventsOfType(tx, tenant.id, "reopened");
    assert.deepEqual(
      reopened.map((event) => [event.tenantId, event.projectId, event.reviewerUserId, event.memberUserId, event.fromStatus, event.toStatus, event.version]),
      [[tenant.id, project.id, reviewer.user.id, null, "approved", "review_needed", 1]],
    );
    const actions = (await reviewActions(tx, tenant.id)).filter((action) => action.action === "reopened");
    assert.deepEqual(
      actions.map((action) => [action.reasonCode, action.note, action.version, action.projectId, action.reviewerUserId]),
      [["material_input_change", "De intake bevat een materiële wijziging die opnieuw beoordeeld moet worden.", 1, project.id, reviewer.user.id]],
    );
    const serialized = JSON.stringify(await auditEvents(tx, tenant.id));
    for (const text of ["materiële wijziging", "Geheime Inhoud"]) assert.ok(!serialized.includes(text), text);

    // The Owner reuses the existing flow: a draft keeps review_needed, resubmitting writes resubmitted.
    assert.equal((await findCurrentOnboarding(tx, tenant.id))?.status, "review_needed");
    const saved = await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, owner.user.id, 1, { company_name: "Aangevuld" }));
    assert.deepEqual(saved.status === "saved" && [saved.draft.status, saved.draft.version], ["review_needed", 2]);
    const resubmitted = await submitOnboardingInTransaction(tx, draftInput(tenant.id, owner.user.id, 2, { company_name: "Aangevuld" }));
    assert.deepEqual(resubmitted.status === "saved" && [resubmitted.draft.status, resubmitted.draft.version], ["submitted", 3]);
    assert.deepEqual((await eventsOfType(tx, tenant.id, "resubmitted")).map((event) => [event.fromStatus, event.version]), [["review_needed", 3]]);

    // The original approval and the approved version are unchanged.
    assert.deepEqual(await eventsOfType(tx, tenant.id, "approved"), [approvedBefore]);
    assert.deepEqual((await versionsOf(tx, tenant.id))[0]?.answers, { company_name: "Geheime Inhoud BV" });
  });
});

test("reopen: verkeerde bronstatus, tweede reopen, verouderde versie, ingetrokken assignment en zelfreview wijzigen niets", async () => {
  await withRollback(async (tx) => {
    const reviewer = await createUser(tx);
    const draftTenant = await createTenant(tx);
    const draftOwner = await createMember(tx, draftTenant.id);
    await assignReviewer(tx, draftTenant.id, reviewer.user.id);
    await saveOnboardingDraftInTransaction(tx, draftInput(draftTenant.id, draftOwner.user.id, 0));
    assert.deepEqual(await reopenOnboardingInTransaction(tx, reopenInput(draftTenant.id, reviewer.user.id)), { status: "not_reviewable" }, "draft");

    for (const status of ["submitted", "review_needed", "blocked"] as const) {
      const { tenant, reviewer: assigned } = await submittedForReview(tx);
      if (status !== "submitted") await tx.update(schema.onboardingProjects).set({ status }).where(eq(schema.onboardingProjects.tenantId, tenant.id));
      assert.deepEqual(await reopenOnboardingInTransaction(tx, reopenInput(tenant.id, assigned.user.id)), { status: "not_reviewable" }, status);
      assert.deepEqual([(await projectRow(tx, tenant.id))?.status, (await eventsOfType(tx, tenant.id, "reopened")).length], [status, 0], status);
    }

    const twice = await approvedForReview(tx);
    assert.deepEqual(await reopenOnboardingInTransaction(tx, reopenInput(twice.tenant.id, twice.reviewer.user.id, 2)), { status: "conflict", currentVersion: 1 }, "stale");
    assert.equal((await reopenOnboardingInTransaction(tx, reopenInput(twice.tenant.id, twice.reviewer.user.id))).status, "review_needed");
    assert.deepEqual(await reopenOnboardingInTransaction(tx, reopenInput(twice.tenant.id, twice.reviewer.user.id)), { status: "not_reviewable" }, "second reopen");
    assert.equal((await eventsOfType(tx, twice.tenant.id, "reopened")).length, 1);

    const revoked = await approvedForReview(tx);
    await tx.update(schema.onboardingReviewerAssignments).set({ status: "revoked", revokedAt: new Date() }).where(eq(schema.onboardingReviewerAssignments.tenantId, revoked.tenant.id));
    assert.deepEqual(await reopenOnboardingInTransaction(tx, reopenInput(revoked.tenant.id, revoked.reviewer.user.id)), { status: "reviewer_forbidden" });
    const self = await approvedForReview(tx);
    await tx.insert(schema.memberships).values({ tenantId: self.tenant.id, userId: self.reviewer.user.id, role: "team_member" });
    assert.deepEqual(await reopenOnboardingInTransaction(tx, reopenInput(self.tenant.id, self.reviewer.user.id)), { status: "self_review_forbidden" });
    for (const tenantId of [revoked.tenant.id, self.tenant.id]) {
      assert.deepEqual([(await projectRow(tx, tenantId))?.status, (await eventsOfType(tx, tenantId, "reopened")).length], ["approved", 0]);
    }
  });
});

test("reopen: een fout bij reviewactie of audit-event rolt status, actie en audit-event terug", async () => {
  await withRollback(async (tx, client) => {
    const { tenant, reviewer } = await approvedForReview(tx);
    for (const setup of [
      "alter table onboarding_review_actions add constraint test_forced_failure check (false) not valid",
      "alter table onboarding_audit_events add constraint test_forced_failure check (false) not valid",
    ]) {
      await client.query("savepoint reopen_attempt");
      await client.query(setup);
      await assert.rejects(reopenOnboardingInTransaction(tx, reopenInput(tenant.id, reviewer.user.id)));
      await client.query("rollback to savepoint reopen_attempt");
      assert.equal((await projectRow(tx, tenant.id))?.status, "approved", setup);
      assert.equal((await reviewActions(tx, tenant.id)).length, 0, setup);
      assert.equal((await eventsOfType(tx, tenant.id, "reopened")).length, 0, setup);
    }
  });
});

test("reopen: database bewaakt reopen-redencodes, notitie, versie, tenant en de audit-overgang approved → review_needed", async () => {
  await withRollback(async (tx, client) => {
    const { tenantA, user, insertEvent } = await auditFixture(tx, client);
    const reviewer = await createUser(tx);
    await assignReviewer(tx, tenantA.id, reviewer.user.id);
    const [projectA] = await tx.select().from(schema.onboardingProjects).where(eq(schema.onboardingProjects.tenantId, tenantA.id));
    assert.ok(projectA);
    const other = await submittedForReview(tx);
    const insertAction = (values: { action?: string; reasonCode?: string; note?: string; version?: number; projectId?: string } = {}) => {
      const { action = "reopened", reasonCode = "rights_or_asset_change", note = "Notitie", version = 1, projectId = projectA.id } = values;
      return client.query(
        "insert into onboarding_review_actions (tenant_id, project_id, reviewer_user_id, action, version, reason_code, note) values ($1, $2, $3, $4, $5, $6, $7)",
        [tenantA.id, projectId, reviewer.user.id, action, version, reasonCode, note],
      );
    };
    await insertAction();
    await insertAction({ reasonCode: "scope_or_strategy_change" });
    await insertAction({ reasonCode: "material_input_change" });
    for (const reasonCode of ["critical_basis_missing", "basis_provided", "missing_information", "onbekend"]) {
      await expectPgError(client, "23514", () => insertAction({ reasonCode }));
    }
    await expectPgError(client, "23514", () => insertAction({ action: "blocked", reasonCode: "material_input_change" }));
    await expectPgError(client, "23514", () => insertAction({ note: "  " }));
    await expectPgError(client, "23514", () => insertAction({ note: "x".repeat(2001) }));
    await expectPgError(client, "23514", () => insertAction({ version: 0 }));
    await expectPgError(client, "23503", () => insertAction({ version: 7 }));
    await expectPgError(client, "23503", () => insertAction({ projectId: other.project.id }));

    const reopened = { memberUserId: null, reviewerUserId: reviewer.user.id, eventType: "reopened", fromStatus: "approved", toStatus: "review_needed", version: 1 };
    for (const invalid of [
      { ...reopened, fromStatus: null },
      { ...reopened, fromStatus: "submitted" },
      { ...reopened, fromStatus: "blocked" },
      { ...reopened, toStatus: "submitted" },
      { ...reopened, version: null },
      { ...reopened, memberUserId: user.id, reviewerUserId: null },
      { ...reopened, memberUserId: user.id },
    ]) {
      await expectPgError(client, "23514", () => insertEvent(invalid));
    }
    await expectPgError(client, "23503", () => insertEvent({ ...reopened, version: 7 }));
    await insertEvent(reopened);
    await expectPgError(client, "23001", () => client.query("update onboarding_audit_events set version = 1 where event_type = 'reopened' and tenant_id = $1", [tenantA.id]));
    await expectPgError(client, "23001", () => client.query("delete from onboarding_audit_events where event_type = 'reopened' and tenant_id = $1", [tenantA.id]));
  });
});

test("HTTP reopen met echte repositories: alleen de toegewezen reviewer; daarna vult de Owner aan en dient opnieuw in", async () => {
  await withRollback(async (tx) => {
    const a = await approvedForReview(tx, completeAnswers());
    const b = await approvedForReview(tx);
    const member = await createUser(tx);
    await tx.insert(schema.memberships).values({ tenantId: a.tenant.id, userId: member.user.id, role: "team_member" });
    const revoked = await createUser(tx);
    await assignReviewer(tx, a.tenant.id, revoked.user.id, { status: "revoked", revokedAt: new Date() });
    const selfReviewer = await createMember(tx, a.tenant.id);
    await assignReviewer(tx, a.tenant.id, selfReviewer.user.id);

    const app = appWithRealRepositories(tx);
    const body = { base_version: 1, reason_code: "scope_or_strategy_change", note: "De CTA en het aanbod zijn gewijzigd." };
    const reopen = (subject: string | undefined, tenantId: string, payload: object = body) =>
      app.inject({ method: "POST", url: "/v1/review/onboarding/reopen", headers: subject ? { "x-test-identity": subject, "x-tenant-id": tenantId } : {}, payload });
    const owner = { "x-test-identity": a.owner.identity.subject };
    try {
      const denied: [string | undefined, string, number, string][] = [
        [undefined, a.tenant.id, 401, "unauthorized"],
        [a.owner.identity.subject, a.tenant.id, 403, "forbidden"],
        [member.identity.subject, a.tenant.id, 403, "forbidden"],
        [revoked.identity.subject, a.tenant.id, 403, "forbidden"],
        [a.reviewer.identity.subject, b.tenant.id, 403, "forbidden"],
        [selfReviewer.identity.subject, a.tenant.id, 403, "self_review_forbidden"],
      ];
      for (const [subject, tenantId, status, error] of denied) {
        const response = await reopen(subject, tenantId);
        assert.deepEqual([response.statusCode, response.json()], [status, { error }], `${subject} ${error}`);
      }
      const extra = await reopen(a.reviewer.identity.subject, a.tenant.id, { ...body, tenant_id: b.tenant.id });
      assert.deepEqual([extra.statusCode, extra.json()], [400, { error: "invalid_body" }]);
      assert.equal((await reviewActions(tx, a.tenant.id)).length, 0, "nothing after the failure paths");

      const ok = await reopen(a.reviewer.identity.subject, a.tenant.id);
      assert.deepEqual([ok.statusCode, ok.json()], [200, { status: "review_needed", version: 1 }]);
      const again = await reopen(a.reviewer.identity.subject, a.tenant.id);
      assert.deepEqual([again.statusCode, again.json()], [409, { error: "not_reviewable" }]);

      const current = await app.inject({ method: "GET", url: "/v1/onboarding/current", headers: owner });
      assert.deepEqual([current.json().status, current.json().version], ["review_needed", 1]);
      const put = await app.inject({ method: "PUT", url: "/v1/onboarding/current", headers: owner, payload: onboardingPayload(1, { ...completeAnswers(), company_name: "Aangevuld" }) });
      assert.deepEqual([put.statusCode, put.json().status, put.json().version], [200, "review_needed", 2]);
      const submit = await app.inject({ method: "POST", url: "/v1/onboarding/current/submit", headers: owner, payload: onboardingPayload(2, { ...completeAnswers(), company_name: "Aangevuld" }) });
      assert.deepEqual([submit.statusCode, submit.json().status, submit.json().version], [200, "submitted", 3]);

      assert.deepEqual([(await projectRow(tx, b.tenant.id))?.status, (await reviewActions(tx, b.tenant.id)).length], ["approved", 0], "tenant B ongewijzigd");
    } finally {
      await app.close();
    }
  });
});

test("reopen: twee gelijktijdige reopens op aparte verbindingen leveren precies één geslaagde overgang op", async () => {
  // Real concurrency needs committed data visible to two connections; the test removes exactly its own rows afterwards.
  const url = process.env.DATABASE_TEST_URL;
  const setup = createDb(url);
  const first = createDb(url);
  const second = createDb(url);
  const userIds: string[] = [];
  let tenantId: string | undefined;
  try {
    const [tenant] = await setup.db.insert(schema.tenants).values({ name: uniqueId("reopen-tenant") }).returning();
    assert.ok(tenant);
    tenantId = tenant.id;
    const [owner, reviewer, granter] = await setup.db
      .insert(schema.users)
      .values([{ authProviderUserId: uniqueId("owner") }, { authProviderUserId: uniqueId("reviewer") }, { authProviderUserId: uniqueId("granter") }])
      .returning();
    assert.ok(owner && reviewer && granter);
    userIds.push(owner.id, reviewer.id, granter.id);
    await setup.db.insert(schema.memberships).values({ tenantId: tenant.id, userId: owner.id, role: "owner" });
    await setup.db.insert(schema.onboardingReviewerAssignments).values({ tenantId: tenant.id, userId: reviewer.id, grantedBy: granter.id });
    await submitOnboarding(setup.db, draftInput(tenant.id, owner.id, 0));
    assert.equal((await approveOnboarding(setup.db, approveInput(tenant.id, reviewer.id))).status, "approved");

    const results = await Promise.all([reopenOnboarding(first.db, reopenInput(tenant.id, reviewer.id)), reopenOnboarding(second.db, reopenInput(tenant.id, reviewer.id))]);
    assert.deepEqual(results.map((result) => result.status).sort(), ["not_reviewable", "review_needed"]);

    const { rows } = await setup.pool.query<{ actions: number; events: number; status: string }>(
      `select (select count(*)::int from onboarding_review_actions where tenant_id = $1 and action = 'reopened') as actions,
              (select count(*)::int from onboarding_audit_events where tenant_id = $1 and event_type = 'reopened') as events,
              (select status from onboarding_projects where tenant_id = $1) as status`,
      [tenant.id],
    );
    assert.deepEqual(rows[0], { actions: 1, events: 1, status: "review_needed" });
  } finally {
    if (tenantId) await removeCommittedFixture(setup.pool, tenantId, userIds);
    await Promise.all([setup.pool.end(), first.pool.end(), second.pool.end()]);
  }
});

// ---------- Reopen-notitie voor de Owner ----------

test("Owner-feedback na reopen: review_needed toont de reopen-reden en -notitie van het eigen project; na opnieuw indienen niets", async () => {
  await withRollback(async (tx) => {
    const { tenant, owner, reviewer, project } = await approvedForReview(tx);
    await reopenOnboardingInTransaction(tx, reopenInput(tenant.id, reviewer.user.id));

    const current = await findCurrentOnboarding(tx, tenant.id);
    assert.equal(current?.status, "review_needed");
    assert.deepEqual(
      current?.reviewRequest && { ...current.reviewRequest, createdAt: current.reviewRequest.createdAt instanceof Date },
      { kind: "reopened", reasonCode: "material_input_change", note: "De intake bevat een materiële wijziging die opnieuw beoordeeld moet worden.", version: 1, createdAt: true },
    );
    assert.equal(current?.projectId, project.id);

    // Draft saves keep the feedback visible; resubmitting moves to submitted, where no active feedback is shown.
    await saveOnboardingDraftInTransaction(tx, draftInput(tenant.id, owner.user.id, 1, { company_name: "Aangevuld" }));
    assert.equal((await findCurrentOnboarding(tx, tenant.id))?.reviewRequest?.kind, "reopened");
    await submitOnboardingInTransaction(tx, draftInput(tenant.id, owner.user.id, 2));
    assert.deepEqual([(await findCurrentOnboarding(tx, tenant.id))?.status, (await findCurrentOnboarding(tx, tenant.id))?.reviewRequest], ["submitted", null]);
  });
});

test("Owner-feedback: de meest recente bron wint (reopen na een verzoek, en een nieuw verzoek na een reopen)", async () => {
  await withRollback(async (tx) => {
    // Change request → resubmit → approve → reopen: the reopen is the active feedback.
    const { tenant, owner, reviewer } = await inReviewNeeded(tx);
    await submitOnboardingInTransaction(tx, draftInput(tenant.id, owner.user.id, 1));
    await approveOnboardingInTransaction(tx, approveInput(tenant.id, reviewer.user.id, 2));
    await reopenOnboardingInTransaction(tx, reopenInput(tenant.id, reviewer.user.id, 2));
    assert.deepEqual(
      [(await findCurrentOnboarding(tx, tenant.id))?.reviewRequest?.kind, (await findCurrentOnboarding(tx, tenant.id))?.reviewRequest?.version],
      ["reopened", 2],
    );

    // Resubmit → a new change request: that newer request is the active feedback again.
    await submitOnboardingInTransaction(tx, draftInput(tenant.id, owner.user.id, 2));
    await requestOnboardingChangesInTransaction(tx, { ...changesInput(tenant.id, reviewer.user.id, 3), note: "Nieuw verzoek na de reopen." });
    const latest = (await findCurrentOnboarding(tx, tenant.id))?.reviewRequest;
    assert.deepEqual([latest?.kind, latest?.note, latest?.version], ["changes_requested", "Nieuw verzoek na de reopen.", 3]);
  });
});

test("Owner-feedback: gelijke versie en created_at kiezen deterministisch de hoogste feedback-ID", async () => {
  await withRollback(async (tx) => {
    const { tenant, reviewer, project } = await submittedForReview(tx);
    const createdAt = new Date("2026-10-27T15:00:00.000Z");
    await tx.insert(schema.onboardingReviewRequests).values({
      id: "00000000-0000-4000-8000-000000000001",
      tenantId: tenant.id,
      projectId: project.id,
      reviewerUserId: reviewer.user.id,
      version: 1,
      reasonCode: "missing_information",
      note: "Verzoek met dezelfde timestamp.",
      createdAt,
    });
    await tx.insert(schema.onboardingReviewActions).values({
      id: "00000000-0000-4000-8000-000000000002",
      tenantId: tenant.id,
      projectId: project.id,
      reviewerUserId: reviewer.user.id,
      action: "unblocked",
      version: 1,
      reasonCode: "basis_provided",
      note: "Unblock met dezelfde timestamp.",
      createdAt,
    });
    await tx.update(schema.onboardingProjects).set({ status: "review_needed" }).where(eq(schema.onboardingProjects.tenantId, tenant.id));

    const feedback = (await findCurrentOnboarding(tx, tenant.id))?.reviewRequest;
    assert.deepEqual([feedback?.kind, feedback?.note], ["unblocked", "Unblock met dezelfde timestamp."]);
  });
});

test("Owner-feedback: geen feedback zonder bron, en nooit die van een andere tenant of een ander project", async () => {
  await withRollback(async (tx) => {
    // review_needed without any stored feedback (fixture): nothing to show.
    const bare = await submittedForReview(tx);
    await tx.update(schema.onboardingProjects).set({ status: "review_needed" }).where(eq(schema.onboardingProjects.tenantId, bare.tenant.id));
    assert.equal((await findCurrentOnboarding(tx, bare.tenant.id))?.reviewRequest, null);

    // Another tenant was reopened; this tenant's own change request is shown, not the other's reopen.
    const other = await approvedForReview(tx);
    await reopenOnboardingInTransaction(tx, reopenInput(other.tenant.id, other.reviewer.user.id));
    const own = await inReviewNeeded(tx);
    assert.equal((await findCurrentOnboarding(tx, own.tenant.id))?.reviewRequest?.kind, "changes_requested");

    // Another project of the same tenant: a reopen stored on the old approved project (data from before O-5)
    // must not show up for the current open project.
    const legacy = await approvedForReview(tx);
    await tx.insert(schema.onboardingReviewActions).values({
      tenantId: legacy.tenant.id,
      projectId: legacy.project.id,
      reviewerUserId: legacy.reviewer.user.id,
      action: "reopened",
      version: 1,
      reasonCode: "rights_or_asset_change",
      note: "Notitie bij het oude project.",
    });
    await tx.insert(schema.onboardingReviewActions).values({
      tenantId: legacy.tenant.id,
      projectId: legacy.project.id,
      reviewerUserId: legacy.reviewer.user.id,
      action: "unblocked",
      version: 1,
      reasonCode: "rights_cleared",
      note: "Notitie bij de blokkade van het oude project.",
    });
    const [open] = await tx.insert(schema.onboardingProjects).values({ tenantId: legacy.tenant.id, status: "review_needed", currentVersion: 1 }).returning();
    assert.ok(open);
    await tx.insert(schema.onboardingVersions).values({
      tenantId: legacy.tenant.id,
      projectId: open.id,
      version: 1,
      schemaId: "WESTEND_ONBOARDING",
      schemaVersion: "0.1.0-design",
      answers: {},
      projectBrief: {},
      createdBy: legacy.owner.user.id,
    });
    const current = await findCurrentOnboarding(tx, legacy.tenant.id);
    assert.deepEqual([current?.projectId, current?.status, current?.reviewRequest], [open.id, "review_needed", null]);
  });
});

test("Owner-feedback: geen actieve feedback bij approved, blocked of submitted, ook als er een reopen-notitie bestaat", async () => {
  await withRollback(async (tx) => {
    const { tenant, reviewer } = await approvedForReview(tx);
    await reopenOnboardingInTransaction(tx, reopenInput(tenant.id, reviewer.user.id));
    for (const status of ["approved", "blocked", "submitted"] as const) {
      await tx.update(schema.onboardingProjects).set({ status }).where(eq(schema.onboardingProjects.tenantId, tenant.id));
      assert.equal((await findCurrentOnboarding(tx, tenant.id))?.reviewRequest, null, status);
    }
  });
});

test("HTTP GET na reopen met echte repositories: Owner ziet de reopen-feedback zonder reviewer- of tenantgegevens", async () => {
  await withRollback(async (tx) => {
    const a = await approvedForReview(tx, completeAnswers());
    const b = await approvedForReview(tx);
    await reopenOnboardingInTransaction(tx, reopenInput(a.tenant.id, a.reviewer.user.id));
    await reopenOnboardingInTransaction(tx, { ...reopenInput(b.tenant.id, b.reviewer.user.id), note: "Notitie die alleen bij tenant B hoort." });

    const app = appWithRealRepositories(tx);
    try {
      const response = await app.inject({ method: "GET", url: "/v1/onboarding/current", headers: { "x-test-identity": a.owner.identity.subject } });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().status, "review_needed");
      const feedback = response.json().review_request;
      assert.deepEqual(Object.keys(feedback).sort(), ["created_at", "kind", "note", "reason_code", "version"]);
      assert.deepEqual([feedback.kind, feedback.reason_code, feedback.version], ["reopened", "material_input_change", 1]);
      for (const secret of [a.reviewer.user.id, a.tenant.id, a.project.id, "reviewer_user_id", "alleen bij tenant B"]) {
        assert.ok(!response.body.includes(secret), secret);
      }

      // The existing edit and resubmit flow keeps working.
      const owner = { "x-test-identity": a.owner.identity.subject };
      const put = await app.inject({ method: "PUT", url: "/v1/onboarding/current", headers: owner, payload: onboardingPayload(1, completeAnswers()) });
      assert.deepEqual([put.statusCode, put.json().status], [200, "review_needed"]);
      const submit = await app.inject({ method: "POST", url: "/v1/onboarding/current/submit", headers: owner, payload: onboardingPayload(2, completeAnswers()) });
      assert.deepEqual([submit.statusCode, submit.json().status], [200, "submitted"]);
      const after = await app.inject({ method: "GET", url: "/v1/onboarding/current", headers: owner });
      assert.deepEqual([after.json().status, after.json().review_request], ["submitted", null]);
    } finally {
      await app.close();
    }
  });
});

test("HTTP GET na unblock: Owner ziet reden, notitie, versie en datum zonder interne gegevens", async () => {
  await withRollback(async (tx) => {
    const own = await submittedForReview(tx);
    const other = await submittedForReview(tx);
    await blockOnboardingInTransaction(tx, blockInput(own.tenant.id, own.reviewer.user.id));
    await unblockOnboardingInTransaction(tx, {
      ...unblockInput(own.tenant.id, own.reviewer.user.id),
      reasonCode: "rights_cleared",
      note: "De rechten zijn gecontroleerd en de blokkade is opgeheven.",
    });
    await blockOnboardingInTransaction(tx, blockInput(other.tenant.id, other.reviewer.user.id));
    await unblockOnboardingInTransaction(tx, { ...unblockInput(other.tenant.id, other.reviewer.user.id), note: "Notitie van tenant B." });

    const app = appWithRealRepositories(tx);
    try {
      const response = await app.inject({ method: "GET", url: "/v1/onboarding/current", headers: { "x-test-identity": own.owner.identity.subject } });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().status, "review_needed");
      const feedback = response.json().review_request;
      assert.deepEqual(Object.keys(feedback).sort(), ["created_at", "kind", "note", "reason_code", "version"]);
      assert.equal(feedback.kind, "unblocked");
      assert.deepEqual([feedback.reason_code, feedback.note, feedback.version], ["rights_cleared", "De rechten zijn gecontroleerd en de blokkade is opgeheven.", 1]);
      assert.equal(typeof feedback.created_at, "string");
      for (const secret of [own.reviewer.user.id, own.tenant.id, own.project.id, "reviewer_user_id", "Tenant B", "tenant B"]) {
        assert.ok(!response.body.includes(secret), secret);
      }

      await tx.update(schema.onboardingProjects).set({ status: "submitted" }).where(eq(schema.onboardingProjects.tenantId, own.tenant.id));
      const hidden = await app.inject({ method: "GET", url: "/v1/onboarding/current", headers: { "x-test-identity": own.owner.identity.subject } });
      assert.deepEqual([hidden.json().status, hidden.json().review_request], ["submitted", null]);
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
              (select count(*)::int from onboarding_versions) as onboarding_versions,
              (select count(*)::int from onboarding_audit_events) as onboarding_audit_events,
              (select count(*)::int from onboarding_reviewer_assignments) as onboarding_reviewer_assignments,
              (select count(*)::int from onboarding_review_access_events) as onboarding_review_access_events,
              (select count(*)::int from onboarding_review_requests) as onboarding_review_requests,
              (select count(*)::int from onboarding_review_actions) as onboarding_review_actions`,
    );
    assert.deepEqual(rows[0], { tenants: 0, users: 0, memberships: 0, leads: 0, websites: 0, onboarding_projects: 0, onboarding_versions: 0, onboarding_audit_events: 0, onboarding_reviewer_assignments: 0, onboarding_review_access_events: 0, onboarding_review_requests: 0, onboarding_review_actions: 0 });
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
