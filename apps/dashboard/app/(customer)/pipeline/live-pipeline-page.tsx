"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  EmptyState,
  ForbiddenState,
  UnauthenticatedState,
  UnavailableState,
} from "../../ui-states";
import {
  isLeadLifecycleStatus,
  parseLeadListResponseResult,
  type LeadQuery,
  type LeadRecord,
} from "../../../lib/bff/leads";
import {
  parseDealListResponseResult,
  type DealRecord,
} from "../../../lib/bff/deals";
import { useWorkspaceContext } from "../../workspace-context";
import { CustomerPage, SourceLabel, StatusBadge } from "../customer-ui";
import {
  buildDealDetailHref,
  buildPipelineQuery,
  buildLeadDetailHref,
  mapDealPipelineResult,
  mapPipelineResult,
  type DealColumn,
  type DealPipelineState,
  type PipelineColumn,
  type PipelineState,
} from "./pipeline-data";
import { DealFormDialog } from "./deal-form-dialog";
import pipelineStyles from "./pipeline.module.css";
import styles from "../customer.module.css";

const statusFilters = [
  { value: "all", label: "Alle statussen" },
  { value: "new", label: "Nieuw" },
  { value: "qualified", label: "Gekwalificeerd" },
  { value: "appointment_scheduled", label: "Afspraak gepland" },
  { value: "proposal", label: "Voorstel" },
  { value: "won", label: "Gewonnen" },
  { value: "lost", label: "Verloren" },
] as const;

export default function LivePipelinePage({ query }: { query: LeadQuery }) {
  const router = useRouter();
  const { fetch: workspaceFetch } = useWorkspaceContext();
  const [state, setState] = useState<PipelineState>({ kind: "unavailable" });
  const [dealState, setDealState] = useState<DealPipelineState>({ kind: "loading" });
  const [loading, setLoading] = useState(true);
  const [dealReloadKey, setDealReloadKey] = useState(0);
  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [dealFeedback, setDealFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPipeline() {
      setLoading(true);
      setDealState({ kind: "loading" });
      try {
        const [leadResponse, dealResponse] = await Promise.all([
          workspaceFetch(`/api/leads?${buildPipelineQuery(query)}`, { cache: "no-store" }),
          workspaceFetch("/api/deals", { cache: "no-store" }),
        ]);
        const result = mapPipelineResult(await parseLeadListResponseResult(leadResponse));
        const deals = mapDealPipelineResult(await parseDealListResponseResult(dealResponse));
        if (!cancelled) setState(result);
        if (!cancelled) setDealState(deals);
      } catch {
        if (!cancelled) {
          setState({ kind: "unavailable" });
          setDealState({ kind: "unavailable" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPipeline();
    return () => { cancelled = true; };
  }, [dealReloadKey, query, workspaceFetch]);

  if (loading) return <PipelineLoading />;
  if (state.kind === "unauthenticated") return <UnauthenticatedState message="Meld je aan om de pipeline van deze klantomgeving te bekijken." />;
  if (state.kind === "forbidden") return <ForbiddenState message="Je account heeft geen toegang tot de pipeline van deze klantomgeving." />;
  if (state.kind === "error") return <PipelineErrorState onRetry={() => router.refresh()} />;
  if (state.kind === "unavailable") return <UnavailableState onRetry={() => router.refresh()} />;
  if (state.kind !== "ready") return null;

  const hasFilters = Boolean(query.q || query.status);

  return (
    <CustomerPage
      current="pipeline"
      title="Pipeline"
      intro="Bekijk tenantgebonden leads en beheer deals per lifecyclefase."
      actions={<><Link className="button button-secondary" href="/leads">Bekijk alle leads</Link><button className="button button-primary" type="button" onClick={() => { setDealFeedback(null); setDealDialogOpen(true); }}>Nieuwe deal</button></>}
    >
      {dealFeedback ? <p className={styles.crmOperationSuccess} role="status" aria-live="polite">{dealFeedback}</p> : null}
      <section aria-labelledby="pipeline-board-title">
        <div className={styles.customerToolbar}>
          <form className={styles.customerFilterForm} method="get" onSubmit={(event) => submitFilters(event, router)}>
            <div className={`field ${styles.customerFilterField}`}>
              <label className="field-label" htmlFor="pipeline-search">Zoek contact of interesse</label>
              <input className="field-control" id="pipeline-search" name="q" defaultValue={query.q ?? ""} placeholder="Bijv. Lisa of coaching" type="search" maxLength={100} />
            </div>
            <div className={`field ${styles.customerFilterField}`}>
              <label className="field-label" htmlFor="pipeline-status">Status</label>
              <select className="field-control" id="pipeline-status" name="status" defaultValue={query.status ?? "all"}>
                {statusFilters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
              </select>
            </div>
            <div className={styles.customerFilterActions}>
              <button className="button button-secondary" type="submit">Filter toepassen</button>
              {hasFilters ? <Link className="button button-secondary" href="/pipeline">Reset</Link> : null}
            </div>
          </form>
          <p className={styles.customerResultCount} aria-live="polite">
            {state.data.reduce((count, column) => count + column.leads.length, 0)} leads op deze pagina{hasFilters ? " · filters actief" : ""}
          </p>
        </div>

        <div className="section-heading">
          <h2 id="pipeline-board-title">Leadpipeline</h2>
          <p>Elke kaart toont alleen naam, e-mail, bron en ontvangstdatum. Open de lead voor de overige toegestane context.</p>
        </div>

        {!state.hasLeads ? <EmptyState title="Nog geen leads in de pipeline" message="Er zijn geen tenantgebonden leads beschikbaar voor deze weergave. Daarom tonen we geen fictieve kaarten of bedragen." /> : null}
        {state.hasNextPage ? <p className={styles.pipelineNotice} role="note">Er zijn meer leads dan op deze pagina worden getoond. Gebruik de leadlijst voor volledige paginering.</p> : null}
        <div className={styles.customerKanban} role="region" aria-label="Leadpipeline per lifecyclefase" tabIndex={0}>
          {state.data.map((column) => <PipelineColumnView key={column.status} column={column} />)}
        </div>
      </section>

      <DealsSection state={dealState} />
      <DealFormDialog
        key={`create-${dealDialogOpen ? "open" : "closed"}`}
        open={dealDialogOpen}
        record={null}
        fetcher={workspaceFetch}
        onClose={() => setDealDialogOpen(false)}
        onSaved={(_, message) => { setDealFeedback(message); setDealDialogOpen(false); setDealReloadKey((value) => value + 1); }}
        onArchived={() => undefined}
      />
    </CustomerPage>
  );
}

function PipelineColumnView({ column }: { column: PipelineColumn }) {
  return (
    <section className={styles.customerKanbanColumn} aria-labelledby={`pipeline-column-${column.status}`}>
      <div className={styles.customerKanbanHeader}>
        <h3 id={`pipeline-column-${column.status}`}>{column.label}</h3>
        <StatusBadge tone={column.tone}>{column.leads.length}</StatusBadge>
      </div>
      {column.leads.length === 0 ? (
        <p className={styles.pipelineColumnEmpty}>Geen leads in deze fase.</p>
      ) : (
        <ul className={styles.pipelineLeadList}>
          {column.leads.map((lead) => <PipelineLeadCard key={lead.id} lead={lead} />)}
        </ul>
      )}
    </section>
  );
}

function PipelineLeadCard({ lead }: { lead: LeadRecord }) {
  return (
    <li className={styles.pipelineLeadItem}>
      <Link className={styles.pipelineLeadCard} href={buildLeadDetailHref(lead.id)}>
        <strong>{lead.name}</strong>
        <span className={styles.customerTableMuted}>{lead.email}</span>
        <span><SourceLabel>{lead.source}</SourceLabel></span>
        <time className={styles.customerTableMuted} dateTime={lead.created_at}>{formatDate(lead.created_at)}</time>
        <span className="visually-hidden">Open lead {lead.name}</span>
      </Link>
    </li>
  );
}

function DealsSection({ state }: { state: DealPipelineState }) {
  return (
    <section aria-labelledby="deal-board-title" className={pipelineStyles.dealSection}>
      <div className="section-heading">
        <h2 id="deal-board-title">Deals</h2>
        <p>Deals zijn commerciële kansen. Ze staan los van leadkaarten en tonen alleen veilige read-only velden.</p>
      </div>
      {state.kind === "loading" ? <DealsLoading /> : null}
      {state.kind === "unauthenticated" ? <UnauthenticatedState message="Meld je aan om de deals van deze klantomgeving te bekijken." /> : null}
      {state.kind === "forbidden" ? <ForbiddenState message="Je account heeft geen toegang tot de deals van deze klantomgeving." /> : null}
      {state.kind === "error" ? <p className={pipelineStyles.dealState} role="alert">De dealgegevens konden niet veilig worden verwerkt.</p> : null}
      {state.kind === "unavailable" ? <UnavailableState /> : null}
      {state.kind === "ready" && !state.hasDeals ? <EmptyState title="Nog geen deals" message="Er zijn nog geen tenantgebonden deals beschikbaar. Daarom tonen we geen fictieve bedragen of kaarten." /> : null}
      {state.kind === "ready" && state.hasDeals ? (
        <div className={styles.customerKanban} role="region" aria-label="Dealpipeline per lifecyclefase" tabIndex={0}>
          {state.data.map((column) => <DealColumnView key={column.stage} column={column} />)}
        </div>
      ) : null}
    </section>
  );
}

function DealColumnView({ column }: { column: DealColumn }) {
  return (
    <section className={styles.customerKanbanColumn} aria-labelledby={`deal-column-${column.stage}`}>
      <div className={styles.customerKanbanHeader}>
        <h3 id={`deal-column-${column.stage}`}>{column.label}</h3>
        <StatusBadge tone={column.tone}>{column.deals.length}</StatusBadge>
      </div>
      {column.deals.length === 0 ? (
        <p className={styles.pipelineColumnEmpty}>Geen deals in deze fase.</p>
      ) : (
        <ul className={styles.pipelineLeadList}>
          {column.deals.map((deal) => <DealCard key={deal.id} deal={deal} />)}
        </ul>
      )}
    </section>
  );
}

function DealCard({ deal }: { deal: DealRecord }) {
  return (
    <li className={styles.pipelineLeadItem}>
      <Link className={styles.pipelineLeadCard} href={buildDealDetailHref(deal.id)}>
        <strong>{deal.title}</strong>
        <span className={pipelineStyles.dealCardMeta}>{formatAmount(deal.amount_eur)}</span>
        <span><StatusBadge tone={deal.status === "archived" ? "neutral" : "success"}>{deal.status === "archived" ? "Gearchiveerd" : "Actief"}</StatusBadge></span>
        {deal.expected_close_date ? <time className={styles.customerTableMuted} dateTime={deal.expected_close_date}>Verwacht {formatDateOnly(deal.expected_close_date)}</time> : null}
        <span className="visually-hidden">Open deal {deal.title}</span>
      </Link>
    </li>
  );
}

function submitFilters(event: FormEvent<HTMLFormElement>, router: ReturnType<typeof useRouter>) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const params = new URLSearchParams();
  const q = String(form.get("q") ?? "").trim();
  const status = String(form.get("status") ?? "all");
  if (q) params.set("q", q.slice(0, 100));
  if (status !== "all" && isLeadLifecycleStatus(status)) params.set("status", status);
  router.push(params.toString() ? `/pipeline?${params.toString()}` : "/pipeline");
}

function PipelineLoading() {
  return <section className="ui-state-container ui-state-loading" role="status" aria-live="polite" aria-busy="true"><h1 className="ui-state-heading">Pipeline wordt geladen</h1><p className="ui-state-message">We halen de tenantgebonden leads per lifecyclefase op.</p><div className="ui-state-skeleton" aria-hidden="true"><span className="ui-state-skeleton-line ui-state-skeleton-line-short" /><div className="ui-state-skeleton-grid"><span className="ui-state-skeleton-card" /><span className="ui-state-skeleton-card" /><span className="ui-state-skeleton-card" /></div></div></section>;
}

function PipelineErrorState({ onRetry }: { onRetry: () => void }) {
  return <section className="ui-state-container ui-state-unavailable" role="alert" aria-live="assertive"><h1 className="ui-state-heading">Pipeline kon niet worden geladen</h1><p className="ui-state-message">De ontvangen CRM-respons kon niet veilig worden verwerkt. Probeer het opnieuw.</p><button className="button button-primary ui-state-action" type="button" onClick={onRetry}>Opnieuw proberen</button></section>;
}

function DealsLoading() {
  return <p className={pipelineStyles.dealState} role="status" aria-live="polite">Deals worden geladen…</p>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDateOnly(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatAmount(value: string | null): string {
  if (value === null) return "Bedrag niet opgegeven";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value));
}
