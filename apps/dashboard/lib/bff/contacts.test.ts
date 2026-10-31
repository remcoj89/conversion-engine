import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  buildContactsApiPath,
  createContactDetailHandler,
  createContactsHandler,
  parseContactResponse,
} from "./contacts";

const API_BASE_URL = "http://api.test";
const SESSION_ID = "valid-session-id-000000000000000000000000000";
const ACCESS_TOKEN = "server-side-access-token";
const CONTACT_ID = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const ORGANIZATION_ID = "7f2c3b0e-4d5a-4b6c-8d9e-0f1a2b3c4d5e";

const contact = {
  id: CONTACT_ID,
  organization_id: ORGANIZATION_ID,
  full_name: "Lisa de Vries",
  first_name: "Lisa",
  last_name: "de Vries",
  email: "lisa@example.test",
  phone: null,
  function: "Eigenaar",
  notes: null,
  communication_preference: "email",
  status: "active" as const,
  created_at: "2026-10-29T08:00:00.000Z",
  updated_at: "2026-10-29T08:00:00.000Z",
};

function setup(apiResponse: () => Response = () => Response.json({ items: [contact] })) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
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
      calls.push({ url: String(input), init: init ?? {} });
      return apiResponse();
    }) as typeof fetch,
  };
  return {
    list: createContactsHandler(dependencies),
    detail: createContactDetailHandler(dependencies),
    calls,
  };
}

function request(url: string, method = "GET", body?: unknown, extraHeaders: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      cookie: `__Host-ce_session=${SESSION_ID}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("contacts BFF whitelist alleen de queryvelden", () => {
  assert.equal(
    buildContactsApiPath(`https://app.test/api/contacts?organization_id=${ORGANIZATION_ID}&include_archived=true&secret=drop`),
    `/v1/contacts?include_archived=true&organization_id=${ORGANIZATION_ID}`,
  );
  assert.equal(buildContactsApiPath("https://app.test/api/contacts?organization_id=not-a-uuid"), null);
});

test("contacts BFF gebruikt server-sessie en stuurt geen tenantheader of browser Authorization door", async () => {
  const { list, calls } = setup();
  const response = await list(request(
    "https://app.test/api/contacts",
    "GET",
    undefined,
    { "x-tenant-id": "browser-selected-tenant", authorization: "Bearer browser-token" },
  ));

  assert.equal(response.status, 200);
  const headers = new Headers(calls[0]!.init.headers);
  assert.equal(calls[0]!.url, `${API_BASE_URL}/v1/contacts`);
  assert.equal(headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(headers.has("cookie"), false);
  assert.equal(headers.has("x-tenant-id"), false);
});

test("contacts BFF whitelist create en patch en valideert organization_id", async () => {
  const create = setup(() => Response.json(contact, { status: 201 }));
  const createResponse = await create.list(request(
    "https://app.test/api/contacts",
    "POST",
    { organization_id: ORGANIZATION_ID, full_name: " Lisa de Vries ", email: "lisa@example.test", phone: null },
    { origin: "https://app.test" },
  ));
  assert.equal(createResponse.status, 201);
  assert.equal(create.calls[0]!.init.body, JSON.stringify({
    organization_id: ORGANIZATION_ID,
    full_name: "Lisa de Vries",
    email: "lisa@example.test",
    phone: null,
  }));

  const invalidPatch = setup();
  const invalidResponse = await invalidPatch.detail(request(
    `https://app.test/api/contacts/${CONTACT_ID}`,
    "PATCH",
    { organization_id: "not-a-uuid" },
    { origin: "https://app.test" },
  ));
  assert.equal(invalidResponse.status, 400);
  assert.equal(invalidPatch.calls.length, 0);

  const patch = setup(() => Response.json(contact));
  await patch.detail(request(
    `https://app.test/api/contacts/${CONTACT_ID}`,
    "PATCH",
    { notes: "updated" },
    { origin: "https://app.test" },
  ));
  assert.equal(patch.calls[0]!.init.body, JSON.stringify({ notes: "updated" }));
});

test("contacts BFF geeft zonder sessie geen API-call", async () => {
  const { list, calls } = setup();
  const response = await list(new NextRequest("https://app.test/api/contacts"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
  assert.equal(calls.length, 0);
});

test("contacts BFF faalt gesloten bij malformed responses en mapte upstream 404 veilig", async () => {
  const malformed = setup(() => Response.json({ ...contact, secret: "do-not-leak" }));
  const malformedResponse = await malformed.detail(request(`https://app.test/api/contacts/${CONTACT_ID}`));
  assert.equal(malformedResponse.status, 503);
  assert.deepEqual(await malformedResponse.json(), { error: "api_unavailable" });
  assert.equal(parseContactResponse({ ...contact, secret: "do-not-leak" }), null);

  const notFound = setup(() => Response.json({ error: "not_found", tenant: "hidden" }, { status: 404 }));
  const notFoundResponse = await notFound.detail(request(`https://app.test/api/contacts/${CONTACT_ID}`));
  assert.equal(notFoundResponse.status, 404);
  assert.deepEqual(await notFoundResponse.json(), { error: "not_found" });
});
