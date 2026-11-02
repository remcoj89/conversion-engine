"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ForbiddenState, UnauthenticatedState, UnavailableState } from "../../../ui-states";
import {
  parseLeadDetailResponseResult,
  updateLeadStatus,
  type LeadLifecycleStatus,
  type LeadRecord,
  type LeadStatusUpdateResult,
} from "../../../../lib/bff/leads";
import { useWorkspaceContext } from "../../../workspace-context";
import { CustomerPage, StatusBadge } from "../../customer-ui";
import styles from "../../customer.module.css";
import {
  applyLeadStatusUpdate,
  formatLeadStatus,
  isTerminalLeadStatus,
  leadStatusTone,
  nextLeadStatuses,
} from "../lead-lifecycle";

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; lead: LeadRecord }
  | { kind: "unauthenticated" | "forbidden" | "not_found" | "error" | "unavailable" };

export default function LiveLeadDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { fetch: workspaceFetch } = useWorkspaceContext();
  const [state, setState] = useState<DetailState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadLead() {
      try {
        const response = await workspaceFetch(`/api/leads/${encodeURIComponent(id)}`, { cache: "no-store" });
        const result = await parseLeadDetailResponseResult(response);
        if (cancelled) return;
        setState(result.status === "ready" ? { kind: "ready", lead: result.data } : { kind: result.status });
      } catch {
        if (!cancelled) setState({ kind: "unavailable" });
      }
    }

    void loadLead();
    return () => { cancelled = true; };
  }, [id, workspaceFetch]);

  if (state.kind === "loading") return <DetailLoading />;
  if (state.kind === "unauthenticated") return <UnauthenticatedState message="Meld je aan om dit CRM-contact te bekijken." />;
  if (state.kind === "forbidden") return <ForbiddenState message="Je account heeft geen toegang tot dit CRM-contact." />;
  if (state.kind === "error") return <LeadErrorState onRetry={() => router.refresh()} />;
  if (state.kind === "unavailable") return <UnavailableState onRetry={() => router.refresh()} />;
  if (state.kind === "not_found") return <LeadNotFound />;
  if (state.kind !== "ready") return null;

  const { lead } = state;
  return (
    <CustomerPage
      current="leads"
      title="Leaddetail"
      intro="Bekijk alleen de gegevens die de CRM-readbron voor deze lead beschikbaar maakt."
      actions={<Link className="button button-secondary" href="/leads">← Terug naar leads</Link>}
    >
      <div className={styles.customerTwoColumn}>
        <article className="card">
          <div className={styles.customerCardContent}>
            <header className={styles.customerDetailHeader}>
              <div><h2>{lead.name}</h2><p><a href={`mailto:${lead.email}`}>{lead.email}</a></p></div>
              <StatusBadge tone={leadStatusTone(lead.status)}>{formatLeadStatus(lead.status)}</StatusBadge>
            </header>
            <dl className={styles.customerDefinitionList}>
              <div className={styles.customerDefinition}><dt>Leadbron</dt><dd>{lead.source}</dd></div>
              <div className={styles.customerDefinition}><dt>Telefoon</dt><dd>{lead.phone ?? "Niet opgegeven"}</dd></div>
              <div className={styles.customerDefinition}><dt>Aangemaakt</dt><dd><time dateTime={lead.created_at}>{formatDate(lead.created_at)}</time></dd></div>
              <div className={styles.customerDefinition}><dt>Laatst bijgewerkt</dt><dd><time dateTime={lead.updated_at}>{formatDate(lead.updated_at)}</time></dd></div>
            </dl>
          </div>
        </article>

        <article className="card">
          <div className={styles.customerCardContent}>
            <h2>Bericht</h2>
            <p>{lead.message}</p>
          </div>
        </article>

        <article className="card">
          <div className={styles.customerCardContent}>
            <h2>Opvolging</h2>
            {lead.next_action ? (
              <dl className={styles.customerDefinitionList}>
                <div className={styles.customerDefinition}><dt>Volgende actie</dt><dd>{lead.next_action.label}</dd></div>
                <div className={styles.customerDefinition}><dt>Uiterste datum</dt><dd>{lead.next_action.due_at ? <time dateTime={lead.next_action.due_at}>{formatDate(lead.next_action.due_at)}</time> : "Datum volgt"}</dd></div>
              </dl>
            ) : <p className={styles.customerTableMuted}>Er is nog geen volgende actie gepland.</p>}
          </div>
        </article>

        <LeadStatusMutation lead={lead} onUpdated={(result) => setState({ kind: "ready", lead: applyLeadStatusUpdate(lead, result) })} />
      </div>
    </CustomerPage>
  );
}

function LeadStatusMutation({
  lead,
  onUpdated,
}: {
  lead: LeadRecord;
  onUpdated: (result: Extract<LeadStatusUpdateResult, { status: "updated" }>) => void;
}) {
  const { fetch: workspaceFetch } = useWorkspaceContext();
  const [selectedStatus, setSelectedStatus] = useState<LeadLifecycleStatus | "">("");
  const [mutationState, setMutationState] = useState<LeadStatusUpdateState>({ kind: "idle" });
  const nextStatuses = nextLeadStatuses(lead.status);
  const isTerminal = isTerminalLeadStatus(lead.status);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStatus || !nextStatuses.includes(selectedStatus)) {
      setMutationState({ kind: "invalid", message: "Kies een geldige volgende status." });
      return;
    }

    setMutationState({ kind: "saving", target: selectedStatus });
    const result = await updateLeadStatus(workspaceFetch, lead.id, selectedStatus);
    if (result.status === "updated") {
      onUpdated(result);
      setSelectedStatus("");
      setMutationState({ kind: "success", message: `Status gewijzigd naar ${formatLeadStatus(result.data.status)}.` });
      return;
    }

    setMutationState(mutationStateFor(result));
  }

  return (
    <article className="card">
      <div className={styles.customerCardContent}>
        <h2>{isTerminal ? "Status" : "Status wijzigen"}</h2>
        {isTerminal ? (
          <p className={styles.customerTableMuted}>Deze lead is afgerond en kan niet meer worden gewijzigd.</p>
        ) : (
          <>
            <p className={styles.customerTableMuted}>Kies alleen de volgende stap in de pipeline. Terugzetten is niet beschikbaar.</p>
            <form className={styles.leadStatusForm} onSubmit={submit}>
              <div className="field">
                <label className="field-label" htmlFor="lead-next-status">Volgende status</label>
                <select
                  className="field-control"
                  id="lead-next-status"
                  value={selectedStatus}
                  onChange={(event) => setSelectedStatus(event.currentTarget.value as LeadLifecycleStatus | "")}
                  disabled={mutationState.kind === "saving"}
                >
                  <option value="">Selecteer een status</option>
                  {nextStatuses.map((status) => <option key={status} value={status}>{formatLeadStatus(status)}</option>)}
                </select>
              </div>
              <button className="button button-primary" type="submit" disabled={mutationState.kind === "saving"}>
                {mutationState.kind === "saving" ? "Status opslaan…" : "Status opslaan"}
              </button>
            </form>
          </>
        )}
        <StatusMutationFeedback state={mutationState} />
      </div>
    </article>
  );
}

type LeadStatusUpdateState =
  | { kind: "idle" }
  | { kind: "saving"; target: LeadLifecycleStatus }
  | { kind: "success"; message: string }
  | { kind: "invalid" | "conflict" | "forbidden" | "unauthenticated" | "not_found" | "unavailable"; message: string };

function mutationStateFor(result: Exclude<LeadStatusUpdateResult, { status: "updated" }>): Exclude<LeadStatusUpdateState, { kind: "idle" | "saving" | "success" }> {
  switch (result.status) {
    case "invalid_status_transition":
      return { kind: "conflict", message: "De status is intussen gewijzigd. Ververs de pagina en probeer opnieuw." };
    case "unauthenticated":
      return { kind: "unauthenticated", message: "Je sessie is verlopen. Meld je opnieuw aan om de status te wijzigen." };
    case "forbidden":
      return { kind: "forbidden", message: "Je account mag de status van deze lead niet wijzigen." };
    case "not_found":
      return { kind: "not_found", message: "Deze lead is niet meer beschikbaar in deze klantomgeving." };
    case "invalid_request":
      return { kind: "invalid", message: "De gekozen status kon niet worden verwerkt." };
    case "unavailable":
      return { kind: "unavailable", message: "De status kon niet worden opgeslagen. Probeer het later opnieuw." };
  }
}

function StatusMutationFeedback({ state }: { state: LeadStatusUpdateState }) {
  if (state.kind === "idle" || state.kind === "saving") return null;
  const isSuccess = state.kind === "success";
  return (
    <p className={isSuccess ? styles.leadStatusSuccess : styles.leadStatusError} role={isSuccess ? "status" : "alert"} aria-live={isSuccess ? "polite" : "assertive"}>
      {state.message}
    </p>
  );
}

function DetailLoading() {
  return <section className="ui-state-container ui-state-loading" role="status" aria-live="polite" aria-busy="true"><h1 className="ui-state-heading">Leaddetail wordt geladen</h1><p className="ui-state-message">We halen de CRM-gegevens op.</p></section>;
}

function LeadNotFound() {
  return <section className="ui-state-container ui-state-empty" role="alert" aria-live="assertive"><h1 className="ui-state-heading">Lead niet gevonden</h1><p className="ui-state-message">Deze lead bestaat niet in de gekozen klantomgeving of is niet beschikbaar.</p><Link className="button button-primary ui-state-action" href="/leads">Terug naar leads</Link></section>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function LeadErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="ui-state-container ui-state-unavailable" role="alert" aria-live="assertive">
      <h1 className="ui-state-heading">Leaddetail kon niet worden geladen</h1>
      <p className="ui-state-message">De ontvangen CRM-respons kon niet veilig worden verwerkt. Probeer het opnieuw.</p>
      <button className="button button-primary ui-state-action" type="button" onClick={onRetry}>Opnieuw proberen</button>
    </section>
  );
}
