import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { buildApp, type AppDependencies } from "../app.js";
import type { AuthAdapter, Membership } from "../auth/types.js";
import type { DealRead, DealRepository } from "../deals/dealRepository.js";

const TEST_IDENTITY_HEADER = "x-test-identity";
const tenantA = randomUUID();
const tenantB = randomUUID();
const contactA = randomUUID();
const dealA = randomUUID();
const createdAt = new Date("2026-11-02T09:00:00.000Z");

const authAdapter: AuthAdapter = {
  authenticate: async (request) => {
    const subject = request.headers[TEST_IDENTITY_HEADER];
    if (subject === undefined) return { status: "anonymous" };
    if (typeof subject !== "string" || subject === "invalid") return { status: "invalid", reason: "test" };
    return { status: "authenticated", identity: { issuer: "https://issuer.test", subject, assurance: { level: "aal2" } } };
  },
};

const memberships: Record<string, readonly Membership[]> = {
  owner: [{ userId: "user-owner", tenantId: tenantA, role: "owner", status: "active" }],
  team: [{ userId: "user-team", tenantId: tenantA, role: "team_member", status: "active" }],
  multi: [
    { userId: "user-multi", tenantId: tenantA, role: "owner", status: "active" },
    { userId: "user-multi", tenantId: tenantB, role: "owner", status: "active" },
  ],
};

function deal(overrides: Partial<DealRead> = {}): DealRead {
  return {
    id: dealA,
    contactId: contactA,
    title: "Website traject",
    description: null,
    amountEur: "1250.00",
    ownerUserId: null,
    stage: "new",
    expectedCloseDate: null,
    lossReason: null,
    status: "active",
    createdAt,
    updatedAt: createdAt,
    archivedAt: null,
    ...overrides,
  };
}

function repository(overrides: Partial<DealRepository> = {}): DealRepository {
  return {
    list: async () => [],
    find: async () => null,
    create: async () => deal(),
    update: async () => null,
    archive: async () => null,
    ...overrides,
  };
}

function dependencies(dealRepository: DealRepository): AppDependencies {
  return {
    authAdapter,
    membershipResolver: async ({ subject }) => memberships[subject] ?? [],
    tenantLoader: async (tenantId) => ({ id: tenantId, name: "Tenant", status: "active" }),
    leadCreator: async () => { throw new Error("not used"); },
    onboardingStore: {
      findCurrent: async () => null,
      saveDraft: async () => { throw new Error("not used"); },
      submit: async () => { throw new Error("not used"); },
    },
    reviewerAssignmentResolver: async () => [],
    reviewStore: {
      findReviewable: async () => null,
      readContent: async () => ({ status: "not_found" }),
      requestChanges: async () => { throw new Error("not used"); },
      block: async () => { throw new Error("not used"); },
      unblock: async () => { throw new Error("not used"); },
      approve: async () => { throw new Error("not used"); },
      reopen: async () => { throw new Error("not used"); },
    },
    dealRepository,
  };
}

function setup(t: TestContext, dealRepository: DealRepository) {
  const app = buildApp(dependencies(dealRepository), { logger: false });
  t.after(() => app.close());
  return app;
}

const ownerHeaders = { [TEST_IDENTITY_HEADER]: "owner" };

test("deal routes require authentication and CRM permissions", async (t) => {
  const app = setup(t, repository());
  const anonymous = await app.inject({ method: "GET", url: "/v1/deals" });
  assert.equal(anonymous.statusCode, 401);

  const teamMember = await app.inject({
    method: "GET",
    url: "/v1/deals",
    headers: { [TEST_IDENTITY_HEADER]: "team" },
  });
  assert.equal(teamMember.statusCode, 403);
});

test("deal routes use only the selected tenant and expose the minimal CRUD contract", async (t) => {
  const calls: string[] = [];
  const app = setup(t, repository({
    list: async (tenantId) => {
      calls.push(`list:${tenantId}`);
      return [deal()];
    },
    create: async (input) => {
      calls.push(`create:${input.tenantId}`);
      return deal({ contactId: input.contactId, title: input.title });
    },
    update: async (input) => {
      calls.push(`update:${input.tenantId}:${input.dealId}`);
      return deal({ title: input.title ?? "Bijgewerkt" });
    },
    archive: async (tenantId, id) => {
      calls.push(`archive:${tenantId}:${id}`);
      return deal({ status: "archived", archivedAt: createdAt });
    },
  }));

  const list = await app.inject({
    method: "GET",
    url: "/v1/deals?include_archived=true",
    headers: { [TEST_IDENTITY_HEADER]: "multi", "x-tenant-id": tenantB },
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().items[0].id, dealA);

  const created = await app.inject({
    method: "POST",
    url: "/v1/deals",
    headers: ownerHeaders,
    payload: {
      contact_id: contactA,
      title: " Nieuwe deal ",
      amount_eur: "1250.00",
      stage: "proposal",
    },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().title, " Nieuwe deal ".trim());

  const updated = await app.inject({
    method: "PATCH",
    url: `/v1/deals/${dealA}`,
    headers: ownerHeaders,
    payload: { stage: "qualified", description: "Meer informatie" },
  });
  assert.equal(updated.statusCode, 200);

  const archived = await app.inject({
    method: "POST",
    url: `/v1/deals/${dealA}/archive`,
    headers: ownerHeaders,
  });
  assert.equal(archived.statusCode, 200);
  assert.deepEqual(calls, [
    `list:${tenantB}`,
    `create:${tenantA}`,
    `update:${tenantA}:${dealA}`,
    `archive:${tenantA}:${dealA}`,
  ]);
});

test("deal route rejects tenant/status injection and direct closed creation", async (t) => {
  const app = setup(t, repository());
  for (const payload of [
    { tenant_id: tenantB, contact_id: contactA, title: "Ongewenst" },
    { contact_id: contactA, title: "Ongewenst", status: "archived" },
    { contact_id: contactA, title: "Te vroeg gesloten", stage: "won" },
    { contact_id: contactA, title: "Negatief", amount_eur: "-1.00" },
  ]) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/deals",
      headers: ownerHeaders,
      payload,
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: "invalid_body" });
  }
});
