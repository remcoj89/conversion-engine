import Link from "next/link";
import { CustomerPage } from "../../customer-ui";
import styles from "../pipeline.module.css";

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await params;

  return (
    <CustomerPage
      current="pipeline"
      title="Dealdetail"
      intro="Bekijk de pipelinefase, contactcontext en volgende commerciële actie zodra de CRM-bron beschikbaar is."
      actions={<Link className="button button-secondary" href="/pipeline">Terug naar pipeline</Link>}
    >
      <section className={styles.availabilityPanel} aria-labelledby="deal-availability-title">
        <div className={styles.availabilityIcon} aria-hidden="true">i</div>
        <div>
          <h2 id="deal-availability-title">Dealdetail is nog niet beschikbaar</h2>
          <p>De deal wordt niet uit de URL afgeleid. Zodra het servercontract bestaat, wordt de deal tenantgebonden opgehaald en opnieuw gecontroleerd.</p>
        </div>
      </section>
    </CustomerPage>
  );
}
