import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildAdminClientsHref, getAdminClientsPageState, parseAdminClientsQuery } from "./page";

test("geeft alleen ondersteunde filters en de standaardpagina door", () => {
  assert.deepEqual(
    parseAdminClientsQuery({
      q: " Northline ",
      status: "active",
      onboarding_status: "review_needed",
      limit: "25",
      cursor: "next-1",
      unknown: "must-not-forward",
      onboarding: "legacy-name",
    }),
    {
      q: "Northline",
      status: "active",
      onboarding_status: "review_needed",
      limit: "25",
      cursor: "next-1",
    },
  );
});

test("ongeldige filters vallen veilig terug op alle klanten en een standaardlimiet", () => {
  assert.deepEqual(parseAdminClientsQuery({ status: "review", onboarding_status: "legacy", limit: "999" }), { limit: "25" });
});

test("bouwt paginering-URLs met filters maar zonder ongewenste queryvelden", () => {
  assert.equal(
    buildAdminClientsHref(
      { q: "Northline", status: "active", onboarding_status: "approved", limit: "25", cursor: "old" },
      { cursor: "next" },
    ),
    "/admin/clients?q=Northline&status=active&onboarding_status=approved&limit=25&cursor=next",
  );
});

test("onderscheidt ready, empty en veilige auth/error states voor de pagina", () => {
  const ready = { status: "ready" as const, data: { items: [], next_cursor: null } };

  assert.equal(getAdminClientsPageState({ status: "unauthenticated", data: null }), "unauthenticated");
  assert.equal(getAdminClientsPageState({ status: "forbidden", data: null }), "forbidden");
  assert.equal(getAdminClientsPageState({ status: "unavailable", data: null }), "unavailable");
  assert.equal(getAdminClientsPageState({ status: "invalid_query", data: null }), "unavailable");
  assert.equal(getAdminClientsPageState(ready), "empty");
  assert.equal(getAdminClientsPageState({ status: "ready", data: { items: [{
    id: "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e",
    name: "Northline",
    status: "active",
    created_at: "2026-10-28T08:00:00.000Z",
    onboarding: null,
    website_summary: { total: 0, active: 0 },
  }], next_cursor: null } }), "ready");
});

test("live klantenlijst blijft los van demo-data en ongecontroleerde previews", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /admin-data/);
  assert.doesNotMatch(source, /Open klantweergave/);
  assert.match(source, /admin\/clients\/\$\{row\.id\}/);
  assert.match(source, /Bekijk klantdetail/);
});
