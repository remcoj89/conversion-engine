import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { buildApp, type AppDependencies } from "../app.js";
import type { AuthAdapter, Membership } from "../auth/types.js";
import type {
  Organization,
  OrganizationContactRepository,
} from "../crm/organizationContactRepository.js";

const TEST_IDENTITY_HEADER = "x-test-identity";
const tenantA = randomUUID();
const tenantB = randomUUID();
const organizationA = randomUUID();
const createdAt = new Date("2026-10-31T09:00:00.000Z");

const authAdapter: AuthAdapter = {
  authenticate: async (request) => {
    const subject = request.headers[TEST_IDENTITY_HEADER];
    if (subject === undefined) return { status: "anonymous" };
    if (typeof subject !== "string" || subject === "invalid") return { status: "invalid", reason: "test" };
    return { status: "authenticated", identity: { issuer: "https://issuer.test", subject, assurance: { level: "aal2" } } };
  },
};

const memberships: Record<string, readonly Membership[]> = {
  owner: [{ userId: "user-owner", tenantId: tenantA, role: "owner", status: "active" }],
  team: [{ userId: "user-team", tenantId: tenantA, role: "team_member", status: "active" }],
  multi: [
    { userId: "user-multi", tenantId: tenantA, role: "owner", status: "active" },
    { userId: "user-multi", tenantId: tenantB, role: "owner", status: "active" },
  ],
};

const organization = (id: string, tenantId: string, status: "active" | "archived" = "active"): Organization => ({
  id,
  tenantId,
  name: tenantId === tenantA ? "Tenant A BV" : "Tenant B BV",
  kvkNumber: null,
  website: null,
  generalEmail: null,
  generalPhone: null,
  address: null,
  industry: null,
  notes: null,
  status,
  createdAt,
  updatedAt: createdAt,
});

function repository(overrides: Partial<OrganizationContactRepository> = {}): OrganizationContactRepository {
  return {
    listOrganizations: async () => [],
    createOrganization: async (input) => ({ ...organization(randomUUID(), input.tenantId), name: input.name }),
    findOrganization: async () => null,
    updateOrganization: async () => null,
    archiveOrganization: async () => null,
    listContacts: async () => [],
    createContact: async () => { throw new Error("not used"); },
    findContact: async () => null,
    updateContact: async () => null,
    archiveContact: async () => null,
    ...overrides,
  };
}

function dependencies(organizationContactRepository: OrganizationContactRepository): AppDependencies {
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
    organizationContactRepository,
  };
}

function setup(t: TestContext, repo: OrganizationContactRepository) {
  const app = buildApp(dependencies(repo), { logger: false });
  t.after(() => app.close());
  return app;
}

const ownerHeaders = { [TEST_IDENTITY_HEADER]: "owner" };

test("organizations routes require auth and fail closed for Team members", async (t) => {
  const app = setup(t, repository());
  const anonymous = await app.inject({ method: "GET", url: "/v1/organizations" });
  assert.equal(anonymous.statusCode, 401);
  assert.deepEqual(anonymous.json(), { error: "unauthorized" });

  const teamMember = await app.inject({
    method: "GET",
    url: "/v1/organizations",
    headers: { [TEST_IDENTITY_HEADER]: "team" },
  });
  assert.equal(teamMember.statusCode, 403);
  assert.deepEqual(teamMember.json(), { error: "forbidden" });
});

test("GET organizations uses only the selected auth tenant and validates include_archived", async (t) => {
  const calls: Array<{ tenantId: string; includeArchived?: boolean }> = [];
  const app = setup(t, repository({
    listOrganizations: async (tenantId, options) => {
      calls.push({ tenantId, ...options });
      return [organization(organizationA, tenantId)];
    },
  }));

  const response = await app.inject({
    method: "GET",
    url: "/v1/organizations?include_archived=true",
    headers: { [TEST_IDENTITY_HEADER]: "multi", "x-tenant-id": tenantB },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().items[0].name, "Tenant B BV");
  assert.deepEqual(calls, [{ tenantId: tenantB, includeArchived: true }]);

  const invalid = await app.inject({
    method: "GET",
    url: "/v1/organizations?include_archived=yes",
    headers: ownerHeaders,
  });
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(invalid.json(), { error: "invalid_query" });
});

test("organization CRUD validates input, archives and hides cross-tenant records", async (t) => {
  let archived = false;
  const app = setup(t, repository({
    createOrganization: async (input) => ({ ...organization(organizationA, input.tenantId), name: input.name }),
    findOrganization: async (tenantId, id) => id === organizationA && tenantId === tenantA ? organization(organizationA, tenantA) : null,
    updateOrganization: async (input) => input.organizationId === organizationA && input.tenantId === tenantA
      ? { ...organization(organizationA, tenantA), name: input.name ?? "Bijgewerkt" }
      : null,
    archiveOrganization: async (tenantId, id) => {
      if (tenantId !== tenantA || id !== organizationA) return null;
      archived = true;
      return organization(organizationA, tenantA, "archived");
    },
  }));

  const created = await app.inject({
    method: "POST",
    url: "/v1/organizations",
    headers: ownerHeaders,
    payload: { name: " Nieuwe Organisatie ", tenant_id: tenantA },
  });
  assert.equal(created.statusCode, 400);
  assert.deepEqual(created.json(), { error: "invalid_body" });

  const valid = await app.inject({
    method: "POST",
    url: "/v1/organizations",
    headers: ownerHeaders,
    payload: { name: " Nieuwe Organisatie ", website: "https://example.test" },
  });
  assert.equal(valid.statusCode, 201);
  assert.equal(valid.json().name, "Nieuwe Organisatie");

  const crossTenant = await app.inject({
    method: "GET",
    url: `/v1/organizations/${organizationA}`,
    headers: { [TEST_IDENTITY_HEADER]: "multi", "x-tenant-id": tenantB },
  });
  assert.equal(crossTenant.statusCode, 404);
  assert.deepEqual(crossTenant.json(), { error: "not_found" });

  const updated = await app.inject({
    method: "PATCH",
    url: `/v1/organizations/${organizationA}`,
    headers: ownerHeaders,
    payload: { name: "Nieuwe naam" },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().name, "Nieuwe naam");

  const invalidPatch = await app.inject({
    method: "PATCH",
    url: `/v1/organizations/${organizationA}`,
    headers: ownerHeaders,
    payload: { status: "archived" },
  });
  assert.equal(invalidPatch.statusCode, 400);
  assert.deepEqual(invalidPatch.json(), { error: "invalid_body" });

  const archivedResponse = await app.inject({
    method: "POST",
    url: `/v1/organizations/${organizationA}/archive`,
    headers: ownerHeaders,
  });
  assert.equal(archivedResponse.statusCode, 200);
  assert.equal(archivedResponse.json().status, "archived");
  assert.equal(archived, true);
});

test("organization repository errors return a generic response", async (t) => {
  const app = setup(t, repository({
    listOrganizations: async () => { throw new Error("database secret tenant"); },
  }));
  const response = await app.inject({
    method: "GET",
    url: "/v1/organizations",
    headers: ownerHeaders,
  });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: "internal_error" });
  assert.ok(!response.body.includes("database secret"));
});
