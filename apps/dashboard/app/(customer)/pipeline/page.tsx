import Link from "next/link";
import { CustomerPage } from "../customer-ui";
import styles from "./pipeline.module.css";

const plannedPipelineParts = [
  { title: "Fasen", detail: "De klantomgeving bepaalt de volgorde en labels van de salesfunnel." },
  { title: "Deals", detail: "Elke deal hoort bij een contactpersoon en toont alleen beschikbare CRM-gegevens." },
  { title: "Volgende actie", detail: "De pipeline maakt opvolging zichtbaar zonder een afspraak als dealstatus te gebruiken." },
] as const;

export default function PipelinePage() {
  return (
    <CustomerPage
      current="pipeline"
      title="Pipeline"
      intro="Volg deals door de pipeline en zie welke commerciële actie als volgende nodig is."
      actions={
        <>
          <Link className="button button-secondary" href="/leads">Bekijk leads</Link>
          <Link className="button button-secondary" href="/settings/crm">CRM-instellingen</Link>
        </>
      }
    >
      <section className={styles.availabilityPanel} aria-labelledby="pipeline-availability-title">
        <div className={styles.availabilityIcon} aria-hidden="true">i</div>
        <div>
          <h2 id="pipeline-availability-title">Pipelinegegevens zijn nog niet beschikbaar</h2>
          <p>
            De frontend is voorbereid op echte tenantgebonden pipelinegegevens, maar de CRM-endpoint voor fasen en deals is nog niet vrijgegeven.
            Daarom tonen we geen fictieve kaarten, aantallen of bedragen.
          </p>
        </div>
      </section>

      <section aria-labelledby="pipeline-preview-title">
        <div className="section-heading">
          <h2 id="pipeline-preview-title">Wat hier straks zichtbaar wordt</h2>
          <p>De server blijft de bron van waarheid voor tenantisolatie, rechten en dealstatus.</p>
        </div>
        <div className={styles.pipelinePreviewGrid}>
          {plannedPipelineParts.map((part) => (
            <article className="card" key={part.title}>
              <div className={styles.previewCardContent}>
                <h3>{part.title}</h3>
                <p>{part.detail}</p>
                <span className={styles.plannedBadge}>Wacht op CRM-contract</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="pipeline-rules-title">
        <div className={styles.previewCardContent}>
          <h2 id="pipeline-rules-title">Werkafspraken</h2>
          <ul className={styles.rulesList}>
            <li>Een afspraak is een afzonderlijke gebeurtenis en geen vervanging voor de dealstatus.</li>
            <li>Dealwaarden worden uitsluitend als beschikbare CRM-data getoond, in EUR.</li>
            <li>Iedere mutatie wordt pas actief zodra de serverroute en autorisatiecontrole beschikbaar zijn.</li>
          </ul>
        </div>
      </section>
    </CustomerPage>
  );
}
