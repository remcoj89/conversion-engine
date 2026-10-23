"use client";

import { useEffect, useReducer, useRef } from "react";
import { phaseProgress, stepErrors, stepProgress, visibleFields } from "../../lib/onboarding/engine";
import { flowReducer, initialFlowState, type FlowAction } from "../../lib/onboarding/flow";
import { onboardingSchema, steps } from "../../lib/onboarding/schema";
import OnboardingField from "./onboarding-field";
import ReviewPanel from "./review-panel";

const PHASE_COUNT = onboardingSchema.phases.length;

// Volledige onboardingflow Q1–Q4 plus eindcontrole. Alleen tijdelijke React-state:
// geen API, geen opslag, geen localStorage en geen uploads.
export default function OnboardingFlow() {
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isFirstRender = useRef(true);
  const { current: currentStep, mode } = state;
  const step = steps[currentStep]!;
  const inReview = mode === "review";

  // Bij een ander scherm: focus naar de nieuwe kop, zodat toetsenbord- en schermlezergebruikers meegaan.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [currentStep, mode]);

  const go = (action: FlowAction) => dispatch(action);

  const next = () => {
    const errors = stepErrors(state.current, state.answers);
    dispatch({ type: "next" });
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      // Na het tonen van de fouten naar het eerste ongeldige veld.
      requestAnimationFrame(() => {
        const target = document.getElementById(`field-${firstInvalid}`);
        const focusable = target?.matches("fieldset") ? target.querySelector<HTMLElement>("input") : target;
        (focusable ?? target)?.focus();
      });
    }
  };

  const errorCount = Object.keys(state.errors).length;
  const overall = inReview ? 100 : Math.round(((state.current + 1) / steps.length) * 100);

  return (
    <>
      <div className="page-heading onboarding-heading">
        <p className="eyebrow">
          {inReview
            ? "Laatste stap · Controle & Project Brief"
            : `Vragenlijst ${step.phaseIndex + 1} / ${PHASE_COUNT} · onderdeel ${step.sectionIndex + 1} / ${step.phase.sections.length}`}
        </p>
        <h1>{inReview ? "Controle & Project Brief" : step.phase.label}</h1>
        <p className="intro">
          {inReview
            ? "Controleer je antwoorden. We zetten ze om in een conceptbrief met bronverwijzingen, ontbrekende informatie en reviewpunten."
            : "Vier vragenlijsten met elk vijf korte onderdelen. Je kunt vrij heen en weer bladeren; je antwoorden blijven staan zolang deze pagina open is."}
        </p>
        <div className="onboarding-overall">
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Voortgang onboarding"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={inReview ? steps.length : state.current + 1}
            aria-valuetext={inReview ? "Eindcontrole" : `Onderdeel ${state.current + 1} van ${steps.length}`}
          >
            <span className="progress-fill" style={{ width: `${overall}%` }} />
          </div>
          <span className="onboarding-overall-label">{inReview ? "Eindcontrole" : `${state.current + 1} van ${steps.length} onderdelen`}</span>
        </div>
      </div>

      <div className="onboarding-layout">
        <nav className="phase-nav" aria-label="Vragenlijsten">
          <ol>
            {onboardingSchema.phases.map((phase, phaseIndex) => {
              const progress = phaseProgress(phaseIndex, state.answers);
              const active = !inReview && step.phaseIndex === phaseIndex;
              return (
                <li key={phase.form_id}>
                  <button
                    type="button"
                    className="phase-button"
                    aria-current={active ? "step" : undefined}
                    onClick={() => go({ type: "goToPhase", phaseIndex })}
                  >
                    <span className={progress.complete ? "phase-number phase-number-done" : "phase-number"} aria-hidden="true">
                      {progress.complete ? "✓" : `Q${phaseIndex + 1}`}
                    </span>
                    <span className="phase-text">
                      <span className="phase-title">{phase.label}</span>
                      <span className="phase-meta">
                        {progress.complete ? "Compleet" : `${progress.open} open`} · {progress.filled}/{progress.visible} ingevuld
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            <li>
              <button type="button" className="phase-button" aria-current={inReview ? "step" : undefined} onClick={() => go({ type: "review" })}>
                <span className="phase-number" aria-hidden="true">
                  PB
                </span>
                <span className="phase-text">
                  <span className="phase-title">Controle & Project Brief</span>
                  <span className="phase-meta">{state.reviewStatus === "submitted_demo" ? "Ingediend (demo)" : "Eindcontrole en output"}</span>
                </span>
              </button>
            </li>
          </ol>
        </nav>

        <div className="onboarding-main">
          {inReview ? (
            <ReviewPanel state={state} dispatch={dispatch} headingRef={headingRef} />
          ) : (
            <form
              className="card onboarding-card"
              aria-labelledby="onboarding-step-title"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                next();
              }}
            >
              <div className="onboarding-card-header">
                <div>
                  <h2 id="onboarding-step-title" ref={headingRef} tabIndex={-1}>
                    {step.section.title}
                  </h2>
                  {step.section.subtitle && <p>{step.section.subtitle}</p>}
                </div>
                <span className="badge badge-neutral">
                  Onderdeel {step.sectionIndex + 1} van {step.phase.sections.length}
                </span>
              </div>

              <ol className="section-steps" aria-label={`Onderdelen van ${step.phase.label}`}>
                {steps
                  .filter((candidate) => candidate.phaseIndex === step.phaseIndex)
                  .map((candidate) => {
                    const progress = stepProgress(candidate.index, state.answers);
                    const current = candidate.index === state.current;
                    return (
                      <li key={candidate.index}>
                        <button
                          type="button"
                          className="section-step"
                          aria-current={current ? "step" : undefined}
                          onClick={() => go({ type: "goToStep", step: candidate.index })}
                        >
                          <span className={progress.complete ? "section-dot section-dot-done" : "section-dot"} aria-hidden="true" />
                          <span className="section-step-title">{candidate.section.title}</span>
                          <span className="visually-hidden">{progress.complete ? " (compleet)" : ` (${progress.open} open)`}</span>
                        </button>
                      </li>
                    );
                  })}
              </ol>

              {errorCount > 0 && (
                <div className="form-alert" role="alert">
                  {errorCount === 1 ? "Eén veld vraagt nog aandacht." : `${errorCount} velden vragen nog aandacht.`} Je ingevulde antwoorden blijven
                  staan.
                </div>
              )}

              <div className="onboarding-fields">
                {visibleFields(state.current, state.answers).map((field) => (
                  <OnboardingField
                    key={field.id}
                    field={field}
                    value={state.answers[field.id]}
                    error={state.errors[field.id]}
                    onChange={(value) => dispatch({ type: "answer", fieldId: field.id, value })}
                    onBlur={() => dispatch({ type: "blur", fieldId: field.id })}
                    onError={(error) => dispatch({ type: "fieldError", fieldId: field.id, error })}
                  />
                ))}
              </div>

              <div className="onboarding-actions">
                <button type="button" className="button button-secondary" disabled={state.current === 0} onClick={() => go({ type: "previous" })}>
                  <span aria-hidden="true">←</span> Vorige
                </button>
                <div className="onboarding-actions-right">
                  <button type="button" className="button button-secondary" onClick={() => go({ type: "review" })}>
                    Bekijk overzicht
                  </button>
                  <button type="submit" className="button button-primary">
                    {state.current === steps.length - 1 ? "Naar eindcontrole" : "Volgende"} <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
              <p className="onboarding-note">
                Je antwoorden blijven alleen staan zolang deze pagina open is. Er wordt niets opgeslagen, geüpload of verstuurd.
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
