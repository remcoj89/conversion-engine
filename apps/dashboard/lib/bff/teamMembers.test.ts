import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  createTeamMemberPermissionHandler,
  createTeamMemberRoleHandler,
  createTeamMembersHandler,
  parseTeamMemberListResponse,
} from "./teamMembers";

const API_BASE_URL = "http://api.test";
const SESSION_ID = "valid-session-id-000000000000000000000000000";
const ACCESS_TOKEN = "server-side-access-token";
const MEMBER_ID = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const member = {
  id: MEMBER_ID,
  label: "Teamlid 1",
  role: "team_member" as const,
  status: "active" as const,
  permissions: { "crm:read": true, "crm:create": false, "crm:update": false, "crm:archive": false },
};

function setup(apiResponse: () => Response = () => Response.json({ items: [member] })) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const dependencies = {
    apiBaseUrl: API_BASE_URL,
    lookupSession: async (sessionId: string) => sessionId === SESSION_ID
      ? { accessToken: ACCESS_TOKEN, accessExpiresAt: new Date(Date.now() + 30 * 60_000), absoluteExpiresAt: new Date(Date.now() + 12 * 60 * 60_000) }
      : null,
    refreshSession: async () => ({ status: "ok", accessToken: ACCESS_TOKEN } as const),
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return apiResponse();
    }) as typeof fetch,
  };
  return {
    list: createTeamMembersHandler(dependencies),
    permission: createTeamMemberPermissionHandler(dependencies),
    role: createTeamMemberRoleHandler(dependencies),
    calls,
  };
}

function request(url: string, method = "GET", body?: unknown, origin = "https://app.test"): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      cookie: `__Host-ce_session=${SESSION_ID}`,
      origin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("team members BFF uses only the server session and strips tenant/browser auth headers", async () => {
  const { list, calls } = setup();
  const response = await list(new NextRequest("https://app.test/api/team/members", {
    headers: {
      cookie: `__Host-ce_session=${SESSION_ID}`,
      "x-tenant-id": "browser-tenant",
      authorization: "Bearer browser-token",
    },
  }));
  assert.equal(response.status, 200);
  const headers = new Headers(calls[0]!.init.headers);
  assert.equal(headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(headers.has("x-tenant-id"), false);
  assert.equal(headers.has("cookie"), false);
});

test("team members BFF accepts exactly the single-permission frontend contract", async () => {
  const permission = setup(() => Response.json(member));
  const response = await permission.permission(request(
    `https://app.test/api/team/members/${MEMBER_ID}/permissions`,
    "PATCH",
    { permission: "crm:read", enabled: true },
  ));
  assert.equal(response.status, 200);
  assert.equal(permission.calls[0]!.init.body, JSON.stringify({ permission: "crm:read", enabled: true }));

  const rejected = setup();
  const rejectedResponse = await rejected.permission(request(
    `https://app.test/api/team/members/${MEMBER_ID}/permissions`,
    "PATCH",
    { permissions: { "crm:read": true } },
  ));
  assert.equal(rejectedResponse.status, 400);
  assert.equal(rejected.calls.length, 0);

  const role = setup(() => Response.json({ ...member, role: "tenant_admin" }));
  const roleResponse = await role.role(request(
    `https://app.test/api/team/members/${MEMBER_ID}/role`,
    "PATCH",
    { role: "tenant_admin" },
  ));
  assert.equal(roleResponse.status, 200);
  assert.equal(role.calls[0]!.init.body, JSON.stringify({ role: "tenant_admin" }));
});

test("team members BFF maps known auth/conflict errors and malformed success bodies safely", async () => {
  for (const [status, error] of [[401, "unauthorized"], [403, "forbidden"], [404, "not_found"], [409, "conflict"], [503, "api_unavailable"]] as const) {
    const { role } = setup(() => Response.json({ error, secret: "hidden" }, { status }));
    const response = await role(request(`https://app.test/api/team/members/${MEMBER_ID}/role`, "PATCH", { role: "team_member" }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error });
  }

  assert.equal(parseTeamMemberListResponse({ items: [{ ...member, provider_subject: "must-not-pass" }] }), null);
});
