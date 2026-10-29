"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  EmptyState,
  ForbiddenState,
  UnauthenticatedState,
  UnavailableState,
} from "../../ui-states";
import {
  parseLeadListResponseResult,
  type LeadListResult,
  type LeadQuery,
  type LeadRecord,
} from "../../../lib/bff/leads";
import { useWorkspaceContext } from "../../workspace-context";
import { CustomerPage, StatusBadge } from "../customer-ui";
import styles from "../customer.module.css";

const statusFilters = [
  { value: "all", label: "Alle statussen" },
  { value: "new", label: "Nieuw" },
] as const;

type LeadsState =
  | { kind: "loading" }
  | { kind: "ready"; data: Extract<LeadListResult, { status: "ready" }>["data"] }
  | { kind: "unauthenticated" | "forbidden" | "unavailable" };

export default function LiveLeadsPage({ query }: { query: LeadQuery }) {
  const router = useRouter();
  const { fetch: workspaceFetch } = useWorkspaceContext();
  const [state, setState] = useState<LeadsState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadLeads() {
      try {
        const response = await workspaceFetch(`/api/leads?${new URLSearchParams(query).toString()}`, {
          cache: "no-store",
        });
        const result = await parseLeadListResponseResult(response);
        if (cancelled) return;
        setState(
          result.status === "ready"
            ? { kind: "ready", data: result.data }
            : { kind: result.status === "unauthenticated" || result.status === "forbidden" ? result.status : "unavailable" },
        );
      } catch {
        if (!cancelled) setState({ kind: "unavailable" });
      }
    }

    void loadLeads();
    return () => { cancelled = true; };
  }, [query, workspaceFetch]);

  if (state.kind === "loading") return <LeadsLoading />;
  if (state.kind === "unauthenticated") return <UnauthenticatedState message="Meld je aan om je leads en contacten te bekijken." />;
  if (state.kind === "forbidden") return <ForbiddenState message="Je account heeft geen toegang tot de leads van deze klantomgeving." />;
  if (state.kind === "unavailable") return <UnavailableState onRetry={() => router.refresh()} />;
  if (state.kind !== "ready") return null;

  const { data } = state;
  const hasFilters = Boolean(query.q || query.status);
  const empty = data.items.length === 0;

  return (
    <CustomerPage
      current="leads"
      title="Leads & contacten"
      intro="Bekijk de CRM-aanvragen die bij deze klantomgeving horen. Deze pagina is alleen-lezen."
      actions={<Link className="button button-primary" href="/support">Vraag hulp bij opvolging</Link>}
    >
      <section aria-labelledby="leads-list-title">
        <div className={styles.customerToolbar}>
          <form className={styles.customerFilterForm} method="get" onSubmit={(event) => submitFilters(event, router)}>
            <div className={`field ${styles.customerFilterField}`}>
              <label className="field-label" htmlFor="lead-search">Zoek contact of interesse</label>
              <input className="field-control" id="lead-search" name="q" defaultValue={query.q ?? ""} placeholder="Bijv. Lisa of coaching" type="search" maxLength={100} />
            </div>
            <div className={`field ${styles.customerFilterField}`}>
              <label className="field-label" htmlFor="lead-status">Status</label>
              <select className="field-control" id="lead-status" name="status" defaultValue={query.status ?? "all"}>
                {statusFilters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
              </select>
            </div>
            <div className={styles.customerFilterActions}>
              <button className="button button-secondary" type="submit">Filter toepassen</button>
              {hasFilters ? <Link className="button button-secondary" href="/leads">Reset</Link> : null}
            </div>
          </form>
          <p className={styles.customerResultCount} aria-live="polite">
            {data.items.length} {data.items.length === 1 ? "aanvraag" : "aanvragen"} op deze pagina
            {hasFilters ? " · filters actief" : ""}
          </p>
        </div>

        <div className="section-heading">
          <h2 id="leads-list-title">Aanvragen</h2>
          <p>De lijst toont alleen velden die de CRM-readbron beschikbaar maakt.</p>
        </div>

        {empty ? (
          hasFilters ? (
            <div className="card empty-state">
              <h3>Geen aanvragen gevonden</h3>
              <p>Pas je zoekterm of statusfilter aan om opnieuw te zoeken.</p>
              <Link className="button button-secondary" href="/leads">Toon alle aanvragen</Link>
            </div>
          ) : (
            <EmptyState title="Nog geen CRM-aanvragen" message="Er is nog geen CRM-bron gekoppeld of er zijn nog geen leads beschikbaar. Daarom tonen we geen aantallen als nul." />
          )
        ) : (
          <div className={styles.customerTableWrap} role="region" aria-label="Leads en contacten" tabIndex={0}>
            <table className={styles.customerTable}>
              <caption className="visually-hidden">CRM-leads en contacten</caption>
              <thead><tr><th scope="col">Contact</th><th scope="col">Bericht</th><th scope="col">Bron</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Actie</span></th></tr></thead>
              <tbody>{data.items.map((lead) => <LeadRow key={lead.id} lead={lead} />)}</tbody>
            </table>
          </div>
        )}

        {data.next_cursor ? (
          <nav className="customer-pagination" aria-label="Leads paginering">
            <Link className="button button-secondary" href={buildLeadsHref(query, data.next_cursor)}>Volgende pagina →</Link>
          </nav>
        ) : null}
      </section>
    </CustomerPage>
  );
}

function LeadRow({ lead }: { lead: LeadRecord }) {
  return (
    <tr>
      <td data-label="Contact"><span className={styles.customerTableCellContent}><strong>{lead.name}</strong><span className={styles.customerTableMuted}>{lead.email}</span></span></td>
      <td data-label="Bericht"><span className={styles.customerTableCellContent}><span>{lead.message}</span><span className={styles.customerTableMuted}>{formatDate(lead.created_at)}</span></span></td>
      <td data-label="Bron">{lead.source}</td>
      <td data-label="Status"><StatusBadge>{formatStatus(lead.status)}</StatusBadge></td>
      <td data-label="Actie"><Link className={styles.customerTableLink} href={`/leads/${lead.id}`}>Open →</Link></td>
    </tr>
  );
}

function LeadsLoading() {
  return <section className="ui-state-container ui-state-loading" role="status" aria-live="polite" aria-busy="true"><h1 className="ui-state-heading">Leads worden geladen</h1><p className="ui-state-message">We halen de CRM-aanvragen van deze klantomgeving op.</p><div className="ui-state-skeleton" aria-hidden="true"><span className="ui-state-skeleton-line ui-state-skeleton-line-short" /><div className="ui-state-skeleton-grid"><span className="ui-state-skeleton-card" /><span className="ui-state-skeleton-card" /><span className="ui-state-skeleton-card" /></div></div></section>;
}

function submitFilters(event: React.FormEvent<HTMLFormElement>, router: ReturnType<typeof useRouter>) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const params = new URLSearchParams();
  const q = String(form.get("q") ?? "").trim();
  const status = String(form.get("status") ?? "all");
  if (q) params.set("q", q.slice(0, 100));
  if (status !== "all" && status === "new") params.set("status", status);
  router.push(params.toString() ? `/leads?${params.toString()}` : "/leads");
}

function buildLeadsHref(query: LeadQuery, cursor: string): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.limit) params.set("limit", query.limit);
  params.set("cursor", cursor);
  return `/leads?${params.toString()}`;
}

function formatStatus(status: string): string {
  if (status === "new") return "Nieuw";
  return status.replaceAll("_", " ");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
