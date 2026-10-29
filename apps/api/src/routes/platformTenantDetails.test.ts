import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import { createPlatformAdminAuthHook } from "../auth/platformAdminAuthHook.js";
import type { AuthAdapter, PlatformAdminAssignmentResolver } from "../auth/types.js";
import { apiErrorHandler } from "../errors.js";
import type { PlatformTenantDetail, PlatformTenantDetailRepository } from "../platform/platformTenantDetailRepository.js";
import { registerPlatformTenantDetailRoutes } from "./platformTenantDetails.js";

const TEST_IDENTITY_HEADER = "x-test-identity";
const subject = "platform-admin-subject";
const tenantA = "00000000-0000-4000-8000-000000000001";
const tenantB = "00000000-0000-4000-8000-000000000002";
const sensitiveFailure = "synthetic-detail-database-secret";

const detail: PlatformTenantDetail = {
  id: tenantA,
  name: "Synthetic Alpha",
  status: "active",
  createdAt: new Date("2026-10-28T10:00:00.000Z"),
  onboarding: {
    status: "submitted",
    version: 2,
    updatedAt: new Date("2026-10-28T11:00:00.000Z"),
  },
  websiteSummary: { total: 2, active: 1 },
};

const authAdapter: AuthAdapter = {
  authenticate: async (request) => {
    const value = request.headers[TEST_IDENTITY_HEADER];
    if (value === undefined) return { status: "anonymous" };
    if (typeof value !== "string" || value === "invalid") return { status: "invalid", reason: "test" };
    return { status: "authenticated", identity: { issuer: "https://issuer.test", subject: value, assurance: { level: "aal2" } } };
  },
};

const assignmentResolver: PlatformAdminAssignmentResolver = {
  resolve: async (identity) => identity.subject === subject
    ? [{ userId: "00000000-0000-4000-8000-000000000099", permission: "platform_admin" }]
    : [],
};

function setup(
  t: TestContext,
  repository: PlatformTenantDetailRepository,
  logs: string[] = [],
) {
  const app = Fastify({
    logger: { level: "info", stream: { write: (line: string) => logs.push(line) } },
  });
  app.setErrorHandler(apiErrorHandler);
  app.addHook("onRequest", createPlatformAdminAuthHook({
    authAdapter,
    platformAdminAssignmentResolver: assignmentResolver,
  }));
  registerPlatformTenantDetailRoutes(app, { platformTenantDetailRepository: repository });
  t.after(() => app.close());
  return app;
}

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { [TEST_IDENTITY_HEADER]: subject, ...extra };
}

test("geeft alleen het read-only detailcontract terug en negeert x-tenant-id", async (t) => {
  const calls: string[] = [];
  const app = setup(t, {
    findById: async (tenantId) => {
      calls.push(tenantId);
      return detail;
    },
  });

  const response = await app.inject({
    method: "GET",
    url: `/v1/platform/tenants/${tenantA}`,
    headers: adminHeaders({ "x-tenant-id": tenantB }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(response.json(), {
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
  });
  assert.deepEqual(calls, [tenantA]);
  assert.doesNotMatch(response.body, /answers|projectBrief|memberships|leads|authProviderUserId|token|preview/i);
});

test("anonymous en niet-geautoriseerde identities krijgen 401 of 403 zonder repositorycall", async (t) => {
  const calls: string[] = [];
  const repository: PlatformTenantDetailRepository = {
    findById: async (tenantId) => {
      calls.push(tenantId);
      return detail;
    },
  };
  const app = setup(t, repository);

  const anonymous = await app.inject({ method: "GET", url: `/v1/platform/tenants/${tenantA}` });
  const forbidden = await app.inject({
    method: "GET",
    url: `/v1/platform/tenants/${tenantA}`,
    headers: { [TEST_IDENTITY_HEADER]: "customer" },
  });

  assert.equal(anonymous.statusCode, 401);
  assert.equal(forbidden.statusCode, 403);
  assert.deepEqual(calls, []);
  assert.equal(anonymous.headers["cache-control"], "no-store");
  assert.equal(forbidden.headers["cache-control"], "no-store");
});

test("valideert de tenant-ID uit het pad en geeft ontbrekende tenants als 404", async (t) => {
  const calls: string[] = [];
  const app = setup(t, {
    findById: async (tenantId) => {
      calls.push(tenantId);
      return null;
    },
  });

  const invalid = await app.inject({
    method: "GET",
    url: "/v1/platform/tenants/not-a-uuid",
    headers: adminHeaders(),
  });
  const missing = await app.inject({
    method: "GET",
    url: `/v1/platform/tenants/${tenantB}`,
    headers: adminHeaders(),
  });

  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(invalid.json(), { error: "invalid_tenant_id" });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.json(), { error: "not_found" });
  assert.deepEqual(calls, [tenantB]);
  assert.equal(invalid.headers["cache-control"], "no-store");
  assert.equal(missing.headers["cache-control"], "no-store");
});

test("repositoryfouten zijn generiek en lekken geen databasegegevens", async (t) => {
  const logs: string[] = [];
  const app = setup(t, {
    findById: async () => { throw new Error(`database failure ${sensitiveFailure}`); },
  }, logs);

  const response = await app.inject({
    method: "GET",
    url: `/v1/platform/tenants/${tenantA}`,
    headers: adminHeaders(),
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: "internal_error" });
  assert.doesNotMatch(response.body, new RegExp(sensitiveFailure));
  assert.doesNotMatch(logs.join(""), new RegExp(sensitiveFailure));
  assert.equal(response.headers["cache-control"], "no-store");
});

test("een route zonder Platform Admin-hook geeft geen tenantdetail terug", async (t) => {
  const app = Fastify({ logger: false });
  app.setErrorHandler(apiErrorHandler);
  registerPlatformTenantDetailRoutes(app, {
    platformTenantDetailRepository: { findById: async () => detail },
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: `/v1/platform/tenants/${tenantA}` });
  assert.equal(response.statusCode, 500);
  assert.doesNotMatch(response.body, /Synthetic Alpha|tenantA/);
});
