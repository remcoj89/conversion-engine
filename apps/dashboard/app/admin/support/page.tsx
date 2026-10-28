import Link from "next/link";
import { AdminBadge, AdminDemoFooter, AdminNotice, AdminPageHeader, AdminSection } from "../admin-components";
import { adminSupportRequests } from "../admin-data";

export default function AdminSupportPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Support"
        description="Eén overzicht voor technische vragen, wijzigingsverzoeken en scopebeoordeling."
        actions={<Link href="/admin/clients" className="button button-secondary">Bekijk klanten</Link>}
      />

      <AdminNotice tone="info">
        De MVP ontvangt verzoeken via supportmail of het klantdashboard. Er is nog geen interne ticketdatabase, AI-prioritering of takenplanner; dit scherm maakt die toekomstige werkstroom zichtbaar.
      </AdminNotice>

      <AdminSection title="Openstaande verzoeken" description="Fictieve tickets met expliciete eigenaar en status.">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="visually-hidden">Supportverzoeken</caption>
            <thead>
              <tr><th scope="col">Verzoek</th><th scope="col">Klant</th><th scope="col">Status</th><th scope="col">Ontvangen</th><th scope="col">Eigenaar</th></tr>
            </thead>
            <tbody>
              {adminSupportRequests.map((request) => (
                <tr key={`${request.client}-${request.subject}`}>
                  <td data-label="Verzoek"><strong>{request.subject}</strong></td>
                  <td data-label="Klant">{request.client}</td>
                  <td data-label="Status"><AdminBadge tone={request.tone}>{request.status}</AdminBadge></td>
                  <td data-label="Ontvangen">{request.received}</td>
                  <td data-label="Eigenaar">{request.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>

      <AdminSection title="Wijzigingsverzoeken" description="Scope en akkoord blijven vóór uitvoering zichtbaar.">
        <div className="admin-support-flow">
          <div className="card admin-support-step"><span>1</span><strong>Verzoek ontvangen</strong><p>Via supportmail of dashboardformulier met tenantcontext.</p></div>
          <div className="card admin-support-step"><span>2</span><strong>Scope beoordelen</strong><p>Inbegrepen werk, bugfix of meerwerk.</p></div>
          <div className="card admin-support-step"><span>3</span><strong>Akkoord vastleggen</strong><p>Offerte en klantakkoord vóór structurele uitvoering.</p></div>
        </div>
        <AdminNotice tone="warning">
          Structurele wijzigingen en nieuwe integraties zijn pas uitvoerbaar na scopebesluit, offerte en klantakkoord. Een supportticket publiceert nooit direct naar productie.
        </AdminNotice>
      </AdminSection>

      <AdminDemoFooter />
    </div>
  );
}
