import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildApp, type AppDependencies } from "./app.js";
import type { AuthAdapter, Membership, MembershipResolver } from "./auth/types.js";
import type { TenantLoader, TenantSummary } from "./tenants/tenantLoader.js";

const TEST_IDENTITY_HEADER = "x-test-identity";
const subject = "oidc-subject-that-must-not-leak";
const internalUserId = randomUUID();
const tenantA = randomUUID();
const tenantB = randomUUID();

const membership = (
  tenantId: string,
  role: Membership["role"],
  status: Membership["status"] = "active",
): Membership => ({ tenantId, userId: internalUserId, role, status });

const membershipsBySubject: Record<string, readonly Membership[]> = {
  single: [membership(tenantA, "owner")],
  multiple: [membership(tenantA, "owner"), membership(tenantB, "team_member")],
  mixed: [membership(tenantB, "team_member", "disabled"), membership(tenantA, "owner")],
  disabled: [membership(tenantB, "owner", "disabled")],
  none: [],
};

const tenantsById: Record<string, TenantSummary> = {
  [tenantA]: { id: tenantA, name: "Tenant A Coaching", status: "active" },
  [tenantB]: { id: tenantB, name: "Tenant B Training", status: "active" },
};

const testAuthAdapter: AuthAdapter = {
  authenticate: async (request) => {
    const identity = request.headers[TEST_IDENTITY_HEADER];
    if (identity === undefined) return { status: "anonymous" };
    if (typeof identity !== "string" || identity === "invalid") {
      return { status: "invalid", reason: "test" };
    }
    return { status: "authenticated", identity: { issuer: "https://issuer.test", subject } };
  },
};

const unusedOnboardingStore: AppDependencies["onboardingStore"] = {
  findCurrent: async () => {
    throw new Error("not used in session context tests");
  },
  saveDraft: async () => {
    throw new Error("not used in session context tests");
  },
  submit: async () => {
    throw new Error("not used in session context tests");
  },
};

const unusedReviewStore: AppDependencies["reviewStore"] = {
  findReviewable: async () => null,
  readContent: async () => ({ status: "not_found" }),
  requestChanges: async () => {
    throw new Error("not used in session context tests");
  },
  block: async () => {
    throw new Error("not used in session context tests");
  },
  unblock: async () => {
    throw new Error("not used in session context tests");
  },
  approve: async () => {
    throw new Error("not used in session context tests");
  },
  reopen: async () => {
    throw new Error("not used in session context tests");
  },
};

function setup(
  t: TestContext,
  options: {
    memberships?: readonly Membership[];
    tenantLoader?: TenantLoader;
    logs?: string[];
  } = {},
) {
  const logs = options.logs ?? [];
  const membershipResolver: MembershipResolver = async () => options.memberships ?? membershipsBySubject.single!;
  const tenantLoader = options.tenantLoader ?? (async (tenantId: string) => tenantsById[tenantId] ?? null);
  const app = buildApp(
    {
      authAdapter: testAuthAdapter,
      membershipResolver,
      tenantLoader,
      leadCreator: async () => {
        throw new Error("not used in session context tests");
      },
      onboardingStore: unusedOnboardingStore,
      reviewerAssignmentResolver: async () => [],
      reviewStore: unusedReviewStore,
    },
    options.logs === undefined
      ? { logger: false }
      : { logger: { level: "info", stream: { write: (line: string) => logs.push(line) } } },
  );
  t.after(() => app.close());
  return { app, logs };
}

function sessionHeaders(subjectName: string, tenantId?: string): Record<string, string> {
  return {
    [TEST_IDENTITY_HEADER]: subjectName,
    ...(tenantId === undefined ? {} : { "x-tenant-id": tenantId }),
  };
}

test("GET /v1/session/context zonder authenticatie geeft 401", async (t) => {
  const { app } = setup(t);

  const response = await app.inject({ method: "GET", url: "/v1/session/context" });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: "unauthorized" });
  assert.equal(response.headers["cache-control"], "no-store");
});

test("GET /v1/session/context zonder actieve membership geeft 403", async (t) => {
  const calls: string[] = [];
  const { app } = setup(t, {
    memberships: membershipsBySubject.none,
    tenantLoader: async (tenantId) => {
      calls.push(tenantId);
      return tenantsById[tenantId] ?? null;
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/session/context",
    headers: sessionHeaders("none"),
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "forbidden" });
  assert.deepEqual(calls, []);
});

test("GET /v1/session/context met één actieve tenant selecteert automatisch", async (t) => {
  const { app } = setup(t, { memberships: membershipsBySubject.single });

  const response = await app.inject({
    method: "GET",
    url: "/v1/session/context",
    headers: sessionHeaders("single"),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(response.json(), {
    workspace: "customer",
    tenant: { id: tenantA, name: "Tenant A Coaching", status: "active", role: "owner" },
    memberships: [{ id: tenantA, name: "Tenant A Coaching", status: "active", role: "owner" }],
    tenant_selection_required: false,
  });
  assert.doesNotMatch(response.body, new RegExp(internalUserId));
  assert.doesNotMatch(response.body, new RegExp(subject));
});

test("GET /v1/session/context met meerdere tenants zonder selectie geeft veilige opties", async (t) => {
  const { app } = setup(t, { memberships: membershipsBySubject.multiple });

  const response = await app.inject({
    method: "GET",
    url: "/v1/session/context",
    headers: sessionHeaders("multiple"),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    workspace: "customer",
    tenant: null,
    memberships: [
      { id: tenantA, name: "Tenant A Coaching", status: "active", role: "owner" },
      { id: tenantB, name: "Tenant B Training", status: "active", role: "team_member" },
    ],
    tenant_selection_required: true,
  });
});

test("GET /v1/session/context met geldige selectie geeft alleen de eigen geselecteerde tenant", async (t) => {
  const { app } = setup(t, { memberships: membershipsBySubject.multiple });

  const response = await app.inject({
    method: "GET",
    url: "/v1/session/context",
    headers: sessionHeaders("multiple", tenantB.toUpperCase()),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    workspace: "customer",
    tenant: { id: tenantB, name: "Tenant B Training", status: "active", role: "team_member" },
    memberships: [
      { id: tenantA, name: "Tenant A Coaching", status: "active", role: "owner" },
      { id: tenantB, name: "Tenant B Training", status: "active", role: "team_member" },
    ],
    tenant_selection_required: false,
  });
});

test("GET /v1/session/context weigert ongeldige en niet-eigen tenantselecties", async (t) => {
  for (const [tenantId, expectedStatus] of [["not-a-uuid", 400], [randomUUID(), 403]] as const) {
    const { app } = setup(t, { memberships: membershipsBySubject.single });
    const response = await app.inject({
      method: "GET",
      url: "/v1/session/context",
      headers: sessionHeaders("single", tenantId),
    });

    assert.equal(response.statusCode, expectedStatus, tenantId);
    assert.deepEqual(response.json(), { error: expectedStatus === 400 ? "invalid_tenant" : "forbidden" });
  }
});

test("GET /v1/session/context filtert disabled memberships opnieuw", async (t) => {
  const calls: string[] = [];
  const { app } = setup(t, {
    memberships: membershipsBySubject.mixed,
    tenantLoader: async (tenantId) => {
      calls.push(tenantId);
      return tenantsById[tenantId] ?? null;
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/session/context",
    headers: sessionHeaders("mixed"),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [tenantA]);
  assert.deepEqual(response.json().memberships, [
    { id: tenantA, name: "Tenant A Coaching", status: "active", role: "owner" },
  ]);
  assert.ok(!response.body.includes(tenantB));
  assert.ok(!response.body.includes("Tenant B Training"));
});

test("GET /v1/session/context met alleen een disabled membership geeft 403", async (t) => {
  const { app } = setup(t, { memberships: membershipsBySubject.disabled });

  const response = await app.inject({
    method: "GET",
    url: "/v1/session/context",
    headers: sessionHeaders("disabled"),
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "forbidden" });
});

test("GET /v1/session/context faalt gesloten wanneer TenantLoader geen tenant vindt", async (t) => {
  const { app } = setup(t, { memberships: membershipsBySubject.single, tenantLoader: async () => null });

  const response = await app.inject({
    method: "GET",
    url: "/v1/session/context",
    headers: sessionHeaders("single"),
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "forbidden" });
  assert.ok(!response.body.includes("Tenant A Coaching"));
});

test("GET /v1/session/context faalt gesloten wanneer TenantLoader een inactieve tenant teruggeeft", async (t) => {
  const { app } = setup(t, {
    memberships: membershipsBySubject.single,
    tenantLoader: async (tenantId) => ({ ...tenantsById[tenantId]!, status: "suspended" }),
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/session/context",
    headers: sessionHeaders("single"),
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "forbidden" });
});

test("GET /v1/session/context lekt geen gevoelige data in responses of logs bij een loaderfout", async (t) => {
  const logs: string[] = [];
  const secret = "database-secret-subject-and-token";
  const { app } = setup(t, {
    logs,
    memberships: membershipsBySubject.single,
    tenantLoader: async () => {
      throw new Error(`query parameters ${secret} ${internalUserId}`);
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/session/context",
    headers: { ...sessionHeaders("single"), authorization: `Bearer ${secret}` },
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: "internal_error" });
  assert.ok(!response.body.includes(secret));
  assert.ok(!logs.join("").includes(secret));
  assert.ok(!logs.join("").includes(internalUserId));
});
