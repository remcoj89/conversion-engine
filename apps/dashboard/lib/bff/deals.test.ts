import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  createDealArchiveHandler,
  createDealDetailHandler,
  createDealUpdateHandler,
  createDealsHandler,
  buildDealsApiPath,
  parseDealListResponse,
} from "./deals";

const API_BASE_URL = "http://api.test";
const SESSION_ID = "valid-session-id-000000000000000000000000000";
const ACCESS_TOKEN = "server-side-access-token";
const DEAL_ID = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const CONTACT_ID = "7f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const OWNER_ID = "8f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";

const record = {
  id: DEAL_ID,
  contact_id: CONTACT_ID,
  title: "Website traject",
  description: null,
  amount_eur: "1250.00",
  owner_user_id: OWNER_ID,
  stage: "proposal",
  expected_close_date: "2026-12-15",
  loss_reason: null,
  status: "active",
  created_at: "2026-11-02T08:00:00.000Z",
  updated_at: "2026-11-02T08:00:00.000Z",
  archived_at: null,
};

function setup(apiResponse = () => Response.json({ items: [record] })) {
  const calls: Array<{ url: string; headers: Headers; body: string }> = [];
  const dependencies = {
    apiBaseUrl: API_BASE_URL,
    lookupSession: async (sessionId: string) => sessionId === SESSION_ID
      ? {
        accessToken: ACCESS_TOKEN,
        accessExpiresAt: new Date(Date.now() + 30 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 12 * 60 * 60_000),
      }
      : null,
    refreshSession: async () => ({ status: "ok", accessToken: ACCESS_TOKEN } as const),
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers), body: String(init?.body ?? "") });
      return apiResponse();
    }) as typeof fetch,
  };
  return {
    list: createDealsHandler(dependencies),
    detail: createDealDetailHandler(dependencies),
    update: createDealUpdateHandler(dependencies),
    archive: createDealArchiveHandler(dependencies),
    calls,
  };
}

function request(url: string, withSession = true): NextRequest {
  return new NextRequest(url, withSession ? {
    headers: {
      cookie: `__Host-ce_session=${SESSION_ID}`,
      authorization: "Bearer browser-token-must-not-forward",
      "x-tenant-id": "tenant-from-browser-must-not-forward",
    },
  } : undefined);
}

function mutationRequest(url: string, method: "POST" | "PATCH", body: unknown, withSession = true): NextRequest {
  return new NextRequest(url, withSession ? {
    method,
    headers: {
      origin: "https://app.test",
      "content-type": "application/json",
      cookie: `__Host-ce_session=${SESSION_ID}`,
      authorization: "Bearer browser-token-must-not-forward",
      "x-tenant-id": "tenant-from-browser-must-not-forward",
    },
    body: JSON.stringify(body),
  } : { method, headers: { origin: "https://app.test", "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("deals BFF forwardt uitsluitend de expliciete archiveflag", () => {
  assert.equal(buildDealsApiPath("https://app.test/api/deals?include_archived=true&tenant=drop"), "/v1/deals?include_archived=true");
  assert.equal(buildDealsApiPath("https://app.test/api/deals"), "/v1/deals");
  assert.equal(buildDealsApiPath("https://app.test/api/deals?include_archived=1"), null);
});

test("deals BFF gebruikt de HttpOnly-sessie en forwardt geen browserauth of tenantheader", async () => {
  const { list, calls } = setup();
  const response = await list(request("https://app.test/api/deals?include_archived=true"));

  assert.equal(response.status, 200);
  assert.equal(calls[0]!.url, `${API_BASE_URL}/v1/deals?include_archived=true`);
  assert.equal(calls[0]!.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(calls[0]!.headers.has("cookie"), false);
  assert.equal(calls[0]!.headers.has("x-tenant-id"), false);
  assert.deepEqual(await response.json(), {
    items: [{
      id: DEAL_ID,
      title: "Website traject",
      amount_eur: "1250.00",
      stage: "proposal",
      status: "active",
      expected_close_date: "2026-12-15",
      loss_reason: null,
    }],
  });
});

test("deals BFF geeft zonder sessie geen upstream-call", async () => {
  const { list, calls } = setup();
  const response = await list(request("https://app.test/api/deals", false));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
  assert.equal(calls.length, 0);
});

test("deals BFF valideert het volledige upstreamcontract en lekt geen interne velden", async () => {
  const malformed = { items: [{ ...record, owner_user_id: "not-a-uuid" }] };
  const { list } = setup(() => Response.json(malformed));
  const response = await list(request("https://app.test/api/deals"));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "api_unavailable" });
  assert.equal(parseDealListResponse(malformed), null);
});

test("deal-detail BFF onderscheidt not-found, forbidden en upstreamproblemen", async () => {
  const notFound = setup(() => Response.json({ error: "not_found", tenant: "secret" }, { status: 404 }));
  const notFoundResponse = await notFound.detail(request(`https://app.test/api/deals/${DEAL_ID}`));
  assert.equal(notFoundResponse.status, 404);
  assert.deepEqual(await notFoundResponse.json(), { error: "not_found" });

  const forbidden = setup(() => Response.json({ error: "forbidden", tenant: "secret" }, { status: 403 }));
  const forbiddenResponse = await forbidden.detail(request(`https://app.test/api/deals/${DEAL_ID}`));
  assert.equal(forbiddenResponse.status, 403);
  assert.deepEqual(await forbiddenResponse.json(), { error: "forbidden" });

  const unavailable = setup(() => Response.json({ error: "api_unavailable" }, { status: 503 }));
  const unavailableResponse = await unavailable.detail(request(`https://app.test/api/deals/${DEAL_ID}`));
  assert.equal(unavailableResponse.status, 503);
  assert.deepEqual(await unavailableResponse.json(), { error: "api_unavailable" });
});

test("deal create BFF accepteert alleen allowlisted velden en gebruikt server-side auth", async () => {
  const { list, calls } = setup(() => Response.json(record, { status: 201 }));
  const response = await list(mutationRequest("https://app.test/api/deals", "POST", {
    contact_id: CONTACT_ID,
    title: " Website traject ",
    description: null,
    amount_eur: "1250.00",
    stage: "new",
    expected_close_date: null,
    loss_reason: null,
    tenant_id: "must-be-rejected",
  }));

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);

  const valid = await list(mutationRequest("https://app.test/api/deals", "POST", {
    contact_id: CONTACT_ID,
    title: " Website traject ",
    description: null,
    amount_eur: "1250.00",
    stage: "new",
    expected_close_date: null,
    loss_reason: null,
  }));
  assert.equal(valid.status, 201);
  assert.equal(calls[0]?.url, `${API_BASE_URL}/v1/deals`);
  assert.equal(calls[0]?.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(calls[0]?.headers.has("x-tenant-id"), false);
  assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), {
    contact_id: CONTACT_ID,
    title: "Website traject",
    description: null,
    amount_eur: "1250.00",
    stage: "new",
    expected_close_date: null,
    loss_reason: null,
  });
});

test("deal update BFF weigert contactwijziging en mapt stageconflict veilig", async () => {
  const { update, calls } = setup(() => Response.json({ error: "invalid_stage_transition", tenant: "secret" }, { status: 409 }));
  const rejected = await update(mutationRequest(`https://app.test/api/deals/${DEAL_ID}`, "PATCH", { contact_id: CONTACT_ID }));
  assert.equal(rejected.status, 400);
  assert.equal(calls.length, 0);

  const conflict = await update(mutationRequest(`https://app.test/api/deals/${DEAL_ID}`, "PATCH", { stage: "won" }));
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "invalid_stage_transition" });
});

test("deal archive BFF vereist same-origin en een lege body", async () => {
  const { archive, calls } = setup(() => Response.json(record));
  const invalidBody = await archive(mutationRequest(`https://app.test/api/deals/${DEAL_ID}/archive`, "POST", { tenant_id: "secret" }));
  assert.equal(invalidBody.status, 400);
  assert.equal(calls.length, 0);

  const valid = await archive(new NextRequest(`https://app.test/api/deals/${DEAL_ID}/archive`, {
    method: "POST",
    headers: { origin: "https://app.test", cookie: `__Host-ce_session=${SESSION_ID}` },
  }));
  assert.equal(valid.status, 200);
  assert.equal(calls[0]?.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(calls[0]?.headers.has("x-tenant-id"), false);
});
