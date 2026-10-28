import Link from "next/link";
import { AdminBadge, AdminDemoFooter, AdminNotice, AdminPageHeader, AdminSection, AdminStat } from "../admin-components";
import { adminAuditEvents } from "../admin-data";

export default function AdminAuditPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Audit & versies"
        description="Een leesbaar overzicht van onveranderlijke beslissingen, statusovergangen en broncontext per tenant en versie."
        actions={<Link href="/admin/review#project-brief" className="button button-secondary">Terug naar review</Link>}
      />

      <AdminNotice tone="warning">
        <strong>Fictief audit-overzicht.</strong> Deze events zijn demo-data, geïnspireerd op de bestaande Review Studio-tab Historie. In productie komen actor, tenant, versie, reden, tijdstip en bron server-side uit append-only audit-events.
      </AdminNotice>

      <div className="admin-stat-grid">
        <AdminStat label="Events in demo" value="5" detail="Allemaal immutable" tone="info" />
        <AdminStat label="Actieve tenants" value="4" detail="Tenantcontext zichtbaar" tone="success" />
        <AdminStat label="Reviewbesluiten" value="3" detail="Menselijke actor vereist" tone="warning" />
        <AdminStat label="Bronnen" value="3" detail="Review Studio, dashboard, monitoring" tone="neutral" />
      </div>

      <AdminSection title="Auditfilters" description="Filtervelden uit het auditdashboard; interactief filteren volgt met de server-side querylaag.">
        <form className="admin-filter-bar admin-audit-filter-bar" aria-label="Auditfilters">
          <div className="admin-filter-field">
            <label htmlFor="audit-tenant">Tenant / klant</label>
            <select id="audit-tenant" name="tenant" defaultValue="all">
              <option value="all">Alle tenants</option>
              <option value="northline">Northline Fysio</option>
              <option value="studio-morgen">Studio Morgen</option>
              <option value="ambachtelijk">Ambachtelijk Vastgoed</option>
            </select>
          </div>
          <div className="admin-filter-field">
            <label htmlFor="audit-action">Actie</label>
            <select id="audit-action" name="action" defaultValue="all">
              <option value="all">Alle acties</option>
              <option value="review">Reviewactie</option>
              <option value="approval">Goedkeuring</option>
              <option value="monitoring">Monitoring</option>
            </select>
          </div>
          <div className="admin-filter-field">
            <label htmlFor="audit-status">Status</label>
            <select id="audit-status" name="status" defaultValue="immutable">
              <option value="immutable">Immutable</option>
              <option value="all">Alle statussen</option>
            </select>
          </div>
          <div className="admin-filter-field">
            <label htmlFor="audit-source">Bron</label>
            <select id="audit-source" name="source" defaultValue="all">
              <option value="all">Alle bronnen</option>
              <option value="review-studio">Review Studio</option>
              <option value="dashboard">Klantdashboard</option>
              <option value="monitoring">Monitoring</option>
            </select>
          </div>
        </form>
      </AdminSection>

      <AdminSection title="Immutable events" description="Events worden niet overschreven of verwijderd; correcties verschijnen als een nieuw event.">
        <div className="admin-table-wrap">
          <table className="admin-table admin-audit-table">
            <caption className="visually-hidden">Immutable audit-events</caption>
            <thead>
              <tr>
                <th scope="col">Tijdstip</th>
                <th scope="col">Actor</th>
                <th scope="col">Tenant / klant</th>
                <th scope="col">Versie</th>
                <th scope="col">Actie</th>
                <th scope="col">Reden</th>
                <th scope="col">Bron</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {adminAuditEvents.map((event) => (
                <tr key={event.id}>
                  <td data-label="Tijdstip"><time>{event.time}</time></td>
                  <td data-label="Actor"><strong>{event.actor}</strong><span className="admin-table-subtext">{event.actorRole}</span></td>
                  <td data-label="Tenant / klant"><strong>{event.client}</strong><span className="admin-table-subtext admin-mono">{event.tenant}</span></td>
                  <td data-label="Versie"><span className="admin-mono">{event.version}</span></td>
                  <td data-label="Actie">{event.action}</td>
                  <td data-label="Reden">{event.reason}</td>
                  <td data-label="Bron">{event.source}</td>
                  <td data-label="Status"><AdminBadge tone="success">{event.status}</AdminBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>

      <AdminDemoFooter />
    </div>
  );
}
