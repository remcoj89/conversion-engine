import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildProjectBrief,
  canSubmit,
  clearHidden,
  isVisible,
  missingFields,
  phaseProgress,
  reviewFlags,
  setAnswer,
  stepErrors,
  toggleChoice,
  validateField,
  validateFiles,
  type Answers,
  type AnswerValue,
  allFields,
  fieldById,
  onboardingSchema,
  steps,
} from "../../../../packages/onboarding-contract/src/index";
import { completeAnswers } from "../../../../packages/onboarding-contract/src/testFixtures";
import {
  allowsSubmit,
  flowReducer,
  initialFlowState,
  isReadOnly,
  onboardingStatusLabel,
  reviewFeedbackTitle,
  reviewReasonLabel,
  reviewStatusFromServer,
  readOnlyStatusMessage,
  visibleReviewRequest,
  type FlowAction,
  type FlowState,
  type ReviewRequest,
} from "./flow";

// ---------- Hulpfuncties ----------

const run = (actions: readonly FlowAction[], state: FlowState = initialFlowState) => actions.reduce(flowReducer, state);
const docsSchemaPath = fileURLToPath(
  new URL("../../../../docs/fase-3-gecombineerde-onboarding-ontwikkelpakket-v0.1/fase-3-gecombineerde-onboarding-schema-v0.1.json", import.meta.url),
);

// ---------- Schema ----------

test("schema: kopie in de app is identiek aan het brondocument", () => {
  const docs: unknown = JSON.parse(readFileSync(docsSchemaPath, "utf8"));
  assert.deepEqual(onboardingSchema, docs);
});

test("schema: 4 vragenlijsten, 20 onderdelen, 123 velden en 70 verplichte velden", () => {
  assert.equal(steps.length, 20);
  assert.deepEqual(
    onboardingSchema.phases.map((phase) => ({
      id: phase.form_id,
      sections: phase.sections.length,
      fields: phase.sections.flatMap((section) => section.fields).length,
      required: phase.sections.flatMap((section) => section.fields).filter((field) => field.required).length,
    })),
    [
      { id: "Q1_KICKOFF", sections: 5, fields: 23, required: 12 },
      { id: "Q2_DOELGROEP", sections: 5, fields: 27, required: 15 },
      { id: "Q3_AANBOD", sections: 5, fields: 35, required: 21 },
      { id: "Q4_BRANDING_ASSETS", sections: 5, fields: 38, required: 22 },
    ],
  );
  assert.equal(allFields.length, 123);
  assert.equal(new Set(allFields.map((field) => field.id)).size, 123, "veld-ID's zijn uniek");
});

test("schema: alle elf veldtypes komen voor", () => {
  const counts: Record<string, number> = {};
  for (const field of allFields) counts[field.type] = (counts[field.type] ?? 0) + 1;
  assert.deepEqual(counts, {
    textarea: 50,
    single_choice: 33,
    text: 14,
    multi_choice: 13,
    file: 4,
    url: 3,
    number: 2,
    repeater: 1,
    money: 1,
    domain: 1,
    email: 1,
  });
});

// ---------- Verplicht en optioneel ----------

test("verplicht: leeg verplicht veld geeft een fout, leeg optioneel veld niet", () => {
  assert.equal(validateField(fieldById("company_name"), {}), "Dit veld is verplicht.");
  assert.equal(validateField(fieldById("founding_year"), {}), null);
  assert.equal(validateField(fieldById("company_name"), { company_name: "   " }), "Dit veld is verplicht.");
  assert.equal(validateField(fieldById("brand_status"), {}), "Kies een antwoord.");
});

test("validatie: lengtes, getallen, bedragen, e-mail, URL en domein volgen het schema", () => {
  const check = (id: string, value: string) => validateField(fieldById(id), { [id]: value });
  assert.equal(check("company_name", "A"), "Gebruik minimaal 2 tekens (nu 1).");
  assert.equal(check("company_name", "x".repeat(121)), "Gebruik maximaal 120 tekens (nu 121).");
  assert.equal(check("founding_year", "2021"), null);
  assert.equal(check("founding_year", "1899"), "Vul minimaal 1.900 in.");
  assert.equal(check("founding_year", "2027"), "Vul maximaal 2.026 in.");
  assert.equal(check("founding_year", "abc"), "Gebruik een geldig getal.");
  assert.equal(check("contact_email", "geen-mail"), "Gebruik een geldig e-mailadres, zoals info@voorbeeld.nl.");
  assert.equal(check("contact_email", "info@voorbeeld.nl"), null);
  assert.equal(check("current_website", "voorbeeld.nl"), "Gebruik een volledige URL, inclusief https://.");
  assert.equal(check("current_website", "ftp://voorbeeld.nl"), "Gebruik een volledige URL die begint met https://.");
  assert.equal(check("current_website", "https://voorbeeld.nl"), null);

  const domain = { domain_status: "existing" };
  assert.equal(validateField(fieldById("domain_name"), { ...domain, domain_name: "https://voorbeeld.nl" }), "Vul alleen de domeinnaam in, zoals voorbeeld.nl.");
  assert.equal(validateField(fieldById("domain_name"), { ...domain, domain_name: "voorbeeld.nl" }), null);

  const money = { pricing_model: "fixed" };
  assert.equal(validateField(fieldById("price_amount"), { ...money, price_amount: "149,00" }), null);
  assert.equal(validateField(fieldById("price_amount"), { ...money, price_amount: "149.5" }), null);
  assert.equal(validateField(fieldById("price_amount"), { ...money, price_amount: "0" }), "Vul minimaal 0,01 in.");
  assert.equal(validateField(fieldById("price_amount"), { ...money, price_amount: "€ 149" }), "Gebruik een bedrag zoals 149,00.");
});

test("validatie: meerkeuze respecteert minimum en maximum aantal keuzes", () => {
  const field = fieldById("brand_values"); // min 2, max 4
  const values = field.choices!.map((choice) => choice.value);
  assert.equal(validateField(field, { brand_values: values.slice(0, 1) }), "Kies minimaal 2 opties.");
  assert.equal(validateField(field, { brand_values: values.slice(0, 2) }), null);
  assert.equal(validateField(field, { brand_values: values.slice(0, 5) }), "Kies maximaal 4 opties.");
});

// ---------- Conditionele velden ----------

test("conditioneel: alle vijf operatoren uit het schema werken", () => {
  assert.equal(isVisible(fieldById("recurring_period"), { pricing_model: "recurring" }), true); // eq
  assert.equal(isVisible(fieldById("recurring_period"), { pricing_model: "fixed" }), false);
  assert.equal(isVisible(fieldById("b2b_roles"), { market_type: "mixed" }), true); // in
  assert.equal(isVisible(fieldById("b2b_roles"), { market_type: "b2c" }), false);
  assert.equal(isVisible(fieldById("expertise_other"), { expertise_sources: ["other"] }), true); // includes
  assert.equal(isVisible(fieldById("expertise_other"), { expertise_sources: ["education"] }), false);
  assert.equal(isVisible(fieldById("people_consent"), { photo_categories: ["clients"] }), true); // includes_any
  assert.equal(isVisible(fieldById("people_consent"), { photo_categories: [] }), false);
  assert.equal(isVisible(fieldById("claim_basis"), { guarantee_or_promise: "Resultaat binnen 8 weken" }), true); // nonempty
  assert.equal(isVisible(fieldById("claim_basis"), { guarantee_or_promise: "  " }), false);
});

test("branding: logo- en brand guide-upload zijn altijd zichtbaar en optioneel", () => {
  for (const id of ["logo_assets", "brandbook_assets"]) {
    const field = fieldById(id);
    assert.equal(field.when, undefined, id);
    assert.equal(field.required, false, id);
    for (const brandStatus of [undefined, "complete", "basic", "none"]) {
      assert.equal(isVisible(field, brandStatus ? { brand_status: brandStatus } : {}), true, `${id} bij ${brandStatus}`);
    }
  }
});

test("conditioneel: verborgen verplicht veld is niet verplicht, zichtbaar wel", () => {
  assert.equal(validateField(fieldById("domain_name"), { domain_status: "new" }), null);
  assert.equal(validateField(fieldById("domain_name"), { domain_status: "existing" }), "Dit veld is verplicht.");
});

test("conditioneel: een verborgen veld verliest zijn waarde zodra de voorwaarde vervalt", () => {
  let answers = setAnswer({}, "pricing_model", "recurring");
  answers = setAnswer(answers, "recurring_period", fieldById("recurring_period").choices![0]!.value);
  answers = setAnswer(answers, "price_amount", "99");
  assert.ok("recurring_period" in answers && "price_amount" in answers);

  answers = setAnswer(answers, "pricing_model", "quote");
  assert.ok(!("recurring_period" in answers), "recurring_period gewist");
  assert.ok(!("price_amount" in answers), "price_amount gewist");
});

// ---------- Exclusieve keuzes ----------

test("exclusief: 'none' wist andere keuzes en andersom", () => {
  const field = fieldById("proof_types");
  let selected = toggleChoice(field, [], "reviews", true);
  selected = toggleChoice(field, selected, "cases", true);
  assert.deepEqual(selected, ["reviews", "cases"]);
  selected = toggleChoice(field, selected, "none", true);
  assert.deepEqual(selected, ["none"]);
  selected = toggleChoice(field, selected, "reviews", true);
  assert.deepEqual(selected, ["reviews"]);
  assert.deepEqual(toggleChoice(field, selected, "reviews", false), []);
  // Een combinatie die toch binnenkomt, is ongeldig.
  assert.equal(validateField(field, { proof_types: ["none", "reviews"] }), "Deze keuze kan niet samen met andere opties.");
});

// ---------- Repeater ----------

test("repeater: maximaal twee aanvullende diensten met eigen itemvalidatie", () => {
  const field = fieldById("additional_offers");
  assert.equal(field.max_items, 2);
  const item = { name: "Groepstraining", description: "Kleine groepen met persoonlijke aandacht." };
  assert.equal(validateField(field, { additional_offers: [item, item] }), null);
  assert.equal(validateField(field, { additional_offers: [item, item, item] }), "Voeg maximaal 2 toe.");
  assert.equal(validateField(field, { additional_offers: [{ name: "Gr" }] }), "Dienst 1, naam aanvullende dienst: Gebruik minimaal 3 tekens (nu 2).");
  assert.equal(validateField(field, { additional_offers: [item, { name: "Online coaching" }] }), "Dienst 2, wat is het?: vul dit in.");
  assert.equal(validateField(field, { additional_offers: [{ ...item, price_note: "x".repeat(101) }] }), "Dienst 1, prijsindicatie (optioneel): Gebruik maximaal 100 tekens (nu 101).");
});

// ---------- Bestanden ----------

test("bestanden: alleen metadata, met controle op aantal, grootte en type", () => {
  const field = fieldById("brandbook_assets"); // .pdf, max 2, 15 MB
  assert.equal(validateFiles(field, [{ name: "huisstijl.pdf", size: 1024, type: "application/pdf" }]), null);
  assert.equal(validateFiles(field, [{ name: "logo.png", size: 1024, type: "image/png" }]), "logo.png heeft een niet-toegestaan bestandstype. Toegestaan: .pdf.");
  assert.equal(validateFiles(field, [{ name: "groot.pdf", size: 16 * 1024 * 1024, type: "application/pdf" }]), "groot.pdf is groter dan 15 MB.");
  const three = ["a", "b", "c"].map((name) => ({ name: `${name}.pdf`, size: 1, type: "application/pdf" }));
  assert.equal(validateFiles(field, three), "Kies maximaal 2 bestanden.");
});

// ---------- Project Brief ----------

test("brief: verborgen waarden komen nooit in client_supplied of provenance", () => {
  // Waarde van een verborgen veld direct in de state, zonder setAnswer.
  const answers: Answers = { ...completeAnswers(), domain_status: "new", domain_name: "verborgen.nl" };
  const brief = buildProjectBrief(answers, { reviewStatus: "draft" });

  assert.ok(!JSON.stringify(brief.client_supplied).includes("verborgen.nl"));
  assert.ok(!brief.provenance.some((entry) => entry.field_id === "domain_name"));
});

test("brief: client_supplied volgt de mapping en provenance noemt bron, veld, versie en verificatiestatus", () => {
  const answers = setAnswer(setAnswer(completeAnswers(), "company_name", "  Sterk & Fit Coaching "), "founding_year", "2021");
  const brief = buildProjectBrief(answers, { reviewStatus: "draft", now: new Date("2026-10-23T12:00:00Z") });
  const business = brief.client_supplied.business as Record<string, unknown>;

  assert.equal(business.name, "Sterk & Fit Coaching");
  assert.equal(business.founding_year, 2021);
  assert.deepEqual(
    brief.provenance.find((entry) => entry.field_id === "company_name"),
    {
      path: "business.name",
      questionnaire: "Q1",
      field_id: "company_name",
      schema_version: "1.0.0-draft",
      type: "text",
      verification_status: "client_supplied_unverified",
    },
  );
  assert.equal(brief.generated_at, "2026-10-23T12:00:00.000Z");
  assert.deepEqual(brief.source_schema_versions.map((source) => source.id), ["Q1", "Q2", "Q3", "Q4"]);
  for (const approval of ["claim_verification", "asset_rights_approval", "scope_approval", "strategy_approval"] as const) {
    assert.equal(brief.review[approval], "pending");
  }
  assert.equal(brief.review.website_publication, "not_authorized");
});

test("brief: status is incomplete_draft of ready_for_westend_review, nooit goedgekeurd", () => {
  const empty = buildProjectBrief({}, { reviewStatus: "draft" });
  assert.equal(empty.status, "incomplete_draft");
  // 70 verplichte velden, waarvan 8 achter een voorwaarde die bij een lege intake niet zichtbaar is.
  const conditionalRequired = allFields.filter((field) => field.required && field.when);
  assert.equal(conditionalRequired.length, 8);
  assert.equal(empty.review.required_fields_missing.length, 70 - 8);
  assert.deepEqual(empty.client_supplied, {});

  const complete = buildProjectBrief(completeAnswers(), { reviewStatus: "submitted" });
  assert.equal(complete.status, "ready_for_westend_review");
  assert.deepEqual(complete.review.required_fields_missing, []);
  assert.equal(complete.submitted_for_review, true);
  assert.equal(buildProjectBrief(completeAnswers(), { reviewStatus: "draft" }).submitted_for_review, false);
});

test("reviewflags: worden alleen afgeleid uit zichtbare antwoorden", () => {
  const codes = (answers: Answers) => reviewFlags(answers).map((flag) => flag.code);
  assert.deepEqual(codes({ brand_status: "none", new_branding_request: "quote" }), ["BRANDING_MISSING", "BRANDING_QUOTE"]);
  assert.deepEqual(codes({ site_relation: "replace", ga4_status: "unknown" }), ["REDIRECT_PLAN", "CONNECTORS"]);
  // image_license is verborgen bij photo_status "little" en mag dan geen flag geven.
  assert.deepEqual(codes({ photo_status: "little", image_license: "no" }), []);
  assert.deepEqual(codes({ photo_status: "mixed", image_license: "no" }), ["IMAGE_RIGHTS"]);
});

// ---------- Navigatie en eindcontrole ----------

test("navigatie: Volgende blokkeert bij fouten en behoudt de ingevulde waarden", () => {
  const state = run([{ type: "answer", fieldId: "company_name", value: "A" }, { type: "next" }]);
  assert.equal(state.current, 0);
  assert.equal(state.answers.company_name, "A");
  assert.equal(state.errors.company_name, "Gebruik minimaal 2 tekens (nu 1).");
  assert.equal(state.errors.contact_name, "Dit veld is verplicht.");
  // Aanpassen haalt alleen de fout van dat veld weg.
  const fixed = flowReducer(state, { type: "answer", fieldId: "company_name", value: "AB" });
  assert.equal(fixed.errors.company_name, undefined);
  assert.equal(fixed.errors.contact_name, "Dit veld is verplicht.");
});

test("navigatie: Volgende, Vorige en het zijmenu verliezen geen gegevens", () => {
  const answers = completeAnswers();
  let state: FlowState = { ...initialFlowState, answers };
  state = flowReducer(state, { type: "next" });
  assert.equal(state.current, 1);
  state = flowReducer(state, { type: "previous" });
  assert.equal(state.current, 0);
  state = flowReducer(state, { type: "previous" });
  assert.equal(state.current, 0, "niet voorbij het eerste scherm");
  state = flowReducer(state, { type: "goToPhase", phaseIndex: 2 });
  assert.equal(state.current, 10);
  assert.equal(steps[state.current]!.phase.form_id, "Q3_AANBOD");
  state = flowReducer(state, { type: "goToStep", step: 19 });
  state = flowReducer(state, { type: "next" });
  assert.equal(state.mode, "review", "laatste scherm gaat naar de eindcontrole");
  assert.deepEqual(state.answers, answers);
});

test("navigatie: zijmenu werkt ook met een onvolledig scherm, zonder validatie of verlies", () => {
  const state = run([
    { type: "answer", fieldId: "company_name", value: "A" },
    { type: "goToPhase", phaseIndex: 3 },
    { type: "goToPhase", phaseIndex: 0 },
  ]);
  assert.equal(state.current, 0);
  assert.equal(state.answers.company_name, "A");
  assert.deepEqual(state.errors, {});
});

test("eindcontrole: naar het eerste ontbrekende veld toont de fouten van dat scherm", () => {
  const answers = { ...completeAnswers() };
  delete (answers as Record<string, AnswerValue>).contact_email;
  const state = run([{ type: "review" }, { type: "goToFirstMissing" }], { ...initialFlowState, answers: clearHidden(answers) });
  assert.equal(state.mode, "form");
  assert.equal(steps[state.current]!.section.fields.some((field) => field.id === "contact_email"), true);
  assert.equal(state.errors.contact_email, "Dit veld is verplicht.");
  assert.equal(missingFields(state.answers).length, 1);
});

test("indienen: een onvolledige intake is lokaal niet indienbaar", () => {
  const state = run([{ type: "review" }]);
  assert.equal(state.reviewStatus, "draft");
  assert.equal(canSubmit(state.answers), false);
  assert.equal(phaseProgress(0, state.answers).complete, false);
  assert.equal(canSubmit(completeAnswers()), true);
});

test("indienen: pas na de serverbevestiging is de status submitted; daarna zijn wijzigingen geblokkeerd", () => {
  let state: FlowState = { ...initialFlowState, answers: completeAnswers() };
  state = flowReducer(state, { type: "review" });
  assert.equal(state.reviewStatus, "draft", "naar de eindcontrole gaan dient niets in");
  state = flowReducer(state, { type: "submitted" });
  assert.equal(state.reviewStatus, "submitted");
  assert.equal(stepErrors(0, state.answers).company_name, undefined);

  const after = flowReducer(state, { type: "answer", fieldId: "company_name", value: "Nieuwe naam BV" });
  assert.equal(after, state, "alleen-lezen: het antwoord wordt genegeerd");
  // Navigeren en bekijken kan nog wel.
  assert.equal(flowReducer(state, { type: "goToPhase", phaseIndex: 1 }).current, 5);
});

test("na refresh: een ingediende onboarding wordt als submitted en alleen-lezen geladen", () => {
  const hydrated = flowReducer(initialFlowState, { type: "hydrate", answers: completeAnswers(), reviewStatus: "submitted" });
  assert.equal(hydrated.reviewStatus, "submitted");
  assert.deepEqual(hydrated.answers, completeAnswers());
  assert.equal(flowReducer(hydrated, { type: "answer", fieldId: "company_name", value: "Wijziging" }), hydrated);
});

test("hervatten: hydrate laadt opgeslagen antwoorden, wist verborgen waarden en behoudt de positie", () => {
  const state = run([{ type: "goToStep", step: 5 }, { type: "next" }]);
  const hydrated = flowReducer(state, {
    type: "hydrate",
    answers: { company_name: "Opgeslagen BV", domain_status: "new", domain_name: "verborgen.nl" },
    reviewStatus: "draft",
  });
  assert.equal(hydrated.current, 5);
  assert.deepEqual(hydrated.answers, { company_name: "Opgeslagen BV", domain_status: "new" });
  assert.deepEqual(hydrated.errors, {});
  assert.equal(hydrated.reviewStatus, "draft");
});

// ---------- Aanvullingen gevraagd (review_needed) ----------

test("brief: review_needed gebruikt de gewone briefstatus en is niet submitted_for_review", () => {
  const complete = buildProjectBrief(completeAnswers(), { reviewStatus: "review_needed" });
  assert.equal(complete.status, "ready_for_westend_review");
  assert.equal(complete.submitted_for_review, false);
  const partial = buildProjectBrief({ company_name: "Concept BV" }, { reviewStatus: "review_needed" });
  assert.equal(partial.status, "incomplete_draft");
  assert.equal(partial.submitted_for_review, false);
});

test("serverstatus: draft en review_needed blijven bewerkbaar; submitted, blocked, approved en onbekend worden alleen-lezen", () => {
  const cases: [string, FlowState["reviewStatus"]][] = [
    ["draft", "draft"],
    ["review_needed", "review_needed"],
    ["submitted", "submitted"],
    ["blocked", "blocked"],
    ["approved", "approved"],
    ["iets_nieuws", "submitted"],
  ];
  for (const [server, client] of cases) {
    assert.equal(reviewStatusFromServer(server), client, server);
  }
});

test("indienen per status: draft en review_needed kunnen indienen; submitted, blocked en approved zijn alleen-lezen", () => {
  assert.deepEqual([isReadOnly("draft"), allowsSubmit("draft")], [false, true]);
  assert.deepEqual([isReadOnly("review_needed"), allowsSubmit("review_needed")], [false, true]);
  assert.deepEqual([isReadOnly("submitted"), allowsSubmit("submitted")], [true, false]);
  assert.deepEqual([isReadOnly("blocked"), allowsSubmit("blocked")], [true, false]);
  assert.deepEqual([isReadOnly("approved"), allowsSubmit("approved")], [true, false]);
});

test("dashboardmeldingen: blocked en approved zijn duidelijk, submitted blijft bestaand", () => {
  assert.deepEqual(readOnlyStatusMessage("blocked"), {
    tone: "warning",
    title: "Deze onboarding is tijdelijk geblokkeerd door Westend.",
    body: "Je antwoorden zijn zichtbaar maar niet bewerkbaar. Opnieuw indienen is niet mogelijk; Westend moet eerst verdere actie ondernemen.",
  });
  assert.deepEqual(readOnlyStatusMessage("approved"), {
    tone: "success",
    title: "Deze onboarding is goedgekeurd door Westend.",
    body: "Je antwoorden zijn alleen-lezen; nieuwe wijzigingen kunnen niet worden opgeslagen.",
  });
  assert.deepEqual(readOnlyStatusMessage("submitted"), {
    tone: "success",
    title: "Deze onboarding is ingediend.",
    body: "Je kunt je antwoorden nog bekijken, maar niet meer wijzigen.",
  });
  assert.deepEqual([onboardingStatusLabel("blocked"), onboardingStatusLabel("approved"), onboardingStatusLabel("submitted")], ["Geblokkeerd", "Goedgekeurd", "Ingediend"]);
});

test("blocked en approved blijven onveranderlijk in de reducer", () => {
  for (const reviewStatus of ["blocked", "approved"] as const) {
    const state = flowReducer(initialFlowState, { type: "hydrate", answers: completeAnswers(), reviewStatus });
    assert.equal(flowReducer(state, { type: "answer", fieldId: "company_name", value: "Nieuwe synthetische waarde" }), state, reviewStatus);
    assert.equal(allowsSubmit(state.reviewStatus), false, reviewStatus);
  }
});

test("na refresh: review_needed wordt geladen met status en antwoorden, en antwoorden blijven wijzigbaar", () => {
  const hydrated = flowReducer(initialFlowState, { type: "hydrate", answers: completeAnswers(), reviewStatus: "review_needed" });
  assert.equal(hydrated.reviewStatus, "review_needed");
  assert.deepEqual(hydrated.answers, completeAnswers());

  const changed = flowReducer(hydrated, { type: "answer", fieldId: "company_name", value: "Aangevulde naam BV" });
  assert.equal(changed.answers.company_name, "Aangevulde naam BV");
  assert.equal(changed.reviewStatus, "review_needed", "bewerken laat de status ongemoeid");
});

test("opnieuw indienen: review_needed wordt na de serverbevestiging submitted en daarna alleen-lezen", () => {
  let state = flowReducer(initialFlowState, { type: "hydrate", answers: completeAnswers(), reviewStatus: "review_needed" });
  state = flowReducer(state, { type: "answer", fieldId: "company_name", value: "Aangevulde naam BV" });
  assert.equal(state.reviewStatus, "review_needed", "wijzigen dient niets in");

  state = flowReducer(state, { type: "submitted" });
  assert.equal(state.reviewStatus, "submitted");
  assert.equal(state.answers.company_name, "Aangevulde naam BV", "de ingediende antwoorden blijven zichtbaar");
  assert.deepEqual([isReadOnly(state.reviewStatus), allowsSubmit(state.reviewStatus)], [true, false]);
  assert.equal(flowReducer(state, { type: "answer", fieldId: "company_name", value: "Na indienen" }), state, "alleen-lezen na indienen");
});

// ---------- Reviewnotitie voor de Owner ----------

test("reviewnotitie: redenlabels zijn Nederlands, een onbekende code krijgt een neutraal label", () => {
  assert.equal(reviewReasonLabel("missing_information"), "Ontbrekende informatie");
  assert.equal(reviewReasonLabel("rights_unclear"), "Rechten of bron onduidelijk");
  assert.equal(reviewReasonLabel("out_of_scope"), "Buiten de standaard scope");
  assert.equal(reviewReasonLabel("basis_provided"), "Basis aangevuld");
  assert.equal(reviewReasonLabel("rights_cleared"), "Rechten opgehelderd");
  assert.equal(reviewReasonLabel("extra_work_agreed"), "Meerwerk afgestemd");
  assert.equal(reviewReasonLabel("toekomstige_code"), "Aanvulling gevraagd");
  assert.equal(reviewReasonLabel("toString"), "Aanvulling gevraagd", "no prototype keys");
});

test("reviewnotitie: alleen zichtbaar in review_needed, verborgen bij draft en submitted", () => {
  const request: ReviewRequest = { reason_code: "rights_unclear", note: "Graag de fotobron aanvullen.", version: 2, created_at: "2026-10-27T09:30:00.000Z" };
  assert.equal(visibleReviewRequest("review_needed", request), request);
  assert.equal(visibleReviewRequest("draft", request), null);
  // submitted also covers blocked, approved and unknown server statuses (see reviewStatusFromServer).
  for (const server of ["submitted", "blocked", "approved"]) {
    assert.equal(visibleReviewRequest(reviewStatusFromServer(server), request), null, server);
  }
  assert.equal(visibleReviewRequest("review_needed", null), null, "no request: nothing to show");
});

// ---------- Reopen-feedback voor de Owner ----------

test("reopen-feedback: Nederlandse labels voor de reopen-redenen en een eigen titel", () => {
  assert.equal(reviewReasonLabel("material_input_change"), "Materiële wijziging in de intake");
  assert.equal(reviewReasonLabel("rights_or_asset_change"), "Wijziging in rechten of beeldmateriaal");
  assert.equal(reviewReasonLabel("scope_or_strategy_change"), "Wijziging in scope of strategie");

  const reopened: ReviewRequest = { kind: "reopened", reason_code: "material_input_change", note: "Graag opnieuw controleren.", version: 2, created_at: "2026-10-27T14:05:00.000Z" };
  assert.equal(reviewFeedbackTitle(reopened), "Westend heeft je goedgekeurde onboarding heropend.");
  assert.equal(reviewFeedbackTitle({ ...reopened, kind: "changes_requested" }), "Westend heeft aanvullingen gevraagd.");
  // Older responses without kind, or no feedback at all, keep the existing title.
  const withoutKind: ReviewRequest = { reason_code: "missing_information", note: "Ouder antwoord.", version: 1, created_at: "2026-10-27T14:05:00.000Z" };
  assert.equal(reviewFeedbackTitle(withoutKind), "Westend heeft aanvullingen gevraagd.");
  assert.equal(reviewFeedbackTitle(null), "Westend heeft aanvullingen gevraagd.");
});

test("unblock-feedback: duidelijke Nederlandse titel en veilige redenlabels", () => {
  const unblocked: ReviewRequest = { kind: "unblocked", reason_code: "rights_cleared", note: "De rechten zijn opgehelderd.", version: 3, created_at: "2026-10-27T15:05:00.000Z" };
  assert.equal(reviewFeedbackTitle(unblocked), "Westend heeft de blokkade opgeheven.");
  assert.equal(reviewFeedbackTitle({ ...unblocked, kind: "future_kind" }), "Westend heeft aanvullingen gevraagd.");
  assert.equal(reviewReasonLabel("future_unblock_reason"), "Aanvulling gevraagd");
});

test("reopen-feedback: alleen zichtbaar in review_needed, niet bij draft, submitted, blocked of approved", () => {
  const reopened: ReviewRequest = { kind: "reopened", reason_code: "scope_or_strategy_change", note: "Het aanbod is gewijzigd.", version: 1, created_at: "2026-10-27T14:05:00.000Z" };
  assert.equal(visibleReviewRequest("review_needed", reopened), reopened);
  for (const server of ["draft", "submitted", "blocked", "approved"]) {
    assert.equal(visibleReviewRequest(reviewStatusFromServer(server), reopened), null, server);
  }
});

test("unblock-feedback: alleen zichtbaar in review_needed en verdwijnt na resubmission", () => {
  const unblocked: ReviewRequest = { kind: "unblocked", reason_code: "extra_work_agreed", note: "Meerwerk is afgestemd.", version: 4, created_at: "2026-10-27T15:05:00.000Z" };
  assert.equal(visibleReviewRequest("review_needed", unblocked), unblocked);
  for (const server of ["draft", "submitted", "blocked", "approved"]) {
    assert.equal(visibleReviewRequest(reviewStatusFromServer(server), unblocked), null, server);
  }
  let state = flowReducer(initialFlowState, { type: "hydrate", answers: completeAnswers(), reviewStatus: "review_needed" });
  state = flowReducer(state, { type: "submitted" });
  assert.equal(visibleReviewRequest(state.reviewStatus, unblocked), null);
});
