import Link from "next/link";
import {
  deals,
  formatCurrency,
  pipelineStages,
} from "../customer-data";
import { CustomerPage, DemoNotice, StatusBadge } from "../customer-ui";
import styles from "../customer.module.css";

export default function PipelinePage() {
  return (
    <CustomerPage
      current="pipeline"
      title="Pipeline"
      intro="Volg deals door de standaardfasen en open een deal voor de volgende actie."
      actions={
        <Link className="button button-secondary" href="/leads">
          Bekijk leads
        </Link>
      }
    >
      <DemoNotice>
        Dit kanban-overzicht gebruikt fictieve deals. De pipeline wordt in een volgende backend-slice aan echte CRM-data gekoppeld.
      </DemoNotice>

      <section aria-labelledby="pipeline-board-title">
        <div className="section-heading">
          <h2 id="pipeline-board-title">Sales pipeline</h2>
          <p>Een bevestigde afspraak is een afzonderlijke gebeurtenis en geen vervanging voor de dealstatus.</p>
        </div>

        <div className={styles.customerKanban} aria-label="Deals per pipelinefase">
          {pipelineStages.map((stage) => {
            const stageDeals = deals.filter((deal) => deal.stage === stage);

            return (
              <section className={styles.customerKanbanColumn} key={stage} aria-labelledby={`stage-${stage}`}>
                <div className={styles.customerKanbanHeader}>
                  <h3 id={`stage-${stage}`}>{stage}</h3>
                  <StatusBadge>{stageDeals.length}</StatusBadge>
                </div>
                {stageDeals.length > 0 ? (
                  stageDeals.map((deal) => (
                    <article className={styles.customerDealCard} key={deal.id}>
                      <h3>{deal.name}</h3>
                      <p className={styles.customerDealMeta}>Eigenaar: {deal.owner}</p>
                      <p className={styles.customerDealValue}>{formatCurrency(deal.value)}</p>
                      <Link className={styles.customerTableLink} href={`/pipeline/${deal.id}`}>
                        Bekijk deal →
                      </Link>
                    </article>
                  ))
                ) : (
                  <p className="onboarding-note">Geen deals in deze fase.</p>
                )}
              </section>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="pipeline-rules-title">
        <div className="card">
          <div className={styles.customerCardContent}>
            <h2 id="pipeline-rules-title">Werkafspraken</h2>
            <p>
              Statuswijzigingen worden in productie als activiteit vastgelegd. Dealwaarden en betalingen blijven tenant- en rolgebonden.
            </p>
          </div>
        </div>
      </section>
    </CustomerPage>
  );
}
