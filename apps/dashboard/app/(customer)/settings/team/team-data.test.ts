import assert from "node:assert/strict";
import test from "node:test";
import { fetchTeamMembers, parseTeamMemberList } from "./team-data";

const member = {
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
} as const;

test("team member parser accepteert alleen het afgesproken CRM-contract", () => {
  assert.deepEqual(parseTeamMemberList({ items: [member] }), [member]);
  assert.equal(parseTeamMemberList({ items: [{ ...member, permissions: { "crm:read": true } }] }), null);
  assert.equal(parseTeamMemberList({ items: [{ ...member, role: "platform_admin" }] }), null);
  assert.equal(parseTeamMemberList({ items: [{ ...member, extra: "niet toegestaan" }] }), null);
});

test("team member fetcher geeft auth-, unavailable- en live states door zonder demo-data", async () => {
  assert.deepEqual(await fetchTeamMembers(async () => new Response(null, { status: 401 })), { status: "unauthenticated" });
  assert.deepEqual(await fetchTeamMembers(async () => new Response(null, { status: 403 })), { status: "forbidden" });
  assert.deepEqual(await fetchTeamMembers(async () => new Response("offline", { status: 503 })), { status: "unavailable" });
  assert.deepEqual(await fetchTeamMembers(async () => new Response(JSON.stringify({ items: [member] }), { status: 200 })), {
    status: "ready",
    items: [member],
  });
});
