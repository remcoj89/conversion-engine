"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ForbiddenState, LoadingState, UnauthenticatedState, UnavailableState } from "../../../ui-states";
import { useWorkspaceContext } from "../../../workspace-context";
import {
  fetchCrmSettings,
  updateCrmSettings,
  type CrmSettingsFetchResult,
  type CrmSettingsResponse,
} from "../../../../lib/bff/crmSettings";
import {
  validateCrmSettings,
  type CrmSettingsField,
  type CrmSettingsValidationErrors,
} from "./crm-settings-validation";
import styles from "./crm-settings.module.css";

type SettingsState = Readonly<{ status: "loading" }> | CrmSettingsFetchResult;
type SaveState = Readonly<{
  status: "idle" | "saving" | "success" | "error";
  message?: string;
}>;

const FIELD_IDS: Readonly<Record<CrmSettingsField, string>> = {
  timezone: "crm-timezone",
  workingStart: "crm-start",
  workingEnd: "crm-end",
  deadlineBusinessDays: "crm-deadline",
  leadSources: "crm-sources",
};

export function CrmSettingsClient() {
  const { fetch: workspaceFetch } = useWorkspaceContext();
  const [state, setState] = useState<SettingsState>({ status: "loading" });
  const [settings, setSettings] = useState<CrmSettingsResponse | null>(null);
  const [savedSettings, setSavedSettings] = useState<CrmSettingsResponse | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [fieldErrors, setFieldErrors] = useState<CrmSettingsValidationErrors>({});

  const isDirty = settings !== null
    && savedSettings !== null
    && JSON.stringify(settings) !== JSON.stringify(savedSettings);
  const saving = saveState.status === "saving";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchCrmSettings(workspaceFetch);
      if (cancelled) return;
      setState(result);
      if (result.status === "ready") {
        setSettings(result.data);
        setSavedSettings(result.data);
        setFieldErrors({});
        setSaveState({ status: "idle" });
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [workspaceFetch]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || saving || !isDirty) return;

    const validationErrors = validateCrmSettings(settings);
    setFieldErrors(validationErrors);
    const firstError = Object.keys(validationErrors)[0] as CrmSettingsField | undefined;
    if (firstError) {
      window.requestAnimationFrame(() => document.getElementById(FIELD_IDS[firstError])?.focus());
      setSaveState({ status: "error", message: "Controleer de gemarkeerde velden." });
      return;
    }

    setSaveState({ status: "saving" });
    const result = await updateCrmSettings(workspaceFetch, settings);
    if (result.status === "ready") {
      setSettings(result.data);
      setSavedSettings(result.data);
      setState(result);
      setFieldErrors({});
      setSaveState({ status: "success", message: "CRM-instellingen opgeslagen." });
      return;
    }

    if (result.status === "unauthenticated" || result.status === "forbidden") {
      setSaveState({ status: "idle" });
      setState(result);
      return;
    }

    setSaveState({
      status: "error",
      message: "Opslaan is niet gelukt. Controleer je verbinding en probeer het opnieuw. Je wijzigingen zijn behouden.",
    });
  }

  function retry() {
    setState({ status: "loading" });
    setSettings(null);
    setSavedSettings(null);
    setFieldErrors({});
    setSaveState({ status: "idle" });
    void fetchCrmSettings(workspaceFetch).then((result) => {
      setState(result);
      if (result.status === "ready") {
        setSettings(result.data);
        setSavedSettings(result.data);
      }
    });
  }

  function updateSettings(nextSettings: CrmSettingsResponse, field?: CrmSettingsField) {
    setSettings(nextSettings);
    setSaveState((current) => current.status === "success" || current.status === "error" ? { status: "idle" } : current);
    if (field) {
      setFieldErrors((current) => {
        if (!(field in current)) return current;
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
  }

  if (state.status === "loading") {
    return <LoadingState title="CRM-instellingen worden geladen" message="We halen de instellingen van deze klantomgeving op." />;
  }
  if (state.status === "unauthenticated") {
    return <UnauthenticatedState message="Meld je aan om CRM-instellingen te bekijken." />;
  }
  if (state.status === "forbidden") {
    return <ForbiddenState message="Je account heeft geen toegang tot CRM-instellingen in deze klantomgeving." />;
  }
  if (state.status === "unavailable" || !settings) {
    return <UnavailableState onRetry={retry} />;
  }

  return (
    <form onSubmit={(event) => void save(event)} aria-busy={saving} noValidate>
      <fieldset className={styles.formFieldset} disabled={saving}>
        <section className="card" aria-labelledby="crm-working-hours-title">
          <div className={styles.settingsCardContent}>
            <h2 id="crm-working-hours-title">Werkuren en tijdzone</h2>
            <p>Opvolgdeadlines gebruiken de tijdzone en werkdagen van deze klantomgeving.</p>
            <div className={styles.settingsFormGrid}>
              <div className="field">
                <label className="field-label" htmlFor="crm-timezone">Tijdzone</label>
                <input
                  className="field-control"
                  id="crm-timezone"
                  value={settings.timezone}
                  onChange={(event) => updateSettings({ ...settings, timezone: event.currentTarget.value }, "timezone")}
                  required
                  aria-invalid={Boolean(fieldErrors.timezone)}
                  aria-describedby={fieldErrors.timezone ? "crm-timezone-error" : "crm-timezone-help"}
                />
                <p className="field-help" id="crm-timezone-help">Bijvoorbeeld Europe/Amsterdam.</p>
                {fieldErrors.timezone ? <p className="field-error" id="crm-timezone-error">{fieldErrors.timezone}</p> : null}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="crm-start">Start werkdag</label>
                <input
                  className="field-control"
                  id="crm-start"
                  type="time"
                  value={settings.workingHours.start}
                  onChange={(event) => updateSettings({ ...settings, workingHours: { ...settings.workingHours, start: event.currentTarget.value } }, "workingStart")}
                  required
                  aria-invalid={Boolean(fieldErrors.workingStart)}
                  aria-describedby={fieldErrors.workingStart ? "crm-start-error" : undefined}
                />
                {fieldErrors.workingStart ? <p className="field-error" id="crm-start-error">{fieldErrors.workingStart}</p> : null}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="crm-end">Einde werkdag</label>
                <input
                  className="field-control"
                  id="crm-end"
                  type="time"
                  value={settings.workingHours.end}
                  onChange={(event) => updateSettings({ ...settings, workingHours: { ...settings.workingHours, end: event.currentTarget.value } }, "workingEnd")}
                  required
                  aria-invalid={Boolean(fieldErrors.workingEnd)}
                  aria-describedby={fieldErrors.workingEnd ? "crm-end-error" : undefined}
                />
                {fieldErrors.workingEnd ? <p className="field-error" id="crm-end-error">{fieldErrors.workingEnd}</p> : null}
              </div>
            </div>
            <p className={styles.workingDays}>Werkdagen: {settings.workingDays.map((day) => dayLabel(day)).join(", ")}</p>
          </div>
        </section>

      <section className="card" aria-labelledby="crm-follow-up-title">
        <div className={styles.settingsCardContent}>
          <h2 id="crm-follow-up-title">Automatische opvolging</h2>
          <p>Leg vast wanneer een nieuwe lead opvolging nodig heeft en hoe die wordt toegewezen.</p>
          <fieldset className={styles.settingsFieldset}>
            <legend className={styles.settingsLegend}>Opvolging</legend>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={settings.leadFollowUp.enabled} onChange={(event) => updateSettings({ ...settings, leadFollowUp: { ...settings.leadFollowUp, enabled: event.currentTarget.checked } })} />
              <span>Automatische opvolging inschakelen</span>
            </label>
          </fieldset>
          <div className={styles.settingsFormGrid}>
            <div className="field">
              <label className="field-label" htmlFor="crm-deadline">Deadline in werkdagen</label>
              <input className="field-control" id="crm-deadline" type="number" min={1} max={30} value={settings.leadFollowUp.deadlineBusinessDays} onChange={(event) => updateSettings({ ...settings, leadFollowUp: { ...settings.leadFollowUp, deadlineBusinessDays: Number(event.currentTarget.value) } }, "deadlineBusinessDays")} required aria-invalid={Boolean(fieldErrors.deadlineBusinessDays)} aria-describedby={fieldErrors.deadlineBusinessDays ? "crm-deadline-error" : "crm-deadline-help"} />
              <p className="field-help" id="crm-deadline-help">Binnen hoeveel werkdagen moet de eerste opvolging gebeuren?</p>
              {fieldErrors.deadlineBusinessDays ? <p className="field-error" id="crm-deadline-error">{fieldErrors.deadlineBusinessDays}</p> : null}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="crm-assignment">Toewijzing</label>
              <select className="field-control" id="crm-assignment" value={settings.leadFollowUp.assignmentStrategy} onChange={(event) => updateSettings({ ...settings, leadFollowUp: { ...settings.leadFollowUp, assignmentStrategy: event.currentTarget.value as CrmSettingsResponse["leadFollowUp"]["assignmentStrategy"] } })}>
                <option value="owner">Eigenaar</option>
                <option value="manual">Handmatig</option>
                <option value="round_robin">Om de beurt</option>
              </select>
            </div>
          </div>
          <fieldset className={styles.settingsFieldset}>
            <legend className={styles.settingsLegend}>Meldingen</legend>
            <div className={styles.checkboxGroup}>
              <label className={styles.checkboxRow}><input type="checkbox" checked={settings.leadFollowUp.notifications.inApp} onChange={(event) => updateSettings({ ...settings, leadFollowUp: { ...settings.leadFollowUp, notifications: { ...settings.leadFollowUp.notifications, inApp: event.currentTarget.checked } } })} /> In-appmelding</label>
              <label className={styles.checkboxRow}><input type="checkbox" checked={settings.leadFollowUp.notifications.email} onChange={(event) => updateSettings({ ...settings, leadFollowUp: { ...settings.leadFollowUp, notifications: { ...settings.leadFollowUp.notifications, email: event.currentTarget.checked } } })} /> E-mailmelding</label>
            </div>
          </fieldset>
        </div>
      </section>

        <section className="card" aria-labelledby="crm-sources-title">
        <div className={styles.settingsCardContent}>
          <h2 id="crm-sources-title">Leadbronnen</h2>
          <p>Schakel alleen bronnen in die deze klantomgeving daadwerkelijk gebruikt.</p>
          <fieldset className={styles.sourceList} id="crm-sources" aria-describedby={fieldErrors.leadSources ? "crm-sources-error" : undefined} aria-invalid={Boolean(fieldErrors.leadSources)}>
            <legend className={styles.settingsLegend}>Beschikbare bronnen</legend>
            {settings.leadSources.map((source) => (
              <label className={styles.checkboxRow} key={source.id}>
                <input id={`crm-source-${source.id}`} type="checkbox" checked={source.enabled} onChange={(event) => updateSettings({ ...settings, leadSources: settings.leadSources.map((candidate) => candidate.id === source.id ? { ...candidate, enabled: event.currentTarget.checked } : candidate) }, "leadSources")} />
                {source.label}
              </label>
            ))}
            {fieldErrors.leadSources ? <p className="field-error" id="crm-sources-error">{fieldErrors.leadSources}</p> : null}
          </fieldset>
        </div>
        </section>
      </fieldset>

      {saveState.status === "error" ? <p className={`${styles.feedback} ${styles.feedbackError}`} role="alert" aria-live="assertive" tabIndex={-1}>{saveState.message}</p> : null}
      {saveState.status === "success" ? <p className={`${styles.feedback} ${styles.feedbackSuccess}`} role="status" aria-live="polite">{saveState.message}</p> : null}
      <div className={styles.formActions}>
        <button className="button button-primary" type="submit" disabled={saving || !isDirty}>{saving ? "Opslaan…" : "Wijzigingen opslaan"}</button>
      </div>
    </form>
  );
}

function dayLabel(day: CrmSettingsResponse["workingDays"][number]): string {
  const labels: Readonly<Record<typeof day, string>> = {
    monday: "maandag",
    tuesday: "dinsdag",
    wednesday: "woensdag",
    thursday: "donderdag",
    friday: "vrijdag",
  };
  return labels[day];
}
