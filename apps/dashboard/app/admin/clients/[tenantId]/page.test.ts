import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAdminClientDetailPageState } from "./page";

const tenant = {
  id: "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e",
  name: "Northline Fysio",
  status: "active",
  created_at: "2026-10-28T08:00:00.000Z",
  onboarding: null,
  website_summary: { total: 0, active: 0 },
};

test("onderscheidt ready, not-found en veilige auth/error states", () => {
  const ready = { status: "ready" as const, data: tenant };

  assert.equal(getAdminClientDetailPageState(ready), "ready");
  assert.equal(getAdminClientDetailPageState({ status: "not_found", data: null }), "not_found");
  assert.equal(getAdminClientDetailPageState({ status: "invalid_tenant_id", data: null }), "not_found");
  assert.equal(getAdminClientDetailPageState({ status: "unauthenticated", data: null }), "unauthenticated");
  assert.equal(getAdminClientDetailPageState({ status: "forbidden", data: null }), "forbidden");
  assert.equal(getAdminClientDetailPageState({ status: "unavailable", data: null }), "unavailable");
});

test("detailpagina gebruikt geen demo-data of previewroute", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /admin-data/);
  assert.doesNotMatch(source, /Open klantweergave|\/admin\/preview/i);
  assert.match(source, /readPlatformTenantDetail/);
  assert.match(source, /Klant niet gevonden/);
  assert.match(source, /UnavailableState/);
});
