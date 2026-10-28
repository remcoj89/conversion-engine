import type { FastifyInstance, FastifyReply } from "fastify";
import { getReviewerContext } from "../auth/reviewerAuthHook.js";
import { blockReasonCodes, reopenReasonCodes, REVIEW_NOTE_MAX_LENGTH, reviewRequestReasonCodes, unblockReasonCodes } from "../db/schema.js";
import type { OnboardingStatus } from "../onboarding/onboardingRepository.js";
import type {
  ApproveInput,
  ApproveResult,
  BlockInput,
  BlockResult,
  ReopenInput,
  ReopenResult,
  ReadReviewableContentInput,
  ReadReviewableContentResult,
  RequestChangesInput,
  RequestChangesResult,
  ReviewableOnboarding,
  ReviewableOnboardingContent,
  ReviewActionInput,
  ReviewerTarget,
  ReviewTransitionResult,
  UnblockInput,
  UnblockResult,
} from "../onboarding/onboardingReviewRepository.js";
import { missingFields, parseAnswers } from "../../../../packages/onboarding-contract/src/index.ts";

// Keeps the HTTP layer independent of Drizzle/PostgreSQL. Always called with the reviewer context tenant.
export type ReviewStore = Readonly<{
  findReviewable: (tenantId: string) => Promise<ReviewableOnboarding | null>;
  readContent: (input: ReadReviewableContentInput) => Promise<ReadReviewableContentResult>;
  // Each action stores its reason, changes the status and writes its audit event in one transaction.
  requestChanges: (input: RequestChangesInput) => Promise<RequestChangesResult>;
  block: (input: BlockInput) => Promise<BlockResult>;
  unblock: (input: UnblockInput) => Promise<UnblockResult>;
  approve: (input: ApproveInput) => Promise<ApproveResult>;
  reopen: (input: ReopenInput) => Promise<ReopenResult>;
}>;

export type ReviewRouteDependencies = Readonly<{
  reviewStore: ReviewStore;
}>;

const noStore = { "cache-control": "no-store" };
// A note of at most 2,000 characters plus the other fields fits easily; anything larger is not a review action.
const REVIEW_ACTION_BODY_LIMIT_BYTES = 16 * 1024;
const REVIEW_ACTION_BODY_KEYS = ["base_version", "note", "reason_code"];
const APPROVE_BODY_KEYS = ["base_version"];

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

  // Content access is deliberately a separate endpoint because it creates an immutable access event.
  app.get("/v1/review/onboarding/content", async (request, reply) => {
    const context = getReviewerContext(request);
    reply.headers(noStore);

    const result = await reviewStore.readContent({
      tenantId: context.tenantId,
      reviewerUserId: context.userId,
      requestId: request.id,
    });
    switch (result.status) {
      case "reviewer_forbidden":
        return reply.code(403).send({ error: "forbidden" });
      case "self_review_forbidden":
        return reply.code(403).send({ error: "self_review_forbidden" });
      case "not_found":
        return sendNotFound(reply);
      case "success":
        return toContentResponse(result.content);
    }
  });

  // Reviewer status actions. Tenant and reviewer come only from the reviewer context; each action accepts
  // only its own reason codes.
  registerReviewAction(app, "/v1/review/onboarding/request-changes", reasonBody(reviewRequestReasonCodes), reviewStore.requestChanges); // submitted → review_needed
  registerReviewAction(app, "/v1/review/onboarding/block", reasonBody(blockReasonCodes), reviewStore.block); // submitted → blocked
  registerReviewAction(app, "/v1/review/onboarding/unblock", reasonBody(unblockReasonCodes), reviewStore.unblock); // blocked → review_needed
  registerReviewAction(app, "/v1/review/onboarding/approve", parseApproveBody, reviewStore.approve); // submitted → approved
  registerReviewAction(app, "/v1/review/onboarding/reopen", reasonBody(reopenReasonCodes), reviewStore.reopen); // approved → review_needed
}

function toContentResponse(content: ReviewableOnboardingContent) {
  return {
    status: content.status,
    version: content.version,
    updated_at: content.updatedAt.toISOString(),
    answers: content.answers,
    project_brief: content.projectBrief,
  };
}

// One POST route for a reviewer status action, with a strict body parser and the shared result mapping.
function registerReviewAction<Body extends object>(
  app: FastifyInstance,
  url: string,
  parse: (body: unknown) => Body | null,
  perform: (input: Body & Pick<ReviewerTarget, "tenantId" | "reviewerUserId">) => Promise<ReviewTransitionResult<OnboardingStatus>>,
) {
  app.post(url, { bodyLimit: REVIEW_ACTION_BODY_LIMIT_BYTES }, async (request, reply) => {
    const context = getReviewerContext(request);
    reply.headers(noStore);

    const parsed = parse(request.body);
    if (!parsed) return reply.code(400).send({ error: "invalid_body" });

    const result = await perform({ tenantId: context.tenantId, reviewerUserId: context.userId, ...parsed });
    switch (result.status) {
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
      default:
        return { status: result.status, version: result.version };
    }
  });
}

function sendNotFound(reply: FastifyReply) {
  return reply.code(404).send({ error: "onboarding_not_found" });
}

type ReviewActionBody<ReasonCode extends string> = Pick<ReviewActionInput<ReasonCode>, "baseVersion" | "reasonCode" | "note">;

// Body parser for an action with a reason: only the given reason codes are accepted.
const reasonBody =
  <ReasonCode extends string>(reasonCodes: readonly ReasonCode[]) =>
  (body: unknown) =>
    parseReviewActionBody(body, reasonCodes);

// Exactly these keys and nothing else; tenant and project never come from the body.
function bodyWithKeys(body: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  return Object.keys(body).sort().join(",") === keys.join(",") ? (body as Record<string, unknown>) : null;
}

const isBaseVersion = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;

// Approve contract: only the version the reviewer looked at.
function parseApproveBody(body: unknown): Pick<ReviewerTarget, "baseVersion"> | null {
  const fields = bodyWithKeys(body, APPROVE_BODY_KEYS);
  if (!fields || !isBaseVersion(fields.base_version)) return null;
  return { baseVersion: fields.base_version };
}

// Strict contract: exactly base_version, reason_code and note.
function parseReviewActionBody<ReasonCode extends string>(body: unknown, reasonCodes: readonly ReasonCode[]): ReviewActionBody<ReasonCode> | null {
  const fields = bodyWithKeys(body, REVIEW_ACTION_BODY_KEYS);
  if (!fields) return null;

  const { base_version: baseVersion, reason_code: reasonCode, note } = fields;
  if (!isBaseVersion(baseVersion)) return null;
  if (typeof reasonCode !== "string" || !(reasonCodes as readonly string[]).includes(reasonCode)) return null;
  if (typeof note !== "string") return null;
  // Stored trimmed; the database enforces the same bounds as a second line of defence.
  const trimmedNote = note.trim();
  if (trimmedNote.length === 0 || trimmedNote.length > REVIEW_NOTE_MAX_LENGTH) return null;

  return { baseVersion, reasonCode: reasonCode as ReasonCode, note: trimmedNote };
}

// Uses the shared onboarding contract, so the route holds no field list of its own.
function countMissingRequiredFields(storedAnswers: Record<string, unknown>): number {
  const parsed = parseAnswers(storedAnswers);
  // Stored answers were validated on save; a mismatch means schema drift and must fail closed (500).
  if (!parsed.ok) throw new Error("Stored onboarding answers do not match the current schema");
  return missingFields(parsed.answers).length;
}
