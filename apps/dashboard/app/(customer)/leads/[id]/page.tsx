import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deals,
  leadStatusLabels,
  leadStatusTones,
  leads,
} from "../../customer-data";
import { CustomerPage, DemoNotice, StatusBadge } from "../../customer-ui";
import styles from "../../customer.module.css";

export function generateStaticParams() {
  return leads.map((lead) => ({ id: lead.id }));
}
export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = leads.find((candidate) => candidate.id === id);

  if (!lead) {
    notFound();
  }

  const relatedDeal = deals.find((deal) => deal.leadId === lead.id);
  const aiLabel = lead.aiStatus === "sent"
    ? "Eerste reactie verzonden"
    : lead.aiStatus === "failed"
      ? "Verzending mislukt"
      : "Niet gestart";
  const aiTone = lead.aiStatus === "sent" ? "success" : lead.aiStatus === "failed" ? "warning" : "neutral";

  return (
    <CustomerPage
      current="leads"
      title="Leaddetail"
      intro="Bekijk de aanvraag, volgende actie en volledige traceerbare tijdlijn."
      actions={
        <>
          <Link className="button button-secondary" href="/leads">
            ← Terug naar leads
          </Link>
          <Link className="button button-secondary" href="/tasks">
            Maak taak
          </Link>
          {relatedDeal ? (
            <Link className="button button-primary" href={`/pipeline/${relatedDeal.id}`}>
              Bekijk deal
            </Link>
          ) : null}
        </>
      }
    >
      <DemoNotice>
        Acties zoals overnemen of een deal aanmaken zijn in deze slice alleen als navigatie en context voorbereid; er worden geen CRM-mutaties uitgevoerd.
      </DemoNotice>

      <div className={styles.customerTwoColumn}>
        <article className="card">
          <div className={styles.customerCardContent}>
            <header className={styles.customerDetailHeader}>
              <div>
                <h2>{lead.name}</h2>
                <p>{lead.email}</p>
              </div>
              <StatusBadge tone={leadStatusTones[lead.status]}>
                {leadStatusLabels[lead.status]}
              </StatusBadge>
            </header>

            <dl className={styles.customerDefinitionList}>
              <div className={styles.customerDefinition}>
                <dt>Interesse</dt>
                <dd>{lead.interest}</dd>
              </div>
              <div className={styles.customerDefinition}>
                <dt>Leadbron</dt>
                <dd>{lead.source}</dd>
              </div>
              <div className={styles.customerDefinition}>
                <dt>Bedrijf</dt>
                <dd>{lead.company}</dd>
              </div>
              <div className={styles.customerDefinition}>
                <dt>Eigenaar</dt>
                <dd>{lead.owner}</dd>
              </div>
              <div className={styles.customerDefinition}>
                <dt>Marketingtoestemming</dt>
                <dd>{lead.marketingConsent}</dd>
              </div>
              <div className={styles.customerDefinition}>
                <dt>Aangemaakt</dt>
                <dd>{lead.created}</dd>
              </div>
            </dl>

            <div className="notice notice-warning" role="note">
              <strong>Volgende actie</strong>
              <span>
                {lead.status === "human"
                  ? "Automatische verzending is mislukt. Neem handmatig contact op."
                  : lead.status === "appointment"
                    ? "De afspraak is bevestigd. Bereid het gesprek voor."
                    : lead.status === "done"
                      ? "Deze aanvraag is afgehandeld."
                      : "Controleer of deze lead persoonlijke opvolging nodig heeft."}
              </span>
            </div>
          </div>
        </article>

        <article className="card">
          <div className={styles.customerCardContent}>
            <h2>AI & opvolging</h2>
            <div className={styles.customerStack}>
              <div className="card stat">
                <h3 className="stat-label">AI-status</h3>
                <p className="stat-meta"><StatusBadge tone={aiTone}>{aiLabel}</StatusBadge></p>
              </div>
              <div className="card stat">
                <h3 className="stat-label">Automatische reminder</h3>
                <p className="stat-meta">
                  <StatusBadge tone={lead.status === "appointment" || lead.status === "done" ? "success" : "neutral"}>
                    {lead.status === "appointment" || lead.status === "done" ? "Gestopt" : lead.status === "human" ? "Uitgeschakeld" : "Voorwaardelijk"}
                  </StatusBadge>
                </p>
              </div>
            </div>
            <p className="onboarding-note">
              Een getoonde boekingslink is nog geen geboekte afspraak. De boekingsprovider moet de afspraak bevestigen.
            </p>
          </div>
        </article>
      </div>

      <section aria-labelledby="lead-timeline-title">
        <div className="section-heading">
          <h2 id="lead-timeline-title">Tijdlijn</h2>
          <p>Gebeurtenissen worden in productie server-side vastgelegd.</p>
        </div>
        <div className="card">
          <div className={styles.customerCardContent}>
            <ol className={styles.customerTimeline}>
              {lead.timeline.map((event) => (
                <li className={styles.customerTimelineItem} key={`${event.at}-${event.title}`}>
                  <time className={styles.customerTimelineDate}>{event.at}</time>
                  <strong>{event.title}</strong>
                  <p className={styles.customerTimelineDetail}>{event.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </CustomerPage>
  );
}
