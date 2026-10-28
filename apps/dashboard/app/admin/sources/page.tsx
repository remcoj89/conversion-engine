import Link from "next/link";
import { AdminBadge, AdminDemoFooter, AdminNotice, AdminPageHeader, AdminSection } from "../admin-components";
import { adminSources } from "../admin-data";

export default function AdminSourcesPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Databronnen"
        description="Beheer de gecontroleerde broncontext voor analytics, zoekdata, gedragsinzichten en SEO."
        actions={<Link href="/admin/intelligence" className="button button-secondary">Naar intelligence</Link>}
      />

      <AdminNotice tone="warning">
        Bronverbindingen zijn tenantgebonden en mogen geen gegevens tussen klanten mengen. Deze pagina toont alleen de UX en demo-status; er worden geen echte tokens of synchronisaties beheerd.
      </AdminNotice>

      <AdminSection title="Bronoverzicht" description="Versheid en scope zijn zichtbaar voordat een bron als bewijs wordt gebruikt.">
        <div className="admin-source-grid">
          {adminSources.map((source) => (
            <article key={source.shortName} className="card admin-source-card">
              <div className="admin-source-mark" aria-hidden="true">{source.shortName}</div>
              <div className="admin-source-content">
                <div className="admin-card-heading">
                  <div>
                    <h3>{source.name}</h3>
                    <p>{source.scope}</p>
                  </div>
                  <AdminBadge tone={source.tone}>{source.status}</AdminBadge>
                </div>
                <dl className="admin-definition-list">
                  <div><dt>Laatste synchronisatie</dt><dd>{source.freshness}</dd></div>
                  <div><dt>Tenantgrens</dt><dd>Verplicht</dd></div>
                  <div><dt>Gebruik</dt><dd>Bronlabel bij elk inzicht</dd></div>
                </dl>
              </div>
            </article>
          ))}
        </div>
      </AdminSection>

      <AdminSection title="Bronregels" description="Minimale randvoorwaarden voor een betrouwbare analyse.">
        <div className="admin-rule-list">
          <div><strong>Versheid tonen</strong><span>Een rapport vermeldt altijd de laatste succesvolle synchronisatie.</span></div>
          <div><strong>Tenantgebonden toegang</strong><span>Een gebruiker ziet alleen bronnen waarvoor het project geautoriseerd is.</span></div>
          <div><strong>Geen bewijs zonder bron</strong><span>Een aanbeveling zonder herleidbare bron blijft een hypothese en geen besluit.</span></div>
        </div>
      </AdminSection>

      <AdminDemoFooter />
    </div>
  );
}
