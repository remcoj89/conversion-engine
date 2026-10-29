import assert from "node:assert/strict";
import test from "node:test";
import { mapPlatformTenantDetail } from "./platformTenantDetailMapping";

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
  website_summary: { total: 2, active: 1 },
} as const;

test("mapt het live detailcontract naar leesbare operationele velden", () => {
  const detail = mapPlatformTenantDetail(tenant);

  assert.equal(detail.name, "Northline Fysio");
  assert.equal(detail.accountStatus, "Actief");
  assert.equal(detail.accountStatusTone, "success");
  assert.equal(detail.onboardingStatus, "Goedgekeurd");
  assert.equal(detail.onboardingVersion, "Versie 4");
  assert.equal(detail.websiteStatus, "1 actief van 2");
  assert.equal(detail.websiteActive, "1");
  assert.equal(detail.websiteTotal, "2");
  assert.equal(detail.createdAtIso, tenant.created_at);
  assert.equal(detail.onboardingUpdatedAtIso, tenant.onboarding.updated_at);
});

test("toont ontbrekende onboarding als expliciete lege status zonder demo-data", () => {
  const detail = mapPlatformTenantDetail({
    ...tenant,
    onboarding: null,
    website_summary: { total: 0, active: 0 },
  });

  assert.equal(detail.onboardingStatus, "Niet gestart");
  assert.equal(detail.onboardingVersion, "Geen versie");
  assert.equal(detail.onboardingUpdatedAt, "Niet gestart");
  assert.equal(detail.websiteStatus, "Geen websites gekoppeld");
  assert.equal(detail.websiteStatusTone, "neutral");
});
