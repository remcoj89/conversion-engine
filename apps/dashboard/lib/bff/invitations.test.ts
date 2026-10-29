import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createInvitationAcceptHandler, parseAcceptedInvitation } from "./invitations";

const API_BASE_URL = "http://api.test";
const SESSION_ID = "valid-session-id-000000000000000000000000000";
const ACCESS_TOKEN = "server-side-access-token";
const accepted = {
  tenant_id: "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e",
  tenant_name: "Northline Fysio",
  status: "active",
};

function setup(apiResponse: () => Response = () => Response.json(accepted)) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const handler = createInvitationAcceptHandler({
    apiBaseUrl: API_BASE_URL,
    lookupSession: async (sessionId) => sessionId === SESSION_ID
      ? {
        accessToken: ACCESS_TOKEN,
        accessExpiresAt: new Date(Date.now() + 30 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 12 * 60 * 60_000),
      }
      : null,
    refreshSession: async () => ({ status: "ok", accessToken: ACCESS_TOKEN }),
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return apiResponse();
    }) as typeof fetch,
  });
  return { handler, calls };
}

function request(body = JSON.stringify({ token: "opaque-token" }), headers: Record<string, string> = {}) {
  return new NextRequest("https://app.test/api/invitations/accept", {
    method: "POST",
    headers: {
      cookie: `__Host-ce_session=${SESSION_ID}`,
      origin: "https://app.test",
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}

test("acceptatie stuurt het fragmenttoken uitsluitend in de request body naar de API", async () => {
  const { handler, calls } = setup();
  const response = await handler(request());

  assert.equal(response.status, 200);
  assert.equal(calls[0]!.url, `${API_BASE_URL}/v1/invitations/accept`);
  assert.equal(new Headers(calls[0]!.init.headers).has("x-tenant-id"), false);
  assert.equal(calls[0]!.init.body, JSON.stringify({ token: "opaque-token" }));
  assert.equal(calls[0]!.url.includes("opaque-token"), false);
  assert.deepEqual(await response.json(), accepted);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("acceptatie maakt upstream statusfouten expliciet maar lekt geen details", async () => {
  const { handler } = setup(() => Response.json({ error: "invitation_revoked", detail: "internal" }, { status: 410 }));
  const response = await handler(request());

  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), { error: "invitation_revoked" });
});

test("generieke onbeschikbare uitnodiging wordt veilig doorgestuurd", async () => {
  const { handler } = setup(() => Response.json({ error: "invitation_unavailable", detail: "internal" }, { status: 410 }));
  const response = await handler(request());

  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), { error: "invitation_unavailable" });
});

test("accepted-parser weigert extra of ongeldige responsevelden", () => {
  assert.deepEqual(parseAcceptedInvitation(accepted), accepted);
  assert.equal(parseAcceptedInvitation({ ...accepted, secret: "leak" }), null);
  assert.equal(parseAcceptedInvitation({ ...accepted, status: "pending" }), null);
});
