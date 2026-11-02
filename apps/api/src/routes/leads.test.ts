import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { buildApp, type AppDependencies } from "../app.js";
import type { AuthAdapter, Membership, MembershipResolver } from "../auth/types.js";
import {
  encodeLeadCursor,
  InvalidLeadStatusTransitionError,
  type Lead,
  type LeadReader,
  type LeadStatusUpdater,
} from "../leads/leadRepository.js";
import type { LeadCreator } from "./leads.js";
import { parseLeadListQuery, parseLeadStatusMutation } from "./leads.js";

const TEST_IDENTITY_HEADER = "x-test-identity";
const tenantA = randomUUID();
const tenantB = randomUUID();
const leadA = randomUUID();
const createdAt = new Date("2026-10-29T10:00:00.000Z");

const testAuthAdapter: AuthAdapter = {
  authenticate: async (request) => {
    const subject = request.headers[TEST_IDENTITY_HEADER];
    if (subject === undefined) return { status: "anonymous" };
    if (typeof subject !== "string" || subject === "invalid") return { status: "invalid", reason: "test" };
    return {
      status: "authenticated",
      identity: { issuer: "https://issuer.test", subject, assurance: { level: "aal2" } },
    };
  },
};

const memberships: Record<string, readonly Membership[]> = {
  owner: [{ userId: "user-owner", tenantId: tenantA, role: "owner", status: "active" }],
  "team-member": [{ userId: "user-team-member", tenantId: tenantA, role: "team_member", status: "active" }],
  "multi-tenant": [
    { userId: "user-multi", tenantId: tenantA, role: "owner", status: "active" },
    {
      userId: "user-multi",
      tenantId: tenantB,
      role: "team_member",
      status: "active",
      teamMemberPermissions: { "crm:update": true },
    },
  ],
  "no-permission": [{ userId: "user-no-permission", tenantId: tenantA, role: "viewer" as "owner", status: "active" }],
};

const membershipResolver: MembershipResolver = async ({ subject }) => memberships[subject] ?? [];
const lead = (id: string, tenantId: string): Lead => ({
  id,
  tenantId,
  name: "Voorbeeld Persoon",
  email: "voorbeeld@example.test",
  phone: null,
  message: "Ik wil graag kennismaken.",
  source: "manual",
  status: "new",
  createdAt: createdAt,
  updatedAt: createdAt,
});

function defaultReader(): LeadReader {
  return {
    list: async ({ tenantId }) => ({
      items: [leadARead(tenantId)],
      nextCursor: null,
    }),
    findDetail: async (tenantId, id) => (id === leadA && tenantId === tenantA ? leadARead(tenantId) : null),
  };
}

function leadARead(tenantId: string) {
  const { tenantId: ignored, ...read } = lead(leadA, tenantId);
  void ignored;
  return { ...read, nextAction: null };
}

const unusedLeadStatusUpdater: LeadStatusUpdater = async ({ leadId, toStatus }) => ({
  id: leadId,
  status: toStatus,
  nextAction: null,
  updatedAt: createdAt,
});

const unusedLeadCreator: LeadCreator = async (tenantId, input) => ({
  id: randomUUID(),
  tenantId,
  ...input,
  phone: input.phone ?? null,
  status: "new",
  createdAt,
  updatedAt: createdAt,
});

const dependencies = (leadReader: LeadReader = defaultReader()): AppDependencies => ({
  authAdapter: testAuthAdapter,
  membershipResolver,
  tenantLoader: async () => ({ id: tenantA, name: "Tenant A", status: "active" }),
  leadCreator: unusedLeadCreator,
  leadStatusUpdater: unusedLeadStatusUpdater,
  leadReader,
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
});

function setup(t: TestContext, leadReader?: LeadReader) {
  const app = buildApp(dependencies(leadReader));
  t.after(() => app.close());
  return app;
}

test("parseLeadListQuery accepteert alleen veilige queryvelden en lifecycle-statussen", () => {
  const cursorCreatedAt = "2026-10-29T10:00:00.000000Z";
  const cursor = encodeLeadCursor({ createdAt: cursorCreatedAt, id: leadA });
  assert.deepEqual(parseLeadListQuery({ q: "  mail@example.test ", status: "new", limit: "10", cursor }), {
    q: "mail@example.test",
    status: "new",
    limit: 10,
    cursor: { createdAt: cursorCreatedAt, id: leadA },
  });
  for (const status of ["new", "qualified", "appointment_scheduled", "proposal", "won", "lost"] as const) {
    assert.equal(parseLeadListQuery({ status })?.status, status);
  }

  for (const query of [
    { status: "not-a-status" },
    { limit: "0" },
    { limit: "51" },
    { limit: "1.5" },
    { q: "x".repeat(121) },
    { unexpected: "value" },
    { cursor: "not-a-cursor" },
  ]) {
    assert.equal(parseLeadListQuery(query), null, JSON.stringify(query));
  }
});

test("parseLeadStatusMutation accepteert alleen een geldige status", () => {
  assert.deepEqual(parseLeadStatusMutation({ status: "qualified" }), { status: "qualified" });
  for (const value of [
    null,
    {},
    { status: "unknown" },
    { status: "qualified", tenant_id: tenantA },
    { status: "qualified", next_action: null },
  ]) {
    assert.equal(parseLeadStatusMutation(value), null, JSON.stringify(value));
  }
});

test("GET /v1/leads vereist auth, membership en leads:read", async (t) => {
  const app = setup(t);
  for (const [headers, status, error] of [
    [{}, 401, "unauthorized"],
    [{ [TEST_IDENTITY_HEADER]: "unknown" }, 403, "forbidden"],
    [{ [TEST_IDENTITY_HEADER]: "no-permission" }, 403, "forbidden"],
  ] as const) {
    const response = await app.inject({ method: "GET", url: "/v1/leads", headers });
    assert.equal(response.statusCode, status);
    assert.deepEqual(response.json(), { error });
  }
});

test("GET /v1/leads gebruikt auth tenant en geeft alleen leadvelden terug", async (t) => {
  const calls: Array<Record<string, unknown>> = [];
  const reader: LeadReader = {
    list: async (query) => {
      calls.push(query);
      return { items: [leadARead(query.tenantId)], nextCursor: null };
    },
    findDetail: async () => null,
  };
  const response = await setup(t, reader).inject({
    method: "GET",
    url: "/v1/leads?q=example&status=new&limit=10",
    headers: { [TEST_IDENTITY_HEADER]: "multi-tenant", "x-tenant-id": tenantB },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{
    tenantId: tenantB,
    role: "team_member",
    userId: "user-multi",
    q: "example",
    status: "new",
    limit: 10,
  }]);
  assert.deepEqual(Object.keys(response.json().items[0]).sort(), [
    "created_at", "email", "id", "message", "name", "next_action", "phone", "source", "status", "updated_at",
  ]);
  assert.ok(!response.body.includes("tenantId"));
});

test("GET /v1/leads geeft 400 bij ongeldige query en cursor", async (t) => {
  const app = setup(t);
  for (const url of ["/v1/leads?status=not-a-status", "/v1/leads?limit=999", "/v1/leads?cursor=broken"]) {
    const response = await app.inject({ method: "GET", url, headers: { [TEST_IDENTITY_HEADER]: "owner" } });
    assert.equal(response.statusCode, 400, url);
    assert.deepEqual(response.json(), { error: "invalid_query" });
  }
});

test("GET /v1/leads/:leadId is tenantgebonden, UUID-gevalideerd en geeft 404 zonder datalek", async (t) => {
  const calls: Array<[string, string]> = [];
  const reader: LeadReader = {
    list: async () => ({ items: [], nextCursor: null }),
    findDetail: async (tenantId, id) => {
      calls.push([tenantId, id]);
      return id === leadA && tenantId === tenantA ? leadARead(tenantA) : null;
    },
  };
  const app = setup(t, reader);

  const success = await app.inject({ method: "GET", url: `/v1/leads/${leadA}`, headers: { [TEST_IDENTITY_HEADER]: "owner" } });
  assert.equal(success.statusCode, 200);
  assert.equal(success.json().id, leadA);
  assert.ok(!success.body.includes(tenantA));

  const crossTenant = await app.inject({
    method: "GET",
    url: `/v1/leads/${leadA}`,
    headers: { [TEST_IDENTITY_HEADER]: "multi-tenant", "x-tenant-id": tenantB },
  });
  assert.equal(crossTenant.statusCode, 404);
  assert.deepEqual(crossTenant.json(), { error: "not_found" });

  const invalid = await app.inject({ method: "GET", url: "/v1/leads/not-a-uuid", headers: { [TEST_IDENTITY_HEADER]: "owner" } });
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(invalid.json(), { error: "invalid_lead_id" });
  assert.deepEqual(calls, [[tenantA, leadA], [tenantB, leadA]]);
});

test("GET /v1/leads geeft veilige 500 bij readerfout", async (t) => {
  const reader: LeadReader = {
    list: async () => { throw new Error("database secret tenant"); },
    findDetail: async () => null,
  };
  const response = await setup(t, reader).inject({ method: "GET", url: "/v1/leads", headers: { [TEST_IDENTITY_HEADER]: "owner" } });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: "internal_error" });
  assert.ok(!response.body.includes("database secret"));
});

test("GET /v1/leads ondersteunt beide bestaande klantrollen", async (t) => {
  const app = setup(t);
  for (const subject of ["owner", "team-member"]) {
    const response = await app.inject({ method: "GET", url: "/v1/leads", headers: { [TEST_IDENTITY_HEADER]: subject } });
    assert.equal(response.statusCode, 200, subject);
  }
});

test("PATCH /v1/leads/:leadId/status gebruikt tenant, actor en CRM-update permission", async (t) => {
  const calls: Parameters<LeadStatusUpdater>[0][] = [];
  const updater: LeadStatusUpdater = async (input) => {
    calls.push(input);
    return { id: input.leadId, status: input.toStatus, nextAction: null, updatedAt: createdAt };
  };
  const app = buildApp({
    ...dependencies(),
    leadStatusUpdater: updater,
  });
  t.after(() => app.close());

  const success = await app.inject({
    method: "PATCH",
    url: `/v1/leads/${leadA}/status`,
    headers: { [TEST_IDENTITY_HEADER]: "owner" },
    payload: { status: "qualified" },
  });
  assert.equal(success.statusCode, 200);
  assert.deepEqual(success.json(), {
    id: leadA,
    status: "qualified",
    next_action: null,
    updated_at: createdAt.toISOString(),
  });
  assert.deepEqual(calls, [{
    tenantId: tenantA,
    leadId: leadA,
    actorUserId: "user-owner",
    toStatus: "qualified",
  }]);

  const otherTenant = await app.inject({
    method: "PATCH",
    url: `/v1/leads/${leadA}/status`,
    headers: { [TEST_IDENTITY_HEADER]: "multi-tenant", "x-tenant-id": tenantB },
    payload: { status: "qualified" },
  });
  assert.equal(otherTenant.statusCode, 200);
  assert.equal(calls.at(-1)?.tenantId, tenantB);
  assert.equal(calls.at(-1)?.actorUserId, "user-multi");
});

test("PATCH /v1/leads/:leadId/status weigert ontbrekende permission, ongeldige body en overgang", async (t) => {
  const updater: LeadStatusUpdater = async () => {
    throw new Error("unexpected");
  };
  const app = buildApp({ ...dependencies(), leadStatusUpdater: updater });
  t.after(() => app.close());

  const forbidden = await app.inject({
    method: "PATCH",
    url: `/v1/leads/${leadA}/status`,
    headers: { [TEST_IDENTITY_HEADER]: "team-member" },
    payload: { status: "qualified" },
  });
  assert.equal(forbidden.statusCode, 403);

  const invalidBody = await app.inject({
    method: "PATCH",
    url: `/v1/leads/${leadA}/status`,
    headers: { [TEST_IDENTITY_HEADER]: "owner" },
    payload: { status: "not-a-status" },
  });
  assert.equal(invalidBody.statusCode, 400);

  const invalidTransitionUpdater: LeadStatusUpdater = async () => {
    throw new InvalidLeadStatusTransitionError("new", "won");
  };
  const transitionApp = buildApp({ ...dependencies(), leadStatusUpdater: invalidTransitionUpdater });
  t.after(() => transitionApp.close());
  const invalidTransition = await transitionApp.inject({
    method: "PATCH",
    url: `/v1/leads/${leadA}/status`,
    headers: { [TEST_IDENTITY_HEADER]: "owner" },
    payload: { status: "qualified" },
  });
  assert.equal(invalidTransition.statusCode, 409);
  assert.deepEqual(invalidTransition.json(), { error: "invalid_status_transition" });
});
