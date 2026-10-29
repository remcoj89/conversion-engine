import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  createPlatformTenantMutationHandler,
  parsePlatformTenantMutation,
  type PlatformTenantMutationOperation,
} from "./platformTenantMutations";

const API_BASE_URL = "http://api.test";
const SESSION_ID = "valid-session-id-000000000000000000000000000";
const ACCESS_TOKEN = "server-side-access-token";
const TENANT_ID = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const mutation = {
  id: TENANT_ID,
  name: "Northline Fysio",
  status: "active",
  created_at: "2026-10-28T08:00:00.000Z",
  updated_at: "2026-10-29T08:00:00.000Z",
  disabled_at: null,
  purge_after_at: null,
};

function setup(
  operation: PlatformTenantMutationOperation = "create",
  apiResponse: () => Response = () => Response.json(mutation),
) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const handler = createPlatformTenantMutationHandler({
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
  }, operation);
  return { handler, calls };
}

function request(headers: Record<string, string> = {}, body = JSON.stringify({ name: "Northline Fysio" })) {
  return new NextRequest("https://app.test/api/admin/clients", {
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

test("mutaties vereisen dezelfde origin en sturen geen tenantcontext door", async () => {
  const { handler, calls } = setup();
  const response = await handler(request({ "x-tenant-id": TENANT_ID }));

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `${API_BASE_URL}/v1/platform/tenants`);
  assert.equal(calls[0]!.init.method, "POST");
  const headers = new Headers(calls[0]!.init.headers);
  assert.equal(headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(headers.has("x-tenant-id"), false);
  assert.equal(calls[0]!.init.body, JSON.stringify({ name: "Northline Fysio" }));
  assert.deepEqual(await response.json(), mutation);
});

test("ontbrekende origin wordt vóór sessie/API-afhandeling geweigerd", async () => {
  const { handler, calls } = setup();
  const response = await handler(request({ origin: "https://evil.test" }));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
  assert.equal(calls.length, 0);
});

test("bekende upstreamfouten blijven beperkt tot het afgesproken contract", async () => {
  const { handler } = setup("create", () => Response.json({ error: "invalid_body", detail: "internal" }, { status: 400 }));
  const response = await handler(request());

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_body" });
});

test("gebruikt de juiste methodes en platformpaden voor rename, uitschakelen en heractiveren", async () => {
  for (const [operation, method, suffix] of [
    ["rename", "PATCH", ""],
    ["disable", "POST", "/disable"],
    ["reactivate", "POST", "/reactivate"],
  ] as const) {
    const { handler, calls } = setup(operation);
    const response = await handler(request(), TENANT_ID);

    assert.equal(response.status, 200);
    assert.equal(calls[0]!.url, `${API_BASE_URL}/v1/platform/tenants/${TENANT_ID}${suffix}`);
    assert.equal(calls[0]!.init.method, method);
  }
});

test("response-parser accepteert exact de mutationvelden en niets extra's", () => {
  assert.deepEqual(parsePlatformTenantMutation(mutation), mutation);
  assert.equal(parsePlatformTenantMutation({ ...mutation, secret: "leak" }), null);
  assert.equal(parsePlatformTenantMutation({ ...mutation, disabled_at: "not-a-date" }), null);
});
