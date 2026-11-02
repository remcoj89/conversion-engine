import assert from "node:assert/strict";
import test from "node:test";
import type { DealRecord } from "../../../lib/bff/deals";
import type { LeadRecord } from "../../../lib/bff/leads";
import { buildDealDetailHref, buildLeadDetailHref, buildPipelineQuery, groupDealsByStage, groupLeadsByStatus, mapDealPipelineResult, mapPipelineResult } from "./pipeline-data";

const lead = (status: LeadRecord["status"], id: string): LeadRecord => ({
  id: `6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d${id}`,
  name: `Contact ${id}`,
  email: `contact-${id}@example.test`,
  phone: null,
  message: "Een veilige testaanvraag.",
  source: "website_contact",
  status,
  next_action: null,
  created_at: "2026-10-29T08:00:00.000Z",
  updated_at: "2026-10-29T08:00:00.000Z",
});

const deal = (stage: DealRecord["stage"], id: string): DealRecord => ({
  id: `7f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d${id}`,
  title: `Deal ${id}`,
  amount_eur: "1250.00",
  stage,
  status: "active",
  expected_close_date: null,
  loss_reason: null,
});

test("pipeline groepeert leads in alle zes lifecycle-kolommen", () => {
  const columns = groupLeadsByStatus([
    lead("new", "1"),
    lead("proposal", "2"),
    lead("proposal", "3"),
    lead("lost", "4"),
  ]);

  assert.deepEqual(columns.map((column) => column.status), [
    "new",
    "qualified",
    "appointment_scheduled",
    "proposal",
    "won",
    "lost",
  ]);
  assert.deepEqual(columns.map((column) => column.leads.length), [1, 0, 0, 2, 0, 1]);
  assert.deepEqual(columns.map((column) => column.label), [
    "Nieuw",
    "Gekwalificeerd",
    "Afspraak gepland",
    "Voorstel",
    "Gewonnen",
    "Verloren",
  ]);
});

test("pipeline map maakt lege kolommen zichtbaar en behoudt paginationele waarschuwing", () => {
  const state = mapPipelineResult({
    status: "ready",
    data: { items: [lead("won", "1")], next_cursor: "next-page" },
  });

  assert.equal(state.kind, "ready");
  if (state.kind !== "ready") return;
  assert.equal(state.hasLeads, true);
  assert.equal(state.hasNextPage, true);
  assert.equal(state.data.find((column) => column.status === "qualified")?.leads.length, 0);
});

test("pipeline map maakt upstream auth- en foutstaten expliciet", () => {
  assert.deepEqual(mapPipelineResult({ status: "unauthenticated", data: null }), { kind: "unauthenticated" });
  assert.deepEqual(mapPipelineResult({ status: "forbidden", data: null }), { kind: "forbidden" });
  assert.deepEqual(mapPipelineResult({ status: "error", data: null }), { kind: "error" });
  assert.deepEqual(mapPipelineResult({ status: "unavailable", data: null }), { kind: "unavailable" });
  assert.deepEqual(mapPipelineResult({ status: "invalid_query", data: null }), { kind: "error" });
});

test("pipeline query gebruikt alleen bestaande leadfilters", () => {
  assert.equal(buildPipelineQuery({ q: "Lisa", status: "proposal" }), "limit=50&q=Lisa&status=proposal");
  assert.equal(buildPipelineQuery({}), "limit=50");
});

test("pipelinekaarten linken alleen naar de tenantgebonden leaddetailroute", () => {
  assert.equal(buildLeadDetailHref("6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e"), "/leads/6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e");
  assert.equal(buildLeadDetailHref("lead with spaces"), "/leads/lead%20with%20spaces");
});

test("dealpipeline gebruikt exact dezelfde zes lifecyclekolommen als leads", () => {
  const columns = groupDealsByStage([deal("new", "1"), deal("proposal", "2"), deal("lost", "3")]);

  assert.deepEqual(columns.map((column) => column.stage), [
    "new",
    "qualified",
    "appointment_scheduled",
    "proposal",
    "won",
    "lost",
  ]);
  assert.deepEqual(columns.map((column) => column.deals.length), [1, 0, 0, 1, 0, 1]);
  assert.deepEqual(mapDealPipelineResult({ status: "forbidden", data: null }), { kind: "forbidden" });
  assert.equal(buildDealDetailHref("6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e"), "/pipeline/6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e");
});
