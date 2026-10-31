"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkspaceFetch } from "../../../lib/session/context";
import { EmptyState, ForbiddenState, LoadingState, UnauthenticatedState, UnavailableState } from "../../ui-states";
import { useWorkspaceContext } from "../../workspace-context";
import { CrmHeader, CrmToolbar } from "../crm/crm-ui";
import { ArchiveButton, OrganizationFormDialog } from "../crm/crm-dialogs";
import { fetchOrganizationsWithOptions, type CrmFetchResult, type OrganizationRecord } from "../crm/crm-data";
import styles from "../customer.module.css";

type OrganizationsState = { status: "loading" } | { status: Exclude<CrmFetchResult<OrganizationRecord>["status"], "ready"> } | { status: "ready"; data: Extract<CrmFetchResult<OrganizationRecord>, { status: "ready" }>["data"] };

export default function OrganizationsPage() {
  const { fetch: workspaceFetch } = useWorkspaceContext();
  const [state, setState] = useState<OrganizationsState>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingOrganization, setEditingOrganization] = useState<OrganizationRecord | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOrganizations() {
      const result = await fetchOrganizationsWithOptions(workspaceFetch, { includeArchived });
      if (cancelled) return;
      setState(result.status === "ready" ? { status: "ready", data: result.data } : { status: result.status });
    }

    void loadOrganizations();
    return () => { cancelled = true; };
  }, [includeArchived, reloadKey, workspaceFetch]);

  const filteredOrganizations = useMemo(() => {
    if (state.status !== "ready") return [];
    const query = search.trim().toLocaleLowerCase("nl-NL");
    if (!query) return state.data.items;
    return state.data.items.filter((organization) => [organization.name, organization.email, organization.industry].some((value) => value?.toLocaleLowerCase("nl-NL").includes(query)));
  }, [search, state]);

  function openCreateDialog() {
    setOperationMessage(null);
    setEditingOrganization(null);
    setDialogMode("create");
  }

  function openEditDialog(organization: OrganizationRecord) {
    setOperationMessage(null);
    setEditingOrganization(organization);
    setDialogMode("edit");
  }

  function handleSaved(message: string) {
    setOperationMessage(message);
    setReloadKey((value) => value + 1);
  }

  return (
    <CrmHeader title="Organisaties" intro="Bekijk de organisaties die bij deze klantomgeving horen.">
      {state.status === "loading" ? <LoadingState title="Organisaties worden geladen" message="We halen de organisatieslijst op." /> : null}
      {state.status === "unauthenticated" ? <UnauthenticatedState message="Meld je aan om organisaties te bekijken." /> : null}
      {state.status === "forbidden" ? <ForbiddenState message="Je account heeft geen toegang tot organisaties in deze klantomgeving." /> : null}
      {state.status === "unavailable" ? <UnavailableState onRetry={() => { setState({ status: "loading" }); setReloadKey((value) => value + 1); }} /> : null}
      {state.status === "ready" ? (
        <section aria-labelledby="organizations-list-title">
          <CrmToolbar>
            <div className="field">
              <label className="field-label" htmlFor="organization-search">Zoek organisatie</label>
              <input className="field-control" id="organization-search" type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Naam, branche of e-mail" />
            </div>
            <p className={styles.crmListSummary} aria-live="polite">{filteredOrganizations.length} van {state.data.items.length} organisaties zichtbaar</p>
            <div className={styles.crmToolbarActions}>
              <label className={styles.crmArchiveToggle}><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.currentTarget.checked)} /> Toon gearchiveerde</label>
              <button className="button button-primary" type="button" onClick={openCreateDialog}>Organisatie toevoegen</button>
            </div>
          </CrmToolbar>
          {operationMessage ? <p className={styles.crmOperationSuccess} role="status" aria-live="polite">{operationMessage}</p> : null}
          <div className="section-heading">
            <h2 id="organizations-list-title">Organisaties</h2>
            <p>De lijst toont de organisaties die deze klantomgeving live beschikbaar maakt.</p>
          </div>
          {state.data.items.length === 0 ? <div className={styles.crmEmptyWithAction}><EmptyState title="Nog geen organisaties" message="Er zijn nog geen organisaties beschikbaar in deze klantomgeving." /><button className="button button-primary" type="button" onClick={openCreateDialog}>Eerste organisatie toevoegen</button></div> : filteredOrganizations.length === 0 ? <div className="card empty-state"><h3>Geen organisaties gevonden</h3><p>Pas je zoekterm aan om opnieuw te zoeken.</p></div> : <OrganizationTable organizations={filteredOrganizations} fetcher={workspaceFetch} onEdit={openEditDialog} onArchived={handleSaved} onError={setOperationMessage} />}
        </section>
      ) : null}
      {dialogMode !== null ? <OrganizationFormDialog key={`${dialogMode}-${editingOrganization?.id ?? "new"}`} open record={dialogMode === "edit" ? editingOrganization : null} fetcher={workspaceFetch} onClose={() => setDialogMode(null)} onSaved={handleSaved} /> : null}
    </CrmHeader>
  );
}

function OrganizationTable({ organizations, fetcher, onEdit, onArchived, onError }: { organizations: readonly OrganizationRecord[]; fetcher: WorkspaceFetch; onEdit: (organization: OrganizationRecord) => void; onArchived: (message: string) => void; onError: (message: string) => void }) {
  return (
    <div className={styles.customerTableWrap} role="region" aria-label="Organisaties" tabIndex={0}>
      <table className={styles.customerTable}>
        <caption className="visually-hidden">Organisaties in de klantomgeving</caption>
        <thead><tr><th scope="col">Organisatie</th><th scope="col">Contactgegevens</th><th scope="col">Branche</th><th scope="col">Contactpersonen</th><th scope="col">Status</th><th scope="col">Acties</th></tr></thead>
        <tbody>{organizations.map((organization) => <tr key={organization.id}><td data-label="Organisatie"><span className={styles.customerTableCellContent}><strong>{organization.name}</strong><span className={styles.customerTableMuted}>{organization.website ?? "Website niet opgegeven"}</span></span></td><td data-label="Contactgegevens"><span className={styles.customerTableCellContent}><span>{organization.email ?? "E-mail niet opgegeven"}</span><span className={styles.customerTableMuted}>{organization.phone ?? "Telefoon niet opgegeven"}</span></span></td><td data-label="Branche">{organization.industry ?? "Niet opgegeven"}</td><td data-label="Contactpersonen">{organization.contact_count ?? "—"}</td><td data-label="Status">{formatStatus(organization.status)}</td><td data-label="Acties"><span className={styles.crmRowActions}>{organization.status === "active" ? <><button className="button button-secondary button-small" type="button" onClick={() => onEdit(organization)}>Bewerken</button><ArchiveButton label={`Organisatie ${organization.name}`} id={organization.id} fetcher={fetcher} kind="organization" onArchived={onArchived} onError={onError} /></> : <span className={styles.customerTableMuted}>Geen actieve acties</span>}</span></td></tr>)}</tbody>
      </table>
    </div>
  );
}

function formatStatus(status: OrganizationRecord["status"]): string {
  if (status === "active") return "Actief";
  if (status === "archived") return "Gearchiveerd";
  return "Onbekend";
}
