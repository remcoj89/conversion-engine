import assert from "node:assert/strict";
import test from "node:test";
import { updateCrmPermission, updateTeamMemberRole } from "./team-mutations";

const responseMember = {
  id: "member-1",
  label: "Lisa Jansen",
  role: "team_member",
  status: "active",
  permissions: {
    "crm:read": true,
    "crm:create": false,
    "crm:update": true,
    "crm:archive": false,
  },
};

test("CRM-rechtmutatie gebruikt de afgesproken PATCH-body", async () => {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", body: String(init?.body ?? "") });
    return new Response(JSON.stringify(responseMember), { status: 200 });
  };

  const result = await updateCrmPermission(fetcher, "member-1", "crm:create", true);
  assert.equal(result.status, "success");
  assert.deepEqual(calls[0], {
    url: "/api/team/members/member-1/permissions",
    method: "PATCH",
    body: JSON.stringify({ permission: "crm:create", enabled: true }),
  });
});

test("rolmutatie gebruikt een expliciete rol-body en fail-closed foutstatus", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body ?? "") });
    return new Response(JSON.stringify(responseMember), { status: 403 });
  };

  const result = await updateTeamMemberRole(fetcher, "member-1", "tenant_admin");
  assert.deepEqual(result, { status: "forbidden" });
  assert.deepEqual(calls[0], {
    url: "/api/team/members/member-1/role",
    body: JSON.stringify({ role: "tenant_admin" }),
  });
  assert.deepEqual(await updateTeamMemberRole(fetcher, "", "team_member"), { status: "invalid" });
});
