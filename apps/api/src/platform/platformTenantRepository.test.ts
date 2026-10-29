import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlatformTenantListItems,
  decodePlatformTenantCursor,
  encodePlatformTenantCursor,
  selectCurrentOnboardingProject,
} from "./platformTenantRepository.js";

const tenantA = "00000000-0000-4000-8000-000000000001";
const tenantB = "00000000-0000-4000-8000-000000000002";
const projectA = "00000000-0000-4000-8000-000000000011";
const projectB = "00000000-0000-4000-8000-000000000012";
const approvedOlder = "00000000-0000-4000-8000-000000000021";
const approvedNewer = "00000000-0000-4000-8000-000000000022";

test("current onboarding kiest een open project vóór approved", () => {
  const selected = selectCurrentOnboardingProject([
    {
      id: approvedNewer,
      tenantId: tenantA,
      status: "approved",
      currentVersion: 4,
      updatedAt: new Date("2026-10-28T12:00:00.000Z"),
    },
    {
      id: projectA,
      tenantId: tenantA,
      status: "review_needed",
      currentVersion: 2,
      updatedAt: new Date("2026-10-27T12:00:00.000Z"),
    },
  ]);

  assert.equal(selected?.id, projectA);
  assert.equal(selected?.status, "review_needed");
});

test("current onboarding kiest de meest recente approved met een ID-tie-breaker", () => {
  const selected = selectCurrentOnboardingProject([
    {
      id: approvedOlder,
      tenantId: tenantA,
      status: "approved",
      currentVersion: 2,
      updatedAt: new Date("2026-10-28T12:00:00.000Z"),
    },
    {
      id: approvedNewer,
      tenantId: tenantA,
      status: "approved",
      currentVersion: 3,
      updatedAt: new Date("2026-10-28T12:00:00.000Z"),
    },
  ]);

  assert.equal(selected?.id, approvedNewer);
});

test("tenant summaries blijven geïsoleerd en bevatten geen gevoelige velden", () => {
  const items = buildPlatformTenantListItems(
    [
      {
        id: tenantA,
        name: "Synthetic Alpha",
        status: "active",
        createdAt: new Date("2026-10-28T10:00:00.000Z"),
      },
      {
        id: tenantB,
        name: "Synthetic Beta",
        status: "disabled",
        createdAt: new Date("2026-10-27T10:00:00.000Z"),
      },
    ],
    [
      {
        id: projectA,
        tenantId: tenantA,
        status: "submitted",
        currentVersion: 2,
        updatedAt: new Date("2026-10-28T11:00:00.000Z"),
      },
      {
        id: projectB,
        tenantId: tenantB,
        status: "approved",
        currentVersion: 3,
        updatedAt: new Date("2026-10-27T11:00:00.000Z"),
      },
    ],
    [
      { projectId: projectA, version: 2 },
      { projectId: projectB, version: 3 },
    ],
    [
      { tenantId: tenantA, total: 2, active: 1 },
      { tenantId: tenantB, total: 1, active: 0 },
    ],
  );

  assert.deepEqual(items, [
    {
      id: tenantA,
      name: "Synthetic Alpha",
      status: "active",
      createdAt: new Date("2026-10-28T10:00:00.000Z"),
      onboarding: {
        status: "submitted",
        version: 2,
        updatedAt: new Date("2026-10-28T11:00:00.000Z"),
      },
      websiteSummary: { total: 2, active: 1 },
    },
    {
      id: tenantB,
      name: "Synthetic Beta",
      status: "disabled",
      createdAt: new Date("2026-10-27T10:00:00.000Z"),
      onboarding: {
        status: "approved",
        version: 3,
        updatedAt: new Date("2026-10-27T11:00:00.000Z"),
      },
      websiteSummary: { total: 1, active: 0 },
    },
  ]);

  const serialized = JSON.stringify(items);
  assert.doesNotMatch(serialized, /answers|projectBrief|authProviderUserId|token/i);
});

test("ontbrekende huidige onboardingversie faalt gesloten", () => {
  assert.throws(
    () => buildPlatformTenantListItems(
      [{
        id: tenantA,
        name: "Synthetic Alpha",
        status: "active",
        createdAt: new Date("2026-10-28T10:00:00.000Z"),
      }],
      [{
        id: projectA,
        tenantId: tenantA,
        status: "draft",
        currentVersion: 1,
        updatedAt: new Date("2026-10-28T11:00:00.000Z"),
      }],
      [],
      [],
    ),
    /Current onboarding version is missing/,
  );
});

test("tenant cursor encodeert en decodeert alleen het stabiele sorteerpaar", () => {
  const cursor = {
    createdAt: new Date("2026-10-28T10:00:00.000Z"),
    id: tenantA,
  };
  const encoded = encodePlatformTenantCursor(cursor);

  assert.deepEqual(decodePlatformTenantCursor(encoded), cursor);
  assert.equal(decodePlatformTenantCursor("not-a-cursor"), null);
  assert.equal(decodePlatformTenantCursor(""), null);
});
