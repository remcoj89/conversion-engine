import Link from "next/link";
import { AdminBadge, AdminDemoFooter, AdminNotice, AdminPageHeader, AdminSection, AdminStat } from "../admin-components";
import { adminIncidents } from "../admin-data";

export default function AdminMonitoringPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Monitoring"
        description="Bekijk health checks, incidenten en de opvolging van technische signalen per klantwebsite."
        actions={<Link href="/admin/intelligence" className="button button-secondary">Website Intelligence</Link>}
      />

      <div className="admin-stat-grid">
        <AdminStat label="Websites gecontroleerd" value="4" detail="Laatste ronde vandaag" tone="success" />
        <AdminStat label="Open incidenten" value="1" detail="Helder Groen" tone="warning" />
        <AdminStat label="Checks geslaagd" value="97%" detail="In fictieve periode" tone="success" />
        <AdminStat label="Laatste run" value="08:55" detail="28 oktober 2026" tone="info" />
      </div>

      <AdminSection id="incidenten" title="Incidenten" description="Incidentstatus is expliciet; oplossen vereist later een echte technische verificatie.">
        <div className="admin-incident-list">
          {adminIncidents.map((incident) => (
            <div key={`${incident.client}-${incident.kind}`} className="card admin-incident-item">
              <div className="admin-incident-marker" aria-hidden="true" />
              <div className="admin-incident-content">
                <div className="admin-card-heading">
                  <div>
                    <h3>{incident.kind} · {incident.client}</h3>
                    <p>{incident.impact}</p>
                  </div>
                  <AdminBadge tone={incident.tone}>{incident.status}</AdminBadge>
                </div>
                <span className="admin-table-subtext">Gemeld {incident.time} · eigenaar: Westend operations</span>
              </div>
            </div>
          ))}
        </div>
        <AdminNotice tone="warning">
          <strong>Open incident:</strong> het formulier van Helder Groen gaf tijdelijk een foutstatus. Een incident mag pas als opgelost worden gemarkeerd na een controle met reproduceerbaar bewijs.
        </AdminNotice>
      </AdminSection>

      <AdminSection title="Health checks" description="De toekomstige monitoringlaag kan deze checks per website en versie vastleggen.">
        <div className="admin-check-grid">
          {([
            ["Publieke pagina bereikbaar", "Geslaagd", "success" as const],
            ["Leadformulier en backendketen", "1 aandachtspunt", "warning" as const],
            ["Analytics- en consent-events", "Geslaagd", "success" as const],
            ["Mobiel, accessibility en performance", "Geslaagd", "success" as const],
          ] as const).map(([title, status, tone]) => (
            <div key={title} className="card admin-health-card">
              <span>{title}</span>
              <AdminBadge tone={tone}>{status}</AdminBadge>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminDemoFooter />
    </div>
  );
}
