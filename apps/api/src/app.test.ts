import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { buildApp } from "./app.js";
import type { AuthAdapter, Membership, MembershipResolver } from "./auth/types.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";

const todayContract = {
  actionRequired: [
    {
      id: "leads-needing-attention",
      label: "Leads die aandacht vragen",
      value: null,
      status: "unavailable",
      source: "CRM",
    },
    {
      id: "open-tasks",
      label: "Open taken",
      value: null,
      status: "unavailable",
      source: "CRM",
    },
    {
      id: "confirmed-appointments",
      label: "Bevestigde afspraken",
      value: null,
      status: "unavailable",
      source: "Boekingsprovider",
    },
  ],
  directFollowUp: {
    status: "empty",
    message:
      "Zodra de Conversion Engine API is gekoppeld, verschijnen hier de aanvragen die opvolging nodig hebben.",
  },
};

// Test-only: identity uit een testheader. Bestaat alleen in dit testbestand, nooit in server.ts.
const TEST_IDENTITY_HEADER = "x-test-identity";
const testAuthAdapter: AuthAdapter = {
  authenticate: async (request) => {
    const subject = request.headers[TEST_IDENTITY_HEADER];
    if (subject === undefined) return { status: "anonymous" };
    if (subject === "invalid" || typeof subject !== "string") return { status: "invalid", reason: "test" };
    return { status: "authenticated", identity: { issuer: "https://issuer.test", subject } };
  },
};

const tenantA = randomUUID();
const tenantB = randomUUID();
const membership = (subject: string, tenantId: string, role: Membership["role"], status: Membership["status"] = "active") =>
  ({ userId: `user-${subject}`, tenantId, role, status }) satisfies Membership;

// Test-only resolver; geeft ook niet-actieve memberships terug om de selectielaag te raken.
const membershipsBySubject: Record<string, readonly Membership[]> = {
  "no-membership": [],
  disabled: [membership("disabled", tenantA, "owner", "disabled")],
  owner: [membership("owner", tenantA, "owner")],
  "team-member": [membership("team-member", tenantA, "team_member")],
  "multi-tenant": [membership("multi-tenant", tenantA, "owner"), membership("multi-tenant", tenantB, "team_member")],
};
const testMembershipResolver: MembershipResolver = async ({ subject }) =>
  Object.hasOwn(membershipsBySubject, subject) ? membershipsBySubject[subject]! : [];

function setup(t: TestContext) {
  const app = buildApp(
    { authAdapter: testAuthAdapter, membershipResolver: testMembershipResolver },
    { logger: false },
  );
  t.after(() => app.close());
  return app;
}

async function getToday(t: TestContext, headers: Record<string, string> = {}, url = "/v1/dashboard/today") {
  return setup(t).inject({ method: "GET", url, headers });
}

test("GET /health geeft status ok zonder auth", async (t) => {
  const response = await setup(t).inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "conversion-engine-api",
  });
});

test("GET /v1/dashboard/today zonder credentials geeft 401", async (t) => {
  const response = await getToday(t);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: "unauthorized" });
});

test("GET /v1/dashboard/today met ongeldige auth geeft 401 zonder reden", async (t) => {
  const response = await getToday(t, { [TEST_IDENTITY_HEADER]: "invalid" });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: "unauthorized" });
});

test("GET /v1/dashboard/today geeft 403 bij onbekende identity, geen of disabled membership", async (t) => {
  for (const subject of ["unknown", "no-membership", "disabled"]) {
    const response = await getToday(t, { [TEST_IDENTITY_HEADER]: subject });

    assert.equal(response.statusCode, 403, subject);
    assert.deepEqual(response.json(), { error: "forbidden" }, subject);
  }
});

test("GET /v1/dashboard/today met één actieve membership zonder x-tenant-id geeft het Vandaag-contract", async (t) => {
  // Een lege header telt als ontbrekend.
  for (const headers of [{}, { "x-tenant-id": "" }] as Record<string, string>[]) {
    const response = await getToday(t, { [TEST_IDENTITY_HEADER]: "owner", ...headers });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] ?? "", /^application\/json/);
    assert.deepEqual(response.json(), todayContract);
  }
});

test("GET /v1/dashboard/today met meerdere memberships zonder x-tenant-id geeft 400", async (t) => {
  const response = await getToday(t, { [TEST_IDENTITY_HEADER]: "multi-tenant" });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: "tenant_required" });
});

test("GET /v1/dashboard/today negeert tenant-ID in de query", async (t) => {
  const response = await getToday(
    t,
    { [TEST_IDENTITY_HEADER]: "multi-tenant" },
    `/v1/dashboard/today?tenantId=${tenantA}&x-tenant-id=${tenantA}`,
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: "tenant_required" });
});

test("GET /v1/dashboard/today met geldige x-tenant-id geeft 200 voor elke tenant van de user", async (t) => {
  for (const tenantId of [tenantA, tenantB]) {
    const response = await getToday(t, { [TEST_IDENTITY_HEADER]: "multi-tenant", "x-tenant-id": tenantId });

    assert.equal(response.statusCode, 200, tenantId);
    assert.deepEqual(response.json(), todayContract);
  }
});

test("GET /v1/dashboard/today met ongeldige x-tenant-id geeft 400", async (t) => {
  for (const tenantId of ["abc", " ", `${tenantA},${tenantB}`]) {
    const response = await getToday(t, { [TEST_IDENTITY_HEADER]: "multi-tenant", "x-tenant-id": tenantId });

    assert.equal(response.statusCode, 400, tenantId);
    assert.deepEqual(response.json(), { error: "invalid_tenant" });
  }
});

test("GET /v1/dashboard/today voor tenant zonder membership geeft 403", async (t) => {
  for (const tenantId of [tenantB, randomUUID()]) {
    const response = await getToday(t, { [TEST_IDENTITY_HEADER]: "owner", "x-tenant-id": tenantId });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { error: "forbidden" });
  }
});

test("GET /v1/dashboard/today: Team Member krijgt dashboard:read", async (t) => {
  const response = await getToday(t, { [TEST_IDENTITY_HEADER]: "team-member" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), todayContract);
});

test("dashboardroute zonder auth-hook geeft geen fixturedata terug", async (t) => {
  // Simuleert een vergeten auth-hook: de echte route op een kale instance.
  const app = Fastify({ logger: false });
  registerDashboardRoutes(app);
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/v1/dashboard/today" });

  assert.equal(response.statusCode, 500);
  assert.doesNotMatch(response.body, /actionRequired|Leads die aandacht vragen/);
});
