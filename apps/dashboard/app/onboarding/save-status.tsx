"use client";

import type { SaveState, SyncPhase } from "./use-draft-sync";

type Props = Readonly<{
  phase: SyncPhase;
  save: SaveState;
  onRetry: () => void;
  onKeepMine: () => void;
  onLoadServer: () => void;
}>;

const timeFormat = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" });

// Eenvoudige opslagstatus onder de voortgangsbalk. Conflicten en blokkades krijgen een duidelijke melding met keuze.
export default function SaveStatus({ phase, save, onRetry, onKeepMine, onLoadServer }: Props) {
  if (phase === "unauthenticated") {
    return (
      <div className="save-notice notice-warning" role="status">
        <p>Je bent niet ingelogd. Je antwoorden blijven op deze pagina staan, maar worden niet opgeslagen.</p>
        <a className="button button-secondary button-small" href="/auth/login">
          Inloggen
        </a>
      </div>
    );
  }
  if (phase === "unavailable") {
    return (
      <div className="save-notice notice-warning" role="status">
        <p>Je opgeslagen concept kon niet worden geladen. Wijzigingen worden pas opgeslagen als dat lukt.</p>
        <button type="button" className="button button-secondary button-small" onClick={onRetry}>
          Opnieuw proberen
        </button>
      </div>
    );
  }
  if (save.kind === "conflict") {
    return (
      <div className="save-notice notice-warning" role="alert">
        <p>
          <strong>Er is elders een nieuwere versie opgeslagen.</strong> Je eigen antwoorden staan nog hier en zijn niet overschreven. Kies welke
          versie je wilt houden.
        </p>
        <div className="save-notice-actions">
          <button type="button" className="button button-secondary button-small" onClick={onKeepMine}>
            Mijn antwoorden bewaren
          </button>
          <button type="button" className="button button-secondary button-small" onClick={onLoadServer}>
            Nieuwste versie laden
          </button>
        </div>
      </div>
    );
  }
  if (save.kind === "blocked") {
    return (
      <div className="save-notice notice-warning" role="alert">
        <p>
          {save.reason === "schema_mismatch"
            ? "De vragenlijst is bijgewerkt. Ververs de pagina om verder te gaan; niet-opgeslagen wijzigingen gaan daarbij verloren."
            : "Deze onboarding is al ingediend en kan hier niet meer worden gewijzigd."}
        </p>
      </div>
    );
  }

  const message =
    phase === "loading"
      ? "Opgeslagen concept laden…"
      : save.kind === "saving"
        ? "Opslaan…"
        : save.kind === "saved"
          ? `Concept opgeslagen om ${timeFormat.format(save.at)}`
          : save.kind === "invalid"
            ? `Niet opgeslagen: ${save.count === 1 ? "één antwoord is" : `${save.count} antwoorden zijn`} te lang of ongeldig.`
            : save.kind === "error"
              ? "Opslaan mislukt. Je antwoorden staan nog hier."
              : "Wijzigingen worden automatisch als concept opgeslagen.";
  const tone = save.kind === "error" || save.kind === "invalid" ? "save-status save-status-error" : "save-status";

  return (
    <div className={tone} role="status" aria-live="polite">
      <span className={`save-dot save-dot-${phase === "loading" ? "saving" : save.kind}`} aria-hidden="true" />
      <span>{message}</span>
      {save.kind === "error" && (
        <button type="button" className="text-button" onClick={onRetry}>
          Opnieuw proberen
        </button>
      )}
    </div>
  );
}
