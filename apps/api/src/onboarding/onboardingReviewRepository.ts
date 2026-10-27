import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import type { OnboardingStatus, Tx } from "./onboardingRepository.js";

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

export type ReviewReasonCode = (typeof schema.reviewRequestReasonCodes)[number];

export type RequestChangesInput = Readonly<{
  // Both come from the ReviewerContext, never from the request body.
  tenantId: string;
  reviewerUserId: string;
  // Version the reviewer looked at; must still be the current version.
  baseVersion: number;
  reasonCode: ReviewReasonCode;
  note: string;
}>;

export type RequestChangesResult =
  | Readonly<{ status: "review_needed"; version: number }>
  | Readonly<{ status: "reviewer_forbidden" }>
  | Readonly<{ status: "self_review_forbidden" }>
  | Readonly<{ status: "not_found" }>
  | Readonly<{ status: "not_reviewable" }>
  | Readonly<{ status: "conflict"; currentVersion: number }>;

// "Current" project of a tenant: the open (non-approved) project when one exists, otherwise the most
// recently approved one. Shared by every review query so they always look at the same project.
const currentProjectOrder = [sql`${schema.onboardingProjects.status} = 'approved'`, desc(schema.onboardingProjects.updatedAt)];

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

// submitted → review_needed: review request, status change and audit event in one transaction.
export async function requestOnboardingChanges(db: Db, input: RequestChangesInput): Promise<RequestChangesResult> {
  return db.transaction((tx) => requestOnboardingChangesInTransaction(tx, input));
}

// Same, inside a transaction managed by the caller (e.g. a test's rollback transaction).
export async function requestOnboardingChangesInTransaction(tx: Tx, input: RequestChangesInput): Promise<RequestChangesResult> {
  // Re-check reviewer authorization inside the transaction, before any lock on the project or any write.
  const authorization = await authorizeReviewerInTransaction(tx, input.tenantId, input.reviewerUserId);
  if (authorization !== "allowed") return { status: authorization };

  // The row lock serializes concurrent review actions: a second request waits and then sees review_needed.
  const [project] = await tx
    .select({ id: schema.onboardingProjects.id, status: schema.onboardingProjects.status, currentVersion: schema.onboardingProjects.currentVersion })
    .from(schema.onboardingProjects)
    .where(eq(schema.onboardingProjects.tenantId, input.tenantId))
    .orderBy(...currentProjectOrder)
    .for("update")
    .limit(1);

  if (!project) return { status: "not_found" };
  if (project.status !== "submitted") return { status: "not_reviewable" };
  if (project.currentVersion !== input.baseVersion) return { status: "conflict", currentVersion: project.currentVersion };

  // The database checks that project and reviewer assignment both belong to this tenant.
  await tx.insert(schema.onboardingReviewRequests).values({
    tenantId: input.tenantId,
    projectId: project.id,
    reviewerUserId: input.reviewerUserId,
    version: project.currentVersion,
    reasonCode: input.reasonCode,
    note: input.note,
  });

  // The status guard in the WHERE clause is a second line of defence next to the row lock.
  const [updated] = await tx
    .update(schema.onboardingProjects)
    .set({ status: "review_needed", updatedAt: sql`now()` })
    .where(
      and(
        eq(schema.onboardingProjects.id, project.id),
        eq(schema.onboardingProjects.tenantId, input.tenantId),
        eq(schema.onboardingProjects.status, "submitted"),
      ),
    )
    .returning({ id: schema.onboardingProjects.id });
  if (!updated) throw new Error("Onboarding project status update returned no row");

  // No note in the audit log: free text may contain client content. The review request holds it.
  await tx.insert(schema.onboardingAuditEvents).values({
    tenantId: input.tenantId,
    projectId: project.id,
    reviewerUserId: input.reviewerUserId,
    eventType: "review_requested",
    fromStatus: "submitted",
    toStatus: "review_needed",
    version: project.currentVersion,
  });

  return { status: "review_needed", version: project.currentVersion };
}
