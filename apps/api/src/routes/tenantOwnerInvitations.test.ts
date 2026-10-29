import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import { createIdentityOnlyAuthHook } from "../auth/identityOnlyAuthHook.js";
import { createPlatformAdminAuthHook } from "../auth/platformAdminAuthHook.js";
import type { AuthAdapter, PlatformAdminAssignmentResolver } from "../auth/types.js";
import { apiErrorHandler } from "../errors.js";
import { TenantOwnerInvitationError, type TenantOwnerInvitationRepository } from "../platform/tenantOwnerInvitationRepository.js";
import {
  registerPlatformTenantOwnerInvitationRoutes,
  registerTenantOwnerInvitationAcceptanceRoutes,
} from "./tenantOwnerInvitations.js";

const TEST_IDENTITY_HEADER = "x-test-identity";
const PLATFORM_SUBJECT = "platform-admin";
const tenantA = "00000000-0000-4000-8000-000000000001";
const tenantB = "00000000-0000-4000-8000-000000000002";
const token = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN12_";
const expiresAt = new Date("2026-11-05T10:00:00.000Z");

const authAdapter: AuthAdapter = {
  authenticate: async (request) => {
    const value = request.headers[TEST_IDENTITY_HEADER];
    if (value === undefined) return { status: "anonymous" };
    if (typeof value !== "string" || value === "invalid") return { status: "invalid", reason: "test" };
    return {
      status: "authenticated",
      identity: { issuer: "https://issuer.test", subject: value, assurance: { level: value === "weak" ? "insufficient" : "aal2" } },
    };
  },
};

const platformAdminAssignmentResolver: PlatformAdminAssignmentResolver = {
  resolve: async (identity) => identity.subject === PLATFORM_SUBJECT
    ? [{ userId: "00000000-0000-4000-8000-000000000099", permission: "platform_admin" }]
    : [],
};

function setup(
  t: TestContext,
  repository: TenantOwnerInvitationRepository,
) {
  const app = Fastify({ logger: false });
  app.setErrorHandler(apiErrorHandler);
  app.register(async (platformApp) => {
    platformApp.addHook("onRequest", createPlatformAdminAuthHook({ authAdapter, platformAdminAssignmentResolver }));
    registerPlatformTenantOwnerInvitationRoutes(platformApp, { tenantOwnerInvitationRepository: repository });
  });
  app.register(async (acceptanceApp) => {
    acceptanceApp.addHook("onRequest", createIdentityOnlyAuthHook({ authAdapter }));
    registerTenantOwnerInvitationAcceptanceRoutes(acceptanceApp, { tenantOwnerInvitationRepository: repository });
  });
  t.after(() => app.close());
  return app;
}

function adminHeaders() {
  return { [TEST_IDENTITY_HEADER]: PLATFORM_SUBJECT };
}

test("Platform Admin maakt een genormaliseerde handmatige invite-link zonder token in de API-route", async (t) => {
  const calls: { tenantId: string; email: string; createdBy: string }[] = [];
  const repository: TenantOwnerInvitationRepository = {
    create: async (input) => {
      calls.push(input);
      return {
        id: "00000000-0000-4000-8000-000000000010",
        tenantId: input.tenantId,
        tenantName: "Alpha",
        email: input.email,
        expiresAt,
        token,
      };
    },
    accept: async () => ({ tenantId: tenantA, tenantName: "Alpha", userId: "00000000-0000-4000-8000-000000000011" }),
  };

  const response = await setup(t, repository).inject({
    method: "POST",
    url: `/v1/platform/tenants/${tenantA}/invitations`,
    headers: adminHeaders(),
    payload: { email: "  OWNER@Example.COM " },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(calls, [{ tenantId: tenantA, email: "owner@example.com", createdBy: "00000000-0000-4000-8000-000000000099" }]);
  assert.deepEqual(response.json(), {
    id: "00000000-0000-4000-8000-000000000010",
    tenant_id: tenantA,
    tenant_name: "Alpha",
    email: "owner@example.com",
    status: "pending",
    expires_at: expiresAt.toISOString(),
    invite_url: `/invite#${token}`,
  });
  assert.equal(response.headers["cache-control"], "no-store");
  assert.doesNotMatch(response.body, /token_hash|sha256/i);
});

test("create valideert tenant/body en negeert x-tenant-id voor Platform Admin", async (t) => {
  const calls: string[] = [];
  const repository: TenantOwnerInvitationRepository = {
    create: async (input) => {
      calls.push(input.tenantId);
      return { id: "id", tenantId: input.tenantId, tenantName: "Alpha", email: input.email, expiresAt, token };
    },
    accept: async () => ({ tenantId: tenantA, tenantName: "Alpha", userId: "user" }),
  };
  const app = setup(t, repository);

  const invalidTenant = await app.inject({
    method: "POST",
    url: "/v1/platform/tenants/not-a-uuid/invitations",
    headers: adminHeaders(),
    payload: { email: "owner@example.com" },
  });
  const invalidBody = await app.inject({
    method: "POST",
    url: `/v1/platform/tenants/${tenantA}/invitations`,
    headers: { ...adminHeaders(), "x-tenant-id": tenantB },
    payload: { email: "not-an-email", extra: true },
  });

  assert.equal(invalidTenant.statusCode, 400);
  assert.equal(invalidBody.statusCode, 400);
  assert.deepEqual(calls, []);
});

test("accept gebruikt de identity-only scope, maakt geen membershipfallback en accepteert een invite één keer", async (t) => {
  const calls: { token: string; subject: string }[] = [];
  let accepted = false;
  const repository: TenantOwnerInvitationRepository = {
    create: async () => ({ id: "id", tenantId: tenantA, tenantName: "Alpha", email: "owner@example.com", expiresAt, token }),
    accept: async ({ token: receivedToken, identity }) => {
      calls.push({ token: receivedToken, subject: identity.subject });
      if (accepted) throw new TenantOwnerInvitationError("invitation_accepted");
      accepted = true;
      return { tenantId: tenantA, tenantName: "Alpha", userId: "user" };
    },
  };
  const app = setup(t, repository);

  const first = await app.inject({
    method: "POST",
    url: "/v1/invitations/accept",
    headers: { [TEST_IDENTITY_HEADER]: "brand-new-subject" },
    payload: { token },
  });
  const second = await app.inject({
    method: "POST",
    url: "/v1/invitations/accept",
    headers: { [TEST_IDENTITY_HEADER]: "brand-new-subject" },
    payload: { token },
  });

  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json(), { status: "accepted", tenant_id: tenantA, tenant_name: "Alpha" });
  assert.equal(second.statusCode, 410);
  assert.deepEqual(second.json(), { error: "invitation_unavailable" });
  assert.deepEqual(calls, [
    { token, subject: "brand-new-subject" },
    { token, subject: "brand-new-subject" },
  ]);
});

test("accept weigert ontbrekende, zwakke of ongeldig gevormde requests vóór de repository", async (t) => {
  let calls = 0;
  const repository: TenantOwnerInvitationRepository = {
    create: async () => ({ id: "id", tenantId: tenantA, tenantName: "Alpha", email: "owner@example.com", expiresAt, token }),
    accept: async () => {
      calls += 1;
      return { tenantId: tenantA, tenantName: "Alpha", userId: "user" };
    },
  };
  const app = setup(t, repository);

  const anonymous = await app.inject({ method: "POST", url: "/v1/invitations/accept", payload: { token } });
  const weak = await app.inject({ method: "POST", url: "/v1/invitations/accept", headers: { [TEST_IDENTITY_HEADER]: "weak" }, payload: { token } });
  const invalidToken = await app.inject({ method: "POST", url: "/v1/invitations/accept", headers: { [TEST_IDENTITY_HEADER]: "new-user" }, payload: { token: "short" } });

  assert.equal(anonymous.statusCode, 401);
  assert.equal(weak.statusCode, 403);
  assert.equal(invalidToken.statusCode, 400);
  assert.equal(calls, 0);
});

test("accept maskeert verlopen/revoked/disabled statussen en lekt geen foutdetails", async (t) => {
  const repository: TenantOwnerInvitationRepository = {
    create: async () => ({ id: "id", tenantId: tenantA, tenantName: "Alpha", email: "owner@example.com", expiresAt, token }),
    accept: async () => { throw new TenantOwnerInvitationError("invitation_expired"); },
  };
  const app = setup(t, repository);

  const response = await app.inject({
    method: "POST",
    url: "/v1/invitations/accept",
    headers: { [TEST_IDENTITY_HEADER]: "new-user" },
    payload: { token },
  });

  assert.equal(response.statusCode, 410);
  assert.deepEqual(response.json(), { error: "invitation_unavailable" });
  assert.doesNotMatch(response.body, /expired|tenant|token|database/i);
});
