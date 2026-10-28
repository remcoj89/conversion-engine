import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { RefreshOutcome } from "../session/refresh";
import { createSessionContextHandler } from "./sessionContext";

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

function setup({ apiResponse = () => Response.json({ tenant_id: TENANT_ID, role: "owner" }), refresh }: SetupOptions = {}) {
  const calls: FetchCall[] = [];
  const handler = createSessionContextHandler({
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
  return new NextRequest("https://app.test/api/session/context", { headers });
}

const withSession = (headers: Record<string, string> = {}) =>
  request({ cookie: `__Host-ce_session=${VALID_SESSION_ID}`, ...headers });

test("zonder sessie 401, cookie gewist en API niet aangeroepen", async () => {
  const { handler, calls } = setup();

  const response = await handler(request({ authorization: "Bearer browser-token" }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("set-cookie") ?? "", /^__Host-ce_session=;.*Max-Age=0/);
  assert.equal(calls.length, 0);
});

test("context gebruikt het server-side token, negeert browser-Authorization en forwardt x-tenant-id", async () => {
  const { handler, calls } = setup();

  const response = await handler(
    withSession({ authorization: "Bearer browser-token", "x-tenant-id": TENANT_ID, "x-custom": "leak" }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { tenant_id: TENANT_ID, role: "owner" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `${API_BASE_URL}/v1/session/context`);
  assert.equal(calls[0]!.method, "GET");
  assert.equal(calls[0]!.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(calls[0]!.headers.get("x-tenant-id"), TENANT_ID);
  assert.deepEqual([...calls[0]!.headers.keys()].sort(), ["authorization", "x-tenant-id"]);
});

test("alleen invalid_tenant wordt als bekende 400-fout doorgestuurd", async () => {
  const { handler } = setup({
    apiResponse: () => Response.json({ error: "invalid_tenant", tenant: "sensitive-detail" }, { status: 400 }),
  });

  const response = await handler(withSession({ "x-tenant-id": "not-a-tenant" }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_tenant" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("onbekende 400-, 401- en 403-fouten blijven generiek", async () => {
  const cases: ReadonlyArray<readonly [number, unknown]> = [
    [400, { error: "internal_detail" }],
    [401, { error: "token_detail" }],
    [403, { error: "permission_detail" }],
  ];

  for (const [status, apiBody] of cases) {
    const { handler } = setup({ apiResponse: () => Response.json(apiBody, { status }) });
    const response = await handler(withSession());

    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: status === 400 ? "api_error" : status === 401 ? "unauthorized" : "forbidden" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("sessie-ID en tokens komen niet in de response terecht", async () => {
  const { handler } = setup({
    apiResponse: () => Response.json({ error: "internal_detail", token: ACCESS_TOKEN }, { status: 500 }),
  });

  const response = await handler(withSession());
  const exposed = [await response.text(), ...response.headers.values()].join("\n");

  assert.equal(exposed.includes(VALID_SESSION_ID), false);
  assert.equal(exposed.includes(ACCESS_TOKEN), false);
});
