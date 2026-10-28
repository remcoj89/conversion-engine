import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { currentProjectOrder, type OnboardingStatus, type Tx } from "./onboardingRepository.js";

type Db = NodePgDatabase<typeof schema>;

// Statuses a Westend reviewer may see. A draft is still the client's work in progress.
export const reviewableOnboardingStatuses = ["submitted", "review_needed", "blocked", "approved"] as const satisfies readonly OnboardingStatus[];

export type ReviewableOnboardingStatus = (typeof reviewableOnboardingStatuses)[number];

// Internal shape for the review route: answers are only used server-side to count missing fields.
export type ReviewableOnboarding = Readonly<{
  status: ReviewableOnboardingStatus;
  version: number;
  updatedAt: Date;
  answers: Record<string, unknown>;
}>;

export type ReviewableOnboardingContent = Readonly<{
  status: ReviewableOnboardingStatus;
  version: number;
  updatedAt: Date;
  answers: Record<string, unknown>;
  projectBrief: Record<string, unknown>;
}>;

export type ReadReviewableContentInput = Readonly<{
  tenantId: string;
  reviewerUserId: string;
  requestId: string;
}>;

export type ReadReviewableContentResult =
  | Readonly<{ status: "success"; content: ReviewableOnboardingContent }>
  | Readonly<{ status: "reviewer_forbidden" }>
  | Readonly<{ status: "self_review_forbidden" }>
  | Readonly<{ status: "not_found" }>;

export type ReviewReasonCode = (typeof schema.reviewRequestReasonCodes)[number];

export type BlockReasonCode = (typeof schema.blockReasonCodes)[number];
export type UnblockReasonCode = (typeof schema.unblockReasonCodes)[number];
export type ReopenReasonCode = (typeof schema.reopenReasonCodes)[number];

// Who acts on which version; shared by every reviewer status action.
export type ReviewerTarget = Readonly<{
  // Both come from the ReviewerContext, never from the request body.
  tenantId: string;
  reviewerUserId: string;
  // Version the reviewer looked at; must still be the current version.
  baseVersion: number;
}>;

// Input of a reviewer status action with a reason; each action has its own reason codes.
export type ReviewActionInput<ReasonCode extends string> = ReviewerTarget &
  Readonly<{
    reasonCode: ReasonCode;
    note: string;
  }>;

export type RequestChangesInput = ReviewActionInput<ReviewReasonCode>;
export type BlockInput = ReviewActionInput<BlockReasonCode>;
export type UnblockInput = ReviewActionInput<UnblockReasonCode>;
export type ReopenInput = ReviewActionInput<ReopenReasonCode>;
// Approval has no reason or note in this slice.
export type ApproveInput = ReviewerTarget;

// Outcome of a reviewer status action; on success it carries the new status and the (unchanged) version.
export type ReviewTransitionResult<NewStatus extends OnboardingStatus> =
  | Readonly<{ status: NewStatus; version: number }>
  | Readonly<{ status: "reviewer_forbidden" }>
  | Readonly<{ status: "self_review_forbidden" }>
  | Readonly<{ status: "not_found" }>
  | Readonly<{ status: "not_reviewable" }>
  | Readonly<{ status: "conflict"; currentVersion: number }>;

export type RequestChangesResult = ReviewTransitionResult<"review_needed">;
export type BlockResult = ReviewTransitionResult<"blocked">;
export type UnblockResult = ReviewTransitionResult<"review_needed">;
export type ApproveResult = ReviewTransitionResult<"approved">;
export type ReopenResult = ReviewTransitionResult<"review_needed">;

// The tenant's current onboarding project, if a reviewer may see it. A draft yields null.
export async function findReviewableOnboarding(db: Db, tenantId: string): Promise<ReviewableOnboarding | null> {
  const [row] = await db
    .select({
      status: schema.onboardingProjects.status,
      version: schema.onboardingVersions.version,
      updatedAt: schema.onboardingProjects.updatedAt,
      answers: schema.onboardingVersions.answers,
    })
    .from(schema.onboardingProjects)
    .innerJoin(
      schema.onboardingVersions,
      and(
        eq(schema.onboardingVersions.tenantId, schema.onboardingProjects.tenantId),
        eq(schema.onboardingVersions.projectId, schema.onboardingProjects.id),
        eq(schema.onboardingVersions.version, schema.onboardingProjects.currentVersion),
      ),
    )
    .where(eq(schema.onboardingProjects.tenantId, tenantId))
    .orderBy(...currentProjectOrder)
    .limit(1);
  if (!row || !isReviewable(row.status)) return null;
  return { ...row, status: row.status, answers: row.answers as Record<string, unknown> };
}

// Reads the current reviewable content and records the access event atomically. The transaction
// locks the project before reading its current version, so the event always describes the content
// that this request actually returns.
export async function readReviewableOnboardingContent(db: Db, input: ReadReviewableContentInput): Promise<ReadReviewableContentResult> {
  return db.transaction((tx) => readReviewableOnboardingContentInTransaction(tx, input));
}

// Same operation inside a caller-managed transaction, used by database tests and transaction-aware callers.
export async function readReviewableOnboardingContentInTransaction(tx: Tx, input: ReadReviewableContentInput): Promise<ReadReviewableContentResult> {
  const authorization = await authorizeReviewerInTransaction(tx, input.tenantId, input.reviewerUserId);
  if (authorization === "reviewer_forbidden") return { status: "reviewer_forbidden" };
  if (authorization === "self_review_forbidden") return { status: "self_review_forbidden" };

  const [project] = await tx
    .select({
      id: schema.onboardingProjects.id,
      status: schema.onboardingProjects.status,
      currentVersion: schema.onboardingProjects.currentVersion,
      updatedAt: schema.onboardingProjects.updatedAt,
    })
    .from(schema.onboardingProjects)
    .where(eq(schema.onboardingProjects.tenantId, input.tenantId))
    .orderBy(...currentProjectOrder)
    .for("update")
    .limit(1);

  if (!project || !isReviewable(project.status)) return { status: "not_found" };

  const [version] = await tx
    .select({
      version: schema.onboardingVersions.version,
      answers: schema.onboardingVersions.answers,
      projectBrief: schema.onboardingVersions.projectBrief,
    })
    .from(schema.onboardingVersions)
    .where(
      and(
        eq(schema.onboardingVersions.tenantId, input.tenantId),
        eq(schema.onboardingVersions.projectId, project.id),
        eq(schema.onboardingVersions.version, project.currentVersion),
      ),
    )
    .for("share")
    .limit(1);

  // A project without its current version is not readable content. Do not create an access event.
  if (!version) return { status: "not_found" };

  const content: ReviewableOnboardingContent = {
    status: project.status,
    version: version.version,
    updatedAt: project.updatedAt,
    answers: version.answers as Record<string, unknown>,
    projectBrief: version.projectBrief as Record<string, unknown>,
  };

  await tx.insert(schema.onboardingReviewAccessEvents).values({
    tenantId: input.tenantId,
    reviewerUserId: input.reviewerUserId,
    projectId: project.id,
    version: version.version,
    purpose: "onboarding_review",
    action: "read_onboarding_content",
    requestOrCorrelationId: input.requestId,
  });

  return { status: "success", content };
}

function isReviewable(status: OnboardingStatus): status is ReviewableOnboardingStatus {
  return (reviewableOnboardingStatuses as readonly OnboardingStatus[]).includes(status);
}

type ReviewerAuthorization = "allowed" | "reviewer_forbidden" | "self_review_forbidden";

// Repeats the reviewer hook's rules inside the caller's transaction, so a direct repository call cannot
// bypass them and an assignment revoked after the hook ran is not used. FOR SHARE keeps the assignment
// and membership rows from being changed (e.g. revoked or activated) until this transaction ends;
// the FK checks on insert only take KEY SHARE, which does not block a status change.
async function authorizeReviewerInTransaction(tx: Tx, tenantId: string, reviewerUserId: string): Promise<ReviewerAuthorization> {
  const [assignment] = await tx
    .select({ status: schema.onboardingReviewerAssignments.status })
    .from(schema.onboardingReviewerAssignments)
    .where(and(eq(schema.onboardingReviewerAssignments.tenantId, tenantId), eq(schema.onboardingReviewerAssignments.userId, reviewerUserId)))
    .for("share");
  if (assignment?.status !== "active") return "reviewer_forbidden";

  // Separation of duties: only an active membership in the same tenant counts as self-review.
  const [membership] = await tx
    .select({ status: schema.memberships.status })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.tenantId, tenantId), eq(schema.memberships.userId, reviewerUserId)))
    .for("share");
  if (membership?.status === "active") return "self_review_forbidden";

  return "allowed";
}

// One reviewer status transition: the allowed starting status, the new status, its audit event type and,
// when the action has one, how the reason and note are stored (tenant-bound, outside the audit log).
type ReviewTransition<NewStatus extends OnboardingStatus> = Readonly<{
  from: OnboardingStatus;
  to: NewStatus;
  eventType: "review_requested" | "blocked" | "unblocked" | "approved" | "reopened";
  saveReason?: (tx: Tx, projectId: string, version: number) => Promise<unknown>;
}>;

// Runs a reviewer status transition inside the caller's transaction, in this fixed order: re-check the
// reviewer, lock the current project, check status and version, store the reason, change the status and
// write the audit event. Any failure rolls everything back. No new onboarding version is created.
async function performReviewTransition<NewStatus extends OnboardingStatus>(
  tx: Tx,
  input: ReviewerTarget,
  transition: ReviewTransition<NewStatus>,
): Promise<ReviewTransitionResult<NewStatus>> {
  // Re-check reviewer authorization inside the transaction, before any lock on the project or any write.
  const authorization = await authorizeReviewerInTransaction(tx, input.tenantId, input.reviewerUserId);
  if (authorization === "reviewer_forbidden") return { status: "reviewer_forbidden" };
  if (authorization === "self_review_forbidden") return { status: "self_review_forbidden" };

  // The row lock serializes concurrent review actions: a second action waits and then sees the new status.
  const [project] = await tx
    .select({ id: schema.onboardingProjects.id, status: schema.onboardingProjects.status, currentVersion: schema.onboardingProjects.currentVersion })
    .from(schema.onboardingProjects)
    .where(eq(schema.onboardingProjects.tenantId, input.tenantId))
    .orderBy(...currentProjectOrder)
    .for("update")
    .limit(1);

  if (!project) return { status: "not_found" };
  if (project.status !== transition.from) return { status: "not_reviewable" };
  if (project.currentVersion !== input.baseVersion) return { status: "conflict", currentVersion: project.currentVersion };

  // The database checks that project, version and reviewer assignment all belong to this tenant.
  await transition.saveReason?.(tx, project.id, project.currentVersion);

  // The status guard in the WHERE clause is a second line of defence next to the row lock.
  const [updated] = await tx
    .update(schema.onboardingProjects)
    .set({ status: transition.to, updatedAt: sql`now()` })
    .where(
      and(
        eq(schema.onboardingProjects.id, project.id),
        eq(schema.onboardingProjects.tenantId, input.tenantId),
        eq(schema.onboardingProjects.status, transition.from),
      ),
    )
    .returning({ id: schema.onboardingProjects.id });
  if (!updated) throw new Error("Onboarding project status update returned no row");

  // No note in the audit log: free text may contain client content. The reason storage holds it.
  await tx.insert(schema.onboardingAuditEvents).values({
    tenantId: input.tenantId,
    projectId: project.id,
    reviewerUserId: input.reviewerUserId,
    eventType: transition.eventType,
    fromStatus: transition.from,
    toStatus: transition.to,
    version: project.currentVersion,
  });

  return { status: transition.to, version: project.currentVersion };
}

// Stores a block, unblock or reopen decision with its reason and note.
const saveReviewAction =
  (input: ReviewActionInput<BlockReasonCode | UnblockReasonCode | ReopenReasonCode>, action: (typeof schema.reviewActionTypes)[number]) =>
  (tx: Tx, projectId: string, version: number) =>
    tx.insert(schema.onboardingReviewActions).values({
      tenantId: input.tenantId,
      projectId,
      reviewerUserId: input.reviewerUserId,
      action,
      version,
      reasonCode: input.reasonCode,
      note: input.note,
    });

// submitted → review_needed: review request, status change and audit event in one transaction.
export async function requestOnboardingChanges(db: Db, input: RequestChangesInput): Promise<RequestChangesResult> {
  return db.transaction((tx) => requestOnboardingChangesInTransaction(tx, input));
}

// Same, inside a transaction managed by the caller (e.g. a test's rollback transaction).
export function requestOnboardingChangesInTransaction(tx: Tx, input: RequestChangesInput): Promise<RequestChangesResult> {
  return performReviewTransition(tx, input, {
    from: "submitted",
    to: "review_needed",
    eventType: "review_requested",
    saveReason: (tx, projectId, version) =>
      tx.insert(schema.onboardingReviewRequests).values({
        tenantId: input.tenantId,
        projectId,
        reviewerUserId: input.reviewerUserId,
        version,
        reasonCode: input.reasonCode,
        note: input.note,
      }),
  });
}

// submitted → blocked: a critical basis is missing; only Westend can lift the block again.
export async function blockOnboarding(db: Db, input: BlockInput): Promise<BlockResult> {
  return db.transaction((tx) => blockOnboardingInTransaction(tx, input));
}

export function blockOnboardingInTransaction(tx: Tx, input: BlockInput): Promise<BlockResult> {
  return performReviewTransition(tx, input, { from: "submitted", to: "blocked", eventType: "blocked", saveReason: saveReviewAction(input, "blocked") });
}

// blocked → review_needed: the block is lifted and the Owner can add information and resubmit.
export async function unblockOnboarding(db: Db, input: UnblockInput): Promise<UnblockResult> {
  return db.transaction((tx) => unblockOnboardingInTransaction(tx, input));
}

export function unblockOnboardingInTransaction(tx: Tx, input: UnblockInput): Promise<UnblockResult> {
  return performReviewTransition(tx, input, { from: "blocked", to: "review_needed", eventType: "unblocked", saveReason: saveReviewAction(input, "unblocked") });
}

// submitted → approved: the reviewed version becomes the approved one; the Owner can no longer change it.
export async function approveOnboarding(db: Db, input: ApproveInput): Promise<ApproveResult> {
  return db.transaction((tx) => approveOnboardingInTransaction(tx, input));
}

export function approveOnboardingInTransaction(tx: Tx, input: ApproveInput): Promise<ApproveResult> {
  return performReviewTransition(tx, input, { from: "submitted", to: "approved", eventType: "approved" });
}

// approved → review_needed: a controlled reopen after a material change. The approval stays in the audit
// log and the approved version is kept; the Owner then adds information and resubmits as usual.
export async function reopenOnboarding(db: Db, input: ReopenInput): Promise<ReopenResult> {
  return db.transaction((tx) => reopenOnboardingInTransaction(tx, input));
}

export function reopenOnboardingInTransaction(tx: Tx, input: ReopenInput): Promise<ReopenResult> {
  return performReviewTransition(tx, input, { from: "approved", to: "review_needed", eventType: "reopened", saveReason: saveReviewAction(input, "reopened") });
}
