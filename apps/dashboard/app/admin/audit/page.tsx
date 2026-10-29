import Link from "next/link";
import {
  ForbiddenState,
  UnauthenticatedState,
  UnavailableState,
} from "../../ui-states";
import { AdminBadge, AdminNotice, AdminPageHeader, AdminSection, AdminStat } from "../admin-components";
import {
  type PlatformAuditEvent,
  type PlatformAuditEventListResponse,
  type PlatformAuditEventQuery,
  type PlatformAuditEventListResult,
} from "../../../lib/bff/platformAuditEvents";
import { readPlatformAuditEvents } from "../../../lib/bff/platformAuditEventsServer";

type SearchParamValue = string | string[] | undefined;
type SearchParams = Record<string, SearchParamValue>;

const auditEventTypes = new Set([
  "submitted",
  "review_requested",
  "resubmitted",
  "blocked",
  "unblocked",
  "approved",
  "reopened",
  "read_onboarding_content",
]);
const auditEventTypeOptions = [
  ["submitted", "Ingediend"],
  ["review_requested", "Wijziging gevraagd"],
  ["resubmitted", "Opnieuw ingediend"],
  ["blocked", "Geblokkeerd"],
  ["unblocked", "Blokkade opgeheven"],
  ["approved", "Goedgekeurd"],
  ["reopened", "Heropend"],
  ["read_onboarding_content", "Reviewerinzage"],
] as const;
const statusLabels: Record<string, string> = {
  draft: "Concept",
  submitted: "Ingediend",
  review_needed: "Aanvulling nodig",
  blocked: "Geblokkeerd",
  approved: "Goedgekeurd",
};
const eventLabels: Record<string, string> = Object.fromEntries(auditEventTypeOptions) as Record<string, string>;

export type AdminAuditPageState = "ready" | "empty" | "unauthenticated" | "forbidden" | "unavailable";

export type AdminAuditPageProps = Readonly<{
  searchParams?: Promise<SearchParams>;
}>;

export function parseAdminAuditQuery(searchParams: SearchParams): PlatformAuditEventQuery {
  const tenantId = firstSearchParam(searchParams.tenant_id)?.trim();
  const eventType = firstSearchParam(searchParams.event_type);
  const from = firstSearchParam(searchParams.from)?.trim();
  const to = firstSearchParam(searchParams.to)?.trim();
  const limit = firstSearchParam(searchParams.limit);
  const cursor = firstSearchParam(searchParams.cursor)?.trim();

  return {
    ...(tenantId && isUuid(tenantId) ? { tenant_id: tenantId } : {}),
    ...(eventType && auditEventTypes.has(eventType) ? { event_type: eventType } : {}),
    ...(from && isValidDateString(from) ? { from } : {}),
    ...(to && isValidDateString(to) ? { to } : {}),
    ...(limit && /^(?:[1-9]|[1-4][0-9]|50)$/.test(limit) ? { limit } : { limit: "25" }),
    ...(cursor && cursor.length <= 512 && /^[A-Za-z0-9_-]+$/.test(cursor) ? { cursor } : {}),
  };
}

export function buildAdminAuditHref(
  query: PlatformAuditEventQuery,
  overrides: Readonly<{ cursor?: string | null }> = {},
): string {
  const params = new URLSearchParams();
  for (const key of ["tenant_id", "event_type", "from", "to", "limit"] as const) {
    const value = query[key];
    if (value) params.set(key, value);
  }

  const cursor = overrides.cursor === undefined ? query.cursor : overrides.cursor;
  if (cursor) params.set("cursor", cursor);

  const queryString = params.toString();
  return queryString ? `/admin/audit?${queryString}` : "/admin/audit";
}

export function getAdminAuditPageState(result: PlatformAuditEventListResult): AdminAuditPageState {
  if (result.status === "unauthenticated") return "unauthenticated";
  if (result.status === "forbidden") return "forbidden";
  if (result.status !== "ready") return "unavailable";
  return result.data.items.length === 0 ? "empty" : "ready";
}

export default async function AdminAuditPage({ searchParams }: AdminAuditPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = parseAdminAuditQuery(resolvedSearchParams);
  const result = await readPlatformAuditEvents(query);
  const state = getAdminAuditPageState(result);

  if (state === "unauthenticated") {
    return <UnauthenticatedState message="Meld je aan om het Westend audit-dashboard te bekijken." />;
  }
  if (state === "forbidden") {
    return <ForbiddenState message="Je account heeft geen Platform Admin-recht voor het audit-dashboard." />;
  }
  if (state === "unavailable") {
    return <UnavailableState />;
  }
  if (result.status !== "ready") return <UnavailableState />;

  return <AdminAuditPageLayout query={query} data={result.data} />;
}

function AdminAuditPageLayout({
  query,
  data,
}: Readonly<{
  query: PlatformAuditEventQuery;
  data: PlatformAuditEventListResponse;
}>) {
  const statusEventCount = data.items.filter((event) => event.event_type !== "read_onboarding_content").length;
  const accessEventCount = data.items.length - statusEventCount;
  const hasFilters = Boolean(query.tenant_id || query.event_type || query.from || query.to);

  return (
    <div className="admin-page">
      <nav className="admin-breadcrumb" aria-label="Kruimelpad">
        <span>Westend beheer</span>
        <span aria-hidden="true">/</span>
        <strong>Audit &amp; versies</strong>
      </nav>

      <AdminPageHeader
        eyebrow="Westend beheer · Platform Admin"
        title="Audit & versies"
        description="Bekijk immutable statusovergangen en reviewerinzage als veilige metadata. Klantantwoorden, Project Brief-inhoud en reviewnotities worden nooit in deze feed getoond."
        actions={<Link href="/admin/clients" className="button button-secondary">Terug naar klanten</Link>}
      />

      <div className="admin-stat-grid">
        <AdminStat label="Events" value={String(data.items.length)} detail="Op deze pagina" tone="info" />
        <AdminStat label="Statusovergangen" value={String(statusEventCount)} detail="Immutable events" tone="success" />
        <AdminStat label="Reviewerinzage" value={String(accessEventCount)} detail="Inhoudsvrij gelogd" tone="warning" />
        <AdminStat label="Paginering" value={data.next_cursor ? "Volgende" : "Laatste"} detail="Server-side cursor" tone="neutral" />
      </div>

      <AdminNotice tone="info">
        <strong>Live auditmetadata.</strong> Deze read-only feed bevat alleen event-, status-, actor- en requestmetadata. Reviewerinzage-events tonen geen klantinhoud of vrije reviewtekst.
      </AdminNotice>

      <AdminSection title="Auditfilters" description="Filter server-side op tenant, eventtype en tijdsvenster. Tenantcontext komt nooit uit x-tenant-id.">
        <form className="admin-filter-bar" method="get" aria-label="Auditfilters">
          <div className="admin-filter-field admin-filter-field-search">
            <label htmlFor="audit-tenant">Tenant-ID</label>
            <input
              id="audit-tenant"
              name="tenant_id"
              type="search"
              inputMode="text"
              placeholder="UUID van tenant"
              defaultValue={query.tenant_id ?? ""}
            />
          </div>
          <div className="admin-filter-field">
            <label htmlFor="audit-event-type">Eventtype</label>
            <select id="audit-event-type" name="event_type" defaultValue={query.event_type ?? "all"}>
              <option value="all">Alle eventtypes</option>
              {auditEventTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="admin-filter-field">
            <label htmlFor="audit-from">Vanaf</label>
            <input id="audit-from" name="from" type="datetime-local" defaultValue={query.from ?? ""} />
          </div>
          <div className="admin-filter-field">
            <label htmlFor="audit-to">Tot en met</label>
            <input id="audit-to" name="to" type="datetime-local" defaultValue={query.to ?? ""} />
          </div>
          <div className="admin-filter-actions">
            <button type="submit" className="button button-secondary button-small">Toon events</button>
            <Link href="/admin/audit" className="button button-secondary button-small">Wis filters</Link>
          </div>
        </form>

        <p className="admin-filter-result" aria-live="polite">
          {data.items.length} {data.items.length === 1 ? "event" : "events"} op deze pagina
          {hasFilters ? " · filters actief" : ""}.
        </p>

        {data.items.length === 0 ? (
          <div className="card admin-empty-state">
            <strong>{hasFilters ? "Geen audit-events gevonden" : "Nog geen audit-events beschikbaar"}</strong>
            <span>
              {hasFilters
                ? "Pas het tenant-ID, eventtype of tijdsvenster aan om opnieuw te zoeken."
                : "Er zijn nog geen veilige auditmetadata beschikbaar in de Platform Admin-bron."}
            </span>
            {hasFilters ? <Link href="/admin/audit" className="button button-secondary button-small">Wis filters</Link> : null}
          </div>
        ) : (
          <AuditEventResults events={data.items} />
        )}

        {data.next_cursor ? (
          <nav className="admin-pagination" aria-label="Auditpaginering">
            <Link href={buildAdminAuditHref(query, { cursor: data.next_cursor })} className="button button-secondary button-small">
              Volgende pagina →
            </Link>
          </nav>
        ) : null}
      </AdminSection>
    </div>
  );
}

function AuditEventResults({ events }: { events: readonly PlatformAuditEvent[] }) {
  return (
    <>
      <div className="admin-table-wrap admin-desktop-audit-table">
        <table className="admin-table admin-audit-table">
          <caption className="visually-hidden">Live immutable audit-events</caption>
          <thead>
            <tr>
              <th scope="col">Tijdstip</th>
              <th scope="col">Event</th>
              <th scope="col">Tenant / project</th>
              <th scope="col">Statusovergang</th>
              <th scope="col">Actor</th>
              <th scope="col">Versie</th>
              <th scope="col">Request-ID</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => <AuditEventTableRow key={event.id} event={event} />)}
          </tbody>
        </table>
      </div>
      <div className="admin-audit-mobile-list" aria-label="Audit-events mobiel">
        {events.map((event) => <AuditEventCard key={event.id} event={event} />)}
      </div>
    </>
  );
}

function AuditEventTableRow({ event }: { event: PlatformAuditEvent }) {
  return (
    <tr>
      <td data-label="Tijdstip"><time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time></td>
      <td data-label="Event">
        <div className="admin-table-cell-stack">
          <strong>{eventLabels[event.event_type] ?? event.event_type}</strong>
          <span className="admin-table-subtext admin-mono">{event.event_type}</span>
        </div>
      </td>
      <td data-label="Tenant / project">
        <div className="admin-table-cell-stack">
          <span className="admin-mono">{event.tenant_id}</span>
          <span className="admin-table-subtext admin-mono">Project {event.project_id}</span>
        </div>
      </td>
      <td data-label="Statusovergang"><StatusTransition event={event} /></td>
      <td data-label="Actor"><ActorSummary event={event} /></td>
      <td data-label="Versie">{event.version === null ? "—" : <span className="admin-mono">v{event.version}</span>}</td>
      <td data-label="Request-ID"><RequestId value={event.request_or_correlation_id} /></td>
    </tr>
  );
}

function AuditEventCard({ event }: { event: PlatformAuditEvent }) {
  return (
    <article className="card admin-audit-card">
      <div className="admin-audit-card-heading">
        <div>
          <h3>{eventLabels[event.event_type] ?? event.event_type}</h3>
          <time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time>
        </div>
        <AdminBadge tone={event.event_type === "read_onboarding_content" ? "warning" : "info"}>
          {event.event_type === "read_onboarding_content" ? "Inzage" : "Status"}
        </AdminBadge>
      </div>
      <dl className="admin-audit-card-details">
        <div><dt>Tenant</dt><dd className="admin-mono">{event.tenant_id}</dd></div>
        <div><dt>Project</dt><dd className="admin-mono">{event.project_id}</dd></div>
        <div><dt>Status</dt><dd><StatusTransition event={event} /></dd></div>
        <div><dt>Actor</dt><dd><ActorSummary event={event} /></dd></div>
        <div><dt>Versie</dt><dd>{event.version === null ? "—" : `v${event.version}`}</dd></div>
        <div><dt>Request-ID</dt><dd><RequestId value={event.request_or_correlation_id} /></dd></div>
      </dl>
    </article>
  );
}

function StatusTransition({ event }: { event: PlatformAuditEvent }) {
  if (event.from_status === null && event.to_status === null) return <span>Inhoudsvrije inzage</span>;
  return <span>{statusLabels[event.from_status ?? ""] ?? "—"} → {statusLabels[event.to_status ?? ""] ?? "—"}</span>;
}

function ActorSummary({ event }: { event: PlatformAuditEvent }) {
  return (
    <div className="admin-table-cell-stack">
      <AdminBadge tone={event.actor_type === "reviewer" ? "warning" : "neutral"}>
        {event.actor_type === "reviewer" ? "Reviewer" : "Klantlid"}
      </AdminBadge>
      <span className="admin-table-subtext admin-mono">{event.actor_id ?? "ID niet beschikbaar"}</span>
    </div>
  );
}

function RequestId({ value }: { value: string | null }) {
  return <span className="admin-mono">{value ?? "—"}</span>;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}

function firstSearchParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidDateString(value: string): boolean {
  return value.length <= 64 && !Number.isNaN(Date.parse(value));
}
