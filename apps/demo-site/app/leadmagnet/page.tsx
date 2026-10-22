import type { Metadata } from "next";
import { CardGrid, FaqList, FitColumns, StepList, Visual } from "../../components/Blocks";
import { CtaBand } from "../../components/CtaBand";
import { CtaButton } from "../../components/CtaButton";
import { QuizLeadmagnet } from "../../components/QuizLeadmagnet";
import { Section, SectionHeading } from "../../components/Section";
import { leadmagnet, pageSeo, quiz } from "../../content/demo";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata(pageSeo.leadmagnet);

// Leadmagnetpagina: website-blokken-leadmagnetpagina.md, variant Trainingsdoel-check.
export default function LeadmagnetPage() {
  return (
    <>
      {/* LM-01 — resultaatgerichte hero */}
      <section className="hero" aria-labelledby="lm-title">
        <div className="container hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">{leadmagnet.hero.eyebrow}</p>
            <h1 id="lm-title">{leadmagnet.hero.title}</h1>
            <p className="lead">{leadmagnet.hero.promise}</p>
            <p>{leadmagnet.hero.text}</p>
            <div className="cta-row">
              <CtaButton cta={leadmagnet.hero.cta} />
            </div>
          </div>
          <Visual variant={2} label="Illustratie van een trainingsplanning" />
        </div>
      </section>

      {/* LM-02 — herkenning */}
      <Section tone="muted" width="narrow" intro={leadmagnet.recognition.intro}>
        <div className="prose">
          {leadmagnet.recognition.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </Section>

      {/* LM-03 — wat je krijgt */}
      <Section intro={leadmagnet.benefits.intro}>
        <CardGrid cards={leadmagnet.benefits.items} />
      </Section>

      {/* LM-04 — hoe het werkt */}
      <Section tone="muted" intro={leadmagnet.howItWorks.intro}>
        <StepList steps={leadmagnet.howItWorks.items} />
      </Section>

      {/* LM-05 — voor wie */}
      <Section intro={leadmagnet.fit.intro}>
        <FitColumns forWho={leadmagnet.fit.forWho} notFor={leadmagnet.fit.notFor} forTitle="Wel voor jou als…" notTitle="Kies een andere route als…" />
      </Section>

      {/* LM-06 quizinteractie + LM-08 optioneel inschrijfformulier */}
      <section id="check" className="section section--muted" aria-labelledby="check-title" tabIndex={-1}>
        <div className="container container--narrow">
          <SectionHeading intro={{ eyebrow: quiz.name, title: "Beantwoord vijf korte vragen" }} id="check-title" />
          <QuizLeadmagnet quiz={quiz} form={leadmagnet.form} />
        </div>
      </section>

      {/* LM-09 — vertrouwen en methode */}
      <Section width="narrow" intro={leadmagnet.trust.intro}>
        <p className="lead">{leadmagnet.trust.text}</p>
      </Section>

      {/* LM-10 — FAQ en bezwaren */}
      <Section tone="muted" width="narrow" intro={{ title: "Veelgestelde vragen" }}>
        <FaqList items={leadmagnet.faq} />
      </Section>

      {/* LM-11 — laatste CTA, zelfde actie als de hero */}
      <CtaBand title={leadmagnet.finalCta.title} text={leadmagnet.finalCta.text} cta={leadmagnet.finalCta.cta} />
    </>
  );
}
