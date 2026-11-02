import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { RefreshOutcome } from "../session/refresh";
import {
  buildLeadsApiPath,
  createLeadDetailHandler,
  createLeadStatusHandler,
  createLeadsHandler,
  parseLeadListResponse,
  parseLeadListResponseResult,
  updateLeadStatus,
} from "./leads";

const API_BASE_URL = "http://api.test";
const SESSION_ID = "valid-session-id-000000000000000000000000000";
const ACCESS_TOKEN = "server-side-access-token";
const LEAD_ID = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";

const record = {
  id: LEAD_ID,
  name: "Lisa de Vries",
  email: "lisa@example.test",
  phone: null,
  message: "Ik wil meer weten.",
  source: "contact_form",
  status: "new",
  next_action: { label: "Aanvraag beoordelen", due_at: "2026-10-30T12:00:00.000Z" },
  created_at: "2026-10-29T08:00:00.000Z",
  updated_at: "2026-10-29T08:00:00.000Z",
};

function setup(apiResponse = () => Response.json({ items: [record], next_cursor: null }), refresh?: () => Promise<RefreshOutcome>) {
  const calls: Array<{ url: string; headers: Headers; body: string | undefined }> = [];
  const dependencies = {
    apiBaseUrl: API_BASE_URL,
    lookupSession: async (sessionId: string) => sessionId === SESSION_ID
      ? {
        accessToken: ACCESS_TOKEN,
        accessExpiresAt: new Date(Date.now() + 30 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 12 * 60 * 60_000),
      }
      : null,
    refreshSession: async () => refresh?.() ?? { status: "ok", accessToken: ACCESS_TOKEN } as const,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(input),
        headers: new Headers(init?.headers),
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return apiResponse();
    }) as typeof fetch,
  };
  return {
    leads: createLeadsHandler(dependencies),
    detail: createLeadDetailHandler(dependencies),
    status: createLeadStatusHandler(dependencies),
    calls,
  };
}

function request(url: string, withSession = true): NextRequest {
  return new NextRequest(url, withSession ? { headers: { cookie: `__Host-ce_session=${SESSION_ID}` } } : undefined);
}

function statusRequest(body: string, options: { withSession?: boolean; sameOrigin?: boolean } = {}): NextRequest {
  const headers = new Headers({
    cookie: options.withSession === false ? "" : `__Host-ce_session=${SESSION_ID}`,
    "content-type": "application/json",
    authorization: "Bearer browser-token-must-not-forward",
    "x-tenant-id": "tenant-from-browser-must-not-forward",
  });
  if (options.sameOrigin !== false) headers.set("origin", "https://app.test");
  return new NextRequest(`https://app.test/api/leads/${LEAD_ID}/status`, {
    method: "PATCH",
    headers,
    body,
  });
}

test("leads BFF forwardt alleen veilige queryvelden", () => {
  assert.equal(
    buildLeadsApiPath("https://app.test/api/leads?q=Lisa&status=new&limit=25&cursor=opaque&secret=drop"),
    "/v1/leads?q=Lisa&status=new&limit=25&cursor=opaque",
  );
  assert.equal(buildLeadsApiPath("https://app.test/api/leads?status=won"), "/v1/leads?status=won");
  assert.equal(buildLeadsApiPath("https://app.test/api/leads?status=appointment_scheduled"), "/v1/leads?status=appointment_scheduled");
  assert.equal(buildLeadsApiPath("https://app.test/api/leads?status=unknown"), null);
  assert.equal(buildLeadsApiPath("https://app.test/api/leads?limit=999"), null);
});

test("leads BFF gebruikt alleen de server-sessie en stuurt tenantcontext door", async () => {
  const { leads, calls } = setup();
  const response = await leads(request("https://app.test/api/leads?q=Lisa", true));

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `${API_BASE_URL}/v1/leads?q=Lisa`);
  assert.equal(calls[0]!.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(calls[0]!.headers.has("cookie"), false);
  assert.equal(calls[0]!.headers.has("x-tenant-id"), false);
});

test("leads BFF geeft zonder sessie geen API-call en wist de sessiecookie", async () => {
  const { leads, calls } = setup();
  const response = await leads(request("https://app.test/api/leads", false));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal(calls.length, 0);
});

test("leads BFF valideert succesvolle responses strikt", async () => {
  const malformed = { items: [{ ...record, secret: "do-not-leak" }], next_cursor: null };
  const { leads } = setup(() => Response.json(malformed));
  const response = await leads(request("https://app.test/api/leads"));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "api_unavailable" });
  assert.equal(parseLeadListResponse(malformed), null);
});

test("leads BFF maskeert upstreamfouten en onderscheidt detail-not-found", async () => {
  const { leads } = setup(() => Response.json({ error: "forbidden", tenant: "secret" }, { status: 403 }));
  const forbidden = await leads(request("https://app.test/api/leads"));
  assert.equal(forbidden.status, 403);
  assert.deepEqual(await forbidden.json(), { error: "forbidden" });

  const detailSetup = setup(() => Response.json({ error: "not_found", tenant: "secret" }, { status: 404 }));
  const notFound = await detailSetup.detail(request(`https://app.test/api/leads/${LEAD_ID}`));
  assert.equal(notFound.status, 404);
  assert.deepEqual(await notFound.json(), { error: "not_found" });
});

test("leads response parser behoudt de veilige read-contractvelden", async () => {
  const parsed = await parseLeadListResponseResult(Response.json({ items: [record], next_cursor: null }));
  assert.deepEqual(parsed, { status: "ready", data: { items: [record], next_cursor: null } });
});

test("leads parser accepteert alle afgesproken lifecycle-statussen", () => {
  for (const status of ["new", "qualified", "appointment_scheduled", "proposal", "won", "lost"] as const) {
    assert.notEqual(parseLeadListResponse({ items: [{ ...record, status, next_action: null }], next_cursor: null }), null);
  }
});

test("leads parser weigert een ontbrekende of onveilige opvolgactie", () => {
  assert.equal(parseLeadListResponse({ items: [{ ...record, next_action: undefined }], next_cursor: null }), null);
  assert.equal(parseLeadListResponse({ items: [{ ...record, next_action: { label: "Volg op", due_at: "morgen" } }], next_cursor: null }), null);
  assert.equal(parseLeadListResponse({ items: [{ ...record, next_action: { label: "Volg op", due_at: null, secret: "drop" } }], next_cursor: null }), null);
  assert.notEqual(parseLeadListResponse({ items: [{ ...record, next_action: null }], next_cursor: null }), null);
});

test("leads parser onderscheidt een veilige contractfout van unavailable", async () => {
  assert.deepEqual(
    await parseLeadListResponseResult(Response.json({ error: "api_error" }, { status: 400 })),
    { status: "error", data: null },
  );
  assert.deepEqual(
    await parseLeadListResponseResult(Response.json({ error: "api_unavailable" }, { status: 503 })),
    { status: "unavailable", data: null },
  );
});

test("lead-status BFF accepteert alleen same-origin JSON en gebruikt uitsluitend de sessie", async () => {
  const mutation = { id: LEAD_ID, status: "qualified", next_action: null, updated_at: "2026-10-30T12:00:00.000Z" };
  const { status, calls } = setup(() => Response.json(mutation));
  const response = await status(statusRequest(JSON.stringify({ status: "qualified" })));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), mutation);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `${API_BASE_URL}/v1/leads/${LEAD_ID}/status`);
  assert.equal(calls[0]!.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(calls[0]!.headers.has("cookie"), false);
  assert.equal(calls[0]!.headers.has("x-tenant-id"), false);
  assert.equal(calls[0]!.body, JSON.stringify({ status: "qualified" }));
});

test("lead-status BFF weigert cross-origin, ontbrekende sessie en ongeldige body zonder API-call", async () => {
  const { status, calls } = setup();
  const crossOrigin = await status(statusRequest(JSON.stringify({ status: "qualified" }), { sameOrigin: false }));
  assert.equal(crossOrigin.status, 403);

  const invalidBody = await status(statusRequest(JSON.stringify({ status: "qualified", extra: true })));
  assert.equal(invalidBody.status, 400);
  assert.deepEqual(await invalidBody.json(), { error: "invalid_body" });

  const unauthenticated = await status(statusRequest(JSON.stringify({ status: "qualified" }), { withSession: false }));
  assert.equal(unauthenticated.status, 401);
  assert.equal(calls.length, 0);
});

test("lead-status BFF maskeert statusconflict en onbereikbare API veilig", async () => {
  const conflict = setup(() => Response.json({ error: "invalid_status_transition", secret: "drop" }, { status: 409 }));
  const conflictResponse = await conflict.status(statusRequest(JSON.stringify({ status: "qualified" })));
  assert.equal(conflictResponse.status, 409);
  assert.deepEqual(await conflictResponse.json(), { error: "invalid_status_transition" });

  const unavailable = setup(() => Response.json({ error: "api_unavailable" }, { status: 503 }));
  const unavailableResponse = await unavailable.status(statusRequest(JSON.stringify({ status: "qualified" })));
  assert.equal(unavailableResponse.status, 503);
  assert.deepEqual(await unavailableResponse.json(), { error: "api_unavailable" });
});

test("updateLeadStatus doet geen request voor ongeldige input en behoudt conflict als foutstatus", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return Response.json({ error: "invalid_status_transition" }, { status: 409 });
  };

  assert.deepEqual(await updateLeadStatus(fetcher, "not-a-uuid", "qualified"), { status: "invalid_request", data: null });
  assert.deepEqual(await updateLeadStatus(fetcher, LEAD_ID, "not-a-status" as never), { status: "invalid_request", data: null });
  assert.equal(calls, 0);
  assert.deepEqual(await updateLeadStatus(fetcher, LEAD_ID, "qualified"), { status: "invalid_status_transition", data: null });
  assert.equal(calls, 1);
});
