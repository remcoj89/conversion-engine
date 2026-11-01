"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { configuredPublicLeadIntakeClient, contactPageLeadContext, type PublicLeadIntakeClient, type PublicLeadIntakeContext } from "../lib/publicLeadIntake";
import { usePublicLeadSubmission } from "../lib/usePublicLeadSubmission";
import { hasErrors, validateContact, type ContactField, type ContactValues } from "../lib/validation";
import { CheckboxField, FormAlert, TextField } from "./FormFields";

type Props = Readonly<{
  submitLabel: string;
  responder: string;
  intakeClient?: PublicLeadIntakeClient;
  context?: PublicLeadIntakeContext;
}>;

const empty: ContactValues = { name: "", email: "", organization: "", message: "", phone: "", privacy: false, marketing: false };

// Kort contactformulier (CP-04). De adapter bepaalt of verzenden al beschikbaar is.
export function ContactForm({ submitLabel, responder, intakeClient = configuredPublicLeadIntakeClient, context = contactPageLeadContext }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<ContactValues>(empty);
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const { status, message, submit, locked } = usePublicLeadSubmission(intakeClient, context, () => router.push("/bedankt?bron=contact"));

  const errors = validateContact(values);
  // Fouten verschijnen per veld na verlaten van het veld, en allemaal na een verzendpoging.
  const visible = (field: ContactField) => (submitted || touched[field] ? errors[field] : undefined);
  const set = <K extends keyof ContactValues>(field: K, value: ContactValues[K]) =>
    setValues((current) => ({ ...current, [field]: value }));
  const blur = (field: ContactField) => () => setTouched((current) => ({ ...current, [field]: true }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    const valid = !hasErrors(errors);
    if (!valid) {
      // Focus naar het eerste foutieve veld, zodat toetsenbord- en schermlezergebruikers direct verder kunnen.
      const first = (Object.keys(errors) as ContactField[])[0];
      document.getElementById(`contact-${first}`)?.focus();
      await submit({ data: toLeadFormData(values), isValid: false });
      return;
    }
    await submit({ data: toLeadFormData(values), isValid: true });
  }

  const showInvalid = status === "invalid" && hasErrors(errors);

  return (
    <form className="form" noValidate onSubmit={onSubmit} aria-describedby="contact-privacy-note">
      <fieldset disabled={locked} className="form__fields">
        <legend className="visually-hidden">Contactformulier</legend>
        <TextField id="contact-name" label="Naam" required autoComplete="name" value={values.name} onChange={(v) => set("name", v)} onBlur={blur("name")} error={visible("name")} maxLength={80} />
        <TextField id="contact-email" label="E-mailadres" type="email" required autoComplete="email" value={values.email} onChange={(v) => set("email", v)} onBlur={blur("email")} error={visible("email")} />
        <TextField id="contact-organization" label="Organisatie" autoComplete="organization" value={values.organization} onChange={(v) => set("organization", v)} onBlur={blur("organization")} error={visible("organization")} maxLength={120} />
        <TextField id="contact-phone" label="Telefoonnummer" type="tel" autoComplete="tel" value={values.phone} onChange={(v) => set("phone", v)} onBlur={blur("phone")} error={visible("phone")} hint="Alleen als je liever gebeld wordt." />
        <TextField id="contact-message" label="Bericht" required multiline value={values.message} onChange={(v) => set("message", v)} onBlur={blur("message")} error={visible("message")} maxLength={1000} />
        <CheckboxField id="contact-privacy" required checked={values.privacy} onChange={(v) => set("privacy", v)} error={visible("privacy")}>
          Ik geef toestemming om mijn gegevens te gebruiken voor het beantwoorden van mijn vraag.
        </CheckboxField>
        <CheckboxField id="contact-marketing" checked={values.marketing} onChange={(v) => set("marketing", v)}>
          Stuur mij af en toe trainingstips per e-mail (optioneel, los van je vraag).
        </CheckboxField>
      </fieldset>
      <p id="contact-privacy-note" className="form__note">
        {responder} Lees de <Link href="/privacy">privacytekst</Link>.
      </p>
      <FormAlert
        status={showInvalid ? "invalid" : status === "invalid" ? "idle" : status}
        messages={{
          invalid: "Controleer de gemarkeerde velden. Je ingevulde gegevens zijn bewaard.",
          submitting: "Bezig met verzenden…",
          success: "Gelukt! Je wordt doorgestuurd naar de bevestiging.",
          unavailable: message ?? "Dit formulier is op deze demo nog niet gekoppeld. Er is niets verzonden of opgeslagen. Plan direct een kennismaking of probeer het later opnieuw.",
          error: message ?? "Er ging iets mis tijdens het verzenden. Er is niets opgeslagen. Probeer het opnieuw of plan direct een kennismaking.",
        }}
      />
      <button type="submit" className="cta cta--primary form__submit" disabled={locked} aria-disabled={locked}>
        {status === "submitting" ? "Bezig met verzenden…" : submitLabel}
      </button>
    </form>
  );
}

function toLeadFormData(values: ContactValues) {
  return {
    name: values.name.trim(),
    email: values.email.trim(),
    organization: values.organization.trim(),
    message: values.message.trim(),
    phone: values.phone.trim(),
    privacyConsent: values.privacy,
    marketingConsent: values.marketing,
  } as const;
}
