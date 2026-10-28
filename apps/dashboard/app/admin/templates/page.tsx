import Link from "next/link";
import { AdminBadge, AdminDemoFooter, AdminNotice, AdminPageHeader, AdminSection } from "../admin-components";
import { adminTemplates } from "../admin-data";

const components = [
  ["Hero + CTA", "v1.2", "Goedgekeurd", "success" as const],
  ["Diensten & cases", "v1.1", "Goedgekeurd", "success" as const],
  ["Reviews", "v1.2", "Goedgekeurd", "success" as const],
  ["Leadmagnet wrapper", "v0.9", "In review", "warning" as const],
] as const;

export default function AdminTemplatesPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Templates & componenten"
        description="Beheer de gecontroleerde bibliotheek waarmee websiteproductie en conversieflows consistent blijven."
        actions={<Link href="/admin/websites" className="button button-secondary">Websiteportfolio</Link>}
      />

      <AdminNotice tone="info">
        Nieuwe componenten vereisen design review, mobiele toetsing, toegankelijkheid en regressietests. Referenties uit klantwebsites zijn inspiratie, geen herbruikbare klantcontent.
      </AdminNotice>

      <AdminSection title="Branchetemplates" description="Een gedeelde softwarekern met beperkte, gecontroleerde configuratie.">
        <div className="admin-template-grid">
          {adminTemplates.map((template) => (
            <article key={template.name} className="card admin-template-card">
              <div className="admin-card-heading">
                <h3>{template.name}</h3>
                <AdminBadge tone={template.tone}>{template.status}</AdminBadge>
              </div>
              <p>{template.coverage}</p>
              <span className="admin-template-version">{template.version}</span>
            </article>
          ))}
        </div>
      </AdminSection>

      <AdminSection title="Componentbibliotheek" description="Versies blijven gekoppeld aan hun review- en releasecontext.">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="visually-hidden">Beheerde componenten</caption>
            <thead>
              <tr><th scope="col">Component</th><th scope="col">Versie</th><th scope="col">Status</th><th scope="col">Volgende controle</th></tr>
            </thead>
            <tbody>
              {components.map(([name, version, status, tone]) => (
                <tr key={name}>
                  <td data-label="Component"><strong>{name}</strong></td>
                  <td data-label="Versie"><span className="admin-mono">{version}</span></td>
                  <td data-label="Status"><AdminBadge tone={tone}>{status}</AdminBadge></td>
                  <td data-label="Volgende controle">Mobiel · accessibility · regressie</td>
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
