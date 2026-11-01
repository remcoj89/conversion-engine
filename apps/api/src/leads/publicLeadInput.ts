import { createHash } from "node:crypto";

export type PublicLeadInput = Readonly<{
  name: string;
  email: string;
  message: string;
  phone: string | null;
  organization: string | null;
  privacyConsent: true;
  marketingConsent: boolean;
}>;

export type PublicLeadInputResult = { ok: true; input: PublicLeadInput } | { ok: false };

const MAX_LENGTH = {
  name: 200,
  email: 254,
  message: 5000,
  phone: 32,
  organization: 200,
} as const;

const ALLOWED_KEYS = new Set([
  "name",
  "email",
  "message",
  "phone",
  "organization",
  "privacyConsent",
  "marketingConsent",
]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^(?=.*[0-9])\+?[0-9 ()-]+$/;

export function parsePublicLeadInput(body: unknown): PublicLeadInputResult {
  if (!isRecord(body) || Object.keys(body).some((key) => !ALLOWED_KEYS.has(key))) {
    return { ok: false };
  }

  if (!isString(body.name) || !isString(body.email) || !isString(body.message)) return { ok: false };
  if (body.privacyConsent !== true || typeof body.marketingConsent !== "boolean") return { ok: false };

  const name = normalizeRequired(body.name, MAX_LENGTH.name);
  const email = normalizeEmail(body.email);
  const message = normalizeRequired(body.message, MAX_LENGTH.message);
  if (!name || !email || !message || !EMAIL_PATTERN.test(email)) return { ok: false };

  const phone = parseOptionalString(body.phone, MAX_LENGTH.phone);
  const organization = parseOptionalString(body.organization, MAX_LENGTH.organization);
  if (phone === null && body.phone !== undefined) return { ok: false };
  if (phone !== null && !PHONE_PATTERN.test(phone)) return { ok: false };
  if (organization === null && body.organization !== undefined) return { ok: false };

  return {
    ok: true,
    input: {
      name,
      email,
      message,
      phone,
      organization,
      privacyConsent: true,
      marketingConsent: body.marketingConsent,
    },
  };
}

export function hashPublicLeadInput(input: PublicLeadInput): string {
  return createHash("sha256")
    .update(JSON.stringify({
      name: input.name,
      email: input.email,
      message: input.message,
      phone: input.phone,
      organization: input.organization,
      privacyConsent: input.privacyConsent,
      marketingConsent: input.marketingConsent,
    }))
    .digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && !containsControlCharacter(value);
}

function normalizeRequired(value: string, maxLength: number): string | null {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized.length <= MAX_LENGTH.email ? normalized : null;
}

function parseOptionalString(value: unknown, maxLength: number): string | null {
  if (value === undefined) return null;
  if (!isString(value)) return null;
  const normalized = value.trim();
  return normalized === "" ? null : normalized.length <= maxLength ? normalized : null;
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}
