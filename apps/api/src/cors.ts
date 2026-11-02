import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export const PUBLIC_LEAD_ROUTE_PATH = "/v1/public/leads";
const PUBLIC_LEAD_CORS_ORIGINS_ENV = "PUBLIC_LEAD_CORS_ORIGINS";
const DEFAULT_DEVELOPMENT_ORIGINS = [
  "http://localhost:3100",
  "http://127.0.0.1:3100",
] as const;
const ALLOWED_METHOD = "POST";
const ALLOWED_HEADERS = [
  "accept",
  "content-type",
  "idempotency-key",
  "x-website-key",
] as const;

type Environment = Readonly<Record<string, string | undefined>>;

export function readPublicLeadCorsOrigins(environment: Environment = process.env): readonly string[] {
  const configuredOrigins = environment[PUBLIC_LEAD_CORS_ORIGINS_ENV]?.trim();
  const rawOrigins = configuredOrigins
    ? configuredOrigins.split(",")
    : environment.NODE_ENV === "production"
      ? []
      : [...DEFAULT_DEVELOPMENT_ORIGINS];

  const normalizedOrigins = rawOrigins.map((origin) => normalizeOrigin(origin));
  return [...new Set(normalizedOrigins)];
}

export function registerPublicLeadCors(app: FastifyInstance, origins: readonly string[]): void {
  const allowedOrigins = new Set(origins.map((origin) => normalizeOrigin(origin)));
  const allowedHeaders = new Set<string>(ALLOWED_HEADERS);

  app.addHook("onRequest", async (request, reply) => {
    if (getPathname(request) !== PUBLIC_LEAD_ROUTE_PATH) return;

    const origin = readHeader(request, "origin");
    if (!origin) return;

    if (!allowedOrigins.has(origin)) {
      sendCorsError(reply, 403, "cors_origin_denied");
      return;
    }

    reply.header("access-control-allow-origin", origin);
    reply.header("vary", "Origin");

    if (request.method !== "OPTIONS") return;

    if (!isAllowedPreflight(request, allowedHeaders)) {
      sendCorsError(reply, 400, "cors_preflight_rejected");
      return;
    }

    reply.header("access-control-allow-methods", ALLOWED_METHOD);
    reply.header("access-control-allow-headers", ALLOWED_HEADERS.join(", "));
    reply.header("access-control-max-age", "600");
    reply.header("vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
    reply.code(204).send();
  });
}

function normalizeOrigin(value: string): string {
  const origin = value.trim();
  if (!origin || origin === "*") {
    throw new Error(`${PUBLIC_LEAD_CORS_ORIGINS_ENV} bevat een ongeldige origin`);
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`${PUBLIC_LEAD_CORS_ORIGINS_ENV} bevat een ongeldige origin`);
  }

  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin !== origin) {
    throw new Error(`${PUBLIC_LEAD_CORS_ORIGINS_ENV} bevat een ongeldige origin`);
  }

  return parsed.origin;
}

function getPathname(request: FastifyRequest): string {
  return new URL(request.url, "http://localhost").pathname;
}

function readHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value) || typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function readRequestedHeaders(request: FastifyRequest): readonly string[] | null {
  const value = readHeader(request, "access-control-request-headers");
  if (!value) return [];

  const headers = value.split(",").map((header) => header.trim().toLowerCase());
  return headers.some((header) => !header) ? null : headers;
}

function isAllowedPreflight(request: FastifyRequest, allowedHeaders: ReadonlySet<string>): boolean {
  const requestedMethod = readHeader(request, "access-control-request-method")?.toUpperCase();
  const requestedHeaders = readRequestedHeaders(request);
  return requestedMethod === ALLOWED_METHOD
    && requestedHeaders !== null
    && requestedHeaders.every((header) => allowedHeaders.has(header));
}

function sendCorsError(
  reply: FastifyReply,
  statusCode: 400 | 403,
  error: "cors_origin_denied" | "cors_preflight_rejected",
): void {
  reply.code(statusCode).send({ error });
}
