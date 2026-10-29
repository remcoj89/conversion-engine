"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ForbiddenState, UnauthenticatedState, UnavailableState } from "../../../ui-states";
import { parseLeadDetailResponseResult, type LeadRecord } from "../../../../lib/bff/leads";
import { useWorkspaceContext } from "../../../workspace-context";
import { CustomerPage, StatusBadge } from "../../customer-ui";
import styles from "../../customer.module.css";

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; lead: LeadRecord }
  | { kind: "unauthenticated" | "forbidden" | "not_found" | "unavailable" };

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
              <StatusBadge>{formatStatus(lead.status)}</StatusBadge>
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
      </div>
    </CustomerPage>
  );
}

function DetailLoading() {
  return <section className="ui-state-container ui-state-loading" role="status" aria-live="polite" aria-busy="true"><h1 className="ui-state-heading">Leaddetail wordt geladen</h1><p className="ui-state-message">We halen de CRM-gegevens op.</p></section>;
}

function LeadNotFound() {
  return <section className="ui-state-container ui-state-empty" role="alert" aria-live="assertive"><h1 className="ui-state-heading">Lead niet gevonden</h1><p className="ui-state-message">Deze lead bestaat niet in de gekozen klantomgeving of is niet beschikbaar.</p><Link className="button button-primary ui-state-action" href="/leads">Terug naar leads</Link></section>;
}

function formatStatus(status: string): string {
  if (status === "new") return "Nieuw";
  return status.replaceAll("_", " ");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
