import Link from "next/link";
import { AdminBadge, AdminDemoFooter, AdminNotice, AdminPageHeader, AdminSection, AdminTabs } from "../admin-components";
import { adminReviewClients } from "../admin-data";

const reviewSections = [
  { href: "#project-brief", label: "Project Brief" },
  { href: "#review-blokkades", label: "Review & blokkades" },
  { href: "#productie-vrijgave", label: "Productie & vrijgave" },
];

const briefItems = [
  ["Bedrijf & identiteit", "Studio Morgen", "Q1 · door klant aangeleverd"],
  ["Primaire doelgroep", "Particuliere verbouwers met een helder interieurvraagstuk", "Q2 · door klant aangeleverd"],
  ["Aanbod & conversie", "Ontwerpsessie met intakegesprek", "Q3 · bronverwijzing ontbreekt"],
  ["Branding & techniek", "Bestaande branding · staging actief", "Q4 · gecontroleerd"],
];

const reviewChecks = [
  { title: "Q1–Q4 compleet", detail: "Q3 mist nog een onderbouwing van de resultaatclaim.", status: "Blokkade", tone: "danger" as const },
  { title: "Claims en bewijs", detail: "Eén claim vraagt een expliciete bron of aanpassing van de copy.", status: "Controle vereist", tone: "warning" as const },
  { title: "Beeldrechten en assets", detail: "Logo en referentiebeelden zijn als metadata vastgelegd.", status: "Gecontroleerd", tone: "success" as const },
  { title: "Scope en meerwerk", detail: "Extra diensten zijn nog niet als standaard of offerte-akkoord bevestigd.", status: "Besluit nodig", tone: "warning" as const },
];

const productionStages = [
  { label: "Gate 1", detail: "Project Brief & intake", status: "Geblokkeerd", tone: "danger" as const },
  { label: "Gate A", detail: "Website- en conversiestrategie", status: "Wacht op Gate 1", tone: "warning" as const },
  { label: "Staging", detail: "Conceptwebsite en content", status: "Niet gestart", tone: "neutral" as const },
  { label: "Gate B", detail: "QA, klantakkoord en livegang", status: "Niet gestart", tone: "neutral" as const },
];

export default function AdminReviewPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Project Brief Review"
        description="Controleer bronantwoorden, blokkades en vrijgavegates voordat productie mag starten."
        actions={<Link href="/admin/audit" className="button button-secondary">Open audit & versies</Link>}
      />

      <AdminTabs items={reviewSections} />

      <div className="admin-review-layout">
        <aside className="card admin-review-queue" aria-label="Onboardingwachtrij">
          <div className="admin-card-heading">
            <div>
              <h2>Onboardingwachtrij</h2>
              <p>Selecteer een bedrijf voor controle.</p>
            </div>
            <AdminBadge tone="info">3 open</AdminBadge>
          </div>
          <ul className="admin-review-client-list">
            {adminReviewClients.map((client, index) => (
              <li key={client.name} className={index === 0 ? "admin-review-client admin-review-client-active" : "admin-review-client"}>
                <Link href="#project-brief">
                  <span className="admin-review-client-title">{client.name}</span>
                  <span className="admin-review-client-meta">{client.industry} · {client.progress}</span>
                  <AdminBadge tone={client.tone}>{client.status}</AdminBadge>
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <div className="admin-review-main">
          <AdminNotice tone="info">
            <strong>Menselijke beslissing vereist.</strong> AI kan ondersteunen bij signalering, maar Project Brief, claims, scope en vrijgave worden niet automatisch goedgekeurd.
          </AdminNotice>

          <AdminSection id="project-brief" title="Project Brief" description="Studio Morgen · Project Brief v3 · laatste concept gisteren om 16:42.">
            <div className="card admin-card">
              <div className="admin-card-heading">
                <div>
                  <h3>Gecombineerde bronweergave</h3>
                  <p>Antwoorden blijven herleidbaar naar de oorspronkelijke vragenlijst.</p>
                </div>
                <AdminBadge tone="warning">Ter beoordeling</AdminBadge>
              </div>
              <div className="admin-brief-grid">
                {briefItems.map(([label, value, source]) => (
                  <div key={label} className="admin-brief-item">
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>{source}</small>
                  </div>
                ))}
              </div>
              <div className="admin-action-row">
                <Link href="#review-blokkades" className="button button-primary button-small">Open controlepunten</Link>
                <Link href="/admin/audit" className="button button-secondary button-small">Bekijk versiehistorie</Link>
              </div>
            </div>
          </AdminSection>

          <AdminSection id="review-blokkades" title="Review & blokkades" description="Alle open punten moeten gecontroleerd of expliciet besloten zijn voordat Gate 1 kan sluiten.">
            <div className="admin-check-list">
              {reviewChecks.map((check) => (
                <div key={check.title} className={`card admin-check-item admin-check-item-${check.tone}`}>
                  <div>
                    <h3>{check.title}</h3>
                    <p>{check.detail}</p>
                  </div>
                  <AdminBadge tone={check.tone}>{check.status}</AdminBadge>
                </div>
              ))}
            </div>
            <AdminNotice tone="danger">
              <strong>Vrijgave geblokkeerd.</strong> Vraag een aanvulling op Q3 en leg het scopebesluit vast voordat deze Project Brief kan worden goedgekeurd.
            </AdminNotice>
          </AdminSection>

          <AdminSection id="productie-vrijgave" title="Productie & vrijgave" description="De productieflow volgt afzonderlijke menselijke gates voor strategie, staging, QA en klantakkoord.">
            <div className="admin-stage-list">
              {productionStages.map((stage, index) => (
                <div key={stage.label} className="card admin-stage-item">
                  <span className="admin-stage-number">{index + 1}</span>
                  <div>
                    <h3>{stage.label} · {stage.detail}</h3>
                    <p>{index === 0 ? "Q1–Q4 compleet, claims en rechten gecontroleerd, scope bevestigd." : "Deze gate start pas na het sluiten van de vorige gate."}</p>
                  </div>
                  <AdminBadge tone={stage.tone}>{stage.status}</AdminBadge>
                </div>
              ))}
            </div>
            <AdminNotice tone="warning">
              Productie start niet zelfstandig. Een promptpakket, stagingversie, QA-bewijs en klantakkoord blijven afzonderlijke, auditbare stappen.
            </AdminNotice>
          </AdminSection>
        </div>
      </div>

      <AdminDemoFooter />
    </div>
  );
}
