"use client";

import { useMemo, type Dispatch, type RefObject } from "react";
import { buildProjectBrief, onboardingSchema, phaseProgress, steps, type ReviewFlag } from "../../../../packages/onboarding-contract/src/index";
import type { FlowAction, FlowState } from "../../lib/onboarding/flow";

type Props = Readonly<{
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
  headingRef: RefObject<HTMLHeadingElement | null>;
}>;

const severityLabels: Record<ReviewFlag["severity"], string> = {
  blocker: "Blokkerend",
  commercial: "Meerwerk",
  review: "Review",
  info: "Info",
};

const statusLabels = {
  incomplete_draft: "Onvolledig concept",
  ready_for_westend_review: "Klaar voor review door Westend",
} as const;

// Eindcontrole: status per vragenlijst, ontbrekende velden, reviewflags, Project Brief-preview en demo-indiening.
export default function ReviewPanel({ state, dispatch, headingRef }: Props) {
  const brief = useMemo(() => buildProjectBrief(state.answers, { reviewStatus: state.reviewStatus }), [state.answers, state.reviewStatus]);
  const missing = brief.review.required_fields_missing;
  const flags = brief.review.flags;
  const submitted = state.reviewStatus === "submitted_demo";

  return (
    <div className="review-stack">
      <section className="card onboarding-card" aria-labelledby="review-title">
        <div className="onboarding-card-header">
          <div>
            <h2 id="review-title" ref={headingRef} tabIndex={-1}>
              Overzicht en controle
            </h2>
            <p>Jij levert de input aan; Westend controleert claims en rechten en geeft de productie pas daarna vrij.</p>
          </div>
          <span className={missing.length > 0 ? "badge badge-warning" : "badge badge-success"}>
            {missing.length > 0 ? `${missing.length} open` : "Compleet"}
          </span>
        </div>

        <h3 className="review-subtitle">Status per vragenlijst</h3>
        <ul className="review-list">
          {onboardingSchema.phases.map((phase, phaseIndex) => {
            const progress = phaseProgress(phaseIndex, state.answers);
            return (
              <li key={phase.form_id} className="review-row">
                <div>
                  <strong>
                    Q{phaseIndex + 1} — {phase.label}
                  </strong>
                  <p>
                    {phase.sections.length} onderdelen · {progress.filled} van {progress.visible} zichtbare vragen ingevuld
                  </p>
                </div>
                <div className="review-row-actions">
                  <span className={progress.complete ? "badge badge-success" : "badge badge-warning"}>
                    {progress.complete ? "Compleet" : `${progress.open} ontbrekend`}
                  </span>
                  <button type="button" className="button button-secondary button-small" onClick={() => dispatch({ type: "goToPhase", phaseIndex })}>
                    Bewerk Q{phaseIndex + 1}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {missing.length > 0 ? (
          <div className="notice notice-warning">
            <p>
              <strong>Nog niet klaar om in te dienen:</strong> {missing.length} ontbrekende of ongeldige{" "}
              {missing.length === 1 ? "antwoord" : "antwoorden"}.
            </p>
            <button type="button" className="button button-secondary button-small" onClick={() => dispatch({ type: "goToFirstMissing" })}>
              Naar het eerste ontbrekende veld
            </button>
            <details className="review-details">
              <summary>Toon alle ontbrekende velden ({missing.length})</summary>
              <ul className="missing-list">
                {missing.map((item) => (
                  <li key={item.field_id}>
                    <button type="button" className="text-button" onClick={() => dispatch({ type: "goToStep", step: item.step })}>
                      {item.questionnaire} · {item.question}
                    </button>
                    <span>{item.error}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ) : (
          <div className="notice notice-success">
            Alle zichtbare verplichte vragen zijn ingevuld. Inhoud, bewijs en beeldmateriaal worden daarna nog door Westend beoordeeld.
          </div>
        )}

        <h3 className="review-subtitle">Controlepunten voor Westend ({flags.length})</h3>
        {flags.length > 0 ? (
          <ul className="review-list">
            {flags.map((flag) => (
              <li key={flag.code} className="review-row">
                <span>{flag.label}</span>
                <span className={flag.severity === "blocker" || flag.severity === "commercial" ? "badge badge-warning" : "badge badge-neutral"}>
                  {severityLabels[flag.severity]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="review-empty">Uit je antwoorden komen geen specifieke controlepunten. Westend controleert de intake altijd handmatig.</p>
        )}

        <div className="onboarding-actions">
          <button type="button" className="button button-secondary" onClick={() => dispatch({ type: "goToStep", step: steps.length - 1 })}>
            <span aria-hidden="true">←</span> Terug naar vragen
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={missing.length > 0 || submitted}
            aria-describedby="submit-status"
            onClick={() => dispatch({ type: "submit" })}
          >
            {submitted ? "Ingediend (demo) ✓" : "Ter review indienen"}
          </button>
        </div>
        <div id="submit-status" role="status" className={submitted ? "notice notice-success" : "onboarding-note"}>
          {submitted
            ? "Ingediend als demo (status submitted_demo). Er is niets naar Westend verstuurd; een wijziging zet de status terug naar concept."
            : missing.length > 0
              ? "Indienen kan zodra alle zichtbare verplichte vragen geldig zijn ingevuld."
              : "Indienen is in deze versie alleen een demo-status; er wordt niets verstuurd."}
        </div>
      </section>

      <section className="card onboarding-card" aria-labelledby="brief-title">
        <div className="onboarding-card-header">
          <div>
            <h2 id="brief-title">Project Brief-preview</h2>
            <p>Geordende input voor strategie, copy, design en development. Er worden geen claims, conclusies of verificaties toegevoegd.</p>
          </div>
          <span className="badge badge-neutral">v{brief.schema_version}</span>
        </div>

        <dl className="brief-stats">
          <div>
            <dt>Reviewstatus</dt>
            <dd>
              {statusLabels[brief.status]} <code>{brief.status}</code>
            </dd>
          </div>
          <div>
            <dt>Indiening</dt>
            <dd>{submitted ? <code>submitted_demo</code> : "Concept"}</dd>
          </div>
          <div>
            <dt>Antwoorden met bron</dt>
            <dd>{brief.provenance.length}</dd>
          </div>
          <div>
            <dt>Ontbrekend</dt>
            <dd>{missing.length}</dd>
          </div>
          <div>
            <dt>Controlepunten</dt>
            <dd>{flags.length}</dd>
          </div>
          <div>
            <dt>Schema</dt>
            <dd>
              {brief.onboarding_schema.id} {brief.onboarding_schema.version}
            </dd>
          </div>
        </dl>

        <h3 className="review-subtitle">Bronverwijzingen (provenance)</h3>
        {brief.provenance.length > 0 ? (
          <div className="table-scroll" role="region" aria-label="Bronverwijzingen" tabIndex={0}>
            <table className="brief-table">
              <thead>
                <tr>
                  <th scope="col">Pad in client_supplied</th>
                  <th scope="col">Bronvraag</th>
                  <th scope="col">Schemaversie</th>
                  <th scope="col">Verificatie</th>
                </tr>
              </thead>
              <tbody>
                {brief.provenance.map((entry) => (
                  <tr key={entry.field_id}>
                    <td>
                      <code>{entry.path}</code>
                    </td>
                    <td>
                      {entry.questionnaire}.{entry.field_id}
                    </td>
                    <td>{entry.schema_version}</td>
                    <td>Door klant verklaard, niet geverifieerd</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="review-empty">Nog geen antwoorden. De brief vult zich zodra je vragen beantwoordt.</p>
        )}

        <details className="review-details">
          <summary>Bekijk de volledige Project Brief (JSON)</summary>
          <pre className="brief-json">{JSON.stringify(brief, null, 2)}</pre>
        </details>
      </section>
    </div>
  );
}
