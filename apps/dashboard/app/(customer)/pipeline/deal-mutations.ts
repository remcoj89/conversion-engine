import type { WorkspaceFetch } from "../../../lib/session/context";
import {
  DEAL_STAGES,
  parseDealMutationResponseResult,
  type DealMutationResult,
  type DealStage,
  type EditableDealRecord,
} from "../../../lib/bff/deals";

export type DealFormValues = Readonly<{
  contact_id: string;
  title: string;
  description: string;
  amount_eur: string;
  stage: DealStage;
  expected_close_date: string;
  loss_reason: string;
}>;

export type DealFormValidation = Readonly<{
  values: DealFormValues;
  errors: Readonly<Record<string, string>>;
}>;

export type DealMutationOutcome =
  | Readonly<{ status: "success"; data: EditableDealRecord }>
  | Readonly<{ status: "invalid" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "unavailable" }>;

const INITIAL_DEAL_STAGES: readonly DealStage[] = ["new", "qualified", "appointment_scheduled", "proposal"];
const DEAL_STAGE_TRANSITIONS: Readonly<Record<DealStage, readonly DealStage[]>> = {
  new: ["qualified"],
  qualified: ["appointment_scheduled"],
  appointment_scheduled: ["proposal"],
  proposal: ["won", "lost"],
  won: [],
  lost: [],
};
const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

export function emptyDealForm(): DealFormValues {
  return {
    contact_id: "",
    title: "",
    description: "",
    amount_eur: "",
    stage: "new",
    expected_close_date: "",
    loss_reason: "",
  };
}

export function dealFormFromRecord(record: EditableDealRecord): DealFormValues {
  return {
    contact_id: record.contact_id,
    title: record.title,
    description: record.description ?? "",
    amount_eur: record.amount_eur ?? "",
    stage: record.stage,
    expected_close_date: record.expected_close_date ?? "",
    loss_reason: record.loss_reason ?? "",
  };
}

export function validDealStages(current: DealStage | null): readonly DealStage[] {
  if (current === null) return INITIAL_DEAL_STAGES;
  return [current, ...DEAL_STAGE_TRANSITIONS[current]];
}

export function isDealStageTerminal(stage: DealStage): boolean {
  return stage === "won" || stage === "lost";
}

export function validateDealForm(form: DealFormValues, editing: boolean): DealFormValidation {
  const values = normalizeDealForm(form);
  const errors: Record<string, string> = {};

  if (!editing && !values.contact_id) errors.contact_id = "Kies een actieve contactpersoon.";
  if (!values.title) errors.title = "Vul een titel in.";
  if (values.title.length > 200) errors.title = "De titel mag maximaal 200 tekens bevatten.";
  if (!isDealStage(values.stage)) errors.stage = "Kies een geldige pipelinefase.";
  if (values.amount_eur && !AMOUNT_PATTERN.test(values.amount_eur)) errors.amount_eur = "Gebruik een bedrag in EUR, bijvoorbeeld 1250.00.";
  if (values.expected_close_date && !isValidDate(values.expected_close_date)) errors.expected_close_date = "Kies een geldige datum.";
  if (values.loss_reason.length > 0 && values.stage !== "lost") errors.loss_reason = "Een verliesreden hoort alleen bij een verloren deal.";
  if (values.loss_reason.length > 2_000) errors.loss_reason = "De verliesreden mag maximaal 2.000 tekens bevatten.";

  return { values, errors };
}

export async function saveDeal(fetcher: WorkspaceFetch, id: string | null, form: DealFormValues): Promise<DealMutationOutcome> {
  const validation = validateDealForm(form, id !== null);
  if (Object.keys(validation.errors).length > 0) return { status: "invalid" };

  const payload = id === null
    ? {
      contact_id: validation.values.contact_id,
      title: validation.values.title,
      description: nullable(validation.values.description),
      amount_eur: nullable(validation.values.amount_eur),
      stage: validation.values.stage,
      expected_close_date: nullable(validation.values.expected_close_date),
      loss_reason: nullable(validation.values.loss_reason),
    }
    : {
      title: validation.values.title,
      description: nullable(validation.values.description),
      amount_eur: nullable(validation.values.amount_eur),
      stage: validation.values.stage,
      expected_close_date: nullable(validation.values.expected_close_date),
      loss_reason: nullable(validation.values.loss_reason),
    };
  return mutate(fetcher, id ? `/api/deals/${encodeURIComponent(id)}` : "/api/deals", id ? "PATCH" : "POST", payload);
}

export function archiveDeal(fetcher: WorkspaceFetch, id: string): Promise<DealMutationOutcome> {
  return mutate(fetcher, `/api/deals/${encodeURIComponent(id)}/archive`, "POST", null);
}

function normalizeDealForm(form: DealFormValues): DealFormValues {
  const amount = form.amount_eur.trim().replace(",", ".");
  return {
    contact_id: form.contact_id.trim(),
    title: form.title.trim(),
    description: form.description.trim(),
    amount_eur: amount,
    stage: form.stage,
    expected_close_date: form.expected_close_date.trim(),
    loss_reason: form.loss_reason.trim(),
  };
}

function nullable(value: string): string | null {
  return value || null;
}

async function mutate(
  fetcher: WorkspaceFetch,
  path: string,
  method: "POST" | "PATCH",
  body: Readonly<Record<string, unknown>> | null,
): Promise<DealMutationOutcome> {
  try {
    const response = await fetcher(path, {
      method,
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await parseDealMutationResponseResult(response);
    return mapMutationResult(result);
  } catch {
    return { status: "unavailable" };
  }
}

function mapMutationResult(result: DealMutationResult): DealMutationOutcome {
  return result.status === "ready" ? { status: "success", data: result.data } : { status: result.status };
}

function isDealStage(value: unknown): value is DealStage {
  return typeof value === "string" && (DEAL_STAGES as readonly string[]).includes(value);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
