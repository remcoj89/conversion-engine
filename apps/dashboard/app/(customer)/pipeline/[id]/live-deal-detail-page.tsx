"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { WorkspaceFetch } from "../../../../lib/session/context";
import { EmptyState, ForbiddenState, UnauthenticatedState, UnavailableState } from "../../../ui-states";
import { useWorkspaceContext } from "../../../workspace-context";
import { parseDealDetailResponseResult, type DealDetailResult, type EditableDealRecord } from "../../../../lib/bff/deals";
import { CustomerPage, StatusBadge } from "../../customer-ui";
import { formatLeadStatus, leadStatusTone } from "../../leads/lead-lifecycle";
import { DealFormDialog } from "../deal-form-dialog";
import styles from "../pipeline.module.css";

export default function LiveDealDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { fetch: workspaceFetch } = useWorkspaceContext();
  const [state, setState] = useState<DealDetailResult>({ status: "unavailable", data: null });
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDeal() {
      setLoading(true);
      try {
        const response = await workspaceFetch(`/api/deals/${encodeURIComponent(id)}`, { cache: "no-store" });
        const result = await parseDealDetailResponseResult(response);
        if (!cancelled) setState(result);
      } catch {
        if (!cancelled) setState({ status: "unavailable", data: null });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDeal();
    return () => { cancelled = true; };
  }, [id, workspaceFetch]);

  if (loading) return <DealLoading />;
  if (state.status === "unauthenticated") return <UnauthenticatedState message="Meld je aan om deze deal te bekijken." />;
  if (state.status === "forbidden") return <ForbiddenState message="Je account heeft geen toegang tot deze deal." />;
  if (state.status === "not_found") return <EmptyState title="Deal niet gevonden" message="Deze deal bestaat niet binnen de geselecteerde klantomgeving of is niet beschikbaar." />;
  if (state.status === "error") return <DealErrorState onRetry={() => router.refresh()} />;
  if (state.status === "unavailable") return <UnavailableState onRetry={() => router.refresh()} />;
  if (state.status !== "ready") return null;

  return (
    <DealView
      deal={state.data}
      feedback={feedback}
      formOpen={formOpen}
      onEdit={() => { setFeedback(null); setFormOpen(true); }}
      onClose={() => setFormOpen(false)}
      onSaved={(deal, message) => {
        setState({ status: "ready", data: deal });
        setFeedback(message);
        setFormOpen(false);
      }}
      onArchived={(message) => {
        setFeedback(message);
        router.push("/pipeline");
      }}
      fetcher={workspaceFetch}
    />
  );
}

function DealView({ deal, feedback, formOpen, onEdit, onClose, onSaved, onArchived, fetcher }: Readonly<{
  deal: EditableDealRecord;
  feedback: string | null;
  formOpen: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSaved: (deal: EditableDealRecord, message: string) => void;
  onArchived: (message: string) => void;
  fetcher: WorkspaceFetch;
}>) {
  return (
    <CustomerPage current="pipeline" title={deal.title} intro="Bekijk en beheer deze tenantgebonden deal." actions={<><Link className="button button-secondary" href="/pipeline">Terug naar pipeline</Link>{deal.status === "active" ? <button className="button button-primary" type="button" onClick={onEdit}>Deal bewerken</button> : null}</>}>
      {feedback ? <p className={styles.dealSuccess} role="status" aria-live="polite">{feedback}</p> : null}
      <section className={styles.dealDetailCard} aria-labelledby="deal-detail-title">
        <div className={styles.dealDetailHeader}>
          <div><p className="eyebrow">Deal</p><h2 id="deal-detail-title">{deal.title}</h2></div>
          <div className={styles.dealBadgeGroup}>
            <StatusBadge tone={leadStatusTone(deal.stage)}>{formatLeadStatus(deal.stage)}</StatusBadge>
            <StatusBadge tone={deal.status === "active" ? "success" : "neutral"}>{deal.status === "active" ? "Actief" : "Gearchiveerd"}</StatusBadge>
          </div>
        </div>
        <dl className={styles.dealDetailGrid}>
          <DetailField label="Bedrag" value={formatAmount(deal.amount_eur)} />
          <DetailField label="Verwachte sluitdatum" value={deal.expected_close_date ? formatDateOnly(deal.expected_close_date) : "Niet opgegeven"} />
          {deal.loss_reason ? <DetailField label="Reden verloren" value={deal.loss_reason} /> : null}
        </dl>
      </section>
      <DealFormDialog key={`${deal.id}-${formOpen ? "open" : "closed"}`} open={formOpen} record={deal} fetcher={fetcher} onClose={onClose} onSaved={onSaved} onArchived={onArchived} />
    </CustomerPage>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div className={styles.dealDetailField}><dt>{label}</dt><dd>{value}</dd></div>;
}

function DealLoading() {
  return <section className="ui-state-container ui-state-loading" role="status" aria-live="polite" aria-busy="true"><h1 className="ui-state-heading">Dealdetail wordt geladen</h1><p className="ui-state-message">We halen de tenantgebonden dealgegevens op.</p><div className="ui-state-skeleton" aria-hidden="true"><span className="ui-state-skeleton-line ui-state-skeleton-line-short" /><span className="ui-state-skeleton-card" /></div></section>;
}

function DealErrorState({ onRetry }: { onRetry: () => void }) {
  return <section className="ui-state-container ui-state-unavailable" role="alert" aria-live="assertive"><h1 className="ui-state-heading">Dealdetail kon niet worden geladen</h1><p className="ui-state-message">De ontvangen CRM-respons kon niet veilig worden verwerkt. Probeer het opnieuw.</p><button className="button button-primary ui-state-action" type="button" onClick={onRetry}>Opnieuw proberen</button></section>;
}

function formatDateOnly(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatAmount(value: string | null): string {
  if (value === null) return "Bedrag niet opgegeven";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value));
}
