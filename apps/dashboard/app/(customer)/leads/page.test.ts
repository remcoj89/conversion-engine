import assert from "node:assert/strict";
import test from "node:test";
import { parseLeadQuery } from "./lead-query";
import { applyLeadStatusUpdate, isTerminalLeadStatus, nextLeadStatuses } from "./lead-lifecycle";
import type { LeadRecord } from "../../../lib/bff/leads";

test("lead query accepteert de zes lifecycle-statusfilters", () => {
  for (const status of ["new", "qualified", "appointment_scheduled", "proposal", "won", "lost"]) {
    assert.equal(parseLeadQuery({ status }).status, status);
  }
});

test("lead query valt veilig terug op alle statussen bij een onbekende filter", () => {
  assert.deepEqual(parseLeadQuery({ status: "private_status" }), { limit: "25" });
  assert.deepEqual(parseLeadQuery({ status: ["won", "lost"] }), { status: "won", limit: "25" });
});

test("leadstatusmutatie toont alleen de geldige volgende pipeline-stap", () => {
  assert.deepEqual(nextLeadStatuses("new"), ["qualified"]);
  assert.deepEqual(nextLeadStatuses("qualified"), ["appointment_scheduled"]);
  assert.deepEqual(nextLeadStatuses("appointment_scheduled"), ["proposal"]);
  assert.deepEqual(nextLeadStatuses("proposal"), ["won", "lost"]);
});

test("gewonnen en verloren leads zijn terminaal", () => {
  assert.equal(isTerminalLeadStatus("won"), true);
  assert.equal(isTerminalLeadStatus("lost"), true);
  assert.equal(isTerminalLeadStatus("proposal"), false);
});

test("een conflict wijzigt de server-confirmed leadstatus niet", () => {
  const lead: LeadRecord = {
    id: "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e",
    name: "Lisa de Vries",
    email: "lisa@example.test",
    phone: null,
    message: "Ik wil meer weten.",
    source: "contact_form",
    status: "new",
    next_action: null,
    created_at: "2026-10-29T08:00:00.000Z",
    updated_at: "2026-10-29T08:00:00.000Z",
  };

  const unchanged = applyLeadStatusUpdate(lead, { status: "invalid_status_transition", data: null });
  assert.equal(unchanged, lead);
});
