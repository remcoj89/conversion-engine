import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { getAuthContext } from "./auth/authHook.js";
import { authorize, type Permission } from "./auth/authorization.js";
import { resolveRequestContext } from "./auth/requestContext.js";
import type { Membership } from "./auth/types.js";

test("authorize: dashboard:read is toegestaan voor owner en team_member", () => {
  assert.equal(authorize("owner", "dashboard:read"), true);
  assert.equal(authorize("team_member", "dashboard:read"), true);
});

test("authorize: onbekende permission wordt geweigerd", () => {
  // Casts simuleren ongecontroleerde invoer die de TypeScript-types omzeilt.
  for (const permission of ["settings:manage", "toString", "__proto__", ""]) {
    assert.equal(authorize("owner", permission as Permission), false, permission);
  }
});

test("getAuthContext: faalt zonder context", () => {
  assert.throws(() => getAuthContext({} as FastifyRequest), /Auth context missing/);
});

const userId: string = randomUUID();
const tenantA: string = randomUUID();
const tenantB: string = randomUUID();

const ownerOfA: Membership = { tenantId: tenantA, userId, role: "owner", status: "active" };
const memberOfB: Membership = { tenantId: tenantB, userId, role: "team_member", status: "active" };

test("resolveRequestContext: één membership zonder tenantkeuze geeft die tenant", () => {
  assert.deepEqual(resolveRequestContext([ownerOfA]), {
    status: "success",
    context: { userId, tenantId: tenantA, role: "owner" },
  });
});

test("resolveRequestContext: meerdere memberships zonder tenantkeuze geeft tenant_required", () => {
  assert.deepEqual(resolveRequestContext([ownerOfA, memberOfB]), { status: "tenant_required" });
});

test("resolveRequestContext: geldige tenantkeuze geeft tenant en rol van die membership", () => {
  assert.deepEqual(resolveRequestContext([ownerOfA], tenantA), {
    status: "success",
    context: { userId, tenantId: tenantA, role: "owner" },
  });
});

test("resolveRequestContext: keuze voor tenant A of B geeft de rol van die tenant", () => {
  const memberships = [ownerOfA, memberOfB];

  assert.deepEqual(resolveRequestContext(memberships, tenantA), {
    status: "success",
    context: { userId, tenantId: tenantA, role: "owner" },
  });
  assert.deepEqual(resolveRequestContext(memberships, tenantB), {
    status: "success",
    context: { userId, tenantId: tenantB, role: "team_member" },
  });
});

test("resolveRequestContext: onbekende UUID geeft membership_forbidden", () => {
  assert.deepEqual(resolveRequestContext([ownerOfA, memberOfB], randomUUID()), {
    status: "membership_forbidden",
  });
});

test("resolveRequestContext: ongeldige UUID geeft invalid_tenant", () => {
  for (const requested of ["", "abc", `${tenantA} `, `${tenantA}x`, tenantA.replaceAll("-", "")]) {
    assert.deepEqual(resolveRequestContext([ownerOfA], requested), { status: "invalid_tenant" }, requested);
  }
});

test("resolveRequestContext: lege memberships geeft membership_forbidden", () => {
  assert.deepEqual(resolveRequestContext([]), { status: "membership_forbidden" });
  assert.deepEqual(resolveRequestContext([], tenantA), { status: "membership_forbidden" });
});

test("resolveRequestContext: accepteert nooit een tenant die niet in memberships zit", () => {
  const memberships = [ownerOfA, memberOfB];
  const outsider = randomUUID();

  for (const requested of [undefined, tenantA, tenantB, outsider, tenantA.toUpperCase()]) {
    const result = resolveRequestContext(memberships, requested);
    if (result.status === "success") {
      assert.ok([tenantA, tenantB].includes(result.context.tenantId), String(requested));
    }
  }
  assert.equal(resolveRequestContext(memberships, outsider).status, "membership_forbidden");
});

test("resolveRequestContext: tenantkeuze is niet hoofdlettergevoelig en geeft de membership-ID terug", () => {
  const result = resolveRequestContext([ownerOfA], tenantA.toUpperCase());
  assert.equal(result.status, "success");
  assert.equal(result.status === "success" && result.context.tenantId, tenantA);
});

test("resolveRequestContext: niet-actieve membership wordt nooit gekozen", () => {
  const disabledInB: Membership = { ...memberOfB, status: "disabled" };

  assert.deepEqual(resolveRequestContext([disabledInB]), { status: "membership_forbidden" });
  assert.deepEqual(resolveRequestContext([disabledInB], tenantB), { status: "membership_forbidden" });
  // With A as the only active membership, no tenant choice is required.
  assert.equal(resolveRequestContext([ownerOfA, disabledInB]).status, "success");
});
