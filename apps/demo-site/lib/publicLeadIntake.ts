/**
 * Public lead intake contract for the demo site.
 *
 * The API resolves the website and fixes the lead source from the public
 * website key. The browser therefore sends neither a tenant ID nor a source.
 */

export const contactPageLeadContext = Object.freeze({
  source: "website_contact",
} as const);

export type PublicLeadSource = "website_contact";

export type PublicLeadIntakeContext = Readonly<{
  source: PublicLeadSource;
}>;

export type PublicLeadFormData = Readonly<{
  name: string;
  email: string;
  organization: string;
  message: string;
  phone: string;
  privacyConsent: boolean;
  marketingConsent: boolean;
}>;

export type PublicLeadSubmission = PublicLeadFormData &
  Readonly<{
    source: PublicLeadSource;
  }>;

export type PublicLeadIntakeResult =
  | Readonly<{ kind: "accepted" }>
  | Readonly<{ kind: "unavailable"; reason: "not_configured" | "not_found" }>
  | Readonly<{
      kind: "error";
      reason: "invalid_request" | "idempotency_conflict" | "rate_limited" | "temporarily_unavailable" | "network";
    }>;

export type PublicLeadErrorReason = Extract<PublicLeadIntakeResult, { kind: "error" }>["reason"] | "not_found";

export interface PublicLeadIntakeClient {
  submitLead(submission: PublicLeadSubmission): Promise<PublicLeadIntakeResult>;
}

export type PublicLeadApiConfig = Readonly<{
  apiBaseUrl: string;
  websiteKey: string;
}>;

type PublicLeadFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type PublicLeadEnvironment = Readonly<Record<string, string | undefined>>;

const API_BASE_URL_ENV = "NEXT_PUBLIC_CONVERSION_ENGINE_API_BASE_URL";
const WEBSITE_KEY_ENV = "NEXT_PUBLIC_CONVERSION_ENGINE_WEBSITE_KEY";
const WEBSITE_KEY_MAX_LENGTH = 128;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/;

export function createPublicLeadSubmission(data: PublicLeadFormData, context: PublicLeadIntakeContext): PublicLeadSubmission {
  return {
    ...data,
    source: context.source,
  };
}

/**
 * Reads only browser-safe NEXT_PUBLIC_ variables. A missing or invalid
 * configuration deliberately selects the unavailable fallback.
 */
export function readPublicLeadApiConfig(environment: PublicLeadEnvironment = browserPublicLeadEnvironment()): PublicLeadApiConfig | null {
  const apiBaseUrl = normalizeApiBaseUrl(environment[API_BASE_URL_ENV]);
  const websiteKey = environment[WEBSITE_KEY_ENV]?.trim();

  if (!apiBaseUrl || !websiteKey || websiteKey.length > WEBSITE_KEY_MAX_LENGTH) return null;
  return { apiBaseUrl, websiteKey };
}

export function createConfiguredPublicLeadIntakeClient(
  environment: PublicLeadEnvironment = browserPublicLeadEnvironment(),
  fetchImplementation: PublicLeadFetch = fetch,
  idempotencyKeyFactory: () => string = createIdempotencyKey,
): PublicLeadIntakeClient {
  const config = readPublicLeadApiConfig(environment);
  return config ? createPublicLeadApiClient(config, fetchImplementation, idempotencyKeyFactory) : unavailableLeadIntakeClient;
}

export function createPublicLeadApiClient(
  config: PublicLeadApiConfig,
  fetchImplementation: PublicLeadFetch = fetch,
  idempotencyKeyFactory: () => string = createIdempotencyKey,
): PublicLeadIntakeClient {
  return {
    async submitLead(submission): Promise<PublicLeadIntakeResult> {
      const idempotencyKey = idempotencyKeyFactory();
      if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
        return { kind: "error", reason: "network" };
      }

      const body = toPublicLeadRequestBody(submission);

      try {
        const response = await fetchImplementation(`${config.apiBaseUrl}/v1/public/leads`, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "x-website-key": config.websiteKey,
            "idempotency-key": idempotencyKey,
          },
          body: JSON.stringify(body),
        });

        if (response.status === 200 || response.status === 201) return { kind: "accepted" };
        if (response.status === 400) return { kind: "error", reason: "invalid_request" };
        if (response.status === 404) return { kind: "unavailable", reason: "not_found" };
        if (response.status === 409) return { kind: "error", reason: "idempotency_conflict" };
        if (response.status === 429) return { kind: "error", reason: "rate_limited" };
        if (response.status === 503) return { kind: "error", reason: "temporarily_unavailable" };
        return { kind: "error", reason: "temporarily_unavailable" };
      } catch {
        return { kind: "error", reason: "network" };
      }
    },
  };
}

export function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function toPublicLeadRequestBody(submission: PublicLeadSubmission): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: submission.name.trim(),
    email: submission.email.trim(),
    message: submission.message.trim(),
    privacyConsent: submission.privacyConsent,
    marketingConsent: submission.marketingConsent,
  };

  const phone = submission.phone.trim();
  const organization = submission.organization.trim();
  if (phone) body.phone = phone;
  if (organization) body.organization = organization;
  return body;
}

export function getPublicLeadErrorMessage(reason: PublicLeadErrorReason): string {
  switch (reason) {
    case "not_found":
      return "Dit formulier is tijdelijk niet beschikbaar. Probeer het later opnieuw of plan direct een kennismaking.";
    case "invalid_request":
      return "We konden je bericht niet verwerken. Controleer je gegevens en probeer het opnieuw.";
    case "idempotency_conflict":
      return "Je bericht is niet bevestigd. Probeer het opnieuw.";
    case "rate_limited":
      return "Het is tijdelijk druk. Wacht even en probeer het opnieuw.";
    case "temporarily_unavailable":
    case "network":
      return "Verzenden lukt nu even niet. Probeer het later opnieuw of plan direct een kennismaking.";
  }
}

/**
 * Safe default when the public API configuration is absent. It never
 * simulates success and never sends the visitor's data anywhere.
 */
export const unavailableLeadIntakeClient: PublicLeadIntakeClient = {
  async submitLead(): Promise<PublicLeadIntakeResult> {
    return { kind: "unavailable", reason: "not_configured" };
  },
};

export const configuredPublicLeadIntakeClient = createConfiguredPublicLeadIntakeClient();

function normalizeApiBaseUrl(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function browserPublicLeadEnvironment(): PublicLeadEnvironment {
  // Keep these accesses static so Next.js can inline NEXT_PUBLIC_ variables in
  // the browser bundle. No server-only environment variable is read here.
  return {
    [API_BASE_URL_ENV]: process.env.NEXT_PUBLIC_CONVERSION_ENGINE_API_BASE_URL,
    [WEBSITE_KEY_ENV]: process.env.NEXT_PUBLIC_CONVERSION_ENGINE_WEBSITE_KEY,
  };
}
