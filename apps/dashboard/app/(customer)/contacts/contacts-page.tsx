"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkspaceFetch } from "../../../lib/session/context";
import { EmptyState, ForbiddenState, LoadingState, UnauthenticatedState, UnavailableState } from "../../ui-states";
import { useWorkspaceContext } from "../../workspace-context";
import { CrmHeader, CrmToolbar } from "../crm/crm-ui";
import { ArchiveButton, ContactFormDialog } from "../crm/crm-dialogs";
import { fetchContactsWithOptions, fetchOrganizationsWithOptions, type ContactRecord, type CrmFetchResult, type OrganizationRecord } from "../crm/crm-data";
import styles from "../customer.module.css";

type ContactsState = { status: "loading" } | { status: Exclude<CrmFetchResult<ContactRecord>["status"], "ready"> } | { status: "ready"; data: Extract<CrmFetchResult<ContactRecord>, { status: "ready" }>["data"] };

export default function ContactsPage() {
  const { fetch: workspaceFetch } = useWorkspaceContext();
  const [state, setState] = useState<ContactsState>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [organizations, setOrganizations] = useState<readonly OrganizationRecord[]>([]);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingContact, setEditingContact] = useState<ContactRecord | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const [contactsResult, organizationsResult] = await Promise.all([
        fetchContactsWithOptions(workspaceFetch, { includeArchived }),
        fetchOrganizationsWithOptions(workspaceFetch, { includeArchived: false }),
      ]);
      if (cancelled) return;
      setState(contactsResult.status === "ready" ? { status: "ready", data: contactsResult.data } : { status: contactsResult.status });
      setOrganizations(organizationsResult.status === "ready" ? organizationsResult.data.items : []);
    }

    void loadData();
    return () => { cancelled = true; };
  }, [includeArchived, reloadKey, workspaceFetch]);

  const filteredContacts = useMemo(() => {
    if (state.status !== "ready") return [];
    const query = search.trim().toLocaleLowerCase("nl-NL");
    return state.data.items.filter((contact) => {
      const matchesQuery = !query || [contact.name, contact.email, contact.function, contact.organization?.name].some((value) => value?.toLocaleLowerCase("nl-NL").includes(query));
      return matchesQuery;
    });
  }, [search, state]);

  function openCreateDialog() {
    setOperationMessage(null);
    setEditingContact(null);
    setDialogMode("create");
  }

  function openEditDialog(contact: ContactRecord) {
    setOperationMessage(null);
    setEditingContact(contact);
    setDialogMode("edit");
  }

  function handleSaved(message: string) {
    setOperationMessage(message);
    setReloadKey((value) => value + 1);
  }

  return (
    <CrmHeader title="Contactpersonen" intro="Bekijk de personen die aan deze klantomgeving zijn gekoppeld.">
      {state.status === "loading" ? <LoadingState title="Contactpersonen worden geladen" message="We halen de contactpersonenlijst op." /> : null}
      {state.status === "unauthenticated" ? <UnauthenticatedState message="Meld je aan om contactpersonen te bekijken." /> : null}
      {state.status === "forbidden" ? <ForbiddenState message="Je account heeft geen toegang tot contactpersonen in deze klantomgeving." /> : null}
      {state.status === "unavailable" ? <UnavailableState onRetry={() => { setState({ status: "loading" }); setReloadKey((value) => value + 1); }} /> : null}
      {state.status === "ready" ? (
        <section aria-labelledby="contacts-list-title">
          <CrmToolbar>
            <div className="field">
              <label className="field-label" htmlFor="contact-search">Zoek contactpersoon</label>
              <input className="field-control" id="contact-search" type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Naam, e-mail of functie" />
            </div>
            <p className={styles.crmListSummary} aria-live="polite">{filteredContacts.length} van {state.data.items.length} contactpersonen zichtbaar</p>
            <div className={styles.crmToolbarActions}>
              <label className={styles.crmArchiveToggle}><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.currentTarget.checked)} /> Toon gearchiveerde</label>
              <button className="button button-primary" type="button" onClick={openCreateDialog}>Contactpersoon toevoegen</button>
            </div>
          </CrmToolbar>
          {operationMessage ? <p className={styles.crmOperationSuccess} role="status" aria-live="polite">{operationMessage}</p> : null}
          <div className="section-heading">
            <h2 id="contacts-list-title">Contactpersonen</h2>
            <p>Een contactpersoon kan zelfstandig bestaan of aan een organisatie gekoppeld zijn.</p>
          </div>
          {state.data.items.length === 0 ? <div className={styles.crmEmptyWithAction}><EmptyState title="Nog geen contactpersonen" message="Er zijn nog geen contactpersonen beschikbaar in deze klantomgeving." /><button className="button button-primary" type="button" onClick={openCreateDialog}>Eerste contactpersoon toevoegen</button></div> : filteredContacts.length === 0 ? <div className="card empty-state"><h3>Geen contactpersonen gevonden</h3><p>Pas je zoekterm of organisatiefilter aan om opnieuw te zoeken.</p></div> : <ContactTable contacts={filteredContacts} fetcher={workspaceFetch} onEdit={openEditDialog} onArchived={handleSaved} onError={setOperationMessage} />}
        </section>
      ) : null}
      {dialogMode !== null ? <ContactFormDialog key={`${dialogMode}-${editingContact?.id ?? "new"}`} open record={dialogMode === "edit" ? editingContact : null} organizations={organizations} fetcher={workspaceFetch} onClose={() => setDialogMode(null)} onSaved={handleSaved} /> : null}
    </CrmHeader>
  );
}

function ContactTable({ contacts, fetcher, onEdit, onArchived, onError }: { contacts: readonly ContactRecord[]; fetcher: WorkspaceFetch; onEdit: (contact: ContactRecord) => void; onArchived: (message: string) => void; onError: (message: string) => void }) {
  return (
    <div className={styles.customerTableWrap} role="region" aria-label="Contactpersonen" tabIndex={0}>
      <table className={styles.customerTable}>
        <caption className="visually-hidden">Contactpersonen in de klantomgeving</caption>
        <thead><tr><th scope="col">Contactpersoon</th><th scope="col">Organisatie</th><th scope="col">Contactgegevens</th><th scope="col">Functie</th><th scope="col">Status</th><th scope="col">Acties</th></tr></thead>
        <tbody>{contacts.map((contact) => <tr key={contact.id}><td data-label="Contactpersoon"><strong>{contact.name}</strong></td><td data-label="Organisatie">{contact.organization?.name ?? (contact.organization ? "Gekoppelde organisatie" : "Geen organisatie")}</td><td data-label="Contactgegevens"><span className={styles.customerTableCellContent}><span>{contact.email ?? "E-mail niet opgegeven"}</span><span className={styles.customerTableMuted}>{contact.phone ?? "Telefoon niet opgegeven"}</span></span></td><td data-label="Functie">{contact.function ?? "Niet opgegeven"}</td><td data-label="Status">{formatStatus(contact.status)}</td><td data-label="Acties"><span className={styles.crmRowActions}>{contact.status === "active" ? <><button className="button button-secondary button-small" type="button" onClick={() => onEdit(contact)}>Bewerken</button><ArchiveButton label={`Contactpersoon ${contact.name}`} id={contact.id} fetcher={fetcher} kind="contact" onArchived={onArchived} onError={onError} /></> : <span className={styles.customerTableMuted}>Geen actieve acties</span>}</span></td></tr>)}</tbody>
      </table>
    </div>
  );
}

function formatStatus(status: ContactRecord["status"]): string {
  if (status === "active") return "Actief";
  if (status === "archived") return "Gearchiveerd";
  return "Onbekend";
}
