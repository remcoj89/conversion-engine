import Link from "next/link";
import {
  performanceAcquisition,
  performancePeriods,
  performanceRecordings,
  performanceVisitors,
  recommendations,
  type PerformancePeriod,
} from "../customer-data";
import { CustomerPage, DemoNotice, SourceLabel, StatusBadge } from "../customer-ui";
import styles from "../customer.module.css";

type PerformanceTab = "overview" | "visitors" | "acquisition" | "recordings" | "recommendations";

const performanceTabs: readonly { value: PerformanceTab; label: string }[] = [
  { value: "overview", label: "Overzicht" },
  { value: "visitors", label: "Bezoekers" },
  { value: "acquisition", label: "Acquisitie" },
  { value: "recordings", label: "Opnames" },
  { value: "recommendations", label: "Aanbevelingen" },
];

type PerformanceSearchParams = Promise<{
  tab?: string;
  period?: string;
}>;

function tabHref(tab: PerformanceTab, period: PerformancePeriod): string {
  return `/performance?tab=${tab}&period=${period}`;
}
function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="card stat">
      <h3 className="stat-label">{label}</h3>
      <p className="stat-value">{value}</p>
      <p className="stat-meta">{detail}</p>
    </article>
  );
}

function PerformanceTabContent({ tab, period }: { tab: PerformanceTab; period: PerformancePeriod }) {
  const data = performancePeriods[period];

  if (tab === "visitors") {
    return (
      <section aria-labelledby="visitor-detail-title">
        <div className={styles.customerFourColumn}>
          <MetricCard label="Bezoekers" value={data.users} detail="Actieve gebruikers · GA4 demo" />
          <MetricCard label="Sessies" value="2.941" detail="Websitebezoeken · GA4 demo" />
          <MetricCard label="Betrokkenheid" value="63%" detail="Voorbeeldperiode" />
          <MetricCard label="Formulieraanvragen" value={data.events} detail="CRM-gevalideerd · demo" />
        </div>
        <div className="section-heading">
          <h2 id="visitor-detail-title">Bezoekersontwikkeling</h2>
          <p>Een beperkte voorbeeldweergave van de gekozen periode.</p>
        </div>
        <div className={styles.customerTableWrap} role="region" aria-label="Bezoekers per dag" tabIndex={0}>
          <table className={styles.customerTable}>
            <caption className="visually-hidden">Bezoekers per dag in de voorbeeldperiode</caption>
            <thead>
              <tr>
                <th scope="col">Dag</th>
                <th scope="col">Bezoekers</th>
                <th scope="col">Sessies</th>
                <th scope="col">Betrokkenheid</th>
              </tr>
            </thead>
            <tbody>
              {performanceVisitors.map((row) => (
                <tr key={row.period}>
                  <th scope="row" data-label="Dag">{row.period}</th>
                  <td data-label="Bezoekers">{row.users}</td>
                  <td data-label="Sessies">{row.sessions}</td>
                  <td data-label="Betrokkenheid">{row.engagement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  if (tab === "acquisition") {
    return (
      <section aria-labelledby="acquisition-detail-title">
        <div className={styles.customerThreeColumn}>
          <MetricCard label="Organische klikken" value={data.clicks} detail="Google Search Console · demo" />
          <MetricCard label="Vertoningen" value={data.impressions} detail="Google Search Console · demo" />
          <MetricCard label="Gemiddelde CTR" value={data.ctr} detail="Klikken / vertoningen · demo" />
        </div>
        <div className="section-heading">
          <h2 id="acquisition-detail-title">Herkomst van bezoekers</h2>
          <p>Bronnen helpen bij prioritering; ze zijn geen garantie op conversie.</p>
        </div>
        <div className={styles.customerTableWrap} role="region" aria-label="Acquisitiebronnen" tabIndex={0}>
          <table className={styles.customerTable}>
            <caption className="visually-hidden">Acquisitiebronnen en conversies</caption>
            <thead>
              <tr>
                <th scope="col">Bron</th>
                <th scope="col">Sessies</th>
                <th scope="col">Aandeel</th>
                <th scope="col">Aanvraagratio</th>
              </tr>
            </thead>
            <tbody>
              {performanceAcquisition.map((row) => (
                <tr key={row.source}>
                  <th scope="row" data-label="Bron">{row.source}</th>
                  <td data-label="Sessies">{row.sessions}</td>
                  <td data-label="Aandeel">{row.share}</td>
                  <td data-label="Aanvraagratio">{row.conversion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.customerSourceMeta}>Bronnen: GA4 en Search Console · voorbeeldperiode {data.label}.</p>
      </section>
    );
  }

  if (tab === "recordings") {
    return (
      <section aria-labelledby="recordings-detail-title">
        <div className={styles.customerTwoColumn}>
          <MetricCard label="Rage clicks" value="47" detail="Clarity · voorbeeld" />
          <MetricCard label="Dead clicks" value="89" detail="Clarity · voorbeeld" />
        </div>
        <div className="section-heading">
          <h2 id="recordings-detail-title">Opnames met mogelijke frictie</h2>
          <p>Gebruik opnames als onderzoekssignaal, nooit als automatische diagnose.</p>
        </div>
        <div className={styles.customerStack}>
          {performanceRecordings.map((recording) => (
            <article className="card" key={recording.path}>
              <div className={styles.customerCardContent}>
                <div className={styles.customerDetailHeader}>
                  <div>
                    <h2>{recording.path}</h2>
                    <p>{recording.sessions}</p>
                  </div>
                  <StatusBadge tone="warning">{recording.status}</StatusBadge>
                </div>
                <p>{recording.signal}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="notice notice-warning" role="note">
          <strong>Privacy en toegang</strong>
          <span>Sessieopnames worden in productie alleen met passende privacywaarborgen en tenantgebonden toegang beschikbaar gemaakt.</span>
        </div>
      </section>
    );
  }

  if (tab === "recommendations") {
    return (
      <section aria-labelledby="recommendations-detail-title">
        <div className="section-heading">
          <h2 id="recommendations-detail-title">Maandelijkse aanbevelingen</h2>
          <p>Een advies is een voorstel op basis van signalen, geen automatisch uitgevoerde wijziging.</p>
        </div>
        <div className={styles.customerStack}>
          {recommendations.map((recommendation) => (
            <article className={styles.customerRecommendation} key={recommendation.title}>
              <div className={styles.customerRecommendationHeader}>
                <div>
                  <div className={styles.customerSourceStrip}>
                    <SourceLabel>{recommendation.area}</SourceLabel>
                    <StatusBadge tone={recommendation.priority === "Hoog" ? "warning" : "neutral"}>
                      Prioriteit {recommendation.priority}
                    </StatusBadge>
                  </div>
                  <h3>{recommendation.title}</h3>
                </div>
                <Link className="button button-secondary button-small" href="/support">
                  Bespreek advies
                </Link>
              </div>
              <div className={styles.customerRecommendationDetails}>
                <p><strong>Signaal:</strong> {recommendation.evidence}</p>
                <p><strong>Volgende stap:</strong> {recommendation.action}</p>
                <p className={styles.customerSourceMeta}>Bronnen: {recommendation.sources}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="performance-overview-title">
      <div className={styles.customerFourColumn}>
        <MetricCard label="Bezoekers (GA4)" value={data.users} detail="Actieve gebruikers · voorbeeld" />
        <MetricCard label="Organische klikken (GSC)" value={data.clicks} detail="Google-zoekresultaten · voorbeeld" />
        <MetricCard label="Formulieraanvragen" value={data.events} detail="CRM-gevalideerd · voorbeeld" />
        <MetricCard label="Gemiddelde CTR (GSC)" value={data.ctr} detail="Klikken / vertoningen · voorbeeld" />
      </div>

      <div className={styles.customerTwoColumn}>
        <article className="card">
          <div className={styles.customerCardContent}>
            <h2 id="performance-overview-title">Ontwikkeling websiteverkeer</h2>
            <p>Illustratieve trend; geen live data.</p>
            <div className={styles.customerChart} role="img" aria-label={`Illustratieve bezoekersontwikkeling over ${data.label}`}>
              <div className={styles.customerChartBars}>
                {data.bars.map((height, index) => (
                  <span
                    className={styles.customerChartBar}
                    key={`${period}-${index}`}
                    style={{ height: `${height}%` }}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <div className={styles.customerChartLegend}>
                <span>Bron: GA4</span>
                <span>Periode: {data.label}</span>
              </div>
            </div>
          </div>
        </article>

        <article className="card">
          <div className={styles.customerCardContent}>
            <h2>Wat valt op?</h2>
            <div className={styles.customerStack}>
              <div className="card stat">
                <h3 className="stat-label">Zoekvragen met kansen</h3>
                <p className="stat-meta">Maak inhoud over praktische trainingsvragen met aantoonbare zoekintentie.</p>
              </div>
              <div className="card stat">
                <h3 className="stat-label">Formulierfrictie</h3>
                <p className="stat-meta">Controleer Clarity-signalen voordat je een CTA of formulier aanpast.</p>
              </div>
              <div className="card stat">
                <h3 className="stat-label">AI-zichtbaarheid</h3>
                <p className="stat-meta">Gebruik steekproeven uit DataForSEO als aanvullend signaal, niet als totaalbereik.</p>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: PerformanceSearchParams;
}) {
  const params = await searchParams;
  const requestedTab = params.tab as PerformanceTab | undefined;
  const tab = performanceTabs.some((candidate) => candidate.value === requestedTab)
    ? requestedTab ?? "overview"
    : "overview";
  const requestedPeriod = params.period;
  const period = requestedPeriod && requestedPeriod in performancePeriods
    ? requestedPeriod as PerformancePeriod
    : "30";

  return (
    <CustomerPage
      current="performance"
      title="Websiteprestaties & advies"
      intro="Inzicht in verkeer, zoekgedrag, gebruikersinteracties en aanbevelingen."
      actions={
        <Link className="button button-secondary" href="/support">
          Bespreek een aanbeveling
        </Link>
      }
    >
      <DemoNotice>
        Er zijn geen live koppelingen of API-credentials geconfigureerd. Bron- en versheidslabels blijven zichtbaar zodat de herkomst niet wordt verward met productiegegevens.
      </DemoNotice>

      <div className={styles.customerSourceStrip} aria-label="Databronnen">
        <SourceLabel>GA4 · Demo</SourceLabel>
        <SourceLabel>Search Console · Demo</SourceLabel>
        <SourceLabel>Clarity · Demo</SourceLabel>
        <SourceLabel>DataForSEO · Demo</SourceLabel>
      </div>

      <div className={styles.customerToolbar}>
        <nav className={styles.customerTabs} aria-label="Websiteprestaties tabs">
          {performanceTabs.map((candidate) => (
            <Link
              className={candidate.value === tab ? styles.customerTabActive : styles.customerTab}
              href={tabHref(candidate.value, period)}
              key={candidate.value}
              aria-current={candidate.value === tab ? "page" : undefined}
            >
              {candidate.label}
            </Link>
          ))}
        </nav>
        <form method="get">
          <input name="tab" type="hidden" value={tab} />
          <label className="field-label" htmlFor="performance-period">Periode</label>
          <select className="field-control" id="performance-period" name="period" defaultValue={period}>
            {Object.entries(performancePeriods).map(([value, data]) => (
              <option key={value} value={value}>{data.label}</option>
            ))}
          </select>
          <button className="button button-secondary button-small" type="submit">Toepassen</button>
        </form>
      </div>

      <p className={styles.customerSourceMeta}>Laatste synchronisatie: voorbeelddata · {performancePeriods[period].label} · Geen automatische wijzigingen.</p>
      <PerformanceTabContent tab={tab} period={period} />
    </CustomerPage>
  );
}
