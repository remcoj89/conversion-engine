import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkspaceFetch,
  stateFromSessionResponse,
  TENANT_HEADER,
} from "./context";

const TENANT_ID = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const OTHER_TENANT_ID = "7f2c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";

function tenant(id = TENANT_ID) {
  return { id, name: "Testomgeving", status: "active", role: "owner" as const };
}

function contextBody(overrides: Record<string, unknown> = {}) {
  return {
    workspace: "customer",
    tenant: tenant(),
    memberships: [tenant()],
    tenant_selection_required: false,
    ...overrides,
  };
}

test("vertaalt een geldige context naar ready", () => {
  const state = stateFromSessionResponse(new Response(null, { status: 200 }), contextBody());

  assert.equal(state.status, "ready");
  assert.equal(state.tenant?.id, TENANT_ID);
});

test("vereist een tenantkeuze wanneer meerdere memberships beschikbaar zijn", () => {
  const state = stateFromSessionResponse(
    new Response(null, { status: 200 }),
    contextBody({
      tenant: null,
      memberships: [tenant(), tenant(OTHER_TENANT_ID)],
      tenant_selection_required: true,
    }),
  );

  assert.equal(state.status, "tenant_selection_required");
  assert.equal(state.memberships.length, 2);
});

test("wijst ongeldige, dubbele en niet-actieve tenantcontext af", () => {
  const cases = [
    contextBody({ tenant: { ...tenant(), status: "suspended" } }),
    contextBody({ memberships: [tenant(), tenant()] }),
    contextBody({ tenant: { ...tenant(), id: OTHER_TENANT_ID } }),
  ];

  for (const body of cases) {
    assert.equal(stateFromSessionResponse(new Response(null, { status: 200 }), body).status, "unavailable");
  }
});

test("behoudt expliciete autorisatie- en beschikbaarheidsstatussen", () => {
  assert.equal(stateFromSessionResponse(new Response(null, { status: 401 }), null).status, "unauthenticated");
  assert.equal(stateFromSessionResponse(new Response(null, { status: 403 }), null).status, "forbidden");
  assert.equal(stateFromSessionResponse(new Response(null, { status: 503 }), null).status, "unavailable");
});

test("voegt de tenantheader alleen toe aan same-origin BFF-verzoeken", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const baseFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(null, { status: 204 });
  };
  const workspaceFetch = createWorkspaceFetch(TENANT_ID, baseFetch);

  await workspaceFetch("/api/dashboard/today", { headers: { "x-client": "present" } });
  await workspaceFetch("https://external.test/api/dashboard/today");

  assert.equal(new Headers(calls[0]?.init?.headers).get(TENANT_HEADER), TENANT_ID);
  assert.equal(new Headers(calls[0]?.init?.headers).get("x-client"), "present");
  assert.equal(new Headers(calls[1]?.init?.headers).get(TENANT_HEADER), null);
});
