import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { RefreshOutcome } from "../session/refresh";
import { createOnboardingHandlers } from "./onboarding";

const API_BASE_URL = "http://api.test";
const VALID_SESSION_ID = "valid-session-id-000000000000000000000000000";
const ACCESS_TOKEN = "server-side-access-token";
const REFRESHED_ACCESS_TOKEN = "refreshed-access-token";
const TENANT_ID = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const NOW = new Date("2026-10-23T12:00:00Z");
const MINUTE = 60_000;

type FetchCall = { url: string; method?: string; headers: Headers; body?: string };

function setup(
  apiResponse: (call: number) => Response | Promise<Response> = () => Response.json({ version: 1 }),
  options: { accessExpiresAt?: Date; refresh?: () => Promise<RefreshOutcome> } = {},
) {
  const calls: FetchCall[] = [];
  const refreshes: (string | undefined)[] = [];
  const handlers = createOnboardingHandlers({
    apiBaseUrl: API_BASE_URL,
    lookupSession: async (sessionId) =>
      sessionId === VALID_SESSION_ID
        ? {
            accessToken: ACCESS_TOKEN,
            accessExpiresAt: options.accessExpiresAt ?? new Date(NOW.getTime() + 30 * MINUTE),
            absoluteExpiresAt: new Date(NOW.getTime() + 12 * 60 * MINUTE),
          }
        : null,
    refreshSession: async (_sessionId, rejectedAccessToken) => {
      refreshes.push(rejectedAccessToken);
      return options.refresh ? options.refresh() : { status: "ok", accessToken: REFRESHED_ACCESS_TOKEN };
    },
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method, headers: new Headers(init?.headers), body: init?.body as string | undefined });
      return apiResponse(calls.length);
    }) as typeof fetch,
    now: () => NOW,
  });
  return { ...handlers, calls, refreshes };
}

const draftBody = JSON.stringify({ schema_id: "WESTEND_ONBOARDING", schema_version: "0.1.0-design", base_version: 1, answers: { company_name: "Bedrijf" } });

function request(method: "GET" | "PUT", headers: Record<string, string> = {}, body?: string) {
  return new NextRequest("https://app.test/api/onboarding", { method, headers, body });
}
const session = { cookie: `__Host-ce_session=${VALID_SESSION_ID}` };

test("BFF onboarding: zonder sessie 401, cookie gewist en geen API-call (GET en PUT)", async () => {
  const { GET, PUT, calls } = setup();
  for (const response of [
    await GET(request("GET", { authorization: "Bearer browser-token" })),
    await PUT(request("PUT", { cookie: "__Host-ce_session=onbekend" }, draftBody)),
  ]) {
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("set-cookie") ?? "", /^__Host-ce_session=;.*Max-Age=0/);
  }
  assert.equal(calls.length, 0);
});

test("BFF onboarding GET: sessietoken als Bearer, browser-Authorization genegeerd, no-store", async () => {
  const { GET, calls } = setup(() => Response.json({ version: 0, answers: {} }));
  const response = await GET(request("GET", { ...session, authorization: "Bearer browser-token", "x-tenant-id": TENANT_ID }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { version: 0, answers: {} });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(calls[0]!.url, `${API_BASE_URL}/v1/onboarding/current`);
  assert.equal(calls[0]!.method, "GET");
  assert.equal(calls[0]!.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.deepEqual([...calls[0]!.headers.keys()].sort(), ["authorization", "x-tenant-id"]);
  assert.equal(calls[0]!.body, undefined);
});

test("BFF onboarding PUT: body ongewijzigd als JSON doorgestuurd, alleen met het sessietoken", async () => {
  const { PUT, calls } = setup();
  const response = await PUT(request("PUT", { ...session, authorization: "Bearer browser-token", "x-custom": "leak" }, draftBody));

  assert.equal(response.status, 200);
  assert.equal(calls[0]!.method, "PUT");
  assert.equal(calls[0]!.body, draftBody);
  assert.equal(calls[0]!.headers.get("content-type"), "application/json");
  assert.equal(calls[0]!.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.deepEqual([...calls[0]!.headers.keys()].sort(), ["authorization", "content-type"]);
});

test("BFF onboarding PUT: bijna verlopen token wordt vóór de call ververst", async () => {
  const { PUT, calls, refreshes } = setup(undefined, { accessExpiresAt: new Date(NOW.getTime() + 30_000) });
  await PUT(request("PUT", session, draftBody));

  assert.deepEqual(refreshes, [undefined]);
  assert.equal(calls[0]!.headers.get("authorization"), `Bearer ${REFRESHED_ACCESS_TOKEN}`);
});

test("BFF onboarding PUT: API-401 geeft één refresh en één nieuwe poging met dezelfde body", async () => {
  const { PUT, calls, refreshes } = setup((call) => (call === 1 ? Response.json({ error: "unauthorized" }, { status: 401 }) : Response.json({ version: 2 })));
  const response = await PUT(request("PUT", session, draftBody));

  assert.equal(response.status, 200);
  assert.deepEqual(refreshes, [ACCESS_TOKEN]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.headers.get("authorization"), `Bearer ${REFRESHED_ACCESS_TOKEN}`);
  assert.equal(calls[1]!.body, draftBody);
});

test("BFF onboarding: mislukte refresh geeft 401 met gewiste cookie of 503 bij onbereikbare provider", async () => {
  for (const [outcome, status] of [[{ status: "invalid" }, 401], [{ status: "unavailable" }, 503]] as const) {
    const { PUT, calls } = setup(undefined, { accessExpiresAt: new Date(NOW.getTime() - MINUTE), refresh: async () => outcome });
    const response = await PUT(request("PUT", session, draftBody));
    assert.equal(response.status, status);
    assert.equal(calls.length, 0);
  }
});

test("BFF onboarding: bekende fouten gaan door met alleen hun eigen velden, de rest wordt generiek", async () => {
  const cases: [() => Response, number, unknown][] = [
    [() => Response.json({ error: "version_conflict", current_version: 3, debug: "x" }, { status: 409 }), 409, { error: "version_conflict", current_version: 3 }],
    [() => Response.json({ error: "schema_mismatch", schema_id: "S", schema_version: "1", extra: 1 }, { status: 409 }), 409, { error: "schema_mismatch", schema_id: "S", schema_version: "1" }],
    [() => Response.json({ error: "not_editable" }, { status: 409 }), 409, { error: "not_editable" }],
    [() => Response.json({ error: "invalid_answers", issues: [{ field_id: "company_name", code: "too_long" }] }, { status: 400 }), 400, { error: "invalid_answers", issues: [{ field_id: "company_name", code: "too_long" }] }],
    [() => Response.json({ error: "invalid_body" }, { status: 400 }), 400, { error: "invalid_body" }],
    [() => Response.json({ error: "geheim", detail: "x" }, { status: 400 }), 400, { error: "api_error" }],
    [() => Response.json({ error: "iets_anders" }, { status: 409 }), 502, { error: "api_unavailable" }],
    [() => Response.json({ error: "forbidden", tenant: "x" }, { status: 403 }), 403, { error: "forbidden" }],
    [() => Response.json({ error: "internal_error", stack: "x" }, { status: 500 }), 502, { error: "api_unavailable" }],
  ];
  for (const [apiResponse, status, expected] of cases) {
    const { PUT } = setup(apiResponse);
    const response = await PUT(request("PUT", session, draftBody));
    assert.equal(response.status, status, JSON.stringify(expected));
    assert.deepEqual(await response.json(), expected);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("BFF onboarding PUT: te grote body geeft 413 zonder API-call", async () => {
  const { PUT, calls } = setup();
  const response = await PUT(request("PUT", session, JSON.stringify({ answers: { company_name: "x".repeat(400 * 1024) } })));
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "payload_too_large" });
  assert.equal(calls.length, 0);
});

test("BFF onboarding: tokens en sessie-ID komen nooit in de response", async () => {
  const { GET } = setup(() => Response.json({ version: 1, answers: {} }));
  const response = await GET(request("GET", session));
  const text = await response.text();
  for (const secret of [ACCESS_TOKEN, REFRESHED_ACCESS_TOKEN, VALID_SESSION_ID]) {
    assert.ok(!text.includes(secret));
  }
});

test("BFF onboarding POST: indienen gaat met sessietoken en dezelfde body naar het submit-endpoint", async () => {
  const { POST, calls } = setup(() => Response.json({ status: "submitted", version: 2, updated_at: "2026-10-23T12:00:00.000Z" }));
  const response = await POST(new NextRequest("https://app.test/api/onboarding", { method: "POST", headers: { ...session, authorization: "Bearer browser-token" }, body: draftBody }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "submitted", version: 2, updated_at: "2026-10-23T12:00:00.000Z" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(calls[0]!.url, `${API_BASE_URL}/v1/onboarding/current/submit`);
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.body, draftBody);
  assert.equal(calls[0]!.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
});

test("BFF onboarding POST: submitstatussen 400/403/409 gaan door, zonder sessie 401", async () => {
  const missing = [{ field_id: "contact_email", questionnaire: "Q4", step: 18, message: "Dit veld is verplicht." }];
  const cases: [() => Response, number, unknown][] = [
    [() => Response.json({ error: "incomplete_answers", missing, debug: "x" }, { status: 400 }), 400, { error: "incomplete_answers", missing }],
    [() => Response.json({ error: "invalid_answers", issues: [{ field_id: "x", code: "unknown_field" }] }, { status: 400 }), 400, { error: "invalid_answers", issues: [{ field_id: "x", code: "unknown_field" }] }],
    [() => Response.json({ error: "version_conflict", current_version: 4 }, { status: 409 }), 409, { error: "version_conflict", current_version: 4 }],
    [() => Response.json({ error: "not_editable" }, { status: 409 }), 409, { error: "not_editable" }],
    [() => Response.json({ error: "schema_mismatch", schema_id: "S", schema_version: "1" }, { status: 409 }), 409, { error: "schema_mismatch", schema_id: "S", schema_version: "1" }],
    [() => Response.json({ error: "forbidden" }, { status: 403 }), 403, { error: "forbidden" }],
  ];
  for (const [apiResponse, status, expected] of cases) {
    const { POST } = setup(apiResponse);
    const response = await POST(new NextRequest("https://app.test/api/onboarding", { method: "POST", headers: session, body: draftBody }));
    assert.equal(response.status, status, JSON.stringify(expected));
    assert.deepEqual(await response.json(), expected);
  }

  const { POST, calls } = setup();
  const anonymous = await POST(new NextRequest("https://app.test/api/onboarding", { method: "POST", body: draftBody }));
  assert.equal(anonymous.status, 401);
  assert.equal(calls.length, 0);
});
