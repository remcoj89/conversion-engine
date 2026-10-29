import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { buildApp, type AppDependencies } from "../app.js";
import type {
  AuthAdapter,
  MembershipResolver,
  PlatformAdminAssignmentResolver,
} from "../auth/types.js";
import type { TenantLoader } from "../tenants/tenantLoader.js";
import type { LeadCreator } from "./leads.js";
import type { OnboardingStore } from "./onboarding.js";
import type {
  PlatformTenantListQuery,
  PlatformTenantListResult,
  PlatformTenantRepository,
} from "../platform/platformTenantRepository.js";
import type {
  PlatformTenantMutation,
  PlatformTenantMutationRepository,
} from "../platform/platformTenantMutationRepository.js";

const TEST_IDENTITY_HEADER = "x-test-identity";
const tenantA = "00000000-0000-4000-8000-000000000001";
const tenantB = "00000000-0000-4000-8000-000000000002";
const subject = "platform-admin-subject";
const sensitiveFailure = "synthetic-database-secret";
const platformAdminUserId = "00000000-0000-4000-8000-000000000099";

const tenantItemA = {
  id: tenantA,
  name: "Synthetic Alpha",
  status: "active",
  createdAt: new Date("2026-10-28T10:00:00.000Z"),
  onboarding: {
    status: "submitted" as const,
    version: 2,
    updatedAt: new Date("2026-10-28T11:00:00.000Z"),
  },
  websiteSummary: { total: 2, active: 1 },
};

const tenantItemB = {
  id: tenantB,
  name: "Synthetic Beta",
  status: "active",
  createdAt: new Date("2026-10-27T10:00:00.000Z"),
  onboarding: null,
  websiteSummary: { total: 0, active: 0 },
};

const mutationItem: PlatformTenantMutation = {
  id: tenantA,
  name: "Synthetic Alpha",
  status: "active",
  createdAt: new Date("2026-10-28T10:00:00.000Z"),
  updatedAt: new Date("2026-10-28T10:00:00.000Z"),
  disabledAt: null,
  purgeAfterAt: null,
};

const emptyOnboardingStore: OnboardingStore = {
  findCurrent: async () => { throw new Error("not used in platform tenant tests"); },
  saveDraft: async () => { throw new Error("not used in platform tenant tests"); },
  submit: async () => { throw new Error("not used in platform tenant tests"); },
};

const emptyReviewStore: AppDependencies["reviewStore"] = {
  findReviewable: async () => null,
  readContent: async () => ({ status: "not_found" }),
  requestChanges: async () => { throw new Error("not used in platform tenant tests"); },
  block: async () => { throw new Error("not used in platform tenant tests"); },
  unblock: async () => { throw new Error("not used in platform tenant tests"); },
  approve: async () => { throw new Error("not used in platform tenant tests"); },
  reopen: async () => { throw new Error("not used in platform tenant tests"); },
};

const testAuthAdapter: AuthAdapter = {
  authenticate: async (request) => {
    const value = request.headers[TEST_IDENTITY_HEADER];
    if (value === undefined) return { status: "anonymous" };
    if (typeof value !== "string" || value === "invalid") return { status: "invalid", reason: "test" };
    return { status: "authenticated", identity: { issuer: "https://issuer.test", subject: value, assurance: { level: "aal2" } } };
  },
};

const testPlatformResolver: PlatformAdminAssignmentResolver = {
  resolve: async (identity) => identity.subject === subject
    ? [{ userId: "00000000-0000-4000-8000-000000000099", permission: "platform_admin" }]
    : [],
};

const emptyMembershipResolver: MembershipResolver = async () => [];
const emptyTenantLoader: TenantLoader = async () => null;
const emptyLeadCreator: LeadCreator = async () => { throw new Error("not used in platform tenant tests"); };

function repositoryReturning(result: PlatformTenantListResult, calls: PlatformTenantListQuery[] = []): PlatformTenantRepository {
  return {
    list: async (query) => {
      calls.push(query);
      return result;
    },
  };
}

function setup(
  t: TestContext,
  repository: PlatformTenantRepository = repositoryReturning({ items: [tenantItemA], nextCursor: null }),
  logs?: string[],
  mutationRepository?: PlatformTenantMutationRepository,
) {
  const app = buildApp(
    {
      authAdapter: testAuthAdapter,
      membershipResolver: emptyMembershipResolver,
      reviewerAssignmentResolver: async () => [],
      platformAdminAssignmentResolver: testPlatformResolver,
      platformTenantRepository: repository,
      platformTenantMutationRepository: mutationRepository,
      tenantLoader: emptyTenantLoader,
      leadCreator: emptyLeadCreator,
      onboardingStore: emptyOnboardingStore,
      reviewStore: emptyReviewStore,
    },
    logs === undefined
      ? { logger: false }
      : { logger: { level: "info", stream: { write: (line: string) => logs.push(line) } } },
  );
  t.after(() => app.close());
  return app;
}

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { [TEST_IDENTITY_HEADER]: subject, ...extra };
}

test("Platform Admin krijgt alleen de read-only klantenlijst", async (t) => {
  const app = setup(t);
  const response = await app.inject({ method: "GET", url: "/v1/platform/tenants", headers: adminHeaders() });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(response.json(), {
    items: [{
      id: tenantA,
      name: "Synthetic Alpha",
      status: "active",
      created_at: "2026-10-28T10:00:00.000Z",
      onboarding: {
        status: "submitted",
        version: 2,
        updated_at: "2026-10-28T11:00:00.000Z",
      },
      website_summary: { total: 2, active: 1 },
    }],
    next_cursor: null,
  });
  assert.doesNotMatch(response.body, /answers|project_brief|authProviderUserId|token/i);
});

test("anonymous, customer, reviewer, revoked en disabled krijgen geen platformlijst", async (t) => {
  for (const identity of [undefined, "customer", "reviewer", "revoked", "disabled"]) {
    const calls: PlatformTenantListQuery[] = [];
    const app = setup(t, repositoryReturning({ items: [tenantItemA], nextCursor: null }, calls));
    const response = await app.inject({
      method: "GET",
      url: "/v1/platform/tenants",
      headers: identity === undefined ? {} : { [TEST_IDENTITY_HEADER]: identity },
    });

    assert.equal(response.statusCode, identity === undefined ? 401 : 403, identity ?? "anonymous");
    assert.deepEqual(response.json(), { error: identity === undefined ? "unauthorized" : "forbidden" });
    assert.deepEqual(calls, []);
  }
});

test("x-tenant-id heeft geen invloed op Platform Admin-data", async (t) => {
  const calls: PlatformTenantListQuery[] = [];
  const app = setup(t, repositoryReturning({ items: [tenantItemA], nextCursor: null }, calls));
  const response = await app.inject({
    method: "GET",
    url: "/v1/platform/tenants",
    headers: adminHeaders({ "x-tenant-id": tenantB }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal("tenantId" in calls[0]!, false);
  assert.equal(response.json().items[0].id, tenantA);
});

test("filters worden gevalideerd en als server-side repositoryquery doorgegeven", async (t) => {
  const calls: PlatformTenantListQuery[] = [];
  const app = setup(t, repositoryReturning({ items: [], nextCursor: null }, calls));
  const response = await app.inject({
    method: "GET",
    url: "/v1/platform/tenants?q=Synthetic%20Alpha&status=active&onboarding_status=submitted&limit=10",
    headers: adminHeaders(),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{
    q: "Synthetic Alpha",
    status: "active",
    onboardingStatus: "submitted",
    limit: 10,
  }]);
});

test("niet gestart is een geldig onboardingfilter", async (t) => {
  const calls: PlatformTenantListQuery[] = [];
  const app = setup(t, repositoryReturning({ items: [], nextCursor: null }, calls));
  const response = await app.inject({
    method: "GET",
    url: "/v1/platform/tenants?onboarding_status=not_started",
    headers: adminHeaders(),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{ onboardingStatus: "not_started", limit: 25 }]);
});

test("default-, maximum- en cursorpaginering worden doorgegeven", async (t) => {
  const calls: PlatformTenantListQuery[] = [];
  const app = setup(t, repositoryReturning({ items: [], nextCursor: null }, calls));
  const cursor = "eyJjcmVhdGVkX2F0IjoiMjAyNi0xMC0yOFQxMDowMDowMC4wMDBaIiwiaWQiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEifQ";

  for (const url of ["/v1/platform/tenants", `/v1/platform/tenants?limit=50&cursor=${cursor}`]) {
    const response = await app.inject({ method: "GET", url, headers: adminHeaders() });
    assert.equal(response.statusCode, 200);
  }

  assert.equal(calls[0]?.limit, 25);
  assert.equal(calls[1]?.limit, 50);
  assert.equal(calls[1]?.cursor?.id, tenantA);
});

test("lege lijst geeft een expliciete lege response", async (t) => {
  const app = setup(t, repositoryReturning({ items: [], nextCursor: null }));
  const response = await app.inject({ method: "GET", url: "/v1/platform/tenants", headers: adminHeaders() });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { items: [], next_cursor: null });
});

test("next_cursor wordt alleen vanuit het repositoryresultaat uitgegeven", async (t) => {
  const app = setup(t, repositoryReturning({
    items: [tenantItemA, tenantItemB],
    nextCursor: { createdAt: tenantItemB.createdAt, id: tenantB },
  }));
  const response = await app.inject({ method: "GET", url: "/v1/platform/tenants", headers: adminHeaders() });

  assert.equal(response.statusCode, 200);
  assert.equal(typeof response.json().next_cursor, "string");
  assert.ok(response.json().next_cursor.length > 0);
});

test("malformed query parameters geven 400 en raken de repository niet", async (t) => {
  for (const query of [
    "unknown=value",
    "limit=0",
    "limit=51",
    "limit=1.5",
    "onboarding_status=unknown",
    "cursor=not-a-cursor",
  ]) {
    const calls: PlatformTenantListQuery[] = [];
    const app = setup(t, repositoryReturning({ items: [], nextCursor: null }, calls));
    const response = await app.inject({ method: "GET", url: `/v1/platform/tenants?${query}`, headers: adminHeaders() });

    assert.equal(response.statusCode, 400, query);
    assert.deepEqual(response.json(), { error: "invalid_query" }, query);
    assert.deepEqual(calls, [], query);
  }
});

test("repository failure blijft een generieke fout zonder interne details", async (t) => {
  const logs: string[] = [];
  const app = setup(t, {
    list: async () => { throw new Error(`database failure ${sensitiveFailure}`); },
  }, logs);
  const response = await app.inject({ method: "GET", url: "/v1/platform/tenants", headers: adminHeaders() });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: "internal_error" });
  assert.doesNotMatch(response.body, new RegExp(sensitiveFailure));
  assert.doesNotMatch(logs.join(""), new RegExp(sensitiveFailure));
});

test("een route zonder Platform Admin-hook geeft geen tenantdata terug", async (t) => {
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    return reply.code(500).send({ error: "internal_error" });
  });
  const repository = repositoryReturning({ items: [tenantItemA], nextCursor: null });
  const { registerPlatformTenantRoutes } = await import("./platformTenants.js");
  registerPlatformTenantRoutes(app, { platformTenantRepository: repository });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/v1/platform/tenants" });
  assert.equal(response.statusCode, 500);
  assert.doesNotMatch(response.body, /Synthetic Alpha|tenant/);
});

function mutationRepositoryReturning(
  calls: Array<{ action: string; input: unknown }>,
): PlatformTenantMutationRepository {
  return {
    create: async (input) => {
      calls.push({ action: "create", input });
      return { ...mutationItem, name: input.name, status: "pending" };
    },
    rename: async (input) => {
      calls.push({ action: "rename", input });
      return { ...mutationItem, id: input.tenantId, name: input.name };
    },
    disable: async (input) => {
      calls.push({ action: "disable", input });
      return {
        ...mutationItem,
        id: input.tenantId,
        status: "disabled",
        disabledAt: new Date("2026-10-29T10:00:00.000Z"),
        purgeAfterAt: new Date("2027-04-27T10:00:00.000Z"),
      };
    },
    reactivate: async (input) => {
      calls.push({ action: "reactivate", input });
      return { ...mutationItem, id: input.tenantId };
    },
  };
}

test("Platform Admin kan een tenant aanmaken met pending-status", async (t) => {
  const calls: Array<{ action: string; input: unknown }> = [];
  const app = setup(t, undefined, undefined, mutationRepositoryReturning(calls));
  const response = await app.inject({
    method: "POST",
    url: "/v1/platform/tenants",
    headers: adminHeaders({ "content-type": "application/json" }),
    payload: { name: "  New Client  " },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().name, "New Client");
  assert.equal(response.json().status, "pending");
  assert.deepEqual(calls, [{ action: "create", input: { name: "New Client" } }]);
});

test("tenantmutaties weigeren ongeldige bodies en ongeldige IDs", async (t) => {
  const calls: Array<{ action: string; input: unknown }> = [];
  const app = setup(t, undefined, undefined, mutationRepositoryReturning(calls));

  const invalidBody = await app.inject({
    method: "POST",
    url: "/v1/platform/tenants",
    headers: adminHeaders({ "content-type": "application/json" }),
    payload: { name: "   ", unexpected: true },
  });
  const invalidId = await app.inject({
    method: "POST",
    url: "/v1/platform/tenants/not-a-uuid/disable",
    headers: adminHeaders(),
  });

  assert.equal(invalidBody.statusCode, 400);
  assert.deepEqual(invalidBody.json(), { error: "invalid_body" });
  assert.equal(invalidId.statusCode, 400);
  assert.deepEqual(invalidId.json(), { error: "invalid_tenant_id" });
  assert.deepEqual(calls, []);
});

test("disable en reactivate gebruiken de Platform Admin actor en zijn idempotent op repository-niveau", async (t) => {
  const calls: Array<{ action: string; input: unknown }> = [];
  const app = setup(t, undefined, undefined, mutationRepositoryReturning(calls));

  const disabled = await app.inject({
    method: "POST",
    url: `/v1/platform/tenants/${tenantA}/disable`,
    headers: adminHeaders(),
  });
  const reactivated = await app.inject({
    method: "POST",
    url: `/v1/platform/tenants/${tenantA}/reactivate`,
    headers: adminHeaders(),
  });

  assert.equal(disabled.statusCode, 200);
  assert.equal(disabled.json().purge_after_at, "2027-04-27T10:00:00.000Z");
  assert.equal(reactivated.statusCode, 200);
  assert.deepEqual(calls, [
    { action: "disable", input: { tenantId: tenantA, actorUserId: platformAdminUserId } },
    { action: "reactivate", input: { tenantId: tenantA } },
  ]);
});

test("customer en anonieme gebruiker krijgen geen tenantmutaties", async (t) => {
  const calls: Array<{ action: string; input: unknown }> = [];
  for (const identity of [undefined, "customer"]) {
    const app = setup(t, undefined, undefined, mutationRepositoryReturning(calls));
    const response = await app.inject({
      method: "POST",
      url: "/v1/platform/tenants",
      headers: identity === undefined
        ? { "content-type": "application/json" }
        : adminHeaders({ [TEST_IDENTITY_HEADER]: identity, "content-type": "application/json" }),
      payload: { name: "Not allowed" },
    });

    assert.equal(response.statusCode, identity === undefined ? 401 : 403);
    assert.deepEqual(response.json(), { error: identity === undefined ? "unauthorized" : "forbidden" });
  }
  assert.deepEqual(calls, []);
});
