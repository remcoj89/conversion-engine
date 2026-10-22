import type { Metadata } from "next";
import { AppointmentCta } from "../../components/AppointmentCta";
import { CardGrid, FaqList, StepList } from "../../components/Blocks";
import { ContactForm } from "../../components/ContactForm";
import { CtaBand } from "../../components/CtaBand";
import { CtaButton } from "../../components/CtaButton";
import { Section } from "../../components/Section";
import { TrustBlock } from "../../components/TrustBlock";
import { contact, pageSeo, testimonials, trustNote } from "../../content/demo";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata(pageSeo.contact);

// Contactpagina: website-blokken-contactpagina.md, CP-01 t/m CP-08 (CP-09 = /bedankt?bron=contact).
export default function ContactPage() {
  return (
    <>
      {/* CP-01 — conversiegerichte hero */}
      <section className="hero hero--center" aria-labelledby="contact-title">
        <div className="container container--narrow">
          <p className="eyebrow">{contact.hero.eyebrow}</p>
          <h1 id="contact-title">{contact.hero.title}</h1>
          <p className="lead">{contact.hero.text}</p>
          <div className="cta-row cta-row--center">
            <CtaButton cta={contact.hero.cta} />
          </div>
        </div>
      </section>

      {/* CP-02 — waarom contact opnemen */}
      <Section tone="muted" intro={contact.reasons.intro}>
        <CardGrid cards={contact.reasons.cards} />
      </Section>

      {/* CP-03 primaire contactactie + CP-04 kort contactformulier */}
      <section className="section" aria-label="Contact opnemen">
        <div className="container contact-grid">
          <div id="afspraak" className="contact-panel contact-panel--primary" tabIndex={-1}>
            <h2>{contact.appointment.title}</h2>
            <p>{contact.appointment.text}</p>
            <AppointmentCta label={contact.appointment.cta} demoResult={contact.appointment.demoResult} />
          </div>
          <div className="contact-panel">
            <h2>{contact.form.title}</h2>
            <p>{contact.form.text}</p>
            <ContactForm reasons={contact.form.reasons} submitLabel={contact.form.submitLabel} responder={contact.responder} />
          </div>
        </div>
      </section>

      {/* CP-05 — vertrouwen en bewijs */}
      <Section tone="muted" intro={{ title: "Wie reageert er?", text: contact.responder }}>
        <TrustBlock testimonials={testimonials} limit={2} note={trustNote} />
      </Section>

      {/* CP-06 — wat gebeurt er daarna */}
      <Section intro={contact.steps.intro}>
        <StepList steps={contact.steps.items} />
      </Section>

      {/* CP-07 — FAQ en bezwaren */}
      <Section tone="muted" width="narrow" intro={{ title: "Veelgestelde vragen" }}>
        <FaqList items={contact.faq} />
      </Section>

      {/* CP-08 — laatste CTA, zelfde bestemming als CP-03 */}
      <CtaBand title={contact.finalCta.title} text={contact.finalCta.text} cta={contact.finalCta.cta} />
    </>
  );
}
