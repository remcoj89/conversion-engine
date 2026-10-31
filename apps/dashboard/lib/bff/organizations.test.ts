import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  buildOrganizationsApiPath,
  createOrganizationArchiveHandler,
  createOrganizationDetailHandler,
  createOrganizationsHandler,
  parseOrganizationListResponse,
} from "./organizations";

const API_BASE_URL = "http://api.test";
const SESSION_ID = "valid-session-id-000000000000000000000000000";
const ACCESS_TOKEN = "server-side-access-token";
const ORGANIZATION_ID = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";

const organization = {
  id: ORGANIZATION_ID,
  name: "Northline Fysio",
  kvk_number: "12345678",
  website: "https://northline.example",
  general_email: "hello@northline.example",
  general_phone: "+31 20 123 4567",
  address: "Kerkstraat 1, Amsterdam",
  industry: "Fysiotherapie",
  notes: null,
  status: "active" as const,
  created_at: "2026-10-29T08:00:00.000Z",
  updated_at: "2026-10-29T08:00:00.000Z",
};

function setup(apiResponse: () => Response = () => Response.json({ items: [organization] })) {
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
    list: createOrganizationsHandler(dependencies),
    detail: createOrganizationDetailHandler(dependencies),
    archive: createOrganizationArchiveHandler(dependencies),
    calls,
  };
}

function request(
  url: string,
  method = "GET",
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): NextRequest {
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

test("organizations BFF whitelist alleen de afgesproken queryvelden", () => {
  assert.equal(
    buildOrganizationsApiPath("https://app.test/api/organizations?include_archived=true&secret=drop"),
    "/v1/organizations?include_archived=true",
  );
  assert.equal(buildOrganizationsApiPath("https://app.test/api/organizations?include_archived=1"), null);
});

test("organizations BFF gebruikt alleen de server-sessie en geen tenantheader of browser-token", async () => {
  const { list, calls } = setup();
  const response = await list(request(
    "https://app.test/api/organizations?include_archived=false",
    "GET",
    undefined,
    { "x-tenant-id": "browser-selected-tenant", authorization: "Bearer browser-token" },
  ));

  assert.equal(response.status, 200);
  assert.equal(calls[0]!.url, `${API_BASE_URL}/v1/organizations?include_archived=false`);
  const headers = new Headers(calls[0]!.init.headers);
  assert.equal(headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(headers.has("cookie"), false);
  assert.equal(headers.has("x-tenant-id"), false);
});

test("organizations BFF whitelist bodyvelden voor create, patch en archive", async () => {
  const create = setup(() => Response.json(organization, { status: 201 }));
  const createResponse = await create.list(request(
    "https://app.test/api/organizations",
    "POST",
    { name: " Northline Fysio ", website: "https://northline.example", notes: null },
    { origin: "https://app.test" },
  ));
  assert.equal(createResponse.status, 201);
  assert.equal(create.calls[0]!.url, `${API_BASE_URL}/v1/organizations`);
  assert.equal(create.calls[0]!.init.method, "POST");
  assert.equal(create.calls[0]!.init.body, JSON.stringify({
    name: "Northline Fysio",
    website: "https://northline.example",
    notes: null,
  }));

  const patch = setup(() => Response.json(organization));
  const patchResponse = await patch.detail(request(
    `https://app.test/api/organizations/${ORGANIZATION_ID}`,
    "PATCH",
    { notes: "updated", hidden: "must-not-pass" },
    { origin: "https://app.test" },
  ));
  assert.equal(patchResponse.status, 400);
  assert.equal(patch.calls.length, 0);

  const validPatch = setup(() => Response.json(organization));
  await validPatch.detail(request(
    `https://app.test/api/organizations/${ORGANIZATION_ID}`,
    "PATCH",
    { notes: "updated" },
    { origin: "https://app.test" },
  ));
  assert.equal(validPatch.calls[0]!.init.body, JSON.stringify({ notes: "updated" }));

  const archive = setup(() => Response.json({ ...organization, status: "archived" }));
  const archiveResponse = await archive.archive(request(
    `https://app.test/api/organizations/${ORGANIZATION_ID}/archive`,
    "POST",
    undefined,
    { origin: "https://app.test" },
  ));
  assert.equal(archiveResponse.status, 200);
  assert.equal(archive.calls[0]!.url, `${API_BASE_URL}/v1/organizations/${ORGANIZATION_ID}/archive`);
  assert.equal(archive.calls[0]!.init.method, "POST");
  assert.equal(archive.calls[0]!.init.body, "");
});

test("organizations BFF weigert mutaties zonder same-origin en onbekende bodyvelden", async () => {
  const { list, calls } = setup();
  const response = await list(request("https://app.test/api/organizations", "POST", { name: "Northline" }, { origin: "https://evil.test" }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
  assert.equal(calls.length, 0);

  const invalidBody = setup();
  const invalidResponse = await invalidBody.list(request("https://app.test/api/organizations", "POST", { name: "Northline", secret: "drop" }, { origin: "https://app.test" }));
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(await invalidResponse.json(), { error: "invalid_body" });
  assert.equal(invalidBody.calls.length, 0);

  const withoutOrigin = setup();
  const forbidden = await withoutOrigin.list(request("https://app.test/api/organizations", "POST", { name: "Northline" }));
  assert.equal(forbidden.status, 403);
  assert.deepEqual(await forbidden.json(), { error: "forbidden" });
  assert.equal(withoutOrigin.calls.length, 0);
});

test("organizations BFF faalt gesloten bij malformed success responses", async () => {
  const malformed = setup(() => Response.json({ items: [{ ...organization, secret: "do-not-leak" }] }));
  const response = await malformed.list(request("https://app.test/api/organizations"));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "api_unavailable" });
  assert.equal(parseOrganizationListResponse({ items: [{ ...organization, secret: "do-not-leak" }] }), null);
});

test("organizations BFF mapt bekende upstreamfouten veilig", async () => {
  for (const [status, error] of [[401, "unauthorized"], [403, "forbidden"], [404, "not_found"], [502, "api_unavailable"], [503, "api_unavailable"]] as const) {
    const { detail } = setup(() => Response.json({ error, secret: "hidden" }, { status }));
    const response = await detail(request(`https://app.test/api/organizations/${ORGANIZATION_ID}`));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error });
  }
});
