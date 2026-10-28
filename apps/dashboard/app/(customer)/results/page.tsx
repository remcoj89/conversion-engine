import Link from "next/link";
import { resultMetrics, resultMonths } from "../customer-data";
import { CustomerPage, DemoNotice, StatusBadge } from "../customer-ui";
import styles from "../customer.module.css";

export default function ResultsPage() {
  return (
    <CustomerPage
      current="results"
      title="Resultaten"
      intro="Bekijk aanvragen, afspraken, gewonnen deals en ontvangen betalingen in één commercieel overzicht."
      actions={
        <Link className="button button-secondary" href="/performance">
          Bekijk websiteprestaties
        </Link>
      }
    >
      <DemoNotice>
        Alle bedragen en conversies zijn fictieve demonstratiegegevens. Ontbrekende betrouwbare data wordt niet als €0 weergegeven.
      </DemoNotice>

      <section aria-labelledby="result-kpis-title">
        <div className="section-heading">
          <h2 id="result-kpis-title">Commercieel overzicht</h2>
          <p>Voorbeeldperiode: oktober 2026.</p>
        </div>
        <div className={styles.customerFourColumn}>
          {resultMetrics.map((metric) => (
            <article className="card stat" key={metric.label}>
              <h3 className="stat-label">{metric.label}</h3>
              <p className="stat-value">{metric.value}</p>
              <p className="stat-meta">{metric.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="result-history-title">
        <div className="section-heading">
          <h2 id="result-history-title">Ontwikkeling per maand</h2>
          <p>Een compact overzicht van de belangrijkste commerciële signalen.</p>
        </div>
        <div className={styles.customerTableWrap} role="region" aria-label="Resultaten per maand" tabIndex={0}>
          <table className={styles.customerTable}>
            <thead>
              <tr>
                <th scope="col">Maand</th>
                <th scope="col">Aanvragen</th>
                <th scope="col">Afspraken</th>
                <th scope="col">Gewonnen</th>
                <th scope="col">Ontvangsten</th>
              </tr>
            </thead>
            <tbody>
              {resultMonths.map((month) => (
                <tr key={month.month}>
                  <th scope="row" data-label="Maand">{month.month}</th>
                  <td data-label="Aanvragen">{month.leads}</td>
                  <td data-label="Afspraken">{month.appointments}</td>
                  <td data-label="Gewonnen">{month.won}</td>
                  <td data-label="Ontvangsten">{month.revenue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="result-quality-title">
        <div className={styles.customerTwoColumn}>
          <article className="card">
            <div className={styles.customerCardContent}>
              <h2 id="result-quality-title">Datakwaliteit</h2>
              <p>Ontvangsten zijn handmatig geregistreerd; CAC en LTV blijven verborgen zolang kosten- en omzetdata onvoldoende betrouwbaar zijn.</p>
              <p className="stat-meta"><StatusBadge tone="warning">Controle nodig</StatusBadge> Bron: CRM en betalingsregistratie</p>
            </div>
          </article>
          <article className="card">
            <div className={styles.customerCardContent}>
              <h2>Toegang</h2>
              <p>Resultaten zijn bedoeld voor de Business Owner. Teamleden krijgen alleen de onderdelen die bij hun rechten passen.</p>
              <p className="stat-meta"><StatusBadge tone="success">Business Owner</StatusBadge> Rol in deze demo</p>
            </div>
          </article>
        </div>
      </section>
    </CustomerPage>
  );
}
