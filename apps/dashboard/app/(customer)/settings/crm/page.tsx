import Link from "next/link";
import { CustomerPage } from "../../customer-ui";
import { CrmSettingsClient } from "./crm-settings-client";
import styles from "./crm-settings.module.css";

export default function CrmSettingsPage() {
  return (
    <CustomerPage
      current="settings"
      title="CRM-instellingen"
      intro="Beheer de werkafspraken voor leadbronnen en opvolging binnen deze klantomgeving."
      actions={
        <>
          <Link className="button button-secondary" href="/settings">Terug naar instellingen</Link>
          <Link className="button button-secondary" href="/pipeline">Naar pipeline</Link>
        </>
      }
    >
      <CrmSettingsClient />

      <section className="card" aria-labelledby="crm-settings-access-title">
        <div className={styles.settingsCardContent}>
          <h2 id="crm-settings-access-title">Toegang</h2>
          <p>Alleen de eigenaar en tenantbeheerder kunnen CRM-instellingen wijzigen. Teamleden werken binnen de toegekende CRM-rechten.</p>
          <Link className="button button-secondary" href="/settings/team">Team- en CRM-rechten bekijken</Link>
        </div>
      </section>
    </CustomerPage>
  );
}
