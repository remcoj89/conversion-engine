import Link from "next/link";
import {
  ForbiddenState,
  UnauthenticatedState,
  UnavailableState,
} from "../../ui-states";
import { AdminBadge, AdminNotice, AdminPageHeader, AdminSection, AdminStat } from "../admin-components";
import { mapPlatformTenantList, type AdminTenantRow } from "../../../lib/admin/platformTenantMapping";
import {
  type PlatformTenantListResult,
  type PlatformTenantQuery,
} from "../../../lib/bff/platformTenants";
import { readPlatformTenantList } from "../../../lib/bff/platformTenantsServer";
import { CreateClientForm } from "./admin-client-actions";

type SearchParamValue = string | string[] | undefined;
type SearchParams = Record<string, SearchParamValue>;

const accountStatusFilters = new Set(["pending", "active", "disabled"]);
const onboardingStatusFilters = new Set([
  "not_started",
  "draft",
  "submitted",
  "review_needed",
  "blocked",
  "approved",
]);

export type AdminClientsPageState =
  | "ready"
  | "empty"
  | "unauthenticated"
  | "forbidden"
  | "unavailable";

export type AdminClientsPageProps = Readonly<{
  searchParams?: Promise<SearchParams>;
}>;

export function parseAdminClientsQuery(searchParams: SearchParams): PlatformTenantQuery {
  const query = firstSearchParam(searchParams.q)?.trim();
  const status = firstSearchParam(searchParams.status);
  const onboardingStatus = firstSearchParam(searchParams.onboarding_status);
  const limit = firstSearchParam(searchParams.limit);
  const cursor = firstSearchParam(searchParams.cursor)?.trim();

  return {
    ...(query ? { q: query } : {}),
    ...(status && accountStatusFilters.has(status) ? { status } : {}),
    ...(onboardingStatus && onboardingStatusFilters.has(onboardingStatus)
      ? { onboarding_status: onboardingStatus }
      : {}),
    ...(limit && /^(?:[1-9]|[1-4][0-9]|50)$/.test(limit) ? { limit } : { limit: "25" }),
    ...(cursor ? { cursor } : {}),
  };
}

export function buildAdminClientsHref(
  query: PlatformTenantQuery,
  overrides: Readonly<{ cursor?: string | null }> = {},
): string {
  const params = new URLSearchParams();
  for (const key of ["q", "status", "onboarding_status", "limit"] as const) {
    const value = query[key];
    if (value) params.set(key, value);
  }

  const cursor = overrides.cursor === undefined ? query.cursor : overrides.cursor;
  if (cursor) params.set("cursor", cursor);

  const queryString = params.toString();
  return queryString ? `/admin/clients?${queryString}` : "/admin/clients";
}

export function getAdminClientsPageState(result: PlatformTenantListResult): AdminClientsPageState {
  if (result.status === "unauthenticated") return "unauthenticated";
  if (result.status === "forbidden") return "forbidden";
  if (result.status !== "ready") return "unavailable";
  return result.data.items.length === 0 ? "empty" : "ready";
}

export default async function AdminClientsPage({ searchParams }: AdminClientsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = parseAdminClientsQuery(resolvedSearchParams);
  const result = await readPlatformTenantList(query);
  const state = getAdminClientsPageState(result);

  if (state === "unauthenticated") {
    return <UnauthenticatedState message="Meld je aan om de Westend klantenlijst te bekijken." />;
  }
  if (state === "forbidden") {
    return <ForbiddenState message="Je account heeft geen Platform Admin-recht voor de Westend klantenlijst." />;
  }
  if (state === "unavailable") {
    return <UnavailableState />;
  }

  if (result.status !== "ready") {
    return <UnavailableState />;
  }

  return <AdminClientsPageLayout query={query} result={result} />;
}

function AdminClientsPageLayout({
  query,
  result,
}: Readonly<{
  query: PlatformTenantQuery;
  result: Extract<PlatformTenantListResult, { status: "ready" }>;
}>) {
  const rows = mapPlatformTenantList(result.data);
  const activeCount = result.data.items.filter((tenant) => tenant.status === "active").length;
  const activeWebsiteCount = result.data.items.reduce(
    (count, tenant) => count + (tenant.website_summary?.active ?? 0),
    0,
  );
  const hasFilters = Boolean(query.q || query.status || query.onboarding_status);

  return (
    <div className="admin-page">
      <nav className="admin-breadcrumb" aria-label="Kruimelpad">
        <span>Westend beheer</span>
        <span aria-hidden="true">/</span>
        <strong>Klanten</strong>
      </nav>

      <AdminPageHeader
        eyebrow="Westend beheer · Platform Admin"
        title="Klanten"
        description="Bekijk operationele status, onboarding en websitekoppelingen per klant. Deze lijst toont alleen metadata die de backend betrouwbaar beschikbaar maakt."
        actions={<CreateClientForm />}
      />

      <div className="admin-stat-grid">
        <AdminStat label="Resultaten" value={String(rows.length)} detail="Op deze pagina" tone="info" />
        <AdminStat label="Actieve klanten" value={String(activeCount)} detail="Operationele status" tone="success" />
        <AdminStat label="Actieve websites" value={String(activeWebsiteCount)} detail="Op deze pagina" tone="success" />
        <AdminStat label="Paginering" value={result.data.next_cursor ? "Volgende" : "Laatste"} detail="Server-side cursor" tone="neutral" />
      </div>

      <AdminNotice tone="info">
        <strong>Live klantdata.</strong> Je kunt hier tenants aanmaken. Interne reviewinhoud, klantantwoorden en klant-CRM blijven buiten deze route.
      </AdminNotice>

      <AdminSection title="Klanten zoeken" description="Zoek op klantnaam en filter server-side op account- of onboardingstatus.">
        <form className="admin-filter-bar" method="get" aria-label="Klantfilters">
          <div className="admin-filter-field admin-filter-field-search">
            <label htmlFor="client-query">Klantnaam</label>
            <input
              id="client-query"
              name="q"
              type="search"
              placeholder="Bijv. Northline"
              defaultValue={query.q ?? ""}
            />
          </div>
          <div className="admin-filter-field">
            <label htmlFor="client-status">Accountstatus</label>
            <select id="client-status" name="status" defaultValue={query.status ?? "all"}>
              <option value="all">Alle statussen</option>
              <option value="pending">In afwachting</option>
              <option value="active">Actief</option>
              <option value="disabled">Inactief</option>
            </select>
          </div>
          <div className="admin-filter-field">
            <label htmlFor="client-onboarding-status">Onboardingstatus</label>
            <select
              id="client-onboarding-status"
              name="onboarding_status"
              defaultValue={query.onboarding_status ?? "all"}
            >
              <option value="all">Alle statussen</option>
              <option value="not_started">Niet gestart</option>
              <option value="draft">In voorbereiding</option>
              <option value="submitted">Ingediend</option>
              <option value="review_needed">Aanvulling nodig</option>
              <option value="blocked">Geblokkeerd</option>
              <option value="approved">Goedgekeurd</option>
            </select>
          </div>
          <div className="admin-filter-actions">
            <button type="submit" className="button button-secondary button-small">Toon klanten</button>
            <Link href="/admin/clients" className="button button-secondary button-small">Wis filters</Link>
          </div>
        </form>

        <p className="admin-filter-result" aria-live="polite">
          {rows.length} {rows.length === 1 ? "klant" : "klanten"} op deze pagina
          {hasFilters ? " · filters actief" : ""}.
        </p>

        {rows.length === 0 ? (
          <div className="card admin-empty-state">
            <strong>{hasFilters ? "Geen klanten gevonden" : "Nog geen klanten beschikbaar"}</strong>
            <span>
              {hasFilters
                ? "Pas je zoekterm of filters aan om opnieuw te zoeken."
                : "Er zijn nog geen actieve klantgegevens beschikbaar in de Platform Admin-bron."}
            </span>
            {hasFilters ? <Link href="/admin/clients" className="button button-secondary button-small">Wis filters</Link> : null}
          </div>
        ) : (
          <>
            <div className="admin-table-wrap admin-desktop-client-table">
              <table className="admin-table admin-client-table">
                <caption className="visually-hidden">Klantenoverzicht</caption>
                <thead>
                  <tr>
                    <th scope="col">Klant</th>
                    <th scope="col">Accountstatus</th>
                    <th scope="col">Onboarding</th>
                    <th scope="col">Websites</th>
                    <th scope="col">Aangemaakt</th>
                    <th scope="col">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => <AdminClientTableRow key={row.id} row={row} />)}
                </tbody>
              </table>
            </div>

            <div className="admin-mobile-client-list" aria-label="Klantenoverzicht mobiel">
              {rows.map((row) => <AdminClientCard key={row.id} row={row} />)}
            </div>
          </>
        )}

        {result.data.next_cursor ? (
          <nav className="admin-pagination" aria-label="Klantenpaginering">
            <Link
              href={buildAdminClientsHref(query, { cursor: result.data.next_cursor })}
              className="button button-secondary button-small"
            >
              Volgende pagina →
            </Link>
          </nav>
        ) : null}
      </AdminSection>
    </div>
  );
}

function AdminClientTableRow({ row }: { row: AdminTenantRow }) {
  return (
    <tr>
      <td>
        <div className="admin-table-client">
          <Link
            href={`/admin/clients/${row.id}`}
            className="admin-table-link"
            aria-label={`Bekijk klantdetail van ${row.name}`}
          >
            <strong>{row.name}</strong>
            <span className="admin-mono">{row.id}</span>
          </Link>
        </div>
      </td>
      <td><AdminBadge tone={row.accountStatusTone}>{row.accountStatus}</AdminBadge></td>
      <td>
        <div className="admin-table-cell-stack">
          <strong>{row.onboardingStatus}</strong>
          <span className="admin-table-subtext">{row.onboardingMeta}</span>
        </div>
      </td>
      <td><AdminBadge tone={row.websiteStatusTone}>{row.websiteStatus}</AdminBadge></td>
      <td><time dateTime={row.createdAtIso}>{row.createdAt}</time></td>
      <td>
        <Link
          href={`/admin/clients/${row.id}`}
          className="button button-secondary button-small admin-table-action-link"
        >
          Bekijk detail
        </Link>
      </td>
    </tr>
  );
}

function AdminClientCard({ row }: { row: AdminTenantRow }) {
  return (
    <article className="card admin-client-card">
      <div className="admin-client-card-heading">
        <Link
          href={`/admin/clients/${row.id}`}
          className="admin-client-card-link"
          aria-label={`Bekijk klantdetail van ${row.name}`}
        >
          <h3>{row.name}</h3>
          <span className="admin-mono">{row.id}</span>
        </Link>
        <AdminBadge tone={row.accountStatusTone}>{row.accountStatus}</AdminBadge>
      </div>
      <dl className="admin-client-card-details">
        <div>
          <dt>Onboarding</dt>
          <dd>
            <AdminBadge tone={row.onboardingStatusTone}>{row.onboardingStatus}</AdminBadge>
            <span>{row.onboardingMeta}</span>
          </dd>
        </div>
        <div>
          <dt>Websites</dt>
          <dd><AdminBadge tone={row.websiteStatusTone}>{row.websiteStatus}</AdminBadge></dd>
        </div>
        <div>
          <dt>Aangemaakt</dt>
          <dd><time dateTime={row.createdAtIso}>{row.createdAt}</time></dd>
        </div>
      </dl>
      <div className="admin-client-card-footer">
        <Link href={`/admin/clients/${row.id}`} className="button button-secondary button-small">
          Bekijk klantdetail →
        </Link>
      </div>
    </article>
  );
}

function firstSearchParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
