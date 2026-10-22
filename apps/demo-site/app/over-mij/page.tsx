import type { Metadata } from "next";
import { CardGrid, CheckList, Visual } from "../../components/Blocks";
import { CtaBand } from "../../components/CtaBand";
import { CtaButton } from "../../components/CtaButton";
import { Section, SectionHeading } from "../../components/Section";
import { TrustBlock } from "../../components/TrustBlock";
import { about, pageSeo, site, testimonials, trustNote } from "../../content/demo";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata(pageSeo.about);

// Over mij: website-blokken-over-mij-pagina-1.docx, blok 1 t/m 6. Geschreven vóór de ideale klant.
export default function AboutPage() {
  return (
    <>
      {/* Blok 1 — drijfveer van de ideale klant = drijfveer van de coach */}
      <section className="hero" aria-labelledby="about-title">
        <div className="container hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">{about.hero.eyebrow}</p>
            <h1 id="about-title">{about.hero.title}</h1>
            <p className="lead">{about.hero.text}</p>
          </div>
          <Visual variant={1} label="Plaats voor een portretfoto van de coach" />
        </div>
      </section>

      {/* Blok 2 — met wie ik samenwerk */}
      <Section tone="muted" width="narrow" intro={about.fit.intro}>
        <CheckList items={about.fit.items} />
      </Section>

      {/* Blok 3 — mijn verhaal */}
      <Section width="narrow" intro={about.story.intro}>
        <div className="prose">
          {about.story.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </Section>

      {/* Blok 4 — wat ik doe: ervaring, opleiding, reviews */}
      <Section tone="muted" intro={about.credentials.intro}>
        <CardGrid cards={about.credentials.items} />
        <TrustBlock testimonials={testimonials} limit={2} note={trustNote} />
      </Section>

      {/* Blok 5 — korte introductie en doorlink naar het belangrijkste product */}
      <Section>
        <div className="offer-card offer-card--wide">
          <SectionHeading intro={about.product.intro} />
          <CtaButton cta={about.product.cta} />
        </div>
      </Section>

      {/* Blok 6 — next step */}
      <CtaBand title={about.nextStep.intro.title} text={about.nextStep.intro.text} cta={about.nextStep.cta} secondary={site.leadmagnetCta} />
    </>
  );
}
