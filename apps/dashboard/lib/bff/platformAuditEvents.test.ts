import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { RefreshOutcome } from "../session/refresh";
import {
  createPlatformAuditEventsHandler,
  parsePlatformAuditEventListResponse,
  parsePlatformAuditEventResponse,
} from "./platformAuditEvents";

const API_BASE_URL = "http://api.test";
const VALID_SESSION_ID = "valid-session-id-000000000000000000000000000";
const ACCESS_TOKEN = "server-side-access-token";
const TENANT_ID = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const PROJECT_ID = "7f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const ACTOR_ID = "8f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";

const statusEvent = {
  id: "9f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e",
  tenant_id: TENANT_ID,
  project_id: PROJECT_ID,
  event_type: "submitted",
  from_status: "draft",
  to_status: "submitted",
  version: 2,
  actor_type: "member",
  actor_id: ACTOR_ID,
  created_at: "2026-10-29T09:00:00.000Z",
  request_or_correlation_id: null,
};

type FetchCall = Readonly<{ url: string; headers: Headers }>;

type SetupOptions = Readonly<{
  apiResponse?: (call: number) => Response | Promise<Response>;
  refresh?: () => Promise<RefreshOutcome>;
}>;

function setup({ apiResponse = () => Response.json({ items: [statusEvent], next_cursor: null }), refresh }: SetupOptions = {}) {
  const calls: FetchCall[] = [];
  const handler = createPlatformAuditEventsHandler({
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

function request(url = "https://app.test/api/admin/audit-events", headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

const withSession = (url?: string, headers: Record<string, string> = {}) =>
  request(url, { cookie: `__Host-ce_session=${VALID_SESSION_ID}`, ...headers });

test("zonder sessie geeft 401 en roept de API niet aan", async () => {
  const { handler, calls } = setup();
  const response = await handler(request(undefined, { authorization: "Bearer browser-token" }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
  assert.equal(calls.length, 0);
});

test("gebruikt alleen de HttpOnly-sessie en forwardt geen browserheaders of tenantcontext", async () => {
  const { handler, calls } = setup();
  const response = await handler(withSession(undefined, {
    authorization: "Bearer browser-token",
    "x-tenant-id": TENANT_ID,
    "x-custom": "leak",
  }));

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(calls[0]!.headers.has("cookie"), false);
  assert.equal(calls[0]!.headers.has("x-tenant-id"), false);
  assert.deepEqual([...calls[0]!.headers.keys()], ["authorization"]);
});

test("forwardt uitsluitend auditfilters door", async () => {
  const { handler, calls } = setup();
  const url = `https://app.test/api/admin/audit-events?tenant_id=${TENANT_ID}&event_type=submitted&from=2026-10-01T00%3A00%3A00.000Z&to=2026-10-29T23%3A59%3A59.999Z&limit=25&cursor=next-1&unknown=leak`;

  const response = await handler(withSession(url));

  assert.equal(response.status, 200);
  const forwardedUrl = new URL(calls[0]!.url);
  assert.equal(forwardedUrl.pathname, "/v1/platform/audit-events");
  assert.deepEqual([...forwardedUrl.searchParams.entries()], [
    ["tenant_id", TENANT_ID],
    ["event_type", "submitted"],
    ["from", "2026-10-01T00:00:00.000Z"],
    ["to", "2026-10-29T23:59:59.999Z"],
    ["limit", "25"],
    ["cursor", "next-1"],
  ]);
  assert.equal(forwardedUrl.searchParams.has("unknown"), false);
});

test("bekende API-fouten worden veilig gemapt", async () => {
  const cases: ReadonlyArray<readonly [number, unknown, number, unknown]> = [
    [400, { error: "invalid_query", detail: "database detail" }, 400, { error: "invalid_query" }],
    [400, { error: "internal_detail" }, 400, { error: "api_error" }],
    [401, { error: "unauthorized", subject: "secret" }, 401, { error: "unauthorized" }],
    [403, { error: "forbidden", tenant: TENANT_ID }, 403, { error: "forbidden" }],
    [502, { error: "api_unavailable", detail: "provider detail" }, 502, { error: "api_unavailable" }],
    [503, { error: "api_unavailable", detail: "provider detail" }, 503, { error: "api_unavailable" }],
  ];

  for (const [upstreamStatus, upstreamBody, expectedStatus, expectedBody] of cases) {
    const { handler } = setup({ apiResponse: () => Response.json(upstreamBody, { status: upstreamStatus }) });
    const response = await handler(withSession());

    assert.equal(response.status, expectedStatus);
    assert.deepEqual(await response.json(), expectedBody);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("malformed succesvolle responses falen gesloten zonder gevoelige upstreamvelden", async () => {
  const { handler } = setup({
    apiResponse: () => Response.json({
      items: [{ ...statusEvent, actor_type: "provider", answers: { secret: true } }],
      next_cursor: null,
    }),
  });

  const response = await handler(withSession());
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.deepEqual(JSON.parse(body), { error: "api_unavailable" });
  assert.doesNotMatch(body, /answers|secret/i);
});

test("response parser accepteert de veilige metadata van status- en inzage-events", () => {
  const accessEvent = {
    ...statusEvent,
    id: "af1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e",
    event_type: "read_onboarding_content",
    from_status: null,
    to_status: null,
    actor_type: "reviewer",
    request_or_correlation_id: "req-123",
  };
  const parsed = parsePlatformAuditEventListResponse({
    items: [statusEvent, accessEvent],
    next_cursor: null,
    secret: "ignored",
  });

  assert.deepEqual(parsed, { items: [statusEvent, accessEvent], next_cursor: null });
  assert.equal("answers" in parsed!.items[0]!, false);
});

test("invalid actor, status, ID en responsevelden falen gesloten", () => {
  for (const invalid of [
    { ...statusEvent, actor_id: "not-a-uuid" },
    { ...statusEvent, from_status: "unknown" },
    { ...statusEvent, version: 0 },
    { ...statusEvent, request_or_correlation_id: "" },
    { ...statusEvent, project_id: "not-a-uuid" },
  ]) {
    assert.equal(parsePlatformAuditEventListResponse({ items: [invalid], next_cursor: null }), null);
  }
});

test("een lege lijst blijft een geldige live response", async () => {
  const { handler } = setup({ apiResponse: () => Response.json({ items: [], next_cursor: null }) });
  const response = await handler(withSession());

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [], next_cursor: null });
});

test("ongeldige status na sessie-refresh blijft generiek", async () => {
  const { handler } = setup({
    apiResponse: () => Response.json({ error: "unauthorized", token: ACCESS_TOKEN }, { status: 401 }),
    refresh: async () => ({ status: "invalid" }),
  });

  const response = await handler(withSession());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("parser geeft alleen de afgesproken responsevelden terug", async () => {
  const parsed = parsePlatformAuditEventListResponse({ items: [{ ...statusEvent, secret: "ignored" }], next_cursor: null });
  assert.deepEqual(parsed, { items: [statusEvent], next_cursor: null });

  const result = await parsePlatformAuditEventResponse(Response.json({ items: [{ ...statusEvent, secret: "ignored" }], next_cursor: null }));
  assert.equal(result.status, "ready");
  if (result.status === "ready") assert.deepEqual(result.data, { items: [statusEvent], next_cursor: null });
});
