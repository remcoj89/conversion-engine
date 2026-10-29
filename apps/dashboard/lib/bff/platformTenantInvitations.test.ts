import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  createPlatformTenantInvitationHandler,
  parsePlatformTenantInvitation,
} from "./platformTenantInvitations";

const API_BASE_URL = "http://api.test";
const SESSION_ID = "valid-session-id-000000000000000000000000000";
const ACCESS_TOKEN = "server-side-access-token";
const TENANT_ID = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const responseBody = {
  invitation_id: "7f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e",
  expires_at: "2026-11-05T08:00:00.000Z",
  invite_url: "https://app.example.test/invite#opaque-token",
};

function setup(apiResponse: () => Response = () => Response.json(responseBody)) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const handler = createPlatformTenantInvitationHandler({
    apiBaseUrl: API_BASE_URL,
    lookupSession: async (sessionId) => sessionId === SESSION_ID
      ? {
        accessToken: ACCESS_TOKEN,
        accessExpiresAt: new Date(Date.now() + 30 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 12 * 60 * 60_000),
      }
      : null,
    refreshSession: async () => ({ status: "ok", accessToken: ACCESS_TOKEN }),
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return apiResponse();
    }) as typeof fetch,
  });
  return { handler, calls };
}

function request(body = JSON.stringify({ email: "owner@example.test" }), headers: Record<string, string> = {}) {
  return new NextRequest(`https://app.test/api/admin/clients/${TENANT_ID}/invitations`, {
    method: "POST",
    headers: {
      cookie: `__Host-ce_session=${SESSION_ID}`,
      origin: "https://app.test",
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}

test("uitnodiging gebruikt de server-side sessie en platformpad zonder tenantheader", async () => {
  const { handler, calls } = setup();
  const response = await handler(request(), TENANT_ID);

  assert.equal(response.status, 200);
  assert.equal(calls[0]!.url, `${API_BASE_URL}/v1/platform/tenants/${TENANT_ID}/invitations`);
  const headers = new Headers(calls[0]!.init.headers);
  assert.equal(headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(headers.has("x-tenant-id"), false);
  assert.equal(calls[0]!.init.body, JSON.stringify({ email: "owner@example.test" }));
  assert.deepEqual(await response.json(), responseBody);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("uitnodigingen vereisen dezelfde origin", async () => {
  const { handler, calls } = setup();
  const response = await handler(request(undefined, { origin: "https://evil.test" }), TENANT_ID);

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
  assert.equal(calls.length, 0);
});

test("response-parser accepteert alleen een HTTPS invite-fragment zonder extra velden", () => {
  assert.deepEqual(parsePlatformTenantInvitation(responseBody), responseBody);
  assert.deepEqual(
    parsePlatformTenantInvitation({ ...responseBody, invite_url: "/invite#opaque-token" }),
    { ...responseBody, invite_url: "/invite#opaque-token" },
  );
  assert.deepEqual(parsePlatformTenantInvitation({ ...responseBody, invite_url: "http://localhost:3000/invite#opaque-token" }), {
    ...responseBody,
    invite_url: "http://localhost:3000/invite#opaque-token",
  });
  assert.equal(parsePlatformTenantInvitation({ ...responseBody, secret: "leak" }), null);
  assert.equal(parsePlatformTenantInvitation({ ...responseBody, invite_url: "https://evil.test/other#token" }), null);
  assert.equal(parsePlatformTenantInvitation({ ...responseBody, invite_url: "https://app.example.test/invite?token=secret" }), null);
});
