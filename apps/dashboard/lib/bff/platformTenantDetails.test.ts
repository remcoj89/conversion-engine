import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { RefreshOutcome } from "../session/refresh";
import {
  createPlatformTenantDetailHandler,
  parsePlatformTenantDetailResponse,
  parsePlatformTenantDetailResponseBody,
} from "./platformTenantDetails";

const API_BASE_URL = "http://api.test";
const VALID_SESSION_ID = "valid-session-id-000000000000000000000000000";
const ACCESS_TOKEN = "server-side-access-token";
const TENANT_ID = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const OTHER_TENANT_ID = "7f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";

const detail = {
  id: TENANT_ID,
  name: "Northline Fysio",
  status: "active",
  created_at: "2026-10-28T08:00:00.000Z",
  onboarding: {
    status: "approved",
    version: 4,
    updated_at: "2026-10-28T08:14:00.000Z",
  },
  website_summary: { total: 1, active: 1 },
};

type FetchCall = Readonly<{ url: string; headers: Headers }>;

function setup({ apiResponse = () => Response.json(detail), refresh }: {
  apiResponse?: (call: number) => Response | Promise<Response>;
  refresh?: () => Promise<RefreshOutcome>;
} = {}) {
  const calls: FetchCall[] = [];
  const handler = createPlatformTenantDetailHandler({
    apiBaseUrl: API_BASE_URL,
    lookupSession: async (sessionId) => sessionId === VALID_SESSION_ID
      ? {
        accessToken: ACCESS_TOKEN,
        accessExpiresAt: new Date(Date.now() + 30 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 12 * 60 * 60_000),
      }
      : null,
    refreshSession: async () => refresh?.() ?? { status: "ok", accessToken: ACCESS_TOKEN },
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers) });
      return apiResponse(calls.length);
    }) as typeof fetch,
  });
  return { handler, calls };
}

function request(url = `https://app.test/api/admin/clients/${TENANT_ID}`, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

const withSession = (url?: string, headers: Record<string, string> = {}) =>
  request(url, { cookie: `__Host-ce_session=${VALID_SESSION_ID}`, ...headers });

test("gebruikt alleen de HttpOnly-sessie en de path tenant-ID", async () => {
  const { handler, calls } = setup();
  const response = await handler(
    withSession(undefined, { authorization: "Bearer browser-token", "x-tenant-id": OTHER_TENANT_ID }),
    TENANT_ID,
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `${API_BASE_URL}/v1/platform/tenants/${TENANT_ID}`);
  assert.equal(calls[0]!.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(calls[0]!.headers.has("cookie"), false);
  assert.equal(calls[0]!.headers.has("x-tenant-id"), false);
  assert.deepEqual(await response.json(), detail);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("zonder sessie geeft 401 en roept de API niet aan", async () => {
  const { handler, calls } = setup();
  const response = await handler(request(undefined, { authorization: "Bearer browser-token" }), TENANT_ID);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
  assert.equal(calls.length, 0);
});

test("mapt 400, 403, 404, 502 en 503 zonder upstreamdetails", async () => {
  const cases: ReadonlyArray<readonly [number, unknown, number, unknown]> = [
    [400, { error: "invalid_tenant_id", secret: "do-not-leak" }, 400, { error: "invalid_tenant_id" }],
    [403, { error: "forbidden", tenant: OTHER_TENANT_ID }, 403, { error: "forbidden" }],
    [404, { error: "not_found", secret: "do-not-leak" }, 404, { error: "not_found" }],
    [502, { error: "api_unavailable", detail: "provider detail" }, 502, { error: "api_unavailable" }],
    [503, { error: "api_unavailable", detail: "provider detail" }, 503, { error: "api_unavailable" }],
  ];

  for (const [upstreamStatus, upstreamBody, expectedStatus, expectedBody] of cases) {
    const { handler } = setup({ apiResponse: () => Response.json(upstreamBody, { status: upstreamStatus }) });
    const response = await handler(withSession(), TENANT_ID);
    assert.equal(response.status, expectedStatus);
    assert.deepEqual(await response.json(), expectedBody);
  }
});

test("ongeldige path-ID wordt lokaal geweigerd en niet naar de API gestuurd", async () => {
  const { handler, calls } = setup();
  const response = await handler(withSession(), "not-a-uuid");

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_tenant_id" });
  assert.equal(calls.length, 0);
});

test("strikte responsevalidatie weigert extra of gevoelige contractvelden", async () => {
  const { handler } = setup({
    apiResponse: () => Response.json({ ...detail, answers: { secret: true } }),
  });
  const response = await handler(withSession(), TENANT_ID);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "api_unavailable" });
  assert.equal(parsePlatformTenantDetailResponseBody({ ...detail, projectBrief: {} }), null);
  assert.equal(parsePlatformTenantDetailResponseBody({ ...detail, website_summary: { total: 1, active: 2 } }), null);
});

test("response-parser onderscheidt not-found en ready", async () => {
  const notFound = await parsePlatformTenantDetailResponse(Response.json({ error: "not_found" }, { status: 404 }));
  assert.deepEqual(notFound, { status: "not_found", data: null });

  const ready = await parsePlatformTenantDetailResponse(Response.json(detail));
  assert.deepEqual(ready, { status: "ready", data: detail });
});

test("een API-401 na refresh blijft generiek", async () => {
  const { handler } = setup({
    apiResponse: () => Response.json({ error: "unauthorized", token: ACCESS_TOKEN }, { status: 401 }),
    refresh: async () => ({ status: "invalid" }),
  });
  const response = await handler(withSession(), TENANT_ID);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});
