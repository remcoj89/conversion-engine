import Link from "next/link";
import { AdminBadge, AdminDemoFooter, AdminNotice, AdminPageHeader, AdminSection, AdminStat } from "../admin-components";
import { adminClients, adminOperations } from "../admin-data";

type SearchParamValue = string | string[] | undefined;

type AdminClientsPageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>>;
};

function firstSearchParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export async function AdminClientsOverview({ searchParams, basePath = "/admin" }: AdminClientsPageProps & { basePath?: string }) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = firstSearchParam(resolvedSearchParams.q)?.trim().toLowerCase() ?? "";
  const selectedStatus = firstSearchParam(resolvedSearchParams.status) ?? "all";
  const selectedOnboarding = firstSearchParam(resolvedSearchParams.onboarding) ?? "all";

  const filteredClients = adminClients.filter((client) => {
    const matchesQuery = query.length === 0
      || client.name.toLowerCase().includes(query)
      || client.industry.toLowerCase().includes(query)
      || client.owner.toLowerCase().includes(query)
      || client.website.toLowerCase().includes(query);
    const matchesStatus = selectedStatus === "all" || client.statusKey === selectedStatus;
    const matchesOnboarding = selectedOnboarding === "all" || client.onboardingKey === selectedOnboarding;

    return matchesQuery && matchesStatus && matchesOnboarding;
  });

  const activeWebsiteCount = adminClients.filter((client) => client.websiteEnvironment === "Live").length;
  const attentionCount = adminClients.filter((client) =>
    client.statusKey === "review" || client.statusKey === "onboarding" || client.monitoringTone === "warning",
  ).length;
  const reviewCount = adminClients.filter((client) => client.statusKey === "review").length;

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Westend beheeromgeving · Klanten & projecten"
        title="Klantenoverzicht"
        description="Start bij de klantcontext: status, onboarding, website en de eerstvolgende beheeractie per tenant."
        actions={<Link href="/admin/review" className="button button-primary">Open review queue</Link>}
      />

      <div className="admin-stat-grid">
        <AdminStat label="Alle klanten" value={String(adminClients.length)} detail="Fictieve tenants in demo" tone="info" />
        <AdminStat label="Live websites" value={String(activeWebsiteCount)} detail="Websiteomgeving actief" tone="success" />
        <AdminStat label="Aandacht nodig" value={String(attentionCount)} detail="Review, onboarding of incident" tone="warning" />
        <AdminStat label="Review queue" value={String(reviewCount)} detail="Klant met open aanvulling" tone="info" />
      </div>

      <AdminNotice tone="info">
        <strong>Demo-omgeving.</strong> Deze klantcontext gebruikt fictieve gegevens. De routes tonen de beheerflow, maar voeren geen autorisatie-, review-, support- of deploymentactie uit.
      </AdminNotice>

      <AdminSection title="Alle klanten" description="Zoek op klant, branche, eigenaar of domein en open daarna het klantdetail.">
        <form className="admin-filter-bar" method="get" aria-label="Klantfilters">
          <div className="admin-filter-field admin-filter-field-search">
            <label htmlFor="client-query">Zoeken</label>
            <input id="client-query" name="q" type="search" placeholder="Bijv. Northline of fysiotherapie" defaultValue={firstSearchParam(resolvedSearchParams.q)} />
          </div>
          <div className="admin-filter-field">
            <label htmlFor="client-status">Klantstatus</label>
            <select id="client-status" name="status" defaultValue={selectedStatus}>
              <option value="all">Alle statussen</option>
              <option value="active">Actief</option>
              <option value="review">In review</option>
              <option value="onboarding">Onboarding</option>
              <option value="monitoring">Monitoring</option>
            </select>
          </div>
          <div className="admin-filter-field">
            <label htmlFor="client-onboarding">Onboarding</label>
            <select id="client-onboarding" name="onboarding" defaultValue={selectedOnboarding}>
              <option value="all">Alle fasen</option>
              <option value="submitted">Ingediend</option>
              <option value="review-needed">Aanvulling nodig</option>
              <option value="in-progress">In uitvoering</option>
              <option value="approved">Goedgekeurd</option>
            </select>
          </div>
          <div className="admin-filter-actions">
            <button type="submit" className="button button-secondary button-small">Toon klanten</button>
            <Link href={basePath} className="button button-secondary button-small">Wis filters</Link>
          </div>
        </form>

        <p className="admin-filter-result" aria-live="polite">
          {filteredClients.length} van {adminClients.length} klanten zichtbaar
          {query ? ` voor “${firstSearchParam(resolvedSearchParams.q)}”` : ""}.
        </p>

        {filteredClients.length > 0 ? (
          <div className="admin-table-wrap admin-client-table-wrap">
            <table className="admin-table admin-client-table">
              <caption className="visually-hidden">Klanten en projecten</caption>
              <thead>
                <tr>
                  <th scope="col">Klant</th>
                  <th scope="col">Status</th>
                  <th scope="col">Onboarding</th>
                  <th scope="col">Website</th>
                  <th scope="col">Monitoring</th>
                  <th scope="col">Eigenaar</th>
                  <th scope="col">Bijgewerkt</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr key={client.id}>
                    <td data-label="Klant">
                      <div className="admin-table-client">
                        <Link href={`/admin/clients/${client.id}`} className="admin-table-link">
                          <strong>{client.name}</strong>
                          <span>{client.industry}</span>
                        </Link>
                        <Link href={`/admin/clients/${client.id}`} className="admin-table-link admin-table-action-link">Bekijk detail →</Link>
                      </div>
                    </td>
                    <td data-label="Status"><AdminBadge tone={client.statusTone}>{client.status}</AdminBadge></td>
                    <td data-label="Onboarding">
                      <div className="admin-table-cell-stack">
                        <strong>{client.onboarding}</strong>
                        <span className="admin-table-subtext">{client.onboardingProgress}</span>
                      </div>
                    </td>
                    <td data-label="Website">
                      <div className="admin-table-cell-stack">
                        <span className="admin-mono">{client.website}</span>
                        <span className="admin-table-subtext">{client.websiteEnvironment} · {client.websiteGate}</span>
                      </div>
                    </td>
                    <td data-label="Monitoring">
                      <div className="admin-table-cell-stack">
                        <AdminBadge tone={client.monitoringTone}>{client.monitoringStatus}</AdminBadge>
                        <span className="admin-table-subtext">{client.monitoringDetail}</span>
                      </div>
                    </td>
                    <td data-label="Eigenaar">{client.owner}</td>
                    <td data-label="Bijgewerkt">{client.updatedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card admin-empty-state">
            <strong>Geen klanten gevonden</strong>
            <span>Pas je zoekterm of filters aan om een klantdetail te openen.</span>
            <Link href={basePath} className="button button-secondary button-small">Toon alle klanten</Link>
          </div>
        )}
      </AdminSection>

      <AdminSection title="Aandacht vandaag" description="Snelle links naar bestaande Westend-beheeronderdelen; klantacties blijven in het detail gescheiden.">
        <div className="admin-operation-list">
          {adminOperations.map((operation) => (
            <Link key={operation.title} href={operation.href} className="admin-operation-item">
              <div>
                <strong>{operation.title}</strong>
                <span>{operation.detail}</span>
              </div>
              <AdminBadge tone={operation.tone}>{operation.status}</AdminBadge>
            </Link>
          ))}
        </div>
      </AdminSection>

      <AdminNotice tone="warning">
        Nieuwe accounts en reviewer-toewijzingen lopen in productie via gecontroleerde provisioning. Deze frontend maakt geen account aan en wijzigt geen autorisaties.
      </AdminNotice>
      <AdminDemoFooter />
    </div>
  );
}

export default function AdminClientsPage(props: AdminClientsPageProps) {
  return <AdminClientsOverview {...props} basePath="/admin/clients" />;
}
