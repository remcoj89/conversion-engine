import assert from "node:assert/strict";
import test from "node:test";
import {
  authorize,
  authorizeForUser,
  permissionMap,
  type Permission,
  type TeamMemberPermissionContract,
} from "./authorization.js";

const crmPermissions = Object.keys(permissionMap) as Permission[];

test("owner krijgt alle bekende tenant- en CRM-rechten", () => {
  for (const permission of crmPermissions) {
    assert.equal(authorizeForUser("owner", permission), true, permission);
  }
});

test("tenant_admin krijgt teambeheer, auditlog en tenant-CRM-rechten maar geen onboardingbeheer", () => {
  for (const permission of [
    "dashboard:read",
    "crm:read",
    "crm:create",
    "crm:update",
    "crm:archive",
    "crm:import",
    "crm:export",
    "crm:audit:read",
    "team:manage",
    "leads:create",
    "leads:read",
  ] as const) {
    assert.equal(authorizeForUser("tenant_admin", permission), true, permission);
  }
  assert.equal(authorizeForUser("tenant_admin", "onboarding:manage"), false);
});

test("team_member krijgt alleen expliciet toegekende configureerbare rechten", () => {
  const permissions: TeamMemberPermissionContract = {
    "crm:read": true,
    "crm:update": false,
    "crm:export": true,
  };

  assert.equal(authorizeForUser("team_member", "crm:read", permissions), true);
  assert.equal(authorizeForUser("team_member", "crm:update", permissions), false);
  assert.equal(authorizeForUser("team_member", "crm:export", permissions), true);
  assert.equal(authorizeForUser("team_member", "crm:create", permissions), false);
  assert.equal(authorizeForUser("team_member", "team:manage", permissions), false);
  assert.equal(authorizeForUser("team_member", "crm:audit:read", permissions), false);
});

test("team_member valt zonder permission contract terug op deny-by-default", () => {
  assert.equal(authorizeForUser("team_member", "dashboard:read"), false);
  assert.equal(authorizeForUser("team_member", "crm:read", {}), false);
  assert.equal(authorizeForUser("team_member", "crm:import", { "crm:import": false }), false);
});

test("onbekende rollen en rechten worden gesloten geweigerd", () => {
  assert.equal(authorizeForUser("unknown" as never, "crm:read", { "crm:read": true }), false);
  assert.equal(authorizeForUser("platform_admin" as never, "crm:read", { "crm:read": true }), false);
  assert.equal(authorizeForUser("tenant_admin", "crm:unknown" as Permission), false);
  assert.equal(authorize("owner", "__proto__" as Permission), false);
});

test("legacy authorize blijft backward compatible voor bestaande routes", () => {
  assert.equal(authorize("owner", "dashboard:read"), true);
  assert.equal(authorize("team_member", "dashboard:read"), true);
  assert.equal(authorize("team_member", "leads:create"), true);
  assert.equal(authorize("tenant_admin", "dashboard:read"), true);
});
