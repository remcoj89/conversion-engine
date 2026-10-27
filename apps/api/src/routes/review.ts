import type { FastifyInstance, FastifyReply } from "fastify";
import { getReviewerContext } from "../auth/reviewerAuthHook.js";
import { REVIEW_NOTE_MAX_LENGTH, reviewRequestReasonCodes } from "../db/schema.js";
import type {
  RequestChangesInput,
  RequestChangesResult,
  ReviewableOnboarding,
  ReviewReasonCode,
} from "../onboarding/onboardingReviewRepository.js";
import { missingFields, parseAnswers } from "../../../../packages/onboarding-contract/src/index.ts";

// Keeps the HTTP layer independent of Drizzle/PostgreSQL. Always called with the reviewer context tenant.
export type ReviewStore = Readonly<{
  findReviewable: (tenantId: string) => Promise<ReviewableOnboarding | null>;
  // Review request + status change + audit event in one transaction.
  requestChanges: (input: RequestChangesInput) => Promise<RequestChangesResult>;
}>;

export type ReviewRouteDependencies = Readonly<{
  reviewStore: ReviewStore;
}>;

const noStore = { "cache-control": "no-store" };
// A note of at most 2,000 characters plus the other fields fits easily; anything larger is not a review request.
const REQUEST_CHANGES_BODY_LIMIT_BYTES = 16 * 1024;
const REQUEST_CHANGES_BODY_KEYS = ["base_version", "note", "reason_code"];

// Must be registered behind the reviewer auth hook; without it getReviewerContext fails closed.
export function registerReviewRoutes(app: FastifyInstance, { reviewStore }: ReviewRouteDependencies) {
  // Read-only metadata for the assigned tenant. Answers and Project Brief never leave the server here.
  app.get("/v1/review/onboarding", async (request, reply) => {
    const context = getReviewerContext(request);
    reply.headers(noStore);

    const onboarding = await reviewStore.findReviewable(context.tenantId);
    if (!onboarding) return sendNotFound(reply);

    return {
      status: onboarding.status,
      version: onboarding.version,
      updated_at: onboarding.updatedAt.toISOString(),
      missing_required_fields: countMissingRequiredFields(onboarding.answers),
    };
  });

  // submitted → review_needed. Tenant and reviewer come only from the reviewer context.
  app.post("/v1/review/onboarding/request-changes", { bodyLimit: REQUEST_CHANGES_BODY_LIMIT_BYTES }, async (request, reply) => {
    const context = getReviewerContext(request);
    reply.headers(noStore);

    const parsed = parseRequestChangesBody(request.body);
    if (!parsed) return reply.code(400).send({ error: "invalid_body" });

    const result = await reviewStore.requestChanges({ tenantId: context.tenantId, reviewerUserId: context.userId, ...parsed });
    switch (result.status) {
      case "review_needed":
        return { status: result.status, version: result.version };
      // The repository re-checks the hook's rules inside its transaction; same responses as the hook.
      case "reviewer_forbidden":
        return reply.code(403).send({ error: "forbidden" });
      case "self_review_forbidden":
        return reply.code(403).send({ error: "self_review_forbidden" });
      case "not_found":
        return sendNotFound(reply);
      case "not_reviewable":
        return reply.code(409).send({ error: "not_reviewable" });
      case "conflict":
        return reply.code(409).send({ error: "version_conflict", current_version: result.currentVersion });
    }
  });
}

function sendNotFound(reply: FastifyReply) {
  return reply.code(404).send({ error: "onboarding_not_found" });
}

type RequestChangesBody = Pick<RequestChangesInput, "baseVersion" | "reasonCode" | "note">;

// Strict contract: exactly these three keys; tenant and project never come from the body.
function parseRequestChangesBody(body: unknown): RequestChangesBody | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  if (Object.keys(body).sort().join(",") !== REQUEST_CHANGES_BODY_KEYS.join(",")) return null;

  const { base_version: baseVersion, reason_code: reasonCode, note } = body as Record<string, unknown>;
  if (!Number.isSafeInteger(baseVersion) || (baseVersion as number) < 1) return null;
  if (!isReasonCode(reasonCode)) return null;
  if (typeof note !== "string") return null;
  // Stored trimmed; the database enforces the same bounds as a second line of defence.
  const trimmedNote = note.trim();
  if (trimmedNote.length === 0 || trimmedNote.length > REVIEW_NOTE_MAX_LENGTH) return null;

  return { baseVersion: baseVersion as number, reasonCode, note: trimmedNote };
}

function isReasonCode(value: unknown): value is ReviewReasonCode {
  return typeof value === "string" && (reviewRequestReasonCodes as readonly string[]).includes(value);
}

// Uses the shared onboarding contract, so the route holds no field list of its own.
function countMissingRequiredFields(storedAnswers: Record<string, unknown>): number {
  const parsed = parseAnswers(storedAnswers);
  // Stored answers were validated on save; a mismatch means schema drift and must fail closed (500).
  if (!parsed.ok) throw new Error("Stored onboarding answers do not match the current schema");
  return missingFields(parsed.answers).length;
}
