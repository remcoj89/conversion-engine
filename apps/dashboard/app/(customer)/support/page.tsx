import Link from "next/link";
import { supportRequests } from "../customer-data";
import { CustomerPage, DemoNotice, StatusBadge } from "../customer-ui";
import styles from "../customer.module.css";

export default function SupportPage() {
  return (
    <CustomerPage
      current="support"
      title="Support aanvragen"
      intro="Beschrijf je vraag of gewenste wijziging. Structurele wijzigingen kunnen meerwerk zijn en vereisen vooraf akkoord."
      actions={
        <Link className="button button-secondary" href="/">
          Terug naar vandaag
        </Link>
      }
    >
      <DemoNotice>
        Dit formulier verstuurt niets. De structuur en duidelijke statusweergave zijn voorbereid op de toekomstige supportinbox.
      </DemoNotice>

      <div className={styles.customerTwoColumn}>
        <section className="card" aria-labelledby="support-form-title">
          <div className={styles.customerCardContent}>
            <h2 id="support-form-title">Nieuwe aanvraag</h2>
            <p>Organisatie en website worden in productie automatisch aan het verzoek gekoppeld.</p>
            <form className={styles.customerForm}>
              <div className="field">
                <label className="field-label" htmlFor="support-category">Onderwerp</label>
                <select className="field-control" id="support-category" name="category" defaultValue="question">
                  <option value="technical">Technisch probleem</option>
                  <option value="question">Vraag</option>
                  <option value="website-change">Websitewijziging</option>
                  <option value="results">Vraag over resultaten</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="support-description">Omschrijving</label>
                <textarea className="field-control" id="support-description" name="description" rows={7} placeholder="Beschrijf je vraag of wijziging" />
              </div>
              <div className="well">
                <strong>Goed om te weten</strong>
                <p className="onboarding-note">Voeg bij een technische melding de betrokken pagina en het moment waarop je het probleem zag toe. Gebruik geen wachtwoorden of API-sleutels.</p>
              </div>
              <div className={styles.customerFormActions}>
                <button className="button button-primary" type="button">Voorbeeld versturen</button>
                <Link className="button button-secondary" href="/support">Formulier leegmaken</Link>
              </div>
            </form>
          </div>
        </section>

        <section className="card" aria-labelledby="request-history-title">
          <div className={styles.customerCardContent}>
            <h2 id="request-history-title">Mijn aanvragen</h2>
            <p>Recente verzoeken en hun actuele status.</p>
            <div className={styles.customerRequestList}>
              {supportRequests.length > 0 ? supportRequests.map((request) => (
                <article className={styles.customerRequest} key={request.id}>
                  <div>
                    <strong>{request.subject}</strong>
                    <p className={styles.customerRequestMeta}>{request.updated}</p>
                  </div>
                  <StatusBadge tone={request.status === "Afgerond" ? "success" : "warning"}>
                    {request.status}
                  </StatusBadge>
                </article>
              )) : (
                <div className="empty-state">
                  <h3>Nog geen supportaanvragen</h3>
                  <p>Nieuwe verzoeken verschijnen hier na verzending.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <section aria-labelledby="support-boundaries-title">
        <div className="card">
          <div className={styles.customerCardContent}>
            <h2 id="support-boundaries-title">Veilige supportcontext</h2>
            <p>Supportmedewerkers krijgen alleen de tenantgebonden context die nodig is om het verzoek te behandelen. Deel geen wachtwoorden, tokens, recoverycodes of productiedumps in dit formulier.</p>
          </div>
        </div>
      </section>
    </CustomerPage>
  );
}
