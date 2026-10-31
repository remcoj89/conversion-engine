import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { buildApp } from "../app.js";
import type { AuthAdapter, Membership } from "../auth/types.js";
import type { TeamMember, TeamMemberRepository } from "../team/teamMemberRepository.js";

const TEST_IDENTITY_HEADER = "x-test-identity";
const tenantA = randomUUID();
const tenantB = randomUUID();
const ownerId = randomUUID();
const adminId = randomUUID();
const teamMemberId = randomUUID();
const crossTenantId = randomUUID();

const authAdapter: AuthAdapter = {
  authenticate: async (request) => {
    const subject = request.headers[TEST_IDENTITY_HEADER];
    if (subject === undefined) return { status: "anonymous" };
    return {
      status: "authenticated",
      identity: { issuer: "https://issuer.test", subject: String(subject), assurance: { level: "aal2" } },
    };
  },
};

const members: Record<string, readonly Membership[]> = {
  owner: [{ tenantId: tenantA, userId: ownerId, role: "owner", status: "active" }],
  admin: [{ tenantId: tenantA, userId: adminId, role: "tenant_admin", status: "active" }],
  team: [{ tenantId: tenantA, userId: teamMemberId, role: "team_member", status: "active" }],
};

const member = (id: string, role: TeamMember["role"], status: TeamMember["status"] = "active"): TeamMember => ({
  id,
  label: role === "owner" ? "Eigenaar" : role === "tenant_admin" ? "Tenantbeheerder" : "Teamlid 1",
  role,
  status,
  permissions: {
    "crm:read": role !== "team_member",
    "crm:create": role !== "team_member",
    "crm:update": role !== "team_member",
    "crm:archive": role !== "team_member",
  },
});

function repository(overrides: Partial<TeamMemberRepository> = {}): TeamMemberRepository {
  return {
    list: async () => [member(ownerId, "owner"), member(teamMemberId, "team_member")],
    updatePermission: async () => ({ status: "updated", member: member(teamMemberId, "team_member") }),
    updateRole: async () => ({ status: "updated", member: member(teamMemberId, "tenant_admin") }),
    ...overrides,
  };
}

function setup(t: TestContext, teamMemberRepository: TeamMemberRepository) {
  const app = buildApp({
    authAdapter,
    membershipResolver: async ({ subject }) => members[subject] ?? [],
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
    teamMemberRepository,
  }, { logger: false });
  t.after(() => app.close());
  return app;
}

test("team members list is authenticated, tenant-bound and never exposes provider subjects", async (t) => {
  const app = setup(t, repository());
  const anonymous = await app.inject({ method: "GET", url: "/v1/team/members" });
  assert.equal(anonymous.statusCode, 401);

  const response = await app.inject({
    method: "GET",
    url: "/v1/team/members",
    headers: { [TEST_IDENTITY_HEADER]: "owner", "x-tenant-id": tenantB },
  });
  assert.equal(response.statusCode, 403);

  const visible = await app.inject({ method: "GET", url: "/v1/team/members", headers: { [TEST_IDENTITY_HEADER]: "owner" } });
  assert.equal(visible.statusCode, 200);
  assert.deepEqual(visible.json().items[0], member(ownerId, "owner"));
  assert.doesNotMatch(visible.body, /provider|subject|oidc/);
});

test("owner and tenant_admin may manage; team_member is deny-by-default", async (t) => {
  const calls: Array<Record<string, unknown>> = [];
  const app = setup(t, repository({
    updatePermission: async (input) => {
      calls.push({ kind: "permission", ...input });
      return { status: "updated", member: member(teamMemberId, "team_member") };
    },
    updateRole: async (input) => {
      calls.push({ kind: "role", ...input });
      return { status: "updated", member: member(teamMemberId, input.role) };
    },
  }));

  const denied = await app.inject({ method: "GET", url: "/v1/team/members", headers: { [TEST_IDENTITY_HEADER]: "team" } });
  assert.equal(denied.statusCode, 403);

  const permission = await app.inject({
    method: "PATCH",
    url: `/v1/team/members/${teamMemberId}/permissions`,
    headers: { [TEST_IDENTITY_HEADER]: "admin" },
    payload: { permission: "crm:read", enabled: true },
  });
  assert.equal(permission.statusCode, 200);

  const role = await app.inject({
    method: "PATCH",
    url: `/v1/team/members/${teamMemberId}/role`,
    headers: { [TEST_IDENTITY_HEADER]: "owner" },
    payload: { role: "tenant_admin" },
  });
  assert.equal(role.statusCode, 200);
  assert.deepEqual(calls, [
    { kind: "permission", tenantId: tenantA, memberId: teamMemberId, permission: "crm:read", enabled: true },
    { kind: "role", tenantId: tenantA, memberId: teamMemberId, role: "tenant_admin" },
  ]);
});

test("team routes reject full permission objects, unknown permissions and protected role changes", async (t) => {
  const app = setup(t, repository({
    updatePermission: async () => ({ status: "conflict", reason: "owner_not_changeable" }),
    updateRole: async (input) => input.memberId === ownerId
      ? { status: "conflict", reason: "owner_not_changeable" }
      : { status: "not_found" },
  }));

  const fullObject = await app.inject({
    method: "PATCH",
    url: `/v1/team/members/${teamMemberId}/permissions`,
    headers: { [TEST_IDENTITY_HEADER]: "owner" },
    payload: { permissions: { "crm:read": true } },
  });
  assert.equal(fullObject.statusCode, 400);

  const unknown = await app.inject({
    method: "PATCH",
    url: `/v1/team/members/${teamMemberId}/permissions`,
    headers: { [TEST_IDENTITY_HEADER]: "owner" },
    payload: { permission: "crm:unknown", enabled: true },
  });
  assert.equal(unknown.statusCode, 400);

  const ownerRole = await app.inject({
    method: "PATCH",
    url: `/v1/team/members/${ownerId}/role`,
    headers: { [TEST_IDENTITY_HEADER]: "owner" },
    payload: { role: "team_member" },
  });
  assert.equal(ownerRole.statusCode, 409);
  assert.deepEqual(ownerRole.json(), { error: "conflict" });

  const crossTenant = await app.inject({
    method: "PATCH",
    url: `/v1/team/members/${crossTenantId}/role`,
    headers: { [TEST_IDENTITY_HEADER]: "owner" },
    payload: { role: "team_member" },
  });
  assert.equal(crossTenant.statusCode, 404);
});
