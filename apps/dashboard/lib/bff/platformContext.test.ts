import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { RefreshOutcome } from "../session/refresh";
import { createPlatformContextHandler } from "./platformContext";

const API_BASE_URL = "http://api.test";
const VALID_SESSION_ID = "valid-session-id-000000000000000000000000000";
const ACCESS_TOKEN = "server-side-access-token";
const TENANT_ID = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";

type FetchCall = Readonly<{
  url: string;
  method?: string;
  headers: Headers;
}>;

type SetupOptions = Readonly<{
  apiResponse?: (call: number) => Response | Promise<Response>;
  refresh?: () => Promise<RefreshOutcome>;
}>;

function setup({ apiResponse = () => Response.json({ workspace: "admin", role: "platform_admin" }), refresh }: SetupOptions = {}) {
  const calls: FetchCall[] = [];
  const handler = createPlatformContextHandler({
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
      calls.push({ url: String(input), method: init?.method, headers: new Headers(init?.headers) });
      return apiResponse(calls.length);
    }) as typeof fetch,
  });
  return { handler, calls };
}

function request(headers: Record<string, string> = {}) {
  return new NextRequest("https://app.test/api/admin/context", { headers });
}

const withSession = (headers: Record<string, string> = {}) =>
  request({ cookie: `__Host-ce_session=${VALID_SESSION_ID}`, ...headers });

test("zonder sessie geeft 401, wist de cookie en roept de API niet aan", async () => {
  const { handler, calls } = setup();

  const response = await handler(request({ authorization: "Bearer browser-token" }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("set-cookie") ?? "", /^__Host-ce_session=;.*Max-Age=0/);
  assert.equal(calls.length, 0);
});

test("platformcontext gebruikt het server-side token en forwardt geen tenantheader", async () => {
  const { handler, calls } = setup();

  const response = await handler(
    withSession({ authorization: "Bearer browser-token", "x-tenant-id": TENANT_ID, "x-custom": "leak" }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { workspace: "admin", role: "platform_admin" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `${API_BASE_URL}/v1/platform/context`);
  assert.equal(calls[0]!.method, "GET");
  assert.equal(calls[0]!.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(calls[0]!.headers.has("x-tenant-id"), false);
  assert.deepEqual([...calls[0]!.headers.keys()].sort(), ["authorization"]);
});

test("401 en 403 blijven generiek en geven geen refresh of API-details door", async () => {
  const cases: ReadonlyArray<readonly [number, unknown, unknown]> = [
    [401, { error: "unauthorized", detail: "token detail" }, { error: "unauthorized" }],
    [403, { error: "forbidden", tenant: TENANT_ID }, { error: "forbidden" }],
  ];

  for (const [status, apiBody, expected] of cases) {
    let refreshes = 0;
    const { handler, calls } = setup({
      apiResponse: () => Response.json(apiBody, { status }),
      refresh: async () => {
        refreshes += 1;
        return { status: "ok", accessToken: "unexpected-refresh-token" };
      },
    });

    const response = await handler(withSession());

    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), expected);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(refreshes, status === 401 ? 1 : 0);
    assert.equal(calls.length, status === 401 ? 2 : 1);
  }
});

test("onbekende API-fouten worden als api_unavailable afgehandeld", async () => {
  const cases: ReadonlyArray<readonly [Response | Promise<Response>, number]> = [
    [Response.json({ error: "internal_detail" }, { status: 400 }), 400],
    [Response.json({ error: "internal_detail" }, { status: 500 }), 502],
    [new Response("not json", { status: 200 }), 503],
    [Promise.reject(new TypeError("fetch failed")), 503],
  ];

  for (const [apiResponse, expectedStatus] of cases) {
    const { handler } = setup({ apiResponse: () => apiResponse });
    const response = await handler(withSession());

    assert.equal(response.status, expectedStatus);
    assert.deepEqual(await response.json(), { error: expectedStatus === 400 ? "api_error" : "api_unavailable" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("sessie-ID en tokens komen niet in de Platform Admin-response terecht", async () => {
  const { handler } = setup({
    apiResponse: () => Response.json({ error: "internal_detail", token: ACCESS_TOKEN }, { status: 500 }),
  });

  const response = await handler(withSession());
  const exposed = [await response.text(), ...response.headers.values()].join("\n");

  assert.equal(exposed.includes(VALID_SESSION_ID), false);
  assert.equal(exposed.includes(ACCESS_TOKEN), false);
});
