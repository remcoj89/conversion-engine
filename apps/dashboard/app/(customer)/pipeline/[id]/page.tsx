import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deals,
  formatCurrency,
  leads,
  pipelineStages,
} from "../../customer-data";
import { CustomerPage, DemoNotice } from "../../customer-ui";
import styles from "../../customer.module.css";

export function generateStaticParams() {
  return deals.map((deal) => ({ id: deal.id }));
}
export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deal = deals.find((candidate) => candidate.id === id);

  if (!deal) {
    notFound();
  }

  const relatedLead = deal.leadId ? leads.find((lead) => lead.id === deal.leadId) : undefined;
  const outstanding = deal.value - deal.received;

  return (
    <CustomerPage
      current="pipeline"
      title="Dealdetail"
      intro="Bekijk de pipelinefase, contractcontext en volgende commerciële actie."
      actions={
        <>
          <Link className="button button-secondary" href="/pipeline">
            ← Terug naar pipeline
          </Link>
          {relatedLead ? (
            <Link className="button button-secondary" href={`/leads/${relatedLead.id}`}>
              Bekijk lead
            </Link>
          ) : null}
        </>
      }
    >
      <DemoNotice>
        Pipelinefase, betaling en dealwaarde zijn hier demonstratiegegevens. De knoppen wijzigen niets op de server.
      </DemoNotice>

      <div className={styles.customerTwoColumn}>
        <article className="card">
          <div className={styles.customerCardContent}>
            <div className={styles.customerDetailHeader}>
              <div>
                <h2>{deal.name}</h2>
                <p>Laatst bijgewerkt: {deal.updated}</p>
              </div>
              <span className="badge badge-neutral">{deal.stage}</span>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="deal-stage">
                Pipelinefase
              </label>
              <select className="field-control" id="deal-stage" defaultValue={deal.stage}>
                {pipelineStages.map((stage) => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
                <option value="Verloren">Verloren</option>
              </select>
            </div>

            <div className={styles.customerFormActions}>
              <button className="button button-primary" type="button">
                Sla fase op (demo)
              </button>
            </div>

            <div className="notice notice-warning" role="note">
              <strong>Volgende actie</strong>
              <span>{deal.nextStep}</span>
            </div>
          </div>
        </article>

        <article className="card">
          <div className={styles.customerCardContent}>
            <h2>Contract en betalingen</h2>
            <dl className={styles.customerDefinitionList}>
              <div className={styles.customerDefinition}>
                <dt>Contractwaarde</dt>
                <dd>{formatCurrency(deal.value)}</dd>
              </div>
              <div className={styles.customerDefinition}>
                <dt>Ontvangen</dt>
                <dd>{formatCurrency(deal.received)}</dd>
              </div>
              <div className={styles.customerDefinition}>
                <dt>Resterende waarde</dt>
                <dd>{formatCurrency(outstanding)}</dd>
              </div>
              <div className={styles.customerDefinition}>
                <dt>Eigenaar</dt>
                <dd>{deal.owner}</dd>
              </div>
            </dl>
            <p className="onboarding-note">
              De resterende contractwaarde is geen openstaande factuur. Facturatie verloopt buiten deze demo.
            </p>
            <div className={styles.customerFormGrid}>
              <div className="field">
                <label className="field-label" htmlFor="payment">
                  Ontvangen betaling (€)
                </label>
                <input className="field-control" id="payment" min="1" placeholder="Bijv. 150" step="1" type="number" />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="payment-date">
                  Datum
                </label>
                <input className="field-control" id="payment-date" type="date" defaultValue="2026-10-28" />
              </div>
            </div>
            <button className="button button-secondary" type="button">
              Registreer betaling (demo)
            </button>
          </div>
        </article>
      </div>
    </CustomerPage>
  );
}
