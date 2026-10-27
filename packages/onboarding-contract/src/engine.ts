// Centrale onboardinglogica: zichtbaarheid, validatie, exclusieve keuzes, status en Project Brief.
// Puur en zonder React, zodat het volledig testbaar is. Gedrag volgt het schema en de gecombineerde
// HTML-demo (docs/fase-3-gecombineerde-onboarding-ontwikkelpakket-v0.1).
import {
  allFields,
  fieldById,
  onboardingSchema,
  sourceOf,
  steps,
  type FieldDefinition,
  type RepeaterItemField,
} from "./schema.ts";

// Alleen metadata; er worden nooit bestandsbytes bewaard of verstuurd.
export type FileMeta = Readonly<{ name: string; size: number; type: string }>;
export type RepeaterItem = Readonly<Record<string, string>>;
export type AnswerValue = string | readonly string[] | readonly RepeaterItem[] | readonly FileMeta[];
export type Answers = Readonly<Record<string, AnswerValue>>;

// Client-side status of the client's submission; approval is always a separate, human Westend step.
// review_needed: Westend asked for additions and the Owner may edit and save drafts. Only "submitted"
// means submitted for review (see buildProjectBrief).
export type ReviewStatus = "draft" | "review_needed" | "submitted";

export function isEmpty(value: AnswerValue | undefined): boolean {
  if (value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return value.length === 0;
}

const asList = (value: AnswerValue | undefined): readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as readonly string[]) : [];

export function isVisible(field: FieldDefinition, answers: Answers): boolean {
  const rule = field.when;
  if (!rule) return true;
  const value = answers[rule.field];
  if (rule.eq !== undefined) return value === rule.eq;
  if (rule.in) return typeof value === "string" && rule.in.includes(value);
  if (rule.includes !== undefined) return asList(value).includes(rule.includes);
  if (rule.includes_any) return rule.includes_any.some((option) => asList(value).includes(option));
  if (rule.nonempty) return !isEmpty(value);
  return true;
}

// Waarden van velden die niet (meer) zichtbaar zijn worden gewist (schema-regel conditional_hidden_values).
// Het schema kent geen ketens van voorwaarden; de lus vangt ze toch op als ze later bijkomen.
export function clearHidden(answers: Answers): Answers {
  let current = answers;
  for (;;) {
    const hidden = allFields.filter((field) => field.id in current && !isVisible(field, current));
    if (hidden.length === 0) return current;
    const next = { ...current };
    for (const field of hidden) delete next[field.id];
    current = next;
  }
}

export function setAnswer(answers: Answers, fieldId: string, value: AnswerValue): Answers {
  const next = { ...answers };
  if (isEmpty(value)) delete next[fieldId];
  else next[fieldId] = value;
  return clearHidden(next);
}

// Meerkeuze met exclusieve opties (bijv. "none"): een exclusieve keuze wist de rest, en andersom.
export function toggleChoice(field: FieldDefinition, current: readonly string[], value: string, checked: boolean): string[] {
  if (!checked) return current.filter((item) => item !== value);
  const exclusive = field.exclusive ?? [];
  if (exclusive.includes(value)) return [value];
  return [...current.filter((item) => !exclusive.includes(item) && item !== value), value];
}

// ---------- Validatie ----------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_PATTERN = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i;
const NUMBER_PATTERN = /^-?\d+(?:[.,]\d+)?$/;
const MONEY_PATTERN = /^\d{1,7}(?:[.,]\d{1,2})?$/;

export function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  return NUMBER_PATTERN.test(trimmed) ? Number(trimmed.replace(",", ".")) : null;
}

export function parseMoney(value: string): number | null {
  const trimmed = value.trim();
  return MONEY_PATTERN.test(trimmed) ? Number(trimmed.replace(",", ".")) : null;
}

const formatNumber = (value: number) => value.toLocaleString("nl-NL");

function validateLength(text: string, min: number | undefined, max: number | undefined, prefix = ""): string | null {
  if (min !== undefined && text.length < min) return `${prefix}Gebruik minimaal ${min} tekens (nu ${text.length}).`;
  if (max !== undefined && text.length > max) return `${prefix}Gebruik maximaal ${max} tekens (nu ${text.length}).`;
  return null;
}

function validateText(field: FieldDefinition, text: string): string | null {
  const lengthError = validateLength(text, field.min, field.max);
  if (lengthError) return lengthError;
  if (field.type === "email" && !EMAIL_PATTERN.test(text)) return "Gebruik een geldig e-mailadres, zoals info@voorbeeld.nl.";
  if (field.type === "domain" && !DOMAIN_PATTERN.test(text)) return "Vul alleen de domeinnaam in, zoals voorbeeld.nl.";
  if (field.type === "url") {
    try {
      const url = new URL(text);
      if (url.protocol !== "https:" && url.protocol !== "http:") return "Gebruik een volledige URL die begint met https://.";
    } catch {
      return "Gebruik een volledige URL, inclusief https://.";
    }
  }
  return null;
}

function validateRange(field: FieldDefinition, value: number): string | null {
  if (field.min !== undefined && value < field.min) return `Vul minimaal ${formatNumber(field.min)} in.`;
  if (field.max !== undefined && value > field.max) return `Vul maximaal ${formatNumber(field.max)} in.`;
  return null;
}

function validateRepeaterItem(itemField: RepeaterItemField, item: RepeaterItem, position: number): string | null {
  const text = (item[itemField.id] ?? "").trim();
  const prefix = `Dienst ${position}, ${itemField.question.toLowerCase()}: `;
  if (text === "") return itemField.required ? `${prefix}vul dit in.` : null;
  return validateLength(text, itemField.min, itemField.max, prefix);
}

export function validateFiles(field: FieldDefinition, files: readonly FileMeta[]): string | null {
  const maxFiles = field.max_files ?? 1;
  const maxBytes = (field.max_mb ?? 10) * 1024 * 1024;
  const accept = (field.accept ?? []).map((extension) => extension.toLowerCase());
  if (files.length > maxFiles) return `Kies maximaal ${maxFiles} ${maxFiles === 1 ? "bestand" : "bestanden"}.`;
  const tooBig = files.find((file) => file.size > maxBytes);
  if (tooBig) return `${tooBig.name} is groter dan ${field.max_mb ?? 10} MB.`;
  const wrongType = files.find((file) => accept.length > 0 && !accept.some((extension) => file.name.toLowerCase().endsWith(extension)));
  if (wrongType) return `${wrongType.name} heeft een niet-toegestaan bestandstype. Toegestaan: ${accept.join(", ")}.`;
  return null;
}

// Geeft een foutmelding of null. Een verborgen veld is nooit ongeldig.
export function validateField(field: FieldDefinition, answers: Answers): string | null {
  if (!isVisible(field, answers)) return null;
  const value = answers[field.id];
  if (isEmpty(value)) {
    if (!field.required) return null;
    return field.type === "single_choice" || field.type === "multi_choice" ? "Kies een antwoord." : "Dit veld is verplicht.";
  }

  switch (field.type) {
    case "text":
    case "textarea":
    case "url":
    case "domain":
    case "email":
      return validateText(field, String(value).trim());
    case "number": {
      const number = parseNumber(String(value));
      return number === null ? "Gebruik een geldig getal." : validateRange(field, number);
    }
    case "money": {
      const amount = parseMoney(String(value));
      return amount === null ? "Gebruik een bedrag zoals 149,00." : validateRange(field, amount);
    }
    case "single_choice":
      return field.choices?.some((choice) => choice.value === value) ? null : "Kies een van de opties.";
    case "multi_choice": {
      const selected = asList(value);
      if (selected.some((item) => !field.choices?.some((choice) => choice.value === item))) return "Kies alleen uit de opties.";
      if (selected.length > 1 && selected.some((item) => field.exclusive?.includes(item))) {
        return "Deze keuze kan niet samen met andere opties.";
      }
      if (field.min_items !== undefined && selected.length < field.min_items) return `Kies minimaal ${field.min_items} opties.`;
      if (field.max_items !== undefined && selected.length > field.max_items) return `Kies maximaal ${field.max_items} opties.`;
      return null;
    }
    case "repeater": {
      const items = value as readonly RepeaterItem[];
      if (field.max_items !== undefined && items.length > field.max_items) return `Voeg maximaal ${field.max_items} toe.`;
      for (const [position, item] of items.entries()) {
        for (const itemField of field.item_fields ?? []) {
          const error = validateRepeaterItem(itemField, item, position + 1);
          if (error) return error;
        }
      }
      return null;
    }
    case "file":
      return validateFiles(field, value as readonly FileMeta[]);
  }
}

export function visibleFields(stepIndex: number, answers: Answers): readonly FieldDefinition[] {
  return steps[stepIndex]!.section.fields.filter((field) => isVisible(field, answers));
}

export function stepErrors(stepIndex: number, answers: Answers): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  for (const field of visibleFields(stepIndex, answers)) {
    const error = validateField(field, answers);
    if (error) errors[field.id] = error;
  }
  return errors;
}

export type Progress = Readonly<{ complete: boolean; open: number; filled: number; visible: number }>;

export function stepProgress(stepIndex: number, answers: Answers): Progress {
  const fields = visibleFields(stepIndex, answers);
  return {
    complete: Object.keys(stepErrors(stepIndex, answers)).length === 0,
    open: Object.keys(stepErrors(stepIndex, answers)).length,
    filled: fields.filter((field) => !isEmpty(answers[field.id])).length,
    visible: fields.length,
  };
}

export function phaseProgress(phaseIndex: number, answers: Answers): Progress {
  const parts = steps.filter((step) => step.phaseIndex === phaseIndex).map((step) => stepProgress(step.index, answers));
  return {
    complete: parts.every((part) => part.complete),
    open: parts.reduce((sum, part) => sum + part.open, 0),
    filled: parts.reduce((sum, part) => sum + part.filled, 0),
    visible: parts.reduce((sum, part) => sum + part.visible, 0),
  };
}

export type MissingField = Readonly<{
  field_id: string;
  question: string;
  error: string;
  questionnaire: string;
  step: number;
}>;

// Alle zichtbare velden met een ontbrekend of ongeldig antwoord, in formuliervolgorde.
export function missingFields(answers: Answers): readonly MissingField[] {
  return steps.flatMap((step) =>
    Object.entries(stepErrors(step.index, answers)).map(([fieldId, error]) => ({
      field_id: fieldId,
      question: fieldById(fieldId).question,
      error,
      questionnaire: fieldById(fieldId).source_questionnaire,
      step: step.index,
    })),
  );
}

export function canSubmit(answers: Answers): boolean {
  return missingFields(answers).length === 0;
}

// ---------- Reviewflags ----------

export type ReviewFlag = Readonly<{
  severity: "blocker" | "commercial" | "review" | "info";
  code: string;
  label: string;
}>;

// Werkhypothesen uit de Project Brief-specificatie (§4); vervangen geen menselijke controle.
export function reviewFlags(answers: Answers): readonly ReviewFlag[] {
  const a = clearHidden(answers);
  const flags: ReviewFlag[] = [];
  const is = (id: string, ...values: string[]) => typeof a[id] === "string" && values.includes(a[id] as string);
  if (is("brand_status", "none")) {
    flags.push({ severity: "blocker", code: "BRANDING_MISSING", label: "Bestaande branding ontbreekt — eerst scope-/meerwerkbesluit." });
  }
  if (is("new_branding_request", "quote", "unsure")) {
    flags.push({ severity: "commercial", code: "BRANDING_QUOTE", label: "Vraag naar nieuwe branding: eerst vrijblijvende offerte." });
  }
  if (is("photoshoot_request", "quote", "unsure")) {
    flags.push({ severity: "commercial", code: "PHOTOGRAPHY_QUOTE", label: "Professionele fotografie: afzonderlijke offerte." });
  }
  if (is("image_license", "check", "no") || is("people_consent", "check", "no")) {
    flags.push({ severity: "review", code: "IMAGE_RIGHTS", label: "Controleer beeld- en portretrechten vóór publicatie." });
  }
  if (is("legal_docs", "need_review", "missing")) {
    flags.push({ severity: "review", code: "LEGAL_DOCS", label: "Privacy/cookies en juridische teksten moeten worden beoordeeld." });
  }
  if (is("site_relation", "replace")) {
    flags.push({ severity: "review", code: "REDIRECT_PLAN", label: "Controleer bestaande URL’s en redirects." });
  }
  if (!isEmpty(a.guarantee_or_promise)) {
    flags.push({ severity: "review", code: "CLAIM_EVIDENCE", label: "Controleer de onderbouwing van garanties of resultaatclaims." });
  }
  if (!isEmpty(a.main_offer_audience) && !isEmpty(a.primary_audience)) {
    flags.push({ severity: "review", code: "AUDIENCE_ALIGNMENT", label: "Verifieer dat de Q2-doelgroep en het Q3-aanbod op elkaar aansluiten." });
  }
  if (is("ga4_status", "no", "unknown") || is("gsc_status", "no", "unknown") || is("clarity_status", "no", "unknown")) {
    flags.push({ severity: "info", code: "CONNECTORS", label: "Inventariseer ontbrekende GA4-, GSC- of Clarity-koppelingen." });
  }
  return flags;
}

// ---------- Project Brief ----------

export type Provenance = Readonly<{
  path: string;
  questionnaire: string;
  field_id: string;
  schema_version: string;
  type: string;
  verification_status: "client_supplied_unverified";
}>;

export type ProjectBrief = Readonly<{
  document_type: "WESTEND_PROJECT_BRIEF_DRAFT";
  schema_version: string;
  onboarding_schema: Readonly<{ id: string; version: string }>;
  source_schema_versions: readonly Readonly<{ id: string; version: string }>[];
  generated_at: string;
  status: "incomplete_draft" | "ready_for_westend_review";
  submitted_for_review: boolean;
  client_supplied: Readonly<Record<string, unknown>>;
  provenance: readonly Provenance[];
  review: Readonly<{
    required_fields_missing: readonly MissingField[];
    flags: readonly ReviewFlag[];
    claim_verification: "pending";
    asset_rights_approval: "pending";
    scope_approval: "pending";
    strategy_approval: "pending";
    website_publication: "not_authorized";
  }>;
  notes: string;
}>;

// Zet een antwoord om naar de vorm in de brief; alleen structureren, nooit aanvullen of interpreteren.
function briefValue(field: FieldDefinition, value: AnswerValue): unknown {
  switch (field.type) {
    case "number":
      return parseNumber(String(value)) ?? String(value).trim();
    case "money":
      return parseMoney(String(value)) ?? String(value).trim();
    case "repeater":
      return (value as readonly RepeaterItem[]).map((item) =>
        Object.fromEntries(Object.entries(item).map(([key, text]) => [key, text.trim()]).filter(([, text]) => text !== "")),
      );
    case "file":
    case "multi_choice":
      return value;
    default:
      return String(value).trim();
  }
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) {
    const existing = node[key];
    if (typeof existing !== "object" || existing === null || Array.isArray(existing)) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[keys.at(-1)!] = value;
}

export function buildProjectBrief(
  answers: Answers,
  { reviewStatus, now = new Date() }: Readonly<{ reviewStatus: ReviewStatus; now?: Date }>,
): ProjectBrief {
  const visibleAnswers = clearHidden(answers);
  const clientSupplied: Record<string, unknown> = {};
  const provenance: Provenance[] = [];

  for (const field of allFields) {
    const value = visibleAnswers[field.id];
    // Verborgen conditionele velden en lege antwoorden komen nooit in de output.
    if (!isVisible(field, visibleAnswers) || isEmpty(value)) continue;
    setPath(clientSupplied, field.mapping, briefValue(field, value!));
    provenance.push({
      path: field.mapping,
      questionnaire: field.source_questionnaire,
      field_id: field.id,
      schema_version: sourceOf(field).version,
      type: field.type,
      verification_status: "client_supplied_unverified",
    });
  }

  const missing = missingFields(visibleAnswers);
  return {
    document_type: "WESTEND_PROJECT_BRIEF_DRAFT",
    schema_version: onboardingSchema.project_brief.version,
    onboarding_schema: { id: onboardingSchema.id, version: onboardingSchema.version },
    source_schema_versions: onboardingSchema.source_questionnaires.map(({ id, version }) => ({ id, version })),
    generated_at: now.toISOString(),
    // Nooit automatisch goedgekeurd: hoogstens klaar voor menselijke review door Westend.
    status: missing.length > 0 ? "incomplete_draft" : "ready_for_westend_review",
    submitted_for_review: reviewStatus === "submitted",
    client_supplied: clientSupplied,
    provenance,
    review: {
      required_fields_missing: missing,
      flags: reviewFlags(visibleAnswers),
      claim_verification: "pending",
      asset_rights_approval: "pending",
      scope_approval: "pending",
      strategy_approval: "pending",
      website_publication: "not_authorized",
    },
    notes: "Geordende intake-input door de klant verklaard, niet extern geverifieerd. Bestanden zijn alleen metadata, niet geüpload.",
  };
}

// ---------- Server-side invoercontrole ----------

// Structurele fouten maken een opslagverzoek ongeldig. Inhoudelijke fouten (verplicht, minimumlengte, formaat,
// bereik) blokkeren een concept niet: die staan in review.required_fields_missing en blokkeren alleen indienen.
export type AnswerIssueCode =
  | "not_an_object"
  | "unknown_field"
  | "invalid_type"
  | "too_long"
  | "invalid_choice"
  | "duplicate_choice"
  | "exclusive_conflict"
  | "too_many_items"
  | "unknown_item_field"
  | "invalid_file";

export type AnswerIssue = Readonly<{ field_id: string; code: AnswerIssueCode }>;

export type ParsedAnswers = { ok: true; answers: Answers } | { ok: false; issues: readonly AnswerIssue[] };

// Bovengrens voor tekst zonder eigen max in het schema (getallen en bedragen); voorkomt willekeurig grote invoer.
const MAX_UNBOUNDED_TEXT = 64;
const MAX_FILE_NAME = 255;
const MAX_FILE_TYPE = 255;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

function textIssue(field: FieldDefinition, value: unknown): AnswerIssueCode | null {
  if (typeof value !== "string") return "invalid_type";
  const max = field.type === "number" || field.type === "money" ? MAX_UNBOUNDED_TEXT : (field.max ?? MAX_UNBOUNDED_TEXT);
  return value.trim().length > max ? "too_long" : null;
}

function fieldIssue(field: FieldDefinition, value: unknown): AnswerIssueCode | null {
  switch (field.type) {
    case "text":
    case "textarea":
    case "url":
    case "domain":
    case "email":
    case "number":
    case "money":
      return textIssue(field, value);
    case "single_choice":
      if (typeof value !== "string") return "invalid_type";
      return value === "" || field.choices?.some((choice) => choice.value === value) ? null : "invalid_choice";
    case "multi_choice": {
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return "invalid_type";
      if (value.some((item) => !field.choices?.some((choice) => choice.value === item))) return "invalid_choice";
      if (new Set(value).size !== value.length) return "duplicate_choice";
      if (value.length > 1 && value.some((item) => field.exclusive?.includes(item))) return "exclusive_conflict";
      return field.max_items !== undefined && value.length > field.max_items ? "too_many_items" : null;
    }
    case "repeater": {
      if (!Array.isArray(value)) return "invalid_type";
      if (field.max_items !== undefined && value.length > field.max_items) return "too_many_items";
      for (const item of value) {
        if (!isPlainObject(item)) return "invalid_type";
        for (const [key, text] of Object.entries(item)) {
          const itemField = field.item_fields?.find((candidate) => candidate.id === key);
          if (!itemField) return "unknown_item_field";
          if (typeof text !== "string") return "invalid_type";
          if (text.trim().length > (itemField.max ?? MAX_UNBOUNDED_TEXT)) return "too_long";
        }
      }
      return null;
    }
    case "file": {
      if (!Array.isArray(value)) return "invalid_type";
      const valid = value.every(
        (file) =>
          isPlainObject(file) &&
          Object.keys(file).every((key) => key === "name" || key === "size" || key === "type") &&
          typeof file.name === "string" &&
          file.name.length > 0 &&
          file.name.length <= MAX_FILE_NAME &&
          typeof file.type === "string" &&
          file.type.length <= MAX_FILE_TYPE &&
          Number.isSafeInteger(file.size) &&
          (file.size as number) >= 0,
      );
      if (!valid) return "invalid_file";
      return validateFiles(field, value as readonly FileMeta[]) ? "invalid_file" : null;
    }
  }
}

// Controleert onvertrouwde invoer (bijv. een API-request) tegen het schema en geeft genormaliseerde antwoorden
// terug: lege waarden en waarden van verborgen conditionele velden zijn verwijderd.
export function parseAnswers(input: unknown): ParsedAnswers {
  if (!isPlainObject(input)) return { ok: false, issues: [{ field_id: "", code: "not_an_object" }] };

  const issues: AnswerIssue[] = [];
  const answers: Record<string, AnswerValue> = {};
  for (const [fieldId, value] of Object.entries(input)) {
    const field = allFields.find((candidate) => candidate.id === fieldId);
    if (!field) {
      issues.push({ field_id: fieldId.slice(0, 64), code: "unknown_field" });
      continue;
    }
    const issue = fieldIssue(field, value);
    if (issue) issues.push({ field_id: fieldId, code: issue });
    else if (!isEmpty(value as AnswerValue)) answers[fieldId] = value as AnswerValue;
  }
  if (issues.length > 0) return { ok: false, issues: issues.slice(0, 50) };
  return { ok: true, answers: clearHidden(answers) };
}
