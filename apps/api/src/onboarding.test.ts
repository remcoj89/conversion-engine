import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { buildApp, type AppDependencies } from "./app.js";
import type { AuthAdapter, Membership, ReviewerAssignment } from "./auth/types.js";
import {
  statusAfterSave,
  type OnboardingDraft,
  type OnboardingStatus,
  type SaveDraftInput,
  type SaveDraftResult,
  type SaveTarget,
} from "./onboarding/onboardingRepository.js";
import type { OnboardingStore } from "./routes/onboarding.js";
import type { RequestChangesInput, RequestChangesResult, ReviewableOnboarding } from "./onboarding/onboardingReviewRepository.js";
import { fieldById, missingFields, onboardingSchema } from "../../../packages/onboarding-contract/src/index.ts";
import { completeAnswers } from "../../../packages/onboarding-contract/src/testFixtures.ts";

// ---------- Testopzet ----------

const TEST_IDENTITY_HEADER = "x-test-identity";
const testAuthAdapter: AuthAdapter = {
  authenticate: async (request) => {
    const subject = request.headers[TEST_IDENTITY_HEADER];
    if (subject === undefined) return { status: "anonymous" };
    if (typeof subject !== "string") return { status: "invalid", reason: "test" };
    return { status: "authenticated", identity: { issuer: "https://issuer.test", subject } };
  },
};

const tenantA = randomUUID();
const tenantB = randomUUID();
const membership = (subject: string, tenantId: string, role: Membership["role"]): Membership => ({
  userId: `user-${subject}`,
  tenantId,
  role,
  status: "active",
});
const membershipsBySubject: Record<string, readonly Membership[]> = {
  owner: [membership("owner", tenantA, "owner")],
  "owner-b": [membership("owner-b", tenantB, "owner")],
  "multi-owner": [membership("multi-owner", tenantA, "owner"), membership("multi-owner", tenantB, "owner")],
  "team-member": [membership("team-member", tenantA, "team_member")],
  // Owner of A who is also assigned as reviewer of A: must be refused as self-review.
  "reviewer-self": [membership("reviewer-self", tenantA, "owner")],
};

// In-memory store met dezelfde versieregels als de repository; legt elke aanroep vast.
function memoryStore() {
  const drafts = new Map<string, OnboardingDraft>();
  const calls: { method: string; tenantId: string; input?: SaveDraftInput }[] = [];
  const store: OnboardingStore = {
    findCurrent: async (tenantId) => {
      calls.push({ method: "findCurrent", tenantId });
      return drafts.get(tenantId) ?? null;
    },
    saveDraft: async (input) => save("saveDraft", input, "draft"),
    submit: async (input) => save("submit", input, "submitted"),
  };
  // Same rules as the repository: first the editing rule (shared statusAfterSave), then the version check.
  function save(method: string, input: SaveDraftInput, target: SaveTarget): SaveDraftResult {
    calls.push({ method, tenantId: input.tenantId, input });
    const current = drafts.get(input.tenantId);
    const nextStatus = current ? statusAfterSave(current.status, target) : target;
    if (!nextStatus) return { status: "not_editable" };
    const currentVersion = current?.version ?? 0;
    if (input.baseVersion !== currentVersion) return { status: "conflict", currentVersion };
    const draft: OnboardingDraft = {
      projectId: current?.projectId ?? randomUUID(),
      status: nextStatus,
      version: currentVersion + 1,
      schemaId: input.schemaId,
      schemaVersion: input.schemaVersion,
      answers: input.answers,
      projectBrief: input.projectBrief,
      updatedAt: new Date("2026-10-23T12:00:00Z"),
    };
    drafts.set(input.tenantId, draft);
    return { status: "saved", draft };
  }
  return { store, calls, drafts };
}

type ReviewDependencies = Partial<Pick<AppDependencies, "reviewerAssignmentResolver" | "reviewStore">>;

function setup(t: TestContext, onboardingStore: OnboardingStore = memoryStore().store, review: ReviewDependencies = {}) {
  const app = buildApp(
    {
      authAdapter: testAuthAdapter,
      membershipResolver: async ({ subject }) => membershipsBySubject[subject] ?? [],
      tenantLoader: async () => null,
      leadCreator: async () => {
        throw new Error("not used in these tests");
      },
      onboardingStore,
      // Deny by default: without explicit review dependencies nobody is a reviewer.
      reviewerAssignmentResolver: async () => [],
      reviewStore: {
        findReviewable: async () => null,
        requestChanges: async () => {
          throw new Error("not used in these tests");
        },
      },
      ...review,
      now: () => new Date("2026-10-23T12:00:00Z"),
    },
    { logger: false },
  );
  t.after(() => app.close());
  return app;
}

const as = (subject: string, extra: Record<string, string> = {}) => ({ [TEST_IDENTITY_HEADER]: subject, ...extra });
const body = (answers: unknown, baseVersion = 0, overrides: Record<string, unknown> = {}) => ({
  schema_id: onboardingSchema.id,
  schema_version: onboardingSchema.version,
  base_version: baseVersion,
  answers,
  ...overrides,
});
const URL_ = "/v1/onboarding/current";

// ---------- GET ----------

test("GET onboarding zonder project geeft een lege draft met lege Project Brief", async (t) => {
  const response = await setup(t).inject({ method: "GET", url: URL_, headers: as("owner") });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  const json = response.json();
  assert.equal(json.version, 0);
  assert.equal(json.status, "draft");
  assert.equal(json.schema_id, onboardingSchema.id);
  assert.equal(json.schema_version, onboardingSchema.version);
  assert.deepEqual(json.answers, {});
  assert.equal(json.updated_at, null);
  assert.equal(json.project_brief.status, "incomplete_draft");
  assert.deepEqual(json.project_brief.client_supplied, {});
});

// ---------- Opslaan, hervatten en versies ----------

test("PUT eerste opslag maakt versie 1; GET hervat met dezelfde antwoorden", async (t) => {
  const { store, calls } = memoryStore();
  const app = setup(t, store);
  const answers = { company_name: "Sterk & Fit Coaching", founding_year: "2021" };

  const saved = await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: body(answers) });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.headers["cache-control"], "no-store");
  assert.deepEqual(saved.json(), { status: "draft", version: 1, updated_at: "2026-10-23T12:00:00.000Z", missing_count: saved.json().missing_count });
  assert.ok(saved.json().missing_count > 0, "onvolledige draft mag worden opgeslagen");

  const resumed = await app.inject({ method: "GET", url: URL_, headers: as("owner") });
  assert.equal(resumed.json().version, 1);
  assert.deepEqual(resumed.json().answers, answers);
  assert.equal(resumed.json().project_brief.client_supplied.business.name, "Sterk & Fit Coaching");
  // Eén keer opslaan, met de tenant en gebruiker uit de auth-context.
  const save = calls.find((call) => call.method === "saveDraft")!;
  assert.equal(save.tenantId, tenantA);
  assert.equal(save.input?.userId, "user-owner");
});

test("PUT met de actuele base_version verhoogt het versienummer", async (t) => {
  const app = setup(t);
  for (const [base, expected] of [[0, 1], [1, 2], [2, 3]] as const) {
    const response = await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: body({ company_name: `Versie ${expected}` }, base) });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().version, expected);
  }
});

test("PUT met een verouderde base_version geeft 409 met de actuele versie", async (t) => {
  const app = setup(t);
  await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: body({ company_name: "Eerste" }, 0) });
  await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: body({ company_name: "Tweede" }, 1) });

  const stale = await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: body({ company_name: "Verouderd" }, 1) });
  assert.equal(stale.statusCode, 409);
  assert.deepEqual(stale.json(), { error: "version_conflict", current_version: 2 });

  const current = await app.inject({ method: "GET", url: URL_, headers: as("owner") });
  assert.equal(current.json().answers.company_name, "Tweede", "verouderde versie overschrijft niets");
});

test("PUT met een ander schema-ID of andere schemaversie geeft 409", async (t) => {
  const { store, calls } = memoryStore();
  const app = setup(t, store);
  for (const overrides of [{ schema_version: "0.0.1-oud" }, { schema_id: "ANDER_SCHEMA" }]) {
    const response = await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: body({}, 0, overrides) });
    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.json(), { error: "schema_mismatch", schema_id: onboardingSchema.id, schema_version: onboardingSchema.version });
  }
  assert.deepEqual(calls, []);
});

// ---------- Body- en antwoordvalidatie ----------

test("PUT accepteert alleen schema_id, schema_version, base_version en answers", async (t) => {
  const { store, calls } = memoryStore();
  const app = setup(t, store);
  const payloads: unknown[] = [
    { ...body({}), tenant_id: tenantB },
    { ...body({}), status: "approved" },
    { schema_id: onboardingSchema.id, schema_version: onboardingSchema.version, answers: {} },
    body({}, -1),
    body({}, 1.5),
    body({}, 0, { base_version: "0" }),
    [],
  ];
  for (const payload of payloads) {
    const response = await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: payload as object });
    assert.equal(response.statusCode, 400, JSON.stringify(payload));
    assert.deepEqual(response.json(), { error: "invalid_body" });
  }
  assert.deepEqual(calls, []);
});

test("PUT weigert onbekende veld-ID's, verkeerde types, ongeldige keuzes en overschreden limieten", async (t) => {
  const { store, calls } = memoryStore();
  const app = setup(t, store);
  const proofOptions = { proof_types: ["none", "reviews"] };
  const firstBrandValue = fieldById("brand_values").choices![0]!.value;
  const cases: [Record<string, unknown>, string, string][] = [
    [{ niet_bestaand_veld: "x" }, "niet_bestaand_veld", "unknown_field"],
    [{ company_name: 42 }, "company_name", "invalid_type"],
    [{ company_name: "x".repeat(121) }, "company_name", "too_long"],
    [{ brand_status: "rebranding" }, "brand_status", "invalid_choice"],
    [{ brand_values: "modern" }, "brand_values", "invalid_type"],
    [proofOptions, "proof_types", "exclusive_conflict"],
    [{ brand_values: [firstBrandValue, firstBrandValue] }, "brand_values", "duplicate_choice"],
    [{ additional_offers: [{}, {}, {}] }, "additional_offers", "too_many_items"],
    [{ additional_offers: [{ name: "Groep", tenant_id: tenantB }] }, "additional_offers", "unknown_item_field"],
    [{ logo_assets: [{ name: "logo.exe", size: 10, type: "application/octet-stream" }] }, "logo_assets", "invalid_file"],
    [{ logo_assets: [{ name: "logo.png", size: 11 * 1024 * 1024, type: "image/png" }] }, "logo_assets", "invalid_file"],
    [{ logo_assets: [{ name: "logo.png", size: 10, type: "image/png", url: "https://x" }] }, "logo_assets", "invalid_file"],
    [{ price_amount: "1".repeat(65) }, "price_amount", "too_long"],
  ];
  for (const [answers, fieldId, code] of cases) {
    const response = await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: body(answers) });
    assert.equal(response.statusCode, 400, JSON.stringify(answers).slice(0, 80));
    assert.equal(response.json().error, "invalid_answers");
    assert.deepEqual(response.json().issues, [{ field_id: fieldId, code }], JSON.stringify(answers).slice(0, 80));
  }
  const notObject = await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: body(["company_name"]) });
  assert.equal(notObject.statusCode, 400);
  assert.deepEqual(calls, []);
});

test("PUT bewaart een onvolledige of inhoudelijk ongeldige draft en meldt dat in de Project Brief", async (t) => {
  const { store, drafts } = memoryStore();
  const app = setup(t, store);
  // Te kort en ongeldige e-mail: geen opslagblokkade, wel reviewpunten.
  const response = await app.inject({
    method: "PUT",
    url: URL_,
    headers: as("owner"),
    payload: body({ company_name: "A", contact_email: "geen-mail" }),
  });
  assert.equal(response.statusCode, 200);
  const brief = drafts.get(tenantA)!.projectBrief as { status: string; review: { required_fields_missing: { field_id: string }[] } };
  assert.equal(brief.status, "incomplete_draft");
  const missing = brief.review.required_fields_missing.map((item) => item.field_id);
  assert.ok(missing.includes("company_name"));
  assert.ok(missing.includes("contact_email"));
});

test("PUT verwijdert verborgen conditionele waarden en lege waarden vóór opslag en uit de Project Brief", async (t) => {
  const { store, drafts } = memoryStore();
  const app = setup(t, store);
  const response = await app.inject({
    method: "PUT",
    url: URL_,
    headers: as("owner"),
    payload: body({
      domain_status: "new",
      domain_name: "verborgen.nl", // alleen zichtbaar bij domain_status "existing"
      pricing_model: "quote",
      price_amount: "149,00", // alleen zichtbaar bij een vaste of terugkerende prijs
      expertise_sources: ["education"],
      expertise_other: "verborgen", // alleen zichtbaar bij "other"
      company_name: "",
    }),
  });
  assert.equal(response.statusCode, 200);
  const saved = drafts.get(tenantA)!;
  assert.deepEqual(saved.answers, { domain_status: "new", pricing_model: "quote", expertise_sources: ["education"] });
  const serialized = JSON.stringify(saved.projectBrief);
  for (const hidden of ["verborgen.nl", "149", "expertise_other", "domain_name", "price_amount"]) {
    assert.ok(!serialized.includes(hidden), `brief bevat ${hidden}`);
  }
});

test("PUT met een zichtbaar conditioneel veld bewaart de waarde", async (t) => {
  const { store, drafts } = memoryStore();
  const app = setup(t, store);
  await app.inject({
    method: "PUT",
    url: URL_,
    headers: as("owner"),
    payload: body({ domain_status: "existing", domain_name: "voorbeeld.nl" }),
  });
  assert.equal(drafts.get(tenantA)!.answers.domain_name, "voorbeeld.nl");
});

// ---------- Autorisatie en tenantisolatie ----------

test("onboarding zonder credentials geeft 401", async (t) => {
  const { store, calls } = memoryStore();
  const app = setup(t, store);
  for (const method of ["GET", "PUT"] as const) {
    const response = await app.inject({ method, url: URL_, payload: method === "PUT" ? body({}) : undefined });
    assert.equal(response.statusCode, 401);
  }
  assert.deepEqual(calls, []);
});

test("Team Member mag onboarding niet lezen of wijzigen", async (t) => {
  const { store, calls } = memoryStore();
  const app = setup(t, store);
  for (const method of ["GET", "PUT"] as const) {
    const response = await app.inject({ method, url: URL_, headers: as("team-member"), payload: method === "PUT" ? body({}) : undefined });
    assert.equal(response.statusCode, 403, method);
    assert.deepEqual(response.json(), { error: "forbidden" });
  }
  assert.deepEqual(calls, []);
});

test("tenantisolatie: Owner van A ziet de draft van B nooit, ook niet met een aangepaste tenant-ID", async (t) => {
  const { store, calls } = memoryStore();
  const app = setup(t, store);
  await app.inject({ method: "PUT", url: URL_, headers: as("owner-b"), payload: body({ company_name: "Geheim B" }) });

  const ownA = await app.inject({ method: "GET", url: URL_, headers: as("owner") });
  assert.equal(ownA.json().version, 0);
  assert.ok(!ownA.body.includes("Geheim B"));

  // Tenant B kiezen zonder membership in B: geweigerd vóór de store wordt aangeroepen.
  const before = calls.length;
  const forged = await app.inject({ method: "GET", url: URL_, headers: as("owner", { "x-tenant-id": tenantB }) });
  assert.equal(forged.statusCode, 403);
  assert.ok(!forged.body.includes("Geheim B"));
  const forgedPut = await app.inject({ method: "PUT", url: `${URL_}?tenant_id=${tenantB}`, headers: as("owner"), payload: body({ company_name: "Inbraak" }, 1) });
  assert.equal(forgedPut.statusCode, 409, "query-tenant wordt genegeerd; de PUT gaat naar A met verkeerde base_version");
  assert.deepEqual(calls.slice(before).map((call) => call.tenantId), [tenantA]);
});

test("tenantisolatie: een Owner van twee tenants schrijft en leest per gekozen tenant", async (t) => {
  const { store, drafts } = memoryStore();
  const app = setup(t, store);
  await app.inject({ method: "PUT", url: URL_, headers: as("multi-owner", { "x-tenant-id": tenantA }), payload: body({ company_name: "Bedrijf A" }) });
  await app.inject({ method: "PUT", url: URL_, headers: as("multi-owner", { "x-tenant-id": tenantB }), payload: body({ company_name: "Bedrijf B" }) });

  assert.equal(drafts.get(tenantA)!.answers.company_name, "Bedrijf A");
  assert.equal(drafts.get(tenantB)!.answers.company_name, "Bedrijf B");
  const readB = await app.inject({ method: "GET", url: URL_, headers: as("multi-owner", { "x-tenant-id": tenantB }) });
  assert.equal(readB.json().answers.company_name, "Bedrijf B");
  assert.ok(!readB.body.includes("Bedrijf A"));
});

test("een storefout geeft 500 zonder interne details", async (t) => {
  const failing: OnboardingStore = {
    findCurrent: async () => {
      throw new Error(`Failed query params: ${tenantA}`);
    },
    saveDraft: async () => {
      throw new Error(`Failed query params: ${tenantA}`);
    },
    submit: async () => {
      throw new Error(`Failed query params: ${tenantA}`);
    },
  };
  const app = setup(t, failing);
  const requests = [
    { method: "GET", url: URL_ },
    { method: "PUT", url: URL_, payload: body({}) },
    // Een fout in de submit-transactie (versie, statusovergang of auditevent) lekt niets naar de client.
    { method: "POST", url: "/v1/onboarding/current/submit", payload: body(completeAnswers()) },
  ] as const;
  for (const request of requests) {
    const response = await app.inject({ ...request, headers: as("owner") });
    assert.equal(response.statusCode, 500, request.method);
    assert.deepEqual(response.json(), { error: "internal_error" });
    assert.ok(!response.body.includes(tenantA));
  }
});

// ---------- Indienen ----------

const SUBMIT_URL = "/v1/onboarding/current/submit";

test("submit: complete onboarding wordt ingediend; GET toont daarna status submitted", async (t) => {
  const { store, calls, drafts } = memoryStore();
  const app = setup(t, store);
  await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: body({ company_name: "Concept" }) });

  const response = await app.inject({ method: "POST", url: SUBMIT_URL, headers: as("owner"), payload: body(completeAnswers(), 1) });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(response.json(), { status: "submitted", version: 2, updated_at: "2026-10-23T12:00:00.000Z" });

  const submitCall = calls.find((call) => call.method === "submit")!;
  assert.equal(submitCall.tenantId, tenantA);
  assert.equal(submitCall.input?.userId, "user-owner");
  const brief = drafts.get(tenantA)!.projectBrief as { status: string; submitted_for_review: boolean; review: { required_fields_missing: unknown[] } };
  assert.equal(brief.status, "ready_for_westend_review");
  assert.equal(brief.submitted_for_review, true);
  assert.deepEqual(brief.review.required_fields_missing, []);

  const current = await app.inject({ method: "GET", url: URL_, headers: as("owner") });
  assert.equal(current.json().status, "submitted");
  assert.equal(current.json().version, 2);
});

test("submit: incomplete onboarding geeft 400 met veldinformatie en blijft draft", async (t) => {
  const { store, calls } = memoryStore();
  const app = setup(t, store);
  await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: body({ company_name: "Concept" }) });
  const answers: Record<string, unknown> = { ...completeAnswers() };
  delete answers.contact_email;
  answers.company_name = "A";

  const response = await app.inject({ method: "POST", url: SUBMIT_URL, headers: as("owner"), payload: body(answers, 1) });
  assert.equal(response.statusCode, 400);
  const json = response.json();
  assert.equal(json.error, "incomplete_answers");
  assert.deepEqual(
    json.missing.map((item: { field_id: string }) => item.field_id).sort(),
    ["company_name", "contact_email"],
  );
  const contact = json.missing.find((item: { field_id: string }) => item.field_id === "contact_email");
  assert.equal(contact.questionnaire, "Q4");
  assert.equal(contact.message, "Dit veld is verplicht.");
  assert.equal(typeof contact.step, "number");

  assert.ok(!calls.some((call) => call.method === "submit"));
  const current = await app.inject({ method: "GET", url: URL_, headers: as("owner") });
  assert.equal(current.json().status, "draft");
  assert.equal(current.json().version, 1);
});

test("submit: ongeldige antwoorden, extra body-velden en een ander schema worden geweigerd", async (t) => {
  const { store, calls } = memoryStore();
  const app = setup(t, store);
  const cases: [unknown, number, string][] = [
    [body({ ...completeAnswers(), niet_bestaand: "x" }), 400, "invalid_answers"],
    [body({ ...completeAnswers(), brand_status: "rebranding" }), 400, "invalid_answers"],
    [{ ...body(completeAnswers()), tenant_id: tenantB }, 400, "invalid_body"],
    [body(completeAnswers(), 0, { schema_version: "0.0.1-oud" }), 409, "schema_mismatch"],
  ];
  for (const [payload, status, error] of cases) {
    const response = await app.inject({ method: "POST", url: SUBMIT_URL, headers: as("owner"), payload: payload as object });
    assert.equal(response.statusCode, status, error);
    assert.equal(response.json().error, error);
  }
  assert.deepEqual(calls, []);
});

test("submit: verborgen conditionele waarden worden niet opgeslagen", async (t) => {
  const { store, drafts } = memoryStore();
  const app = setup(t, store);
  const answers = { ...completeAnswers(), domain_status: "new", domain_name: "verborgen.nl" };
  const response = await app.inject({ method: "POST", url: SUBMIT_URL, headers: as("owner"), payload: body(answers) });
  assert.equal(response.statusCode, 200);
  assert.equal(drafts.get(tenantA)!.answers.domain_name, undefined);
  assert.ok(!JSON.stringify(drafts.get(tenantA)!.projectBrief).includes("verborgen.nl"));
});

test("submit: verouderde base_version geeft 409 en wijzigt niets", async (t) => {
  const { store } = memoryStore();
  const app = setup(t, store);
  await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: body({ company_name: "Eerste" }) });
  await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: body({ company_name: "Tweede" }, 1) });

  const response = await app.inject({ method: "POST", url: SUBMIT_URL, headers: as("owner"), payload: body(completeAnswers(), 1) });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), { error: "version_conflict", current_version: 2 });
  const current = await app.inject({ method: "GET", url: URL_, headers: as("owner") });
  assert.deepEqual([current.json().status, current.json().version, current.json().answers.company_name], ["draft", 2, "Tweede"]);
});

test("submit: tweede indiening en een PUT na indiening geven 409 not_editable", async (t) => {
  const app = setup(t);
  const first = await app.inject({ method: "POST", url: SUBMIT_URL, headers: as("owner"), payload: body(completeAnswers()) });
  assert.equal(first.statusCode, 200);

  const second = await app.inject({ method: "POST", url: SUBMIT_URL, headers: as("owner"), payload: body(completeAnswers(), 1) });
  assert.equal(second.statusCode, 409);
  assert.deepEqual(second.json(), { error: "not_editable" });

  const put = await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: body({ company_name: "Wijziging" }, 1) });
  assert.equal(put.statusCode, 409);
  assert.deepEqual(put.json(), { error: "not_editable" });

  const current = await app.inject({ method: "GET", url: URL_, headers: as("owner") });
  assert.equal(current.json().status, "submitted");
  assert.equal(current.json().version, 1);
});

test("submit: zonder credentials 401, Team Member 403, en geen storeaanroep", async (t) => {
  const { store, calls } = memoryStore();
  const app = setup(t, store);
  const anonymous = await app.inject({ method: "POST", url: SUBMIT_URL, payload: body(completeAnswers()) });
  assert.equal(anonymous.statusCode, 401);
  const member = await app.inject({ method: "POST", url: SUBMIT_URL, headers: as("team-member"), payload: body(completeAnswers()) });
  assert.equal(member.statusCode, 403);
  assert.deepEqual(member.json(), { error: "forbidden" });
  assert.deepEqual(calls, []);
});

test("submit: tenantisolatie, ook met een aangepaste tenant-ID", async (t) => {
  const { store, drafts, calls } = memoryStore();
  const app = setup(t, store);
  await app.inject({ method: "PUT", url: URL_, headers: as("owner-b"), payload: body({ company_name: "Concept B" }) });

  const forged = await app.inject({ method: "POST", url: SUBMIT_URL, headers: as("owner", { "x-tenant-id": tenantB }), payload: body(completeAnswers(), 1) });
  assert.equal(forged.statusCode, 403);
  assert.equal(drafts.get(tenantB)!.status, "draft");

  const ownA = await app.inject({ method: "POST", url: SUBMIT_URL, headers: as("owner"), payload: body(completeAnswers()) });
  assert.equal(ownA.statusCode, 200);
  assert.equal(drafts.get(tenantA)!.status, "submitted");
  assert.equal(drafts.get(tenantB)!.status, "draft", "B blijft ongewijzigd");
  assert.deepEqual(calls.filter((call) => call.method === "submit").map((call) => call.tenantId), [tenantA]);
});

// ---------- Concept opslaan in review_needed (O-6) ----------

// Puts tenant A's onboarding in the given status at version 1, as a fixture.
function seedStatus(drafts: Map<string, OnboardingDraft>, status: OnboardingStatus) {
  drafts.set(tenantA, {
    projectId: randomUUID(),
    status,
    version: 1,
    schemaId: onboardingSchema.id,
    schemaVersion: onboardingSchema.version,
    answers: { company_name: "Versie 1" },
    projectBrief: {},
    updatedAt: new Date("2026-10-23T12:00:00Z"),
  });
}

test("review_needed: Owner slaat een concept op; versie stijgt en de status blijft review_needed", async (t) => {
  const { store, calls, drafts } = memoryStore();
  const app = setup(t, store);
  seedStatus(drafts, "review_needed");

  const saved = await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: body({ company_name: "Aangevuld" }, 1) });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().status, "review_needed");
  assert.equal(saved.json().version, 2);

  const current = await app.inject({ method: "GET", url: URL_, headers: as("owner") });
  assert.deepEqual([current.json().status, current.json().version, current.json().answers.company_name], ["review_needed", 2, "Aangevuld"]);
  // Tenant and actor come from the auth context.
  const save = calls.find((call) => call.method === "saveDraft")!;
  assert.deepEqual([save.tenantId, save.input?.userId], [tenantA, "user-owner"]);
});

test("review_needed: een verouderde base_version geeft 409 en wijzigt niets", async (t) => {
  const { store, drafts } = memoryStore();
  const app = setup(t, store);
  seedStatus(drafts, "review_needed");

  const stale = await app.inject({ method: "PUT", url: URL_, headers: as("owner"), payload: body({ company_name: "Verouderd" }, 0) });
  assert.equal(stale.statusCode, 409);
  assert.deepEqual(stale.json(), { error: "version_conflict", current_version: 1 });
  const current = drafts.get(tenantA)!;
  assert.deepEqual([current.status, current.version, current.answers.company_name], ["review_needed", 1, "Versie 1"]);
});

test("review_needed: opnieuw indienen is nog niet mogelijk; submitted, blocked en approved blijven niet bewerkbaar", async (t) => {
  for (const status of ["review_needed", "submitted", "blocked", "approved"] as const) {
    const { store, drafts } = memoryStore();
    const app = setup(t, store);
    seedStatus(drafts, status);
    const put = { method: "PUT", url: URL_, payload: body({ company_name: "Wijziging" }, 1) } as const;
    const submit = { method: "POST", url: SUBMIT_URL, payload: body(completeAnswers(), 1) } as const;
    // review_needed accepts draft saves (tested above) but not a resubmit yet.
    const requests = status === "review_needed" ? [submit] : [put, submit];
    for (const request of requests) {
      const response = await app.inject({ ...request, headers: as("owner") });
      assert.equal(response.statusCode, 409, `${status} ${request.method}`);
      assert.deepEqual(response.json(), { error: "not_editable" });
    }
    assert.deepEqual([drafts.get(tenantA)!.status, drafts.get(tenantA)!.version], [status, 1], status);
  }
});

test("review_needed: Team Member, reviewer zonder membership en tenantwaarden uit body of query wijzigen niets", async (t) => {
  const { store, drafts } = memoryStore();
  const app = setup(t, store, { reviewerAssignmentResolver: async ({ subject }) => (subject === "reviewer" ? [{ userId: "user-reviewer", tenantId: tenantA }] : []) });
  seedStatus(drafts, "review_needed");

  const member = await app.inject({ method: "PUT", url: URL_, headers: as("team-member"), payload: body({ company_name: "Teamlid" }, 1) });
  assert.deepEqual([member.statusCode, member.json()], [403, { error: "forbidden" }]);
  const reviewer = await app.inject({ method: "PUT", url: URL_, headers: as("reviewer", { "x-tenant-id": tenantA }), payload: body({ company_name: "Reviewer" }, 1) });
  assert.deepEqual([reviewer.statusCode, reviewer.json()], [403, { error: "forbidden" }]);
  const bodyTenant = await app.inject({ method: "PUT", url: URL_, headers: as("owner-b"), payload: { ...body({ company_name: "B" }, 1), tenant_id: tenantA } });
  assert.deepEqual([bodyTenant.statusCode, bodyTenant.json()], [400, { error: "invalid_body" }]);
  // Owner of B with tenant A in the query: the save goes to B (no project yet), never to A.
  const queryTenant = await app.inject({ method: "PUT", url: `${URL_}?tenant_id=${tenantA}`, headers: as("owner-b"), payload: body({ company_name: "B" }, 1) });
  assert.deepEqual([queryTenant.statusCode, queryTenant.json()], [409, { error: "version_conflict", current_version: 0 }]);

  assert.deepEqual([drafts.get(tenantA)!.version, drafts.get(tenantA)!.answers.company_name], [1, "Versie 1"]);
});

// ---------- Westend-review: reviewer-scope en metadata ----------

const REVIEW_URL = "/v1/review/onboarding";
const assignment = (subject: string, tenantId: string): ReviewerAssignment => ({ userId: `user-${subject}`, tenantId });
const assignmentsBySubject: Record<string, readonly ReviewerAssignment[]> = {
  reviewer: [assignment("reviewer", tenantA)],
  "reviewer-self": [assignment("reviewer-self", tenantA)],
};
const SECRET_ANSWER = "Geheim Antwoord BV";

const defaultReviewable: ReviewableOnboarding = {
  status: "submitted",
  version: 3,
  updatedAt: new Date("2026-10-27T12:00:00Z"),
  answers: { ...completeAnswers(), company_name: SECRET_ANSWER },
};

// Review store that records every call; the stored onboarding contains a recognisable secret.
function reviewSetup(
  t: TestContext,
  onboarding: ReviewableOnboarding | null = defaultReviewable,
  requestChangesResult?: RequestChangesResult,
) {
  const loaderCalls: string[] = [];
  const changeCalls: RequestChangesInput[] = [];
  const { store, calls: storeCalls } = memoryStore();
  const app = setup(t, store, {
    reviewerAssignmentResolver: async ({ subject }) => assignmentsBySubject[subject] ?? [],
    reviewStore: {
      findReviewable: async (tenantId) => {
        loaderCalls.push(tenantId);
        return onboarding;
      },
      requestChanges: async (input) => {
        changeCalls.push(input);
        return requestChangesResult ?? { status: "review_needed", version: input.baseVersion };
      },
    },
  });
  return { app, loaderCalls, changeCalls, storeCalls };
}

test("review: toegewezen reviewer krijgt alleen de vier metadatavelden van de eigen toegewezen tenant", async (t) => {
  const { app, loaderCalls } = reviewSetup(t);
  const response = await app.inject({ method: "GET", url: REVIEW_URL, headers: as("reviewer", { "x-tenant-id": tenantA }) });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(response.json(), { status: "submitted", version: 3, updated_at: "2026-10-27T12:00:00.000Z", missing_required_fields: 0 });
  assert.deepEqual(loaderCalls, [tenantA]);
  // No answers or Project Brief content in the response.
  assert.ok(!response.body.includes(SECRET_ANSWER));
  assert.ok(!response.body.includes("answers"));
  assert.ok(!response.body.includes("project_brief"));
});

test("review: missing_required_fields komt uit de gedeelde contractlogica", async (t) => {
  const answers = { company_name: "Concept" };
  const { app } = reviewSetup(t, { status: "review_needed", version: 2, updatedAt: new Date("2026-10-27T12:00:00Z"), answers });
  const response = await app.inject({ method: "GET", url: REVIEW_URL, headers: as("reviewer", { "x-tenant-id": tenantA }) });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "review_needed");
  assert.equal(response.json().missing_required_fields, missingFields(answers).length);
  assert.ok(response.json().missing_required_fields > 0);
});

test("review: geen reviewbare onboarding geeft 404 onboarding_not_found", async (t) => {
  const { app } = reviewSetup(t, null);
  const response = await app.inject({ method: "GET", url: REVIEW_URL, headers: as("reviewer", { "x-tenant-id": tenantA }) });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "onboarding_not_found" });
});

test("review: anoniem 401, ontbrekende of ongeldige x-tenant-id 400; tenant uit query of body telt niet", async (t) => {
  const { app, loaderCalls } = reviewSetup(t);
  const cases: [Record<string, string>, string, number, string][] = [
    [{}, REVIEW_URL, 401, "unauthorized"],
    [as("reviewer"), REVIEW_URL, 400, "tenant_required"],
    [as("reviewer"), `${REVIEW_URL}?tenant_id=${tenantA}`, 400, "tenant_required"],
    [as("reviewer", { "x-tenant-id": "" }), REVIEW_URL, 400, "tenant_required"],
    [as("reviewer", { "x-tenant-id": "tenant-a" }), REVIEW_URL, 400, "invalid_tenant"],
    [as("reviewer", { "x-tenant-id": `${tenantA}x` }), REVIEW_URL, 400, "invalid_tenant"],
  ];
  for (const [headers, url, status, error] of cases) {
    const response = await app.inject({ method: "GET", url, headers });
    assert.equal(response.statusCode, status, `${url} ${JSON.stringify(headers)}`);
    assert.deepEqual(response.json(), { error });
  }
  assert.deepEqual(loaderCalls, []);
});

test("review: reviewer van A krijgt geen toegang tot B; Owner en Team Member zonder assignment krijgen 403", async (t) => {
  const { app, loaderCalls } = reviewSetup(t);
  const cases: [string, string][] = [
    ["reviewer", tenantB],
    ["owner", tenantA],
    ["owner-b", tenantB],
    ["team-member", tenantA],
    ["onbekend", tenantA],
  ];
  for (const [subject, tenantId] of cases) {
    const response = await app.inject({ method: "GET", url: REVIEW_URL, headers: as(subject, { "x-tenant-id": tenantId }) });
    assert.equal(response.statusCode, 403, subject);
    assert.deepEqual(response.json(), { error: "forbidden" });
  }
  assert.deepEqual(loaderCalls, []);
});

test("review: reviewer met een membership in dezelfde tenant wordt geweigerd wegens zelfreview", async (t) => {
  const { app, loaderCalls } = reviewSetup(t);
  const response = await app.inject({ method: "GET", url: REVIEW_URL, headers: as("reviewer-self", { "x-tenant-id": tenantA }) });
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "self_review_forbidden" });
  assert.deepEqual(loaderCalls, []);
});

test("review: reviewer zonder membership kan de gewone onboardingroutes niet gebruiken", async (t) => {
  const { app, storeCalls } = reviewSetup(t);
  const headers = as("reviewer", { "x-tenant-id": tenantA });
  const requests = [
    { method: "GET", url: URL_ },
    { method: "PUT", url: URL_, payload: body({}) },
    { method: "POST", url: SUBMIT_URL, payload: body(completeAnswers()) },
  ] as const;
  for (const request of requests) {
    const response = await app.inject({ ...request, headers });
    assert.equal(response.statusCode, 403, request.method);
    assert.deepEqual(response.json(), { error: "forbidden" });
  }
  assert.deepEqual(storeCalls, []);
});

test("review: een storefout geeft 500 zonder interne details, ook bij request-changes", async (t) => {
  const failure = async () => {
    throw new Error(`Failed query params: ${tenantA}`);
  };
  const app = setup(t, undefined, {
    reviewerAssignmentResolver: async ({ subject }) => assignmentsBySubject[subject] ?? [],
    reviewStore: { findReviewable: failure, requestChanges: failure },
  });
  const requests = [
    { method: "GET", url: REVIEW_URL },
    { method: "POST", url: REQUEST_CHANGES_URL, payload: changesBody() },
  ] as const;
  for (const request of requests) {
    const response = await app.inject({ ...request, headers: as("reviewer", { "x-tenant-id": tenantA }) });
    assert.equal(response.statusCode, 500, request.method);
    assert.deepEqual(response.json(), { error: "internal_error" });
    assert.ok(!response.body.includes(tenantA));
  }
});

// ---------- Westend-review: wijzigingen aanvragen (submitted → review_needed) ----------

const REQUEST_CHANGES_URL = "/v1/review/onboarding/request-changes";
const changesBody = (overrides: Record<string, unknown> = {}) => ({
  base_version: 1,
  reason_code: "missing_information",
  note: "Lever de ontbrekende informatie over de dienstverlening aan.",
  ...overrides,
});

test("request-changes: reviewer zet de eigen toegewezen tenant op review_needed; tenant en reviewer komen uit de context", async (t) => {
  const { app, changeCalls } = reviewSetup(t);
  const response = await app.inject({
    method: "POST",
    url: REQUEST_CHANGES_URL,
    headers: as("reviewer", { "x-tenant-id": tenantA }),
    payload: changesBody({ note: "  Graag de prijsindicatie aanvullen.  " }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(response.json(), { status: "review_needed", version: 1 });
  assert.deepEqual(changeCalls, [
    { tenantId: tenantA, reviewerUserId: "user-reviewer", baseVersion: 1, reasonCode: "missing_information", note: "Graag de prijsindicatie aanvullen." },
  ]);
});

test("request-changes: repositoryresultaten worden vertaald naar 403, 404 en 409", async (t) => {
  const cases: [RequestChangesResult, number, Record<string, unknown>][] = [
    // Repository re-check of the hook's rules (e.g. assignment revoked after the hook ran).
    [{ status: "reviewer_forbidden" }, 403, { error: "forbidden" }],
    [{ status: "self_review_forbidden" }, 403, { error: "self_review_forbidden" }],
    [{ status: "not_found" }, 404, { error: "onboarding_not_found" }],
    [{ status: "not_reviewable" }, 409, { error: "not_reviewable" }],
    [{ status: "conflict", currentVersion: 4 }, 409, { error: "version_conflict", current_version: 4 }],
  ];
  for (const [result, status, json] of cases) {
    const { app } = reviewSetup(t, defaultReviewable, result);
    const response = await app.inject({ method: "POST", url: REQUEST_CHANGES_URL, headers: as("reviewer", { "x-tenant-id": tenantA }), payload: changesBody() });
    assert.equal(response.statusCode, status, result.status);
    assert.deepEqual(response.json(), json);
  }
});

test("request-changes: alleen base_version, reason_code en note; ongeldige waarden geven 400 zonder repositoryaanroep", async (t) => {
  const { app, changeCalls } = reviewSetup(t);
  const payloads: unknown[] = [
    { ...changesBody(), tenant_id: tenantB },
    { ...changesBody(), project_id: randomUUID() },
    { ...changesBody(), answers: { company_name: "x" } },
    { base_version: 1, reason_code: "missing_information" },
    changesBody({ base_version: 0 }),
    changesBody({ base_version: -1 }),
    changesBody({ base_version: 1.5 }),
    changesBody({ base_version: "1" }),
    changesBody({ reason_code: "approved" }),
    changesBody({ reason_code: null }),
    changesBody({ note: "" }),
    changesBody({ note: " \n\t " }),
    changesBody({ note: "x".repeat(2001) }),
    changesBody({ note: 42 }),
    [],
  ];
  for (const payload of payloads) {
    const response = await app.inject({ method: "POST", url: REQUEST_CHANGES_URL, headers: as("reviewer", { "x-tenant-id": tenantA }), payload: payload as object });
    assert.equal(response.statusCode, 400, JSON.stringify(payload).slice(0, 80));
    assert.deepEqual(response.json(), { error: "invalid_body" });
  }
  assert.deepEqual(changeCalls, []);

  const longest = await app.inject({ method: "POST", url: REQUEST_CHANGES_URL, headers: as("reviewer", { "x-tenant-id": tenantA }), payload: changesBody({ note: "x".repeat(2000) }) });
  assert.equal(longest.statusCode, 200, "precies 2000 tekens mag");
});

test("request-changes: anoniem, zonder tenant, Owner, Team Member, andere tenant en zelfreview worden geweigerd", async (t) => {
  const { app, changeCalls, storeCalls } = reviewSetup(t);
  const cases: [Record<string, string>, number, string][] = [
    [{}, 401, "unauthorized"],
    [as("reviewer"), 400, "tenant_required"],
    [as("owner", { "x-tenant-id": tenantA }), 403, "forbidden"],
    [as("team-member", { "x-tenant-id": tenantA }), 403, "forbidden"],
    [as("reviewer", { "x-tenant-id": tenantB }), 403, "forbidden"],
    [as("reviewer-self", { "x-tenant-id": tenantA }), 403, "self_review_forbidden"],
  ];
  for (const [headers, status, error] of cases) {
    const response = await app.inject({ method: "POST", url: REQUEST_CHANGES_URL, headers, payload: changesBody() });
    assert.equal(response.statusCode, status, JSON.stringify(headers));
    assert.deepEqual(response.json(), { error });
  }
  assert.deepEqual(changeCalls, []);
  assert.deepEqual(storeCalls, []);
});
