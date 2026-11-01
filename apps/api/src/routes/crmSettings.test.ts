import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { buildApp, type AppDependencies } from "../app.js";
import type { AuthAdapter, Membership } from "../auth/types.js";
import { createDefaultCrmSettings, type CrmSettings } from "../crm/settings.js";
import type { CrmSettingsRepository, PersistedCrmSettings } from "../crm/settingsRepository.js";

const TEST_IDENTITY_HEADER = "x-test-identity";
const tenantA = randomUUID();
const tenantB = randomUUID();

const authAdapter: AuthAdapter = {
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
  admin: [{ userId: "user-admin", tenantId: tenantA, role: "tenant_admin", status: "active" }],
  reader: [{
    userId: "user-reader",
    tenantId: tenantA,
    role: "team_member",
    status: "active",
    teamMemberPermissions: { "crm:read": true },
  }],
  editor: [{
    userId: "user-editor",
    tenantId: tenantA,
    role: "team_member",
    status: "active",
    teamMemberPermissions: { "crm:read": true, "crm:update": true },
  }],
  noAccess: [{ userId: "user-no-access", tenantId: tenantA, role: "team_member", status: "active" }],
  multi: [
    { userId: "user-multi", tenantId: tenantA, role: "owner", status: "active" },
    { userId: "user-multi", tenantId: tenantB, role: "owner", status: "active" },
  ],
};

function persisted(settings: CrmSettings): PersistedCrmSettings {
  const timestamp = new Date("2026-10-31T10:00:00.000Z");
  return { settings, createdAt: timestamp, updatedAt: timestamp };
}

function repository(overrides: Partial<CrmSettingsRepository> = {}): CrmSettingsRepository {
  return {
    get: async () => persisted(createDefaultCrmSettings()),
    update: async ({ settings }) => persisted(settings),
    ...overrides,
  };
}

function dependencies(crmSettingsRepository: CrmSettingsRepository): AppDependencies {
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
    crmSettingsRepository,
  };
}

function setup(t: TestContext, repo: CrmSettingsRepository = repository()) {
  const app = buildApp(dependencies(repo), { logger: false });
  t.after(() => app.close());
  return app;
}

function settingsPayload() {
  return {
    ...createDefaultCrmSettings(),
    timezone: "UTC",
  };
}

test("CRM settings requires authentication and CRM permissions", async (t) => {
  const app = setup(t);

  const anonymous = await app.inject({ method: "GET", url: "/v1/crm/settings" });
  assert.equal(anonymous.statusCode, 401);

  const noAccess = await app.inject({
    method: "GET",
    url: "/v1/crm/settings",
    headers: { [TEST_IDENTITY_HEADER]: "noAccess" },
  });
  assert.equal(noAccess.statusCode, 403);

  const reader = await app.inject({
    method: "GET",
    url: "/v1/crm/settings",
    headers: { [TEST_IDENTITY_HEADER]: "reader" },
  });
  assert.equal(reader.statusCode, 200);

  const readerPatch = await app.inject({
    method: "PATCH",
    url: "/v1/crm/settings",
    headers: { [TEST_IDENTITY_HEADER]: "reader" },
    payload: settingsPayload(),
  });
  assert.equal(readerPatch.statusCode, 403);
});

test("CRM settings uses the selected membership tenant and returns no-store", async (t) => {
  const calls: string[] = [];
  const app = setup(t, repository({
    get: async (tenantId) => {
      calls.push(tenantId);
      return persisted(createDefaultCrmSettings());
    },
  }));

  const response = await app.inject({
    method: "GET",
    url: "/v1/crm/settings",
    headers: { [TEST_IDENTITY_HEADER]: "multi", "x-tenant-id": tenantB },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(calls, [tenantB]);
  assert.equal(response.json().timezone, "Europe/Amsterdam");
});

test("CRM settings PATCH validates the full contract and passes only auth context IDs", async (t) => {
  const updates: Array<{ tenantId: string; actorUserId: string; settings: CrmSettings }> = [];
  const app = setup(t, repository({
    update: async (input) => {
      updates.push(input);
      return persisted(input.settings);
    },
  }));

  const valid = await app.inject({
    method: "PATCH",
    url: "/v1/crm/settings",
    headers: { [TEST_IDENTITY_HEADER]: "editor", "x-tenant-id": tenantB },
    payload: settingsPayload(),
  });
  assert.equal(valid.statusCode, 403);
  assert.deepEqual(updates, []);

  const allowed = await app.inject({
    method: "PATCH",
    url: "/v1/crm/settings",
    headers: { [TEST_IDENTITY_HEADER]: "editor" },
    payload: settingsPayload(),
  });
  assert.equal(allowed.statusCode, 200);
  assert.deepEqual(updates.map(({ tenantId, actorUserId }) => ({ tenantId, actorUserId })), [
    { tenantId: tenantA, actorUserId: "user-editor" },
  ]);

  for (const payload of [
    { ...settingsPayload(), unknown: true },
    { ...settingsPayload(), timezone: "Not/AZone" },
    { ...settingsPayload(), leadSources: [] },
    { timezone: "UTC" },
  ]) {
    const invalid = await app.inject({
      method: "PATCH",
      url: "/v1/crm/settings",
      headers: { [TEST_IDENTITY_HEADER]: "editor" },
      payload,
    });
    assert.equal(invalid.statusCode, 400);
  }
  assert.equal(updates.length, 1);
});

test("CRM settings repository errors do not leak details", async (t) => {
  const app = setup(t, repository({ get: async () => { throw new Error("secret tenant settings"); } }));
  const response = await app.inject({
    method: "GET",
    url: "/v1/crm/settings",
    headers: { [TEST_IDENTITY_HEADER]: "owner" },
  });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: "internal_error" });
  assert.ok(!response.body.includes("secret tenant settings"));
});
