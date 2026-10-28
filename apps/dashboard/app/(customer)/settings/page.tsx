import Link from "next/link";
import { CustomerPage, DemoNotice, SourceLabel, StatusBadge } from "../customer-ui";
import styles from "../customer.module.css";

export default function SettingsPage() {
  return (
    <CustomerPage
      current="settings"
      title="Instellingen"
      intro="Beheer zakelijke basisgegevens en bekijk welke toegang en databronnen actief zijn."
      actions={
        <Link className="button button-secondary" href="/support">
          Vraag een wijziging aan
        </Link>
      }
    >
      <DemoNotice>
        Deze instellingen zijn leesbare demo-invoer. Opslaan, rechtenbeheer en providerconfiguratie worden server-side toegevoegd.
      </DemoNotice>

      <div className={styles.customerTwoColumn}>
        <section className="card" aria-labelledby="business-settings-title">
          <div className={styles.customerCardContent}>
            <h2 id="business-settings-title">Basisinstellingen</h2>
            <p>De ondernemer wijzigt zakelijke gegevens, geen technische AI-prompts.</p>
            <form className={styles.customerForm}>
              <div className="field">
                <label className="field-label" htmlFor="business-name">Bedrijfsnaam</label>
                <input className="field-control" id="business-name" name="businessName" defaultValue="NoordFit Coaching" readOnly />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="booking-link">Boekingslink</label>
                <input className="field-control" id="booking-link" name="bookingLink" defaultValue="https://calendly.com/voorbeeld/kennismaking" readOnly />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="reply-email">Antwoordadres</label>
                <input className="field-control" id="reply-email" name="replyEmail" defaultValue="hallo@noordfit.example" readOnly />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="timezone">Tijdzone</label>
                <select className="field-control" id="timezone" name="timezone" defaultValue="Europe/Amsterdam">
                  <option value="Europe/Amsterdam">Europe/Amsterdam</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div className={styles.customerFormActions}>
                <button className="button button-primary" type="button">Wijzigingen opslaan (demo)</button>
              </div>
            </form>
          </div>
        </section>

        <section className="card" aria-labelledby="subscription-title">
          <div className={styles.customerCardContent}>
            <h2 id="subscription-title">Abonnement</h2>
            <p>Conversion Engine Basis · €249/mnd</p>
            <p className="onboarding-note">Facturatie verloopt extern. Dit scherm toont alleen de status.</p>
            <p className="stat-meta"><StatusBadge tone="success">Actief</StatusBadge></p>
            <div className="notice notice-warning" role="note">
              <strong>Geen factuuractie beschikbaar</strong>
              <span>Voor wijzigingen in abonnement of facturatie kun je een supportaanvraag sturen.</span>
            </div>
            <Link className="button button-secondary" href="/support">Open support</Link>
          </div>
        </section>
      </div>

      <section aria-labelledby="access-title">
        <div className="section-heading">
          <h2 id="access-title">Toegang en rechten</h2>
          <p>Rechten worden in productie door de server en tenantcontext afgedwongen.</p>
        </div>
        <div className={styles.customerThreeColumn}>
          <article className="card stat">
            <h3 className="stat-label">Jouw rol</h3>
            <p className="stat-value">Owner</p>
            <p className="stat-meta">Volledige inzage in klantresultaten en instellingen.</p>
          </article>
          <article className="card stat">
            <h3 className="stat-label">Teamleden</h3>
            <p className="stat-value">2</p>
            <p className="stat-meta">Toegang is beperkt tot toegewezen opvolging.</p>
          </article>
          <article className="card stat">
            <h3 className="stat-label">Dealwaarden</h3>
            <p className="stat-value">Beperkt</p>
            <p className="stat-meta">Teamleden zien alleen wat hun rechten toestaan.</p>
          </article>
        </div>
      </section>

      <section aria-labelledby="sources-title">
        <div className="section-heading">
          <h2 id="sources-title">Databronnen</h2>
          <p>Bronnen en synchronisatiestatus blijven expliciet zichtbaar.</p>
        </div>
        <div className="card">
          <div className={styles.customerCardContent}>
            <div className={styles.customerSourceStrip}>
              <SourceLabel>CRM · Demo</SourceLabel>
              <SourceLabel>Boekingsprovider · Demo</SourceLabel>
              <SourceLabel>GA4 · Niet gekoppeld</SourceLabel>
              <SourceLabel>Search Console · Niet gekoppeld</SourceLabel>
            </div>
            <p className="onboarding-note">Een bronlabel betekent niet dat de data live of volledig is. De integratiestatus wordt in productie per tenant bijgehouden.</p>
          </div>
        </div>
      </section>
    </CustomerPage>
  );
}
