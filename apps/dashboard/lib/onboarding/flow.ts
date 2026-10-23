// Navigatie en status van de onboardingflow als pure reducer: geen opslag, alleen tijdelijke state.
import {
  canSubmit,
  isEmpty,
  missingFields,
  setAnswer,
  stepErrors,
  validateField,
  type AnswerValue,
  type Answers,
  type ReviewStatus,
} from "./engine";
import { fieldById, steps } from "./schema";

export type FlowState = Readonly<{
  answers: Answers;
  current: number;
  mode: "form" | "review";
  reviewStatus: ReviewStatus;
  // Zichtbare foutmeldingen van het huidige scherm.
  errors: Readonly<Record<string, string>>;
}>;

export type FlowAction =
  | Readonly<{ type: "answer"; fieldId: string; value: AnswerValue }>
  | Readonly<{ type: "blur"; fieldId: string }>
  | Readonly<{ type: "fieldError"; fieldId: string; error: string }>
  | Readonly<{ type: "next" }>
  | Readonly<{ type: "previous" }>
  | Readonly<{ type: "goToStep"; step: number }>
  | Readonly<{ type: "goToPhase"; phaseIndex: number }>
  | Readonly<{ type: "review" }>
  | Readonly<{ type: "goToFirstMissing" }>
  | Readonly<{ type: "submit" }>;

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
    case "answer":
      // Elke wijziging maakt een eerdere demo-indiening ongedaan: de klant moet opnieuw indienen.
      return {
        ...state,
        answers: setAnswer(state.answers, action.fieldId, action.value),
        errors: withoutKey(state.errors, action.fieldId),
        reviewStatus: "draft",
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
    case "submit":
      return canSubmit(state.answers) ? { ...state, reviewStatus: "submitted_demo" } : state;
  }
}
