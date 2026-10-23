import type { NewLead } from "./leadRepository.js";

// Maximum lengths after trimming. Email follows the practical SMTP limit of 254 characters.
const MAX_LENGTH = {
  name: 200,
  email: 254,
  phone: 32,
  message: 5000,
  source: 100,
} as const satisfies Record<keyof NewLead, number>;

type LeadField = keyof typeof MAX_LENGTH;

const REQUIRED: readonly LeadField[] = ["name", "email", "message", "source"];
const ALLOWED = new Set<string>(Object.keys(MAX_LENGTH));

// Basic check only: one @, no whitespace, a dot in the domain. Deliverability is not verified here.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Digits with common separators, e.g. "+31 6 1234 5678" or "(010) 123-4567"; at least one digit.
const PHONE_PATTERN = /^(?=.*[0-9])\+?[0-9 ()-]+$/;

export type LeadInputResult = { ok: true; lead: NewLead } | { ok: false };

// Accepts exactly name, email, message, source and optional phone. Anything else (tenantId, status,
// id, timestamps or unknown keys) rejects the whole body, so a client can never choose those values.
export function parseLeadInput(body: unknown): LeadInputResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false };
  if (Object.keys(body).some((key) => !ALLOWED.has(key))) return { ok: false };

  const input = body as Partial<Record<LeadField, unknown>>;
  const values: Partial<Record<LeadField, string>> = {};
  for (const field of Object.keys(MAX_LENGTH) as LeadField[]) {
    if (input[field] === undefined) {
      if (REQUIRED.includes(field)) return { ok: false };
      continue;
    }
    if (typeof input[field] !== "string") return { ok: false };
    const value = input[field].trim();
    // An empty or whitespace-only value is rejected, also for the optional phone.
    if (value === "" || value.length > MAX_LENGTH[field]) return { ok: false };
    values[field] = value;
  }

  if (!EMAIL_PATTERN.test(values.email!)) return { ok: false };
  if (values.phone !== undefined && !PHONE_PATTERN.test(values.phone)) return { ok: false };

  return {
    ok: true,
    lead: {
      name: values.name!,
      email: values.email!,
      phone: values.phone ?? null,
      message: values.message!,
      source: values.source!,
    },
  };
}
