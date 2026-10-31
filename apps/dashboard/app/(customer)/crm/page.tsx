import Link from "next/link";
import { CrmHeader } from "./crm-ui";
import styles from "../customer.module.css";

export default function CrmPage() {
  return (
    <CrmHeader title="CRM" intro="Beheer organisaties en contactpersonen vanuit één overzichtelijke klantomgeving.">
      <section aria-labelledby="crm-start-title">
        <div className="section-heading">
          <h2 id="crm-start-title">Waar wil je beginnen?</h2>
          <p>De CRM-lijsten tonen alleen gegevens die live uit de klantomgeving worden opgehaald.</p>
        </div>
        <div className={styles.crmOverviewGrid}>
          <Link className={`${styles.crmOverviewCard} card`} href="/organizations">
            <span className={styles.crmOverviewIcon} aria-hidden="true">◎</span>
            <span>
              <strong>Organisaties</strong>
              <span>Bekijk bedrijven en organisaties met hun zakelijke gegevens.</span>
            </span>
            <span className={styles.crmOverviewArrow} aria-hidden="true">→</span>
          </Link>
          <Link className={`${styles.crmOverviewCard} card`} href="/contacts">
            <span className={styles.crmOverviewIcon} aria-hidden="true">◌</span>
            <span>
              <strong>Contactpersonen</strong>
              <span>Bekijk personen en hun gekoppelde organisatie.</span>
            </span>
            <span className={styles.crmOverviewArrow} aria-hidden="true">→</span>
          </Link>
          <Link className={`${styles.crmOverviewCard} card`} href="/leads">
            <span className={styles.crmOverviewIcon} aria-hidden="true">◇</span>
            <span>
              <strong>Leads</strong>
              <span>Volg aanvragen en de actuele opvolgingsstatus.</span>
            </span>
            <span className={styles.crmOverviewArrow} aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </CrmHeader>
  );
}
