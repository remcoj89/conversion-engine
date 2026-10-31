import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { buildApp, type AppDependencies } from "../app.js";
import type { AuthAdapter, Membership } from "../auth/types.js";
import type {
  Contact,
  Organization,
  OrganizationContactRepository,
} from "../crm/organizationContactRepository.js";
import { parseContactQuery } from "./contacts.js";

const TEST_IDENTITY_HEADER = "x-test-identity";
const tenantA = randomUUID();
const tenantB = randomUUID();
const organizationA = randomUUID();
const contactA = randomUUID();
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

const organization = (id: string, tenantId: string): Organization => ({
  id,
  tenantId,
  name: "Organisatie",
  kvkNumber: null,
  website: null,
  generalEmail: null,
  generalPhone: null,
  address: null,
  industry: null,
  notes: null,
  status: "active",
  createdAt,
  updatedAt: createdAt,
});

const contact = (id: string, tenantId: string): Contact => ({
  id,
  tenantId,
  organizationId: organizationA,
  fullName: "Voorbeeld Contact",
  firstName: "Voorbeeld",
  lastName: "Contact",
  email: "contact@example.test",
  phone: null,
  function: null,
  notes: null,
  communicationPreference: null,
  status: "active",
  createdAt,
  updatedAt: createdAt,
});

function repository(overrides: Partial<OrganizationContactRepository> = {}): OrganizationContactRepository {
  return {
    listOrganizations: async () => [],
    createOrganization: async () => { throw new Error("not used"); },
    findOrganization: async () => null,
    updateOrganization: async () => null,
    archiveOrganization: async () => null,
    listContacts: async () => [],
    createContact: async (input) => ({ ...contact(randomUUID(), input.tenantId), ...input, organizationId: input.organizationId ?? null }),
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

test("parseContactQuery accepteert alleen organization_id en include_archived", () => {
  assert.deepEqual(parseContactQuery({ include_archived: "true", organization_id: organizationA }), {
    includeArchived: true,
    organizationId: organizationA,
  });
  assert.deepEqual(parseContactQuery({}), { includeArchived: false });
  assert.equal(parseContactQuery({ organization_id: "not-a-uuid" }), null);
  assert.equal(parseContactQuery({ unknown: "value" }), null);
});

test("contacts fail closed for Team members and keep organization relation tenant-bound", async (t) => {
  const calls: Array<{ tenantId: string; organizationId?: string }> = [];
  const app = setup(t, repository({
    listContacts: async (tenantId, options) => {
      calls.push({ tenantId, organizationId: options?.organizationId });
      return [contact(contactA, tenantId)];
    },
    findOrganization: async (tenantId, id) => id === organizationA && tenantId === tenantA
      ? organization(organizationA, tenantA)
      : null,
  }));

  const teamMember = await app.inject({
    method: "GET",
    url: "/v1/contacts",
    headers: { [TEST_IDENTITY_HEADER]: "team" },
  });
  assert.equal(teamMember.statusCode, 403);

  const list = await app.inject({
    method: "GET",
    url: `/v1/contacts?organization_id=${organizationA}`,
    headers: ownerHeaders,
  });
  assert.equal(list.statusCode, 200);
  assert.deepEqual(calls, [{ tenantId: tenantA, organizationId: organizationA }]);

  const invalidRelation = await app.inject({
    method: "POST",
    url: "/v1/contacts",
    headers: ownerHeaders,
    payload: { full_name: "Contact", email: "contact@example.test", organization_id: tenantB },
  });
  assert.equal(invalidRelation.statusCode, 400);
  assert.deepEqual(invalidRelation.json(), { error: "invalid_organization" });
});

test("contact CRUD validates, uses auth tenant, and archives without leaking cross-tenant records", async (t) => {
  let archived = false;
  const app = setup(t, repository({
    findOrganization: async (tenantId, id) => id === organizationA && tenantId === tenantA
      ? organization(organizationA, tenantA)
      : null,
    createContact: async (input) => ({ ...contact(contactA, input.tenantId), ...input, organizationId: input.organizationId ?? null }),
    findContact: async (tenantId, id) => tenantId === tenantA && id === contactA ? contact(contactA, tenantA) : null,
    updateContact: async (input) => tenantA === input.tenantId && input.contactId === contactA
      ? { ...contact(contactA, tenantA), fullName: input.fullName ?? "Bijgewerkt" }
      : null,
    archiveContact: async (tenantId, id) => {
      if (tenantId !== tenantA || id !== contactA) return null;
      archived = true;
      return { ...contact(contactA, tenantA), status: "archived" };
    },
  }));

  const invalid = await app.inject({
    method: "POST",
    url: "/v1/contacts",
    headers: ownerHeaders,
    payload: { full_name: "Contact", email: "not-an-email", tenant_id: tenantA },
  });
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(invalid.json(), { error: "invalid_body" });

  const created = await app.inject({
    method: "POST",
    url: "/v1/contacts",
    headers: ownerHeaders,
    payload: { full_name: " Contact ", email: "contact@example.test", organization_id: organizationA },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().full_name, "Contact");

  const crossTenant = await app.inject({
    method: "GET",
    url: `/v1/contacts/${contactA}`,
    headers: { [TEST_IDENTITY_HEADER]: "multi", "x-tenant-id": tenantB },
  });
  assert.equal(crossTenant.statusCode, 404);
  assert.deepEqual(crossTenant.json(), { error: "not_found" });

  const updated = await app.inject({
    method: "PATCH",
    url: `/v1/contacts/${contactA}`,
    headers: ownerHeaders,
    payload: { full_name: "Nieuwe naam" },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().full_name, "Nieuwe naam");

  const invalidPatch = await app.inject({
    method: "PATCH",
    url: `/v1/contacts/${contactA}`,
    headers: ownerHeaders,
    payload: { tenant_id: tenantA },
  });
  assert.equal(invalidPatch.statusCode, 400);
  assert.deepEqual(invalidPatch.json(), { error: "invalid_body" });

  const archivedResponse = await app.inject({
    method: "POST",
    url: `/v1/contacts/${contactA}/archive`,
    headers: ownerHeaders,
  });
  assert.equal(archivedResponse.statusCode, 200);
  assert.equal(archivedResponse.json().status, "archived");
  assert.equal(archived, true);
});
