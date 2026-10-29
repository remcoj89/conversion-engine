import assert from "node:assert/strict";
import test from "node:test";
import { buildPlatformTenantDetail } from "./platformTenantDetailRepository.js";

const tenantA = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Synthetic Alpha",
  status: "active",
  createdAt: new Date("2026-10-28T10:00:00.000Z"),
};

test("bouwt alleen operationele tenantmetadata en kiest het open project", () => {
  const detail = buildPlatformTenantDetail(
    tenantA,
    [
      {
        id: "00000000-0000-4000-8000-000000000011",
        tenantId: tenantA.id,
        status: "approved",
        currentVersion: 3,
        updatedAt: new Date("2026-10-28T12:00:00.000Z"),
      },
      {
        id: "00000000-0000-4000-8000-000000000012",
        tenantId: tenantA.id,
        status: "review_needed",
        currentVersion: 2,
        updatedAt: new Date("2026-10-28T11:00:00.000Z"),
      },
    ],
    {
      projectId: "00000000-0000-4000-8000-000000000012",
      version: 2,
    },
    { total: 2, active: 1 },
  );

  assert.deepEqual(detail, {
    ...tenantA,
    onboarding: {
      status: "review_needed",
      version: 2,
      updatedAt: new Date("2026-10-28T11:00:00.000Z"),
    },
    websiteSummary: { total: 2, active: 1 },
  });
  assert.equal("answers" in detail, false);
  assert.equal("projectBrief" in detail, false);
  assert.equal("memberships" in detail, false);
  assert.equal("leads" in detail, false);
  assert.equal("authProviderUserId" in detail, false);
  assert.equal("previewUrl" in detail, false);
});

test("een tenant zonder onboarding blijft een expliciete lege operationele status", () => {
  const detail = buildPlatformTenantDetail(tenantA, [], null, { total: 0, active: 0 });

  assert.equal(detail.onboarding, null);
  assert.deepEqual(detail.websiteSummary, { total: 0, active: 0 });
});

test("een ontbrekende huidige versie faalt gesloten", () => {
  assert.throws(
    () => buildPlatformTenantDetail(
      tenantA,
      [{
        id: "00000000-0000-4000-8000-000000000011",
        tenantId: tenantA.id,
        status: "submitted",
        currentVersion: 1,
        updatedAt: new Date("2026-10-28T12:00:00.000Z"),
      }],
      null,
      { total: 0, active: 0 },
    ),
    /Current onboarding version is missing/,
  );
});
