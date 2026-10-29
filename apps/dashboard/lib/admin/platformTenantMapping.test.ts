import assert from "node:assert/strict";
import test from "node:test";
import { mapPlatformTenant, mapPlatformTenantList } from "./platformTenantMapping";

const tenant = {
  id: "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e",
  name: "Northline Fysio",
  status: "active",
  created_at: "2026-10-28T08:00:00.000Z",
  onboarding: {
    status: "approved",
    version: 4,
    updated_at: "2026-10-28T08:14:00.000Z",
  },
  website_summary: { total: 1, active: 1 },
} as const;

test("mapt live tenantmetadata naar leesbare operationele labels", () => {
  const row = mapPlatformTenant(tenant);

  assert.equal(row.name, "Northline Fysio");
  assert.equal(row.accountStatus, "Actief");
  assert.equal(row.accountStatusTone, "success");
  assert.equal(row.onboardingStatus, "Goedgekeurd");
  assert.equal(row.websiteStatus, "1 actief van 1");
  assert.equal(row.websiteStatusTone, "success");
  assert.equal(row.createdAtIso, tenant.created_at);
});

test("toont ontbrekende bronnen expliciet zonder fictieve data", () => {
  const row = mapPlatformTenant({
    ...tenant,
    status: "unknown",
    onboarding: null,
    website_summary: { total: 0, active: 0 },
  });

  assert.equal(row.accountStatus, "Onbekend");
  assert.equal(row.onboardingStatus, "Niet gestart");
  assert.equal(row.onboardingMeta, "Nog geen onboarding beschikbaar");
  assert.equal(row.websiteStatus, "Geen website gekoppeld");
  assert.equal(row.websiteStatusTone, "neutral");
});

test("behoudt de volgorde van de serverresponse", () => {
  const rows = mapPlatformTenantList({ items: [tenant, { ...tenant, id: "7f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e", name: "Tweede tenant" }], next_cursor: null });
  assert.deepEqual(rows.map((row) => row.name), ["Northline Fysio", "Tweede tenant"]);
});
