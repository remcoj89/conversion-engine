import { CtaButton } from "../components/CtaButton";
import { site } from "../content/demo";

export default function NotFound() {
  return (
    <section className="section">
      <div className="container container--narrow">
        <h1>Deze pagina bestaat niet</h1>
        <p className="lead">Misschien is de link verouderd. Ga terug naar de homepage of plan direct een kennismaking.</p>
        <div className="cta-row">
          <CtaButton cta={site.primaryCta} />
          <CtaButton cta={{ label: "Naar de homepage", href: "/" }} variant="text" />
        </div>
      </div>
    </section>
  );
}
