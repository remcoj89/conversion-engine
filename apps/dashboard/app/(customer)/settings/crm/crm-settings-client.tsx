"use client";

import { useEffect, useState } from "react";
import { ForbiddenState, LoadingState, UnauthenticatedState, UnavailableState } from "../../../ui-states";
import { useWorkspaceContext } from "../../../workspace-context";
import {
  fetchCrmSettings,
  updateCrmSettings,
  type CrmSettingsFetchResult,
  type CrmSettingsResponse,
} from "../../../../lib/bff/crmSettings";
import styles from "./crm-settings.module.css";

type SettingsState = Readonly<{ status: "loading" }> | CrmSettingsFetchResult;

export function CrmSettingsClient() {
  const { fetch: workspaceFetch } = useWorkspaceContext();
  const [state, setState] = useState<SettingsState>({ status: "loading" });
  const [settings, setSettings] = useState<CrmSettingsResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchCrmSettings(workspaceFetch);
      if (cancelled) return;
      setState(result);
      if (result.status === "ready") setSettings(result.data);
    }

    void load();
    return () => { cancelled = true; };
  }, [workspaceFetch]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || saving) return;

    setSaving(true);
    setFeedback(null);
    const result = await updateCrmSettings(workspaceFetch, settings);
    setSaving(false);
    if (result.status === "ready") {
      setSettings(result.data);
      setState(result);
      setFeedback("CRM-instellingen opgeslagen.");
      return;
    }
    setState(result);
    setFeedback("De CRM-instellingen konden niet worden opgeslagen. Controleer je toegang en probeer het opnieuw.");
  }

  function retry() {
    setState({ status: "loading" });
    setSettings(null);
    setFeedback(null);
    void fetchCrmSettings(workspaceFetch).then((result) => {
      setState(result);
      if (result.status === "ready") setSettings(result.data);
    });
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
    <form onSubmit={(event) => void save(event)}>
      <section className="card" aria-labelledby="crm-working-hours-title">
        <div className={styles.settingsCardContent}>
          <h2 id="crm-working-hours-title">Werkuren en tijdzone</h2>
          <p>Opvolgdeadlines gebruiken de tijdzone en werkdagen van deze klantomgeving.</p>
          <div className={styles.settingsFormGrid}>
            <div className="field">
              <label className="field-label" htmlFor="crm-timezone">Tijdzone</label>
              <input className="field-control" id="crm-timezone" value={settings.timezone} onChange={(event) => setSettings({ ...settings, timezone: event.currentTarget.value })} required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="crm-start">Start werkdag</label>
              <input className="field-control" id="crm-start" type="time" value={settings.workingHours.start} onChange={(event) => setSettings({ ...settings, workingHours: { ...settings.workingHours, start: event.currentTarget.value } })} required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="crm-end">Einde werkdag</label>
              <input className="field-control" id="crm-end" type="time" value={settings.workingHours.end} onChange={(event) => setSettings({ ...settings, workingHours: { ...settings.workingHours, end: event.currentTarget.value } })} required />
            </div>
          </div>
          <p className={styles.workingDays}>Werkdagen: {settings.workingDays.map((day) => dayLabel(day)).join(", ")}</p>
        </div>
      </section>

      <section className="card" aria-labelledby="crm-follow-up-title">
        <div className={styles.settingsCardContent}>
          <h2 id="crm-follow-up-title">Automatische opvolging</h2>
          <p>Leg vast wanneer een nieuwe lead opvolging nodig heeft en hoe die wordt toegewezen.</p>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={settings.leadFollowUp.enabled} onChange={(event) => setSettings({ ...settings, leadFollowUp: { ...settings.leadFollowUp, enabled: event.currentTarget.checked } })} />
            <span>Automatische opvolging inschakelen</span>
          </label>
          <div className={styles.settingsFormGrid}>
            <div className="field">
              <label className="field-label" htmlFor="crm-deadline">Deadline in werkdagen</label>
              <input className="field-control" id="crm-deadline" type="number" min={1} max={30} value={settings.leadFollowUp.deadlineBusinessDays} onChange={(event) => setSettings({ ...settings, leadFollowUp: { ...settings.leadFollowUp, deadlineBusinessDays: Number(event.currentTarget.value) } })} required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="crm-assignment">Toewijzing</label>
              <select className="field-control" id="crm-assignment" value={settings.leadFollowUp.assignmentStrategy} onChange={(event) => setSettings({ ...settings, leadFollowUp: { ...settings.leadFollowUp, assignmentStrategy: event.currentTarget.value as CrmSettingsResponse["leadFollowUp"]["assignmentStrategy"] } })}>
                <option value="owner">Eigenaar</option>
                <option value="manual">Handmatig</option>
                <option value="round_robin">Om de beurt</option>
              </select>
            </div>
          </div>
          <div className={styles.checkboxGroup} aria-label="Opvolgmeldingen">
            <label className={styles.checkboxRow}><input type="checkbox" checked={settings.leadFollowUp.notifications.inApp} onChange={(event) => setSettings({ ...settings, leadFollowUp: { ...settings.leadFollowUp, notifications: { ...settings.leadFollowUp.notifications, inApp: event.currentTarget.checked } } })} /> In-appmelding</label>
            <label className={styles.checkboxRow}><input type="checkbox" checked={settings.leadFollowUp.notifications.email} onChange={(event) => setSettings({ ...settings, leadFollowUp: { ...settings.leadFollowUp, notifications: { ...settings.leadFollowUp.notifications, email: event.currentTarget.checked } } })} /> E-mailmelding</label>
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="crm-sources-title">
        <div className={styles.settingsCardContent}>
          <h2 id="crm-sources-title">Leadbronnen</h2>
          <p>Schakel alleen bronnen in die deze klantomgeving daadwerkelijk gebruikt.</p>
          <div className={styles.sourceList}>
            {settings.leadSources.map((source) => (
              <label className={styles.checkboxRow} key={source.id}>
                <input type="checkbox" checked={source.enabled} onChange={(event) => setSettings({ ...settings, leadSources: settings.leadSources.map((candidate) => candidate.id === source.id ? { ...candidate, enabled: event.currentTarget.checked } : candidate) })} />
                {source.label}
              </label>
            ))}
          </div>
        </div>
      </section>

      {feedback ? <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p> : null}
      <div className={styles.formActions}>
        <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Opslaan…" : "Wijzigingen opslaan"}</button>
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
