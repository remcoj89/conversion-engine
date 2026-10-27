// Navigatie en status van de onboardingflow als pure reducer. Opslag op de server staat in app/onboarding/use-draft-sync.ts.
import {
  clearHidden,
  isEmpty,
  missingFields,
  setAnswer,
  stepErrors,
  validateField,
  type AnswerValue,
  type Answers,
  type ReviewStatus,
  fieldById,
  steps,
} from "../../../../packages/onboarding-contract/src/index";

export type DashboardReviewStatus = ReviewStatus | "blocked" | "approved";

export type FlowState = Readonly<{
  answers: Answers;
  current: number;
  mode: "form" | "review";
  reviewStatus: DashboardReviewStatus;
  // Zichtbare foutmeldingen van het huidige scherm.
  errors: Readonly<Record<string, string>>;
}>;

export type FlowAction =
  // Antwoorden en status van de server; navigatie blijft waar die is.
  | Readonly<{ type: "hydrate"; answers: Answers; reviewStatus: DashboardReviewStatus }>
  | Readonly<{ type: "answer"; fieldId: string; value: AnswerValue }>
  | Readonly<{ type: "blur"; fieldId: string }>
  | Readonly<{ type: "fieldError"; fieldId: string; error: string }>
  | Readonly<{ type: "next" }>
  | Readonly<{ type: "previous" }>
  | Readonly<{ type: "goToStep"; step: number }>
  | Readonly<{ type: "goToPhase"; phaseIndex: number }>
  | Readonly<{ type: "review" }>
  | Readonly<{ type: "goToFirstMissing" }>
  // Alleen na een geslaagde server-indiening.
  | Readonly<{ type: "submitted" }>;

// Maps the server status to the client status. Only draft and review_needed are editable; unknown statuses
// fall back to the safe read-only submitted state.
export function reviewStatusFromServer(serverStatus: string): DashboardReviewStatus {
  if (serverStatus === "draft" || serverStatus === "review_needed" || serverStatus === "submitted") return serverStatus;
  if (serverStatus === "blocked" || serverStatus === "approved") return serverStatus;
  return "submitted";
}

export const isReadOnly = (reviewStatus: DashboardReviewStatus): boolean => reviewStatus !== "draft" && reviewStatus !== "review_needed";

// A draft can be submitted, and review_needed can be resubmitted after the Owner added the requested changes.
export const allowsSubmit = (reviewStatus: DashboardReviewStatus): boolean => reviewStatus === "draft" || reviewStatus === "review_needed";

export function onboardingStatusLabel(reviewStatus: DashboardReviewStatus): string {
  if (reviewStatus === "blocked") return "Geblokkeerd";
  if (reviewStatus === "approved") return "Goedgekeurd";
  if (reviewStatus === "submitted") return "Ingediend";
  return reviewStatus === "review_needed" ? "Aanvullingen gevraagd" : "Concept";
}

export type ReadOnlyStatusMessage = Readonly<{
  tone: "success" | "warning";
  title: string;
  body: string;
}>;

export function readOnlyStatusMessage(reviewStatus: DashboardReviewStatus): ReadOnlyStatusMessage | null {
  if (reviewStatus === "blocked") {
    return {
      tone: "warning",
      title: "Deze onboarding is tijdelijk geblokkeerd door Westend.",
      body: "Je antwoorden zijn zichtbaar maar niet bewerkbaar. Opnieuw indienen is niet mogelijk; Westend moet eerst verdere actie ondernemen.",
    };
  }
  if (reviewStatus === "approved") {
    return {
      tone: "success",
      title: "Deze onboarding is goedgekeurd door Westend.",
      body: "Je antwoorden zijn alleen-lezen; nieuwe wijzigingen kunnen niet worden opgeslagen.",
    };
  }
  if (reviewStatus === "submitted") {
    return {
      tone: "success",
      title: "Deze onboarding is ingediend.",
      body: "Je kunt je antwoorden nog bekijken, maar niet meer wijzigen.",
    };
  }
  return null;
}

// Open reviewer feedback as returned by GET /api/onboarding; only the fields the Owner needs.
// kind: a change request, a reopen of an approved onboarding, or an unblock (absent from older API responses).
export type ReviewRequest = Readonly<{ kind?: string; reason_code: string; note: string; version: number; created_at: string }>;

const reviewReasonLabels: Readonly<Record<string, string>> = {
  missing_information: "Ontbrekende informatie",
  rights_unclear: "Rechten of bron onduidelijk",
  out_of_scope: "Buiten de standaard scope",
  material_input_change: "Materiële wijziging in de intake",
  rights_or_asset_change: "Wijziging in rechten of beeldmateriaal",
  scope_or_strategy_change: "Wijziging in scope of strategie",
  basis_provided: "Basis aangevuld",
  rights_cleared: "Rechten opgehelderd",
  extra_work_agreed: "Meerwerk afgestemd",
};

// Dutch label for a reason code; an unknown future code still gets a neutral label.
export function reviewReasonLabel(reasonCode: string): string {
  return Object.hasOwn(reviewReasonLabels, reasonCode) ? reviewReasonLabels[reasonCode]! : "Aanvulling gevraagd";
}

// Title of the feedback notice: a reopened approval reads differently from a change request.
export function reviewFeedbackTitle(reviewRequest: ReviewRequest | null): string {
  if (reviewRequest?.kind === "reopened") return "Westend heeft je goedgekeurde onboarding heropend.";
  if (reviewRequest?.kind === "unblocked") return "Westend heeft de blokkade opgeheven.";
  return "Westend heeft aanvullingen gevraagd.";
}

// The reviewer's note is only shown while Westend's request is open (review_needed).
export function visibleReviewRequest(reviewStatus: DashboardReviewStatus, reviewRequest: ReviewRequest | null): ReviewRequest | null {
  return reviewStatus === "review_needed" ? reviewRequest : null;
}

export const initialFlowState: FlowState = {
  answers: {},
  current: 0,
  mode: "form",
  reviewStatus: "draft",
  errors: {},
};

const LAST_STEP = steps.length - 1;

function withoutKey(record: Readonly<Record<string, string>>, key: string): Record<string, string> {
  const rest = { ...record };
  delete rest[key];
  return rest;
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "hydrate":
      return { ...state, answers: clearHidden(action.answers), errors: {}, reviewStatus: action.reviewStatus };
    case "answer":
      // Read-only after submitting; the server refuses changes as well (409 not_editable).
      if (isReadOnly(state.reviewStatus)) return state;
      return {
        ...state,
        answers: setAnswer(state.answers, action.fieldId, action.value),
        errors: withoutKey(state.errors, action.fieldId),
      };
    case "blur": {
      // Bij het verlaten van een ingevuld veld direct controleren; lege velden pas bij "Volgende".
      if (isEmpty(state.answers[action.fieldId])) return state;
      const error = validateField(fieldById(action.fieldId), state.answers);
      return { ...state, errors: error ? { ...state.errors, [action.fieldId]: error } : withoutKey(state.errors, action.fieldId) };
    }
    case "fieldError":
      return { ...state, errors: { ...state.errors, [action.fieldId]: action.error } };
    case "next": {
      const errors = stepErrors(state.current, state.answers);
      if (Object.keys(errors).length > 0) return { ...state, errors };
      return state.current === LAST_STEP
        ? { ...state, mode: "review", errors: {} }
        : { ...state, current: state.current + 1, errors: {} };
    }
    case "previous":
      return { ...state, current: Math.max(0, state.current - 1), errors: {} };
    case "goToStep":
      return { ...state, mode: "form", current: Math.min(Math.max(0, action.step), LAST_STEP), errors: {} };
    case "goToPhase": {
      const first = steps.find((step) => step.phaseIndex === action.phaseIndex);
      return first ? { ...state, mode: "form", current: first.index, errors: {} } : state;
    }
    case "review":
      return { ...state, mode: "review", errors: {} };
    case "goToFirstMissing": {
      const first = missingFields(state.answers)[0];
      if (!first) return state;
      return { ...state, mode: "form", current: first.step, errors: stepErrors(first.step, state.answers) };
    }
    case "submitted":
      return { ...state, reviewStatus: "submitted", errors: {} };
  }
}
