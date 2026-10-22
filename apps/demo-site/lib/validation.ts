// Gedeelde formuliervalidatie (GE-09): verplichte velden en formaat, met foutmeldingen
// die de bezoeker vertellen wat er moet gebeuren.

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Cijfers, spaties, +, -, haakjes; 10 tot 15 cijfers.
const PHONE_PATTERN = /^\+?[\d\s()-]+$/;

export type ContactValues = Readonly<{
  name: string;
  email: string;
  reason: string;
  message: string;
  phone: string;
  privacy: boolean;
  marketing: boolean;
}>;

export type ContactField = "name" | "email" | "reason" | "message" | "phone" | "privacy";

export function validateContact(values: ContactValues, reasons: readonly string[]): FieldErrors<ContactField> {
  const errors: FieldErrors<ContactField> = {};
  if (values.name.trim() === "") {
    errors.name = "Vul je naam in.";
  } else if (values.name.trim().length > 80) {
    errors.name = "Gebruik maximaal 80 tekens.";
  }
  const emailError = validateEmail(values.email);
  if (emailError) {
    errors.email = emailError;
  }
  if (!reasons.includes(values.reason)) {
    errors.reason = "Kies waar je vraag over gaat.";
  }
  if (values.message.length > 1000) {
    errors.message = "Gebruik maximaal 1000 tekens.";
  }
  const phone = values.phone.trim();
  if (phone !== "") {
    const digits = phone.replace(/\D/g, "").length;
    if (!PHONE_PATTERN.test(phone) || digits < 10 || digits > 15) {
      errors.phone = "Vul een geldig telefoonnummer in, bijvoorbeeld 06 12345678, of laat dit veld leeg.";
    }
  }
  if (!values.privacy) {
    errors.privacy = "Geef toestemming om je vraag te verwerken, anders kunnen we niet reageren.";
  }
  return errors;
}

export type SummaryValues = Readonly<{ firstName: string; email: string; consent: boolean; marketing: boolean }>;

export type SummaryField = "firstName" | "email" | "consent";

export function validateSummary(values: SummaryValues): FieldErrors<SummaryField> {
  const errors: FieldErrors<SummaryField> = {};
  if (values.firstName.trim() === "") {
    errors.firstName = "Vul je voornaam in.";
  } else if (values.firstName.trim().length > 50) {
    errors.firstName = "Gebruik maximaal 50 tekens.";
  }
  const emailError = validateEmail(values.email);
  if (emailError) {
    errors.email = emailError;
  }
  if (!values.consent) {
    errors.consent = "Geef toestemming om je de samenvatting te sturen.";
  }
  return errors;
}

function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (email === "") {
    return "Vul je e-mailadres in.";
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return "Vul een geldig e-mailadres in, bijvoorbeeld naam@voorbeeld.nl.";
  }
  return undefined;
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}
