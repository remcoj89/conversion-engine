import type { Metadata } from "next";
import { CheckList, FactList, FaqList, FitColumns, Visual } from "../../components/Blocks";
import { CtaBand } from "../../components/CtaBand";
import { CtaButton } from "../../components/CtaButton";
import { Section, SectionHeading } from "../../components/Section";
import { TrustBlock } from "../../components/TrustBlock";
import { pageSeo, sales, testimonials, trustNote } from "../../content/demo";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata(pageSeo.sales);

// Salespage: website-blokken-salespagina.docx. Blok 1, 8 en 15 zijn bewust weggelaten (zie content/demo.ts).
export default function SalesPage() {
  return (
    <>
      {/* Blok 2 — naam van de dienst, belofte en CTA */}
      <section className="hero hero--center" aria-labelledby="sales-title">
        <div className="container container--narrow">
          <p className="eyebrow">{sales.hero.eyebrow}</p>
          <h1 id="sales-title">{sales.hero.title}</h1>
          <p className="lead">{sales.hero.promise}</p>
          <div className="cta-row cta-row--center">
            <CtaButton cta={sales.hero.cta} />
          </div>
        </div>
      </section>

      {/* Blok 3 — het probleem herkenbaar maken */}
      <Section tone="muted" width="narrow" intro={sales.problem.intro}>
        <div className="prose">
          {sales.problem.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </Section>

      {/* Blok 4 — oplossing aanlokkelijk maken + CTA */}
      <Section width="narrow" intro={sales.solution.intro}>
        <CtaButton cta={sales.solution.cta} />
      </Section>

      {/* Blok 5 — reviews */}
      <Section tone="muted" intro={{ title: "Ervaringen" }}>
        <TrustBlock testimonials={testimonials} note={trustNote} />
      </Section>

      {/* Blok 6 — resultaten die je krijgt */}
      <Section width="narrow" intro={sales.outcomes.intro}>
        <CheckList items={sales.outcomes.items} />
        <p className="muted-note">{sales.outcomes.disclaimer}</p>
      </Section>

      {/* Blok 7 — praktische zaken + CTA */}
      <Section tone="muted" width="narrow" intro={sales.practical.intro}>
        <FactList items={sales.practical.items} />
        <CtaButton cta={sales.practical.cta} />
      </Section>

      {/* Blok 9 — prijzen */}
      <Section intro={sales.pricing.intro}>
        <ul className="pricing">
          {sales.pricing.plans.map((plan) => (
            <li key={plan.name} className={plan.highlighted ? "pricing__plan pricing__plan--highlighted" : "pricing__plan"}>
              <h3>{plan.name}</h3>
              <p className="pricing__price">
                <strong>{plan.price}</strong> <span>{plan.period}</span>
              </p>
              <CheckList items={plan.features} />
            </li>
          ))}
        </ul>
      </Section>

      {/* Blok 10 — risico verlagen + CTA */}
      <Section tone="muted" width="narrow" intro={sales.risk.intro}>
        <CheckList items={sales.risk.points} />
        <CtaButton cta={sales.risk.cta} />
      </Section>

      {/* Blok 11 — reviews */}
      <Section intro={{ title: "Wat anderen zeggen" }}>
        <TrustBlock testimonials={testimonials.slice(1)} note={trustNote} />
      </Section>

      {/* Blok 12 — even voorstellen */}
      <Section tone="muted">
        <div className="split split--media">
          <Visual variant={1} label="Plaats voor een portretfoto van de coach" />
          <div>
            <SectionHeading intro={sales.intro.intro} />
            <p className="lead">{sales.intro.text}</p>
            <CtaButton cta={sales.intro.cta} variant="text" />
          </div>
        </div>
      </Section>

      {/* Blok 13 — voor wie wel en niet + CTA */}
      <Section intro={sales.fit.intro}>
        <FitColumns forWho={sales.fit.forWho} notFor={sales.fit.notFor} />
        <CtaButton cta={sales.fit.cta} />
      </Section>

      {/* Blok 14 — waarom nu */}
      <Section tone="muted" width="narrow" intro={sales.whyNow.intro}>
        <p className="lead">{sales.whyNow.text}</p>
      </Section>

      {/* Blok 16 — meest gestelde vragen */}
      <Section width="narrow" intro={{ title: "Veelgestelde vragen" }}>
        <FaqList items={sales.faq} />
      </Section>

      {/* Blok 17 — laatste CTA */}
      <CtaBand title={sales.finalCta.title} text={sales.finalCta.text} cta={sales.finalCta.cta} />
    </>
  );
}
