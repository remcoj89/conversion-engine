import assert from "node:assert/strict";
import test from "node:test";
import {
  dealFormFromRecord,
  emptyDealForm,
  isDealStageTerminal,
  saveDeal,
  validDealStages,
  validateDealForm,
  type DealFormValues,
} from "./deal-mutations";

const contactId = "7f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const dealId = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const record = {
  id: dealId,
  contact_id: contactId,
  title: "Website traject",
  description: "Nieuwe website",
  amount_eur: "1250.00",
  owner_user_id: null,
  stage: "proposal" as const,
  expected_close_date: "2026-12-15",
  loss_reason: null,
  status: "active" as const,
  created_at: "2026-11-02T08:00:00.000Z",
  updated_at: "2026-11-02T08:00:00.000Z",
  archived_at: null,
};

function form(overrides: Partial<DealFormValues> = {}): DealFormValues {
  return { ...emptyDealForm(), contact_id: contactId, title: "Website traject", ...overrides };
}

test("dealformulier normaliseert EUR-komma en lege optionele waarden", () => {
  const result = validateDealForm(form({ amount_eur: " 1250,50 ", description: " ", expected_close_date: " " }), false);
  assert.deepEqual(result.errors, {});
  assert.equal(result.values.amount_eur, "1250.50");
  assert.equal(result.values.description, "");
  assert.equal(result.values.expected_close_date, "");
});

test("dealvalidatie vereist contact en titel en koppelt verliesreden aan lost", () => {
  assert.equal(validateDealForm(form({ contact_id: "", title: "" }), false).errors.contact_id, "Kies een actieve contactpersoon.");
  assert.equal(validateDealForm(form({ contact_id: "", title: "" }), false).errors.title, "Vul een titel in.");
  assert.equal(validateDealForm(form({ loss_reason: "Geen budget" }), false).errors.loss_reason, "Een verliesreden hoort alleen bij een verloren deal.");
  assert.deepEqual(validateDealForm(form({ stage: "lost", loss_reason: "Geen budget" }), false).errors, {});
});

test("alleen geldige voorwaartse dealfases en terminale fases worden aangeboden", () => {
  assert.deepEqual(validDealStages(null), ["new", "qualified", "appointment_scheduled", "proposal"]);
  assert.deepEqual(validDealStages("proposal"), ["proposal", "won", "lost"]);
  assert.equal(isDealStageTerminal("won"), true);
  assert.equal(isDealStageTerminal("lost"), true);
  assert.equal(isDealStageTerminal("proposal"), false);
});

test("dealmutatie gebruikt uitsluitend het BFF-pad en behoudt server-confirmed response", async () => {
  const calls: Array<{ path: string; body: string }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ path: String(input), body: String(init?.body ?? "") });
    return new Response(JSON.stringify(record), { status: 201 });
  };
  const result = await saveDeal(fetcher, null, form({ amount_eur: "1250,50" }));
  assert.equal(result.status, "success");
  assert.equal(calls[0]?.path, "/api/deals");
  assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), {
    contact_id: contactId,
    title: "Website traject",
    description: null,
    amount_eur: "1250.50",
    stage: "new",
    expected_close_date: null,
    loss_reason: null,
  });
  if (result.status === "success") assert.equal(result.data.id, dealId);
});

test("dealmutatie vertaalt serverconflict naar conflict zonder optimistische successtatus", async () => {
  const fetcher = async () => new Response(JSON.stringify({ error: "invalid_stage_transition" }), { status: 409 });
  assert.deepEqual(await saveDeal(fetcher, dealId, form({ stage: "won" })), { status: "conflict" });
});

test("dealFormFromRecord hydrateert de bewerkvelden zonder ownerkeuze", () => {
  const values = dealFormFromRecord(record);
  assert.deepEqual(values, {
    contact_id: contactId,
    title: "Website traject",
    description: "Nieuwe website",
    amount_eur: "1250.00",
    stage: "proposal",
    expected_close_date: "2026-12-15",
    loss_reason: "",
  });
});
