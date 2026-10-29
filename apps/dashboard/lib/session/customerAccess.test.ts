import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import CustomerWorkspaceGate from "../../app/customer-workspace-gate";
import { WorkspaceContextProvider } from "../../app/workspace-context";
import {
  initialWorkspaceContext,
  stateFromSessionResponse,
  type WorkspaceContextState,
} from "./context";

const DEMO_MARKER = "VERBORGENE DEMO-INHOUD";
const TENANT_ID = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";

function tenant(id = TENANT_ID) {
  return {
    id,
    name: "Testomgeving",
    status: "active",
    role: "owner" as const,
  };
}

function sessionBody(overrides: Record<string, unknown> = {}) {
  return {
    workspace: "customer",
    tenant: tenant(),
    memberships: [tenant()],
    tenant_selection_required: false,
    ...overrides,
  };
}

function stateFor(status: 401 | 403 | 503): WorkspaceContextState {
  return stateFromSessionResponse(new Response(null, { status }), null);
}

function renderBoundary(pathname: string): string {
  const content = createElement("p", null, DEMO_MARKER);
  const gate = createElement(CustomerWorkspaceGate, null, content);
  const provider = createElement(WorkspaceContextProvider, null, gate);
  return renderToStaticMarkup(
    createElement(PathnameContext.Provider, { value: pathname }, provider),
  );
}

function renderWithInitialContext(state: WorkspaceContextState, pathname = "/leads"): string {
  const original = { ...initialWorkspaceContext };
  Object.assign(initialWorkspaceContext, state);

  try {
    return renderBoundary(pathname);
  } finally {
    Object.assign(initialWorkspaceContext, original);
  }
}

test("customer access herkent loading, ready en tenantkeuze", () => {
  assert.equal(initialWorkspaceContext.status, "loading");
  assert.equal(
    stateFromSessionResponse(new Response(null, { status: 200 }), sessionBody()).status,
    "ready",
  );
  assert.equal(
    stateFromSessionResponse(
      new Response(null, { status: 200 }),
      sessionBody({
        tenant: null,
        memberships: [tenant(), tenant("7f2c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e")],
        tenant_selection_required: true,
      }),
    ).status,
    "tenant_selection_required",
  );
});
test("customer access bewaart expliciete 401-, 403- en unavailable-states", () => {
  assert.equal(stateFor(401).status, "unauthenticated");
  assert.equal(stateFor(403).status, "forbidden");
  assert.equal(stateFor(503).status, "unavailable");

  for (const state of [stateFor(401), stateFor(403), stateFor(503)]) {
    assert.equal(state.tenant, null);
    assert.deepEqual(state.memberships, []);
  }
});

test("customer loading gate toont geen demo-inhoud", () => {
  const markup = renderBoundary("/leads");

  assert.match(markup, /ui-state-loading/);
  assert.doesNotMatch(markup, new RegExp(DEMO_MARKER));
});

test("geblokkeerde customer states tonen geen demo-inhoud", () => {
  const states: WorkspaceContextState[] = [
    {
      status: "tenant_selection_required",
      tenant: null,
      memberships: [tenant(), tenant("7f2c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e")],
    },
    stateFor(401),
    stateFor(403),
    stateFor(503),
  ];

  for (const state of states) {
    assert.doesNotMatch(renderWithInitialContext(state), new RegExp(DEMO_MARKER));
  }
});

test("admin route wordt niet door de customer gate geblokkeerd", () => {
  const markup = renderBoundary("/admin/clients");

  assert.match(markup, new RegExp(DEMO_MARKER));
  assert.doesNotMatch(markup, /Klantomgeving laden/);
});

test("publieke auth-route wordt niet door de customer gate geblokkeerd", () => {
  const markup = renderBoundary("/auth/login");

  assert.match(markup, new RegExp(DEMO_MARKER));
  assert.doesNotMatch(markup, /Klantomgeving laden/);
});

test("invite-route wordt publiek gerenderd zonder klant-membership gate", () => {
  const markup = renderBoundary("/invite");

  assert.match(markup, new RegExp(DEMO_MARKER));
  assert.doesNotMatch(markup, /Klantomgeving laden/);
});

test("fallback-rendering bevat geen gevoelige tenantinformatie", () => {
  const markup = renderBoundary("/leads");

  assert.doesNotMatch(markup, new RegExp(TENANT_ID));
  assert.doesNotMatch(markup, /Testomgeving/);
  assert.doesNotMatch(markup, /@/);
});
