import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { RefreshOutcome } from "../session/refresh";
import { createPlatformTenantsHandler, parsePlatformTenantListResponse, parsePlatformTenantResponse } from "./platformTenants";

const API_BASE_URL = "http://api.test";
const VALID_SESSION_ID = "valid-session-id-000000000000000000000000000";
const ACCESS_TOKEN = "server-side-access-token";
const TENANT_ID = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";

const tenant = {
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

type FetchCall = Readonly<{
  url: string;
  headers: Headers;
}>;

type SetupOptions = Readonly<{
  apiResponse?: (call: number) => Response | Promise<Response>;
  refresh?: () => Promise<RefreshOutcome>;
}>;

function setup({ apiResponse = () => Response.json({ items: [tenant], next_cursor: null }), refresh }: SetupOptions = {}) {
  const calls: FetchCall[] = [];
  const handler = createPlatformTenantsHandler({
    apiBaseUrl: API_BASE_URL,
    lookupSession: async (sessionId) =>
      sessionId === VALID_SESSION_ID
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

function request(url = "https://app.test/api/admin/clients", headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

const withSession = (url?: string, headers: Record<string, string> = {}) =>
  request(url, { cookie: `__Host-ce_session=${VALID_SESSION_ID}`, ...headers });

test("zonder sessie geeft 401, wist de cookie en roept de API niet aan", async () => {
  const { handler, calls } = setup();

  const response = await handler(request(undefined, { authorization: "Bearer browser-token" }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
  assert.match(response.headers.get("set-cookie") ?? "", /^__Host-ce_session=;.*Max-Age=0/);
  assert.equal(calls.length, 0);
});

test("gebruikt alleen de HttpOnly-sessie en forwardt geen browserheaders of tenantcontext", async () => {
  const { handler, calls } = setup();

  const response = await handler(
    withSession(undefined, {
      authorization: "Bearer browser-token",
      "x-tenant-id": TENANT_ID,
      "x-custom": "leak",
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(calls[0]!.headers.has("cookie"), false);
  assert.equal(calls[0]!.headers.has("x-tenant-id"), false);
  assert.deepEqual([...calls[0]!.headers.keys()], ["authorization"]);
});

test("forwardt uitsluitend de expliciet toegestane filters en cursor door", async () => {
  const { handler, calls } = setup();
  const url = "https://app.test/api/admin/clients?q=Northline%20Fysio&status=active&onboarding_status=approved&limit=25&cursor=next-1&unknown=leak";

  const response = await handler(withSession(url));

  assert.equal(response.status, 200);
  const forwardedUrl = new URL(calls[0]!.url);
  assert.equal(forwardedUrl.pathname, "/v1/platform/tenants");
  assert.deepEqual([...forwardedUrl.searchParams.entries()], [
    ["q", "Northline Fysio"],
    ["status", "active"],
    ["onboarding_status", "approved"],
    ["limit", "25"],
    ["cursor", "next-1"],
  ]);
  assert.equal(forwardedUrl.searchParams.has("unknown"), false);
});

test("mapt bekende API-fouten veilig en lekt geen upstream-details", async () => {
  const cases: ReadonlyArray<readonly [number, unknown, number, unknown]> = [
    [400, { error: "invalid_query", detail: "database detail" }, 400, { error: "invalid_query" }],
    [400, { error: "internal_detail" }, 400, { error: "api_error" }],
    [403, { error: "forbidden", tenant: TENANT_ID }, 403, { error: "forbidden" }],
    [502, { error: "api_unavailable", detail: "provider detail" }, 502, { error: "api_unavailable" }],
    [503, { error: "api_unavailable", detail: "provider detail" }, 503, { error: "api_unavailable" }],
  ];

  for (const [upstreamStatus, upstreamBody, expectedStatus, expectedBody] of cases) {
    const { handler } = setup({ apiResponse: () => Response.json(upstreamBody, { status: upstreamStatus }) });
    const response = await handler(withSession());

    assert.equal(response.status, expectedStatus);
    assert.deepEqual(await response.json(), expectedBody);
  }
});

test("401 na een verlopen sessie blijft generiek en krijgt geen tweede foutdetails mee", async () => {
  const { handler } = setup({
    apiResponse: () => Response.json({ error: "unauthorized", token: ACCESS_TOKEN }, { status: 401 }),
    refresh: async () => ({ status: "invalid" }),
  });

  const response = await handler(withSession());

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("een malformed succesvolle response wordt 503 en lekt geen extra velden", async () => {
  const { handler } = setup({
    apiResponse: () => Response.json({ items: [{ ...tenant, website_summary: { total: 0, active: 1 } }], next_cursor: null }),
  });

  const response = await handler(withSession());

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "api_unavailable" });
});

test("een ongeldige tenant-ID in een succesvolle response faalt gesloten", async () => {
  const { handler } = setup({
    apiResponse: () => Response.json({ items: [{ ...tenant, id: "not-a-uuid" }], next_cursor: null }),
  });

  const response = await handler(withSession());

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "api_unavailable" });
});

test("een lege lijst blijft een geldige, valide response", async () => {
  const { handler } = setup({ apiResponse: () => Response.json({ items: [], next_cursor: null }) });

  const response = await handler(withSession());

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [], next_cursor: null });
});

test("response-parser accepteert alleen de afgesproken contractvelden", async () => {
  const parsed = parsePlatformTenantListResponse({ items: [tenant], next_cursor: null, secret: "ignored" });
  assert.deepEqual(parsed, { items: [tenant], next_cursor: null });

  const result = await parsePlatformTenantResponse(
    Response.json({ items: [tenant], next_cursor: null, secret: "ignored" }),
  );
  assert.equal(result.status, "ready");
  if (result.status === "ready") assert.deepEqual(result.data, { items: [tenant], next_cursor: null });
});
