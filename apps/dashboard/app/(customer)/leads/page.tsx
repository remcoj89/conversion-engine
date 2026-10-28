import Link from "next/link";
import {
  leads,
  leadStatusLabels,
  leadStatusTones,
  type LeadStatus,
} from "../customer-data";
import { CustomerPage, DemoNotice, StatusBadge } from "../customer-ui";
import styles from "../customer.module.css";

const statusFilters: readonly { value: "all" | LeadStatus; label: string }[] = [
  { value: "all", label: "Alle statussen" },
  { value: "action", label: "Actie nodig" },
  { value: "appointment", label: "Afspraak" },
  { value: "new", label: "Nieuw" },
  { value: "human", label: "Handmatig" },
  { value: "done", label: "Afgehandeld" },
];

type LeadsSearchParams = Promise<{
  q?: string;
  status?: string;
}>;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: LeadsSearchParams;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const requestedStatus = params.status as "all" | LeadStatus | undefined;
  const status = statusFilters.some((filter) => filter.value === requestedStatus)
    ? requestedStatus ?? "all"
    : "all";

  const filteredLeads = leads.filter((lead) => {
    const matchesQuery = query.length === 0
      || `${lead.name} ${lead.company} ${lead.interest}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === "all" || lead.status === status;
    return matchesQuery && matchesStatus;
  });

  return (
    <CustomerPage
      current="leads"
      title="Leads & contacten"
      intro="Iedere aanvraag blijft traceerbaar; AI-status en opvolgstatus blijven afzonderlijk zichtbaar."
      actions={
        <Link className="button button-primary" href="/support">
          Vraag hulp bij opvolging
        </Link>
      }
    >
      <DemoNotice>
        Deze lijst gebruikt fictieve data. In productie komt de data tenantgebonden uit de CRM-bron.
      </DemoNotice>

      <section aria-labelledby="leads-list-title">
        <div className={styles.customerToolbar}>
          <form className={styles.customerFilterForm} method="get">
            <div className={`field ${styles.customerFilterField}`}>
              <label className="field-label" htmlFor="lead-search">
                Zoek contact of interesse
              </label>
              <input
                className="field-control"
                id="lead-search"
                name="q"
                defaultValue={query}
                placeholder="Bijv. Lisa of coaching"
                type="search"
              />
            </div>
            <div className={`field ${styles.customerFilterField}`}>
              <label className="field-label" htmlFor="lead-status">
                Status
              </label>
              <select className="field-control" id="lead-status" name="status" defaultValue={status}>
                {statusFilters.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.customerFilterActions}>
              <button className="button button-secondary" type="submit">
                Filter toepassen
              </button>
              {query || status !== "all" ? (
                <Link className="button button-secondary" href="/leads">
                  Reset
                </Link>
              ) : null}
            </div>
          </form>
          <p className={styles.customerResultCount} aria-live="polite">
            {filteredLeads.length} van {leads.length} aanvragen zichtbaar
          </p>
        </div>

        <div className="section-heading">
          <h2 id="leads-list-title">Aanvragen</h2>
          <p>Open een lead voor de volledige context, AI-status en tijdlijn.</p>
        </div>

        {filteredLeads.length > 0 ? (
          <div className={styles.customerTableWrap} role="region" aria-label="Leads en contacten" tabIndex={0}>
            <table className={styles.customerTable}>
              <thead>
                <tr>
                  <th scope="col">Contact</th>
                  <th scope="col">Interesse</th>
                  <th scope="col">Bron</th>
                  <th scope="col">Toegewezen aan</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="visually-hidden">Actie</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td data-label="Contact">
                      <span className={styles.customerTableCellContent}>
                        <strong>{lead.name}</strong>
                        <span className={styles.customerTableMuted}>{lead.created}</span>
                      </span>
                    </td>
                    <td data-label="Interesse">
                      <span className={styles.customerTableCellContent}>
                        <span>{lead.interest}</span>
                        <span className={styles.customerTableMuted}>{lead.company}</span>
                      </span>
                    </td>
                    <td data-label="Bron">{lead.source}</td>
                    <td data-label="Toegewezen aan">{lead.owner}</td>
                    <td data-label="Status">
                      <StatusBadge tone={leadStatusTones[lead.status]}>
                        {leadStatusLabels[lead.status]}
                      </StatusBadge>
                    </td>
                    <td data-label="Actie">
                      <Link className={styles.customerTableLink} href={`/leads/${lead.id}`}>
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card empty-state">
            <h3>Geen aanvragen gevonden</h3>
            <p>Pas de zoekterm of statusfilter aan om andere aanvragen te bekijken.</p>
            <Link className="button button-secondary" href="/leads">
              Toon alle aanvragen
            </Link>
          </div>
        )}
      </section>

      <section aria-labelledby="lead-separation-title">
        <div className="card">
          <div className={styles.customerCardContent}>
            <h2 id="lead-separation-title">Contacten en aanvragen</h2>
            <p>
              Een contact kan meerdere aanvragen en deals hebben. Deze lijst toont de aanvraag als afzonderlijk opvolgbaar record.
            </p>
          </div>
        </div>
      </section>
    </CustomerPage>
  );
}
