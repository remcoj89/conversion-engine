import type { FastifyInstance, FastifyRequest } from "fastify";
import { ensureDatabaseRequestContext, setDatabasePublicContactEmail, setDatabasePublicWebsite, setDatabasePublicWebsiteLookup } from "../db/requestContext.js";
import { parsePublicLeadInput, type PublicLeadInput } from "../leads/publicLeadInput.js";
import {
  isPublicLeadRateLimited,
  type PublicLeadResult,
  type PublicWebsiteContext,
  PublicLeadIdempotencyConflictError,
} from "../leads/publicLeadRepository.js";

const BODY_LIMIT_BYTES = 16 * 1024;
const HEADER_MAX_LENGTH = 128;
const NO_STORE_HEADER = { "cache-control": "no-store" };
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/;

export type PublicWebsiteResolver = (publicKey: string) => Promise<PublicWebsiteContext | null>;
export type PublicLeadCreator = (
  website: PublicWebsiteContext,
  idempotencyKey: string,
  input: PublicLeadInput,
) => Promise<PublicLeadResult>;

export type PublicLeadRouteDependencies = Readonly<{
  websiteResolver: PublicWebsiteResolver;
  publicLeadCreator: PublicLeadCreator;
}>;

export function registerPublicLeadRoutes(
  app: FastifyInstance,
  { websiteResolver, publicLeadCreator }: PublicLeadRouteDependencies,
): void {
  app.post("/v1/public/leads", { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    reply.headers(NO_STORE_HEADER);

    const websiteKey = readSingleHeader(request, "x-website-key");
    const idempotencyKey = readSingleHeader(request, "idempotency-key");
    if (!websiteKey || websiteKey.length > HEADER_MAX_LENGTH || !idempotencyKey || !isValidIdempotencyKey(idempotencyKey)) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const input = parsePublicLeadInput(request.body);
    if (!input.ok) return reply.code(400).send({ error: "invalid_body" });

    try {
      const context = ensureDatabaseRequestContext(request);
      setDatabasePublicWebsiteLookup(context, websiteKey);
      const website = await websiteResolver(websiteKey);
      if (!website) return reply.code(404).send({ error: "not_found" });

      // The tenant is copied only after the opaque key was resolved against an active website.
      setDatabasePublicWebsite(context, websiteKey, website.tenantId);
      setDatabasePublicContactEmail(context, input.input.email);
      const result = await publicLeadCreator(website, idempotencyKey, input.input);
      if (isPublicLeadRateLimited(result)) return reply.code(429).send({ error: "rate_limited" });
      if (result.status === "replayed") return reply.code(200).send({ accepted: true });
      return reply.code(201).send({ accepted: true });
    } catch (error) {
      if (error instanceof PublicLeadIdempotencyConflictError) {
        return reply.code(409).send({ error: "idempotency_conflict" });
      }
      request.log.error({ errorType: error instanceof Error ? error.name : typeof error }, "public lead intake failed");
      return reply.code(503).send({ error: "temporarily_unavailable" });
    }
  });
}

function readSingleHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value) || typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function isValidIdempotencyKey(value: string): boolean {
  return value.length <= HEADER_MAX_LENGTH && IDEMPOTENCY_KEY_PATTERN.test(value);
}
