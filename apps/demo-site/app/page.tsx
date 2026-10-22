import type { Metadata } from "next";
import { CardGrid, CheckList, Visual } from "../components/Blocks";
import { CtaBand } from "../components/CtaBand";
import { CtaButton } from "../components/CtaButton";
import { Section, SectionHeading } from "../components/Section";
import { TrustBlock } from "../components/TrustBlock";
import { home, pageSeo, site, testimonials, trustNote } from "../content/demo";
import { pageMetadata } from "../lib/seo";

export const metadata: Metadata = { ...pageMetadata(pageSeo.home), title: { absolute: `${pageSeo.home.title} | ${site.name}` } };

// Homepage: website-blokken-home-pagina.docx, blok 1 t/m 7 in vaste volgorde.
export default function HomePage() {
  return (
    <>
      {/* Blok 1 — resultaatgerichte titel, herkenbare pijn en CTA */}
      <section className="hero" aria-labelledby="home-title">
        <div className="container hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">{home.hero.eyebrow}</p>
            <h1 id="home-title">{home.hero.title}</h1>
            <p className="lead">{home.hero.text}</p>
            <div className="cta-row">
              <CtaButton cta={home.hero.cta} />
              <CtaButton cta={home.hero.secondary} variant="text" />
            </div>
          </div>
          <Visual variant={0} label="Illustratieve achtergrond; in de klantversie een foto van de coach" />
        </div>
      </section>

      {/* Blok 2 — herkenbare situatie, pijn en verlangen */}
      <Section tone="muted" width="narrow" intro={home.recognition.intro}>
        <div className="prose">
          {home.recognition.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </Section>

      {/* Blok 3 — reviews en het belangrijkste programma, met knop naar de salespage */}
      <Section intro={home.offer.intro}>
        <div className="split">
          <div className="offer-card">
            <CheckList items={home.offer.points} />
            <CtaButton cta={home.offer.cta} />
          </div>
          <TrustBlock testimonials={testimonials} limit={2} note={trustNote} />
        </div>
      </Section>

      {/* Blok 4 — over mij */}
      <Section tone="muted">
        <div className="split split--media">
          <Visual variant={1} label="Plaats voor een portretfoto van de coach" />
          <div>
            <SectionHeading intro={home.about.intro} />
            <p className="lead">{home.about.text}</p>
            <CtaButton cta={home.about.cta} variant="secondary" />
          </div>
        </div>
      </Section>

      {/* Blok 5 — visie en werkwijze */}
      <Section intro={home.approach.intro}>
        <CardGrid cards={home.approach.cards} />
      </Section>

      {/* Blok 6 — één eerste stap: de leadmagnet */}
      <CtaBand title={home.firstStep.intro.title} text={home.firstStep.intro.text} cta={home.firstStep.cta} />

      {/* Blok 7 — socials */}
      <Section intro={home.socials.intro}>
        <ul className="social-grid">
          {home.socials.posts.map((post, index) => (
            <li key={post} className="social-tile">
              <Visual variant={index + 1} />
              <p>{post}</p>
            </li>
          ))}
        </ul>
        <p className="muted-note">
          <strong>{home.socials.handle}</strong> — {home.socials.note}
        </p>
      </Section>
    </>
  );
}
