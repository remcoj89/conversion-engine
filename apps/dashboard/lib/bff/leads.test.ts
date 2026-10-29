import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { RefreshOutcome } from "../session/refresh";
import {
  buildLeadsApiPath,
  createLeadDetailHandler,
  createLeadsHandler,
  parseLeadListResponse,
  parseLeadListResponseResult,
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
  created_at: "2026-10-29T08:00:00.000Z",
  updated_at: "2026-10-29T08:00:00.000Z",
};

function setup(apiResponse = () => Response.json({ items: [record], next_cursor: null }), refresh?: () => Promise<RefreshOutcome>) {
  const calls: Array<{ url: string; headers: Headers }> = [];
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
      calls.push({ url: String(input), headers: new Headers(init?.headers) });
      return apiResponse();
    }) as typeof fetch,
  };
  return {
    leads: createLeadsHandler(dependencies),
    detail: createLeadDetailHandler(dependencies),
    calls,
  };
}

function request(url: string, withSession = true): NextRequest {
  return new NextRequest(url, withSession ? { headers: { cookie: `__Host-ce_session=${SESSION_ID}` } } : undefined);
}

test("leads BFF forwardt alleen veilige queryvelden", () => {
  assert.equal(
    buildLeadsApiPath("https://app.test/api/leads?q=Lisa&status=new&limit=25&cursor=opaque&secret=drop"),
    "/v1/leads?q=Lisa&status=new&limit=25&cursor=opaque",
  );
  assert.equal(buildLeadsApiPath("https://app.test/api/leads?status=won"), "/v1/leads?status=won");
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
