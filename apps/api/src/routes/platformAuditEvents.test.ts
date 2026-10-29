import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { createPlatformAdminAuthHook } from "../auth/platformAdminAuthHook.js";
import type { AuthAdapter, PlatformAdminAssignmentResolver } from "../auth/types.js";
import { apiErrorHandler } from "../errors.js";
import {
  registerPlatformAuditEventRoutes,
  parsePlatformAuditEventListQuery,
} from "./platformAuditEvents.js";
import type {
  PlatformAuditEventListQuery,
  PlatformAuditEventListResult,
  PlatformAuditEventRepository,
} from "../platform/platformAuditEventRepository.js";

const TEST_IDENTITY_HEADER = "x-test-identity";
const subject = "platform-admin-subject";
const tenantA = "00000000-0000-4000-8000-000000000001";
const tenantB = "00000000-0000-4000-8000-000000000002";
const eventA = "00000000-0000-4000-8000-000000000011";
const projectA = "00000000-0000-4000-8000-000000000021";
const actorA = "00000000-0000-4000-8000-000000000031";
const sensitiveFailure = "database-secret-audit-detail";

const auditItem = {
  id: eventA,
  tenantId: tenantA,
  projectId: projectA,
  eventType: "submitted" as const,
  fromStatus: "draft" as const,
  toStatus: "submitted" as const,
  version: 2,
  actorType: "member" as const,
  actorId: actorA,
  createdAt: new Date("2026-10-29T09:00:00.000Z"),
  requestOrCorrelationId: null,
};

const accessItem = {
  id: "00000000-0000-4000-8000-000000000012",
  tenantId: tenantB,
  projectId: "00000000-0000-4000-8000-000000000022",
  eventType: "read_onboarding_content" as const,
  fromStatus: null,
  toStatus: null,
  version: 3,
  actorType: "reviewer" as const,
  actorId: "00000000-0000-4000-8000-000000000032",
  createdAt: new Date("2026-10-29T08:00:00.000Z"),
  requestOrCorrelationId: "req-review-1",
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

function repositoryReturning(result: PlatformAuditEventListResult, calls: PlatformAuditEventListQuery[] = []): PlatformAuditEventRepository {
  return {
    list: async (query) => {
      calls.push(query);
      return result;
    },
  };
}

function setup(
  t: TestContext,
  repository: PlatformAuditEventRepository = repositoryReturning({ items: [auditItem], nextCursor: null }),
  logs?: string[],
): FastifyInstance {
  const app = Fastify(
    logs === undefined
      ? { logger: false }
      : { logger: { level: "info", stream: { write: (line: string) => logs.push(line) } } },
  );
  app.setErrorHandler(apiErrorHandler);
  app.addHook("onRequest", createPlatformAdminAuthHook({
    authAdapter: testAuthAdapter,
    platformAdminAssignmentResolver: testPlatformResolver,
  }));
  registerPlatformAuditEventRoutes(app, { platformAuditEventRepository: repository });
  t.after(() => app.close());
  return app;
}

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { [TEST_IDENTITY_HEADER]: subject, ...extra };
}

test("Platform Admin krijgt alleen veilige auditmetadata en no-store", async (t) => {
  const app = setup(t, repositoryReturning({ items: [auditItem, accessItem], nextCursor: null }));
  const response = await app.inject({ method: "GET", url: "/v1/platform/audit-events", headers: adminHeaders() });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(response.json(), {
    items: [
      {
        id: eventA,
        tenant_id: tenantA,
        project_id: projectA,
        event_type: "submitted",
        from_status: "draft",
        to_status: "submitted",
        version: 2,
        actor_type: "member",
        actor_id: actorA,
        created_at: "2026-10-29T09:00:00.000Z",
        request_or_correlation_id: null,
      },
      {
        id: accessItem.id,
        tenant_id: tenantB,
        project_id: accessItem.projectId,
        event_type: "read_onboarding_content",
        from_status: null,
        to_status: null,
        version: 3,
        actor_type: "reviewer",
        actor_id: accessItem.actorId,
        created_at: "2026-10-29T08:00:00.000Z",
        request_or_correlation_id: "req-review-1",
      },
    ],
    next_cursor: null,
  });
  assert.doesNotMatch(response.body, /answers|projectBrief|reviewNote|reason|token|authProviderUserId/i);
});

test("anonieme en niet-geautoriseerde identities krijgen geen auditdata", async (t) => {
  for (const identity of [undefined, "customer", "reviewer", "revoked"]) {
    const calls: PlatformAuditEventListQuery[] = [];
    const app = setup(t, repositoryReturning({ items: [auditItem], nextCursor: null }, calls));
    const response = await app.inject({
      method: "GET",
      url: "/v1/platform/audit-events",
      headers: identity === undefined ? {} : { [TEST_IDENTITY_HEADER]: identity },
    });

    assert.equal(response.statusCode, identity === undefined ? 401 : 403, identity ?? "anonymous");
    assert.deepEqual(response.json(), { error: identity === undefined ? "unauthorized" : "forbidden" });
    assert.deepEqual(calls, []);
  }
});

test("x-tenant-id is geen scopebron voor een Platform Admin-auditquery", async (t) => {
  const calls: PlatformAuditEventListQuery[] = [];
  const app = setup(t, repositoryReturning({ items: [auditItem], nextCursor: null }, calls));
  const response = await app.inject({
    method: "GET",
    url: "/v1/platform/audit-events",
    headers: adminHeaders({ "x-tenant-id": tenantB }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal("tenantId" in calls[0]!, false);
});

test("filters worden server-side gevalideerd en doorgestuurd", async (t) => {
  const calls: PlatformAuditEventListQuery[] = [];
  const app = setup(t, repositoryReturning({ items: [], nextCursor: null }, calls));
  const response = await app.inject({
    method: "GET",
    url: `/v1/platform/audit-events?tenant_id=${tenantA}&event_type=submitted&from=2026-10-01T00:00:00.000Z&to=2026-10-29T23:59:59.999Z&limit=10`,
    headers: adminHeaders(),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{
    tenantId: tenantA,
    eventType: "submitted",
    from: new Date("2026-10-01T00:00:00.000Z"),
    to: new Date("2026-10-29T23:59:59.999Z"),
    limit: 10,
  }]);
});

test("malformed filters geven 400 en raken de repository niet", async (t) => {
  for (const query of [
    "unknown=value",
    "tenant_id=not-a-uuid",
    "event_type=made-up",
    "from=not-a-date",
    "to=not-a-date",
    "from=2026-11-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z",
    "limit=0",
    "limit=51",
    "cursor=not-a-cursor",
  ]) {
    const calls: PlatformAuditEventListQuery[] = [];
    const app = setup(t, repositoryReturning({ items: [], nextCursor: null }, calls));
    const response = await app.inject({ method: "GET", url: `/v1/platform/audit-events?${query}`, headers: adminHeaders() });

    assert.equal(response.statusCode, 400, query);
    assert.deepEqual(response.json(), { error: "invalid_query" }, query);
    assert.deepEqual(calls, [], query);
  }
});

test("repository failure blijft generiek en lekt geen interne details", async (t) => {
  const logs: string[] = [];
  const app = setup(t, {
    list: async () => { throw new Error(`${sensitiveFailure}`); },
  }, logs);
  const response = await app.inject({ method: "GET", url: "/v1/platform/audit-events", headers: adminHeaders() });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: "internal_error" });
  assert.equal(response.headers["cache-control"], "no-store");
  assert.doesNotMatch(response.body, new RegExp(sensitiveFailure));
  assert.doesNotMatch(logs.join(""), new RegExp(sensitiveFailure));
});

test("een route zonder Platform Admin-hook faalt gesloten", async (t) => {
  const app = Fastify({ logger: false });
  app.setErrorHandler(apiErrorHandler);
  registerPlatformAuditEventRoutes(app, { platformAuditEventRepository: repositoryReturning({ items: [auditItem], nextCursor: null }) });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/v1/platform/audit-events" });
  assert.equal(response.statusCode, 500);
  assert.doesNotMatch(response.body, /Synthetic|answers|projectBrief/i);
});

test("query parser gebruikt de standaardlimiet en accepteert reviewerinzage-events", () => {
  assert.deepEqual(parsePlatformAuditEventListQuery({ event_type: "read_onboarding_content" }), {
    eventType: "read_onboarding_content",
    limit: 25,
  });
});
