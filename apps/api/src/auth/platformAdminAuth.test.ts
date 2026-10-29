import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { buildApp, type AppDependencies } from "../app.js";
import type {
  AuthAdapter,
  ExternalIdentity,
  MembershipResolver,
  PlatformAdminAssignment,
  PlatformAdminAssignmentResolver,
} from "./types.js";
import { resolvePlatformAdminContext } from "./platformAdminContext.js";
import type { TenantLoader } from "../tenants/tenantLoader.js";
import type { LeadCreator } from "../routes/leads.js";
import type { OnboardingStore } from "../routes/onboarding.js";

const TEST_IDENTITY_HEADER = "x-test-identity";
const subject = "platform-admin-subject";
const internalUserId = "platform-user-id";

const testAuthAdapter: AuthAdapter = {
  authenticate: async (request) => {
    const value = request.headers[TEST_IDENTITY_HEADER];
    if (value === undefined) return { status: "anonymous" };
    if (typeof value !== "string" || value === "invalid") return { status: "invalid", reason: "test" };
    return { status: "authenticated", identity: { issuer: "https://issuer.test", subject: value, assurance: { level: "aal2" } } };
  },
};

const unusedOnboardingStore: OnboardingStore = {
  findCurrent: async () => {
    throw new Error("not used in platform context tests");
  },
  saveDraft: async () => {
    throw new Error("not used in platform context tests");
  },
  submit: async () => {
    throw new Error("not used in platform context tests");
  },
};

const unusedReviewStore: AppDependencies["reviewStore"] = {
  findReviewable: async () => null,
  readContent: async () => ({ status: "not_found" }),
  requestChanges: async () => {
    throw new Error("not used in platform context tests");
  },
  block: async () => {
    throw new Error("not used in platform context tests");
  },
  unblock: async () => {
    throw new Error("not used in platform context tests");
  },
  approve: async () => {
    throw new Error("not used in platform context tests");
  },
  reopen: async () => {
    throw new Error("not used in platform context tests");
  },
};

const emptyMembershipResolver: MembershipResolver = async () => [];
const unusedTenantLoader: TenantLoader = async () => null;
const unusedLeadCreator: LeadCreator = async () => {
  throw new Error("not used in platform context tests");
};

function setup(
  t: TestContext,
  platformAdminAssignmentResolver: PlatformAdminAssignmentResolver,
  authAdapter: AuthAdapter = testAuthAdapter,
  logs?: string[],
) {
  const app = buildApp(
    {
      authAdapter,
      membershipResolver: emptyMembershipResolver,
      reviewerAssignmentResolver: async () => [],
      platformAdminAssignmentResolver,
      tenantLoader: unusedTenantLoader,
      leadCreator: unusedLeadCreator,
      onboardingStore: unusedOnboardingStore,
      reviewStore: unusedReviewStore,
    },
    logs === undefined
      ? { logger: false }
      : { logger: { level: "info", stream: { write: (line: string) => logs.push(line) } } },
  );
  t.after(() => app.close());
  return app;
}

function resolverFor(assignments: readonly PlatformAdminAssignment[]): PlatformAdminAssignmentResolver {
  return { resolve: async () => assignments };
}

function activeGrant(): PlatformAdminAssignment {
  return { userId: internalUserId, permission: "platform_admin" };
}

test("resolvePlatformAdminContext accepteert precies één actieve platform grant", () => {
  assert.deepEqual(resolvePlatformAdminContext([activeGrant()]), {
    status: "success",
    context: { userId: internalUserId, role: "platform_admin" },
  });
  assert.deepEqual(resolvePlatformAdminContext([]), { status: "forbidden" });
});

test("resolvePlatformAdminContext faalt gesloten bij meerdere actieve of malformed grants", () => {
  assert.deepEqual(resolvePlatformAdminContext([activeGrant(), activeGrant()]), { status: "forbidden" });
  assert.deepEqual(
    resolvePlatformAdminContext([activeGrant(), { userId: internalUserId, permission: "wrong" } as never]),
    { status: "forbidden" },
  );
  assert.deepEqual(resolvePlatformAdminContext([null as never]), { status: "forbidden" });
  assert.deepEqual(resolvePlatformAdminContext(null), { status: "forbidden" });
});

test("platform context zonder authenticatie geeft 401 en geen identiteit terug", async (t) => {
  const app = setup(t, resolverFor([activeGrant()]));

  const response = await app.inject({ method: "GET", url: "/v1/platform/context" });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: "unauthorized" });
  assert.equal(response.headers["cache-control"], "no-store");
  assert.doesNotMatch(response.body, /platform-admin-subject|platform-user-id/);
});

test("platform context zonder actieve platform grant geeft generiek 403 zonder membershipfallback", async (t) => {
  const app = setup(t, resolverFor([]));

  const response = await app.inject({
    method: "GET",
    url: "/v1/platform/context",
    headers: { [TEST_IDENTITY_HEADER]: subject },
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "forbidden" });
  assert.equal(response.headers["cache-control"], "no-store");
  assert.doesNotMatch(response.body, /platform-admin-subject|platform-user-id/);
});

test("platform context geeft alleen de minimale admincontext en negeert x-tenant-id", async (t) => {
  const seenIdentities: ExternalIdentity[] = [];
  const resolver: PlatformAdminAssignmentResolver = {
    resolve: async (identity) => {
      seenIdentities.push(identity);
      return [activeGrant()];
    },
  };
  const app = setup(t, resolver);

  const response = await app.inject({
    method: "GET",
    url: "/v1/platform/context?tenantId=must-not-be-used",
    headers: { [TEST_IDENTITY_HEADER]: subject, "x-tenant-id": "not-a-uuid" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(response.json(), { workspace: "admin", role: "platform_admin" });
  assert.deepEqual(seenIdentities, [{ issuer: "https://issuer.test", subject, assurance: { level: "aal2" } }]);
  assert.doesNotMatch(response.body, /platform-admin-subject|platform-user-id|not-a-uuid/);
});

test("platform context faalt gesloten bij een resolverfout zonder identity leakage", async (t) => {
  const secret = "resolver-secret-subject";
  const logs: string[] = [];
  const resolver: PlatformAdminAssignmentResolver = {
    resolve: async () => {
      throw new Error(`database failure for ${secret}`);
    },
  };
  const app = setup(t, resolver, testAuthAdapter, logs);

  const response = await app.inject({
    method: "GET",
    url: "/v1/platform/context",
    headers: { [TEST_IDENTITY_HEADER]: secret },
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: "internal_error" });
  assert.doesNotMatch(response.body, /database failure|resolver-secret-subject/);
  assert.doesNotMatch(logs.join(""), /database failure|resolver-secret-subject/);
});

test("platform context faalt generiek bij een provider exception zonder identity leakage", async (t) => {
  const secret = "provider-secret-subject";
  const logs: string[] = [];
  const authAdapter: AuthAdapter = {
    authenticate: async () => {
      throw new Error(`provider failure for ${secret}`);
    },
  };
  const app = setup(t, resolverFor([activeGrant()]), authAdapter, logs);

  const response = await app.inject({ method: "GET", url: "/v1/platform/context" });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: "internal_error" });
  assert.doesNotMatch(response.body, /provider failure|provider-secret-subject/);
  assert.doesNotMatch(logs.join(""), /provider failure|provider-secret-subject/);
});

test("platform context weigert meerdere actieve grants en malformed grants via HTTP", async (t) => {
  for (const assignments of [
    [activeGrant(), activeGrant()],
    [{ userId: internalUserId, permission: "unknown" } as never],
  ]) {
    const app = setup(t, resolverFor(assignments));
    const response = await app.inject({
      method: "GET",
      url: "/v1/platform/context",
      headers: { [TEST_IDENTITY_HEADER]: subject },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { error: "forbidden" });
  }
});

test("platform auth-hook zonder routecontext geeft geen beschermde data terug", async (t) => {
  const app = Fastify({ logger: false });
  app.get("/protected", async (request) => {
    // This deliberately bypasses the hook to verify the accessor fails closed.
    const { getPlatformAdminContext } = await import("./platformAdminAuthHook.js");
    return getPlatformAdminContext(request);
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/protected" });

  assert.equal(response.statusCode, 500);
});
