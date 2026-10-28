import Link from "next/link";
import { AdminBadge, AdminDemoFooter, AdminNotice, AdminPageHeader, AdminSection } from "../admin-components";
import { adminWebsites } from "../admin-data";

export default function AdminWebsitesPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Websites"
        description="Volg websiteversies, omgevingen en de menselijke gates voor staging, QA en livegang."
        actions={<Link href="/admin/monitoring" className="button button-secondary">Open monitoring</Link>}
      />

      <AdminNotice tone="info">
        De Conversion Engine bewaart productie-input en gatebesluiten. Websitecode, tests en deployment blijven in het geïsoleerde klantproject; deze demo publiceert niets.
      </AdminNotice>

      <AdminSection title="Websiteportfolio" description="Een compact overzicht van de huidige demo-omgevingen.">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="visually-hidden">Websiteportfolio</caption>
            <thead>
              <tr>
                <th scope="col">Klant</th>
                <th scope="col">Domein</th>
                <th scope="col">Omgeving</th>
                <th scope="col">Versie</th>
                <th scope="col">Gate</th>
                <th scope="col">Laatste controle</th>
              </tr>
            </thead>
            <tbody>
              {adminWebsites.map((website) => (
                <tr key={website.domain}>
                  <td data-label="Klant"><strong>{website.client}</strong></td>
                  <td data-label="Domein"><span className="admin-mono">{website.domain}</span></td>
                  <td data-label="Omgeving"><AdminBadge tone={website.environment === "Live" ? "success" : website.environment === "Staging" ? "info" : "neutral"}>{website.environment}</AdminBadge></td>
                  <td data-label="Versie">{website.version}</td>
                  <td data-label="Gate"><AdminBadge tone={website.tone}>{website.gate}</AdminBadge></td>
                  <td data-label="Laatste controle">{website.lastCheck}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>

      <AdminSection title="Productieprincipes" description="De punten die vóór een vrijgave zichtbaar en herleidbaar moeten blijven.">
        <div className="admin-principle-grid">
          <div className="card admin-principle-card"><strong>Versioneerbare input</strong><span>Project Brief, design baseline, change set en productieprompt vormen één herleidbare keten.</span></div>
          <div className="card admin-principle-card"><strong>Gescheiden gates</strong><span>Strategie, staging, QA en klantakkoord zijn geen éénstapsgoedkeuring.</span></div>
          <div className="card admin-principle-card"><strong>Geen stille deployment</strong><span>Een demo-actie of AI-suggestie publiceert nooit zelfstandig naar productie.</span></div>
        </div>
      </AdminSection>

      <AdminDemoFooter />
    </div>
  );
}
