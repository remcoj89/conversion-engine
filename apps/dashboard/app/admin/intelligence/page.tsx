import Link from "next/link";
import { AdminBadge, AdminDemoFooter, AdminNotice, AdminPageHeader, AdminSection } from "../admin-components";
import { adminIntelligenceSignals } from "../admin-data";

export default function AdminIntelligencePage() {
  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Website Intelligence"
        description="Breng gedrag, herkomst, opnames en aanbevelingen samen zonder signalen als feiten te presenteren."
        actions={<Link href="/admin/sources" className="button button-secondary">Beheer databronnen</Link>}
      />

      <AdminNotice tone="info">
        <strong>Evidence first.</strong> Een inzicht is pas bruikbaar als bron, periode, tenantcontext en betrouwbaarheid zichtbaar zijn. AI mag een signaal samenvatten, maar publiceert geen advies zonder Westend-review.
      </AdminNotice>

      <AdminSection title="Signalen voor review" description="Fictieve signalen uit GA4, GSC en Clarity met bron- en controlecontext.">
        <div className="admin-signal-grid">
          {adminIntelligenceSignals.map((signal) => (
            <article key={signal.title} className="card admin-signal-card">
              <div className="admin-card-heading">
                <h3>{signal.title}</h3>
                <AdminBadge tone={signal.tone}>{signal.status}</AdminBadge>
              </div>
              <p>{signal.detail}</p>
              <div className="admin-signal-meta">
                <span>Broncontext aanwezig</span>
                <span>Westend-review vereist</span>
              </div>
            </article>
          ))}
        </div>
      </AdminSection>

      <AdminSection title="Analysewerkruimte" description="De Review Studio-prototype koppelt gedragssignalen aan geautoriseerde bronnen en controleerbare acties.">
        <div className="admin-intelligence-grid">
          <div className="card admin-intelligence-card"><strong>Gedrag</strong><span>Opnames, heatmaps en sessiecontext blijven beperkt tot geautoriseerde klantprojecten.</span></div>
          <div className="card admin-intelligence-card"><strong>Herkomst</strong><span>GA4 en GSC leveren trendcontext; de bron en versheid blijven bij ieder inzicht zichtbaar.</span></div>
          <div className="card admin-intelligence-card"><strong>Aanbevelingen</strong><span>Een aanbeveling wordt eerst als review-item opgeslagen; er wordt niet automatisch gepubliceerd.</span></div>
        </div>
      </AdminSection>

      <AdminDemoFooter />
    </div>
  );
}
