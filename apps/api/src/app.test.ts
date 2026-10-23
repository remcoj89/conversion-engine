import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { buildApp, type AppDependencies } from "./app.js";
import type { AuthAdapter, Membership, MembershipResolver } from "./auth/types.js";
import { apiErrorHandler } from "./errors.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import type { TenantLoader, TenantSummary } from "./tenants/tenantLoader.js";

// Kaarten blijven unavailable; alleen de tenant komt uit de database.
const todayCards = {
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
      "CRM- en leaddata zijn nog niet beschikbaar. Zodra die bron is gekoppeld, verschijnen hier de aanvragen die opvolging nodig hebben.",
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

// Test-only tenants; de naam van B mag nooit in een response voor tenant A staan.
const tenantsById: Record<string, TenantSummary> = {
  [tenantA]: { id: tenantA, name: "Tenant A Coaching", status: "active" },
  [tenantB]: { id: tenantB, name: "Tenant B Training", status: "active" },
};
const todayFor = (tenantId: string) => ({ tenant: tenantsById[tenantId], ...todayCards });

// Geeft de loader plus de lijst tenant-ID's waarmee hij is aangeroepen.
function spyTenantLoader(lookup: TenantLoader = async (tenantId) => tenantsById[tenantId] ?? null) {
  const calls: string[] = [];
  const tenantLoader: TenantLoader = async (tenantId) => {
    calls.push(tenantId);
    return lookup(tenantId);
  };
  return { tenantLoader, calls };
}

function setup(t: TestContext, tenantLoader: TenantLoader = spyTenantLoader().tenantLoader) {
  const app = buildApp(
    { authAdapter: testAuthAdapter, membershipResolver: testMembershipResolver, tenantLoader },
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
    assert.deepEqual(response.json(), todayFor(tenantA));
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
    assert.deepEqual(response.json(), todayFor(tenantId));
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
  assert.deepEqual(response.json(), todayFor(tenantA));
});

test("tenantisolatie: de loader krijgt alleen de tenant uit de auth-context", async (t) => {
  for (const [tenantId, otherTenantId] of [[tenantA, tenantB], [tenantB, tenantA]] as const) {
    const { tenantLoader, calls } = spyTenantLoader();
    const response = await setup(t, tenantLoader).inject({
      method: "GET",
      url: "/v1/dashboard/today",
      headers: { [TEST_IDENTITY_HEADER]: "multi-tenant", "x-tenant-id": tenantId },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, [tenantId]);
    assert.deepEqual(response.json(), todayFor(tenantId));
    assert.ok(!response.body.includes(tenantsById[otherTenantId]!.name));
    assert.ok(!response.body.includes(otherTenantId));
  }
});

test("tenantisolatie: tenant-ID in de query verandert de geladen tenant niet", async (t) => {
  const { tenantLoader, calls } = spyTenantLoader();
  const response = await setup(t, tenantLoader).inject({
    method: "GET",
    url: `/v1/dashboard/today?tenantId=${tenantB}&x-tenant-id=${tenantB}`,
    headers: { [TEST_IDENTITY_HEADER]: "owner" },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [tenantA]);
  assert.deepEqual(response.json(), todayFor(tenantA));
});

test("tenantisolatie: zonder geldige context wordt geen tenant geladen", async (t) => {
  const cases: Record<string, string>[] = [
    {},
    { [TEST_IDENTITY_HEADER]: "invalid" },
    { [TEST_IDENTITY_HEADER]: "disabled" },
    { [TEST_IDENTITY_HEADER]: "multi-tenant" },
    { [TEST_IDENTITY_HEADER]: "owner", "x-tenant-id": tenantB },
    { [TEST_IDENTITY_HEADER]: "owner", "x-tenant-id": "abc" },
  ];
  for (const headers of cases) {
    const { tenantLoader, calls } = spyTenantLoader();
    const response = await setup(t, tenantLoader).inject({ method: "GET", url: "/v1/dashboard/today", headers });

    assert.ok([400, 401, 403].includes(response.statusCode), JSON.stringify(headers));
    assert.deepEqual(calls, [], JSON.stringify(headers));
    assert.ok(!response.body.includes("Tenant "), JSON.stringify(headers));
  }
});

test("tenantisolatie: een niet (meer) bestaande tenant geeft 403 zonder data", async (t) => {
  const { tenantLoader } = spyTenantLoader(async () => null);
  const response = await setup(t, tenantLoader).inject({
    method: "GET",
    url: "/v1/dashboard/today",
    headers: { [TEST_IDENTITY_HEADER]: "owner" },
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "forbidden" });
});

test("dashboardroute zonder auth-hook geeft geen fixturedata of interne melding terug", async (t) => {
  // Simuleert een vergeten auth-hook: de echte route op een kale instance met de echte error handler.
  const app = Fastify({ logger: false });
  app.setErrorHandler(apiErrorHandler);
  const { tenantLoader, calls } = spyTenantLoader();
  registerDashboardRoutes(app, { tenantLoader });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/v1/dashboard/today" });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: "internal_error" });
  assert.doesNotMatch(response.body, /actionRequired|tenant|Leads die aandacht vragen|Auth context missing/);
  assert.deepEqual(calls, []);
});

// Gevoelige waarden in de foutmelding, zoals een DrizzleQueryError die query-params bevat.
const SECRET_SUBJECT = "secret-subject-123";
const SECRET_TOKEN = "secret-access-token";
const sensitiveError = () =>
  new Error(`Failed query params: ${SECRET_SUBJECT}, ${tenantA}, Bearer ${SECRET_TOKEN}`, {
    cause: { code: "57P01" },
  });

// Bouwt de app met een eigen dependency en vangt de logregels op.
function setupWithLogs(t: TestContext, dependencies: Partial<AppDependencies>) {
  const logs: string[] = [];
  const app = buildApp(
    { authAdapter: testAuthAdapter, membershipResolver: testMembershipResolver, tenantLoader: spyTenantLoader().tenantLoader, ...dependencies },
    { logger: { level: "info", stream: { write: (line: string) => logs.push(line) } } },
  );
  t.after(() => app.close());
  return { app, logs };
}

for (const [name, dependencies] of [
  ["authAdapter", { authAdapter: { authenticate: async () => { throw sensitiveError(); } } }],
  ["membershipResolver", { membershipResolver: async () => { throw sensitiveError(); } }],
  // Met een geldige membership, zodat de request de loader echt bereikt.
  [
    "tenantLoader",
    {
      membershipResolver: async () => [membership(SECRET_SUBJECT, tenantA, "owner")],
      tenantLoader: async () => { throw sensitiveError(); },
    },
  ],
] as const satisfies readonly (readonly [string, Partial<AppDependencies>])[]) {
  test(`${name} die een exception gooit geeft 500 internal_error zonder interne details`, async (t) => {
    const { app, logs } = setupWithLogs(t, dependencies);

    const response = await app.inject({
      method: "GET",
      url: "/v1/dashboard/today",
      headers: { [TEST_IDENTITY_HEADER]: SECRET_SUBJECT, authorization: `Bearer ${SECRET_TOKEN}`, "x-tenant-id": tenantA },
    });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), { error: "internal_error" });
    assert.doesNotMatch(response.body, /Failed query|secret|57P01/);

    // De serverlog bevat de fout, maar geen melding, subject, token of tenant-ID.
    const log = logs.join("");
    assert.match(log, /"msg":"unhandled error"/);
    assert.match(log, /"causeCode":"57P01"/);
    for (const secret of ["Failed query", SECRET_SUBJECT, SECRET_TOKEN, tenantA]) {
      assert.ok(!log.includes(secret), `log bevat ${secret}`);
    }
  });
}
