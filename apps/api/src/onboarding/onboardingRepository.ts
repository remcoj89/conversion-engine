import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

type Db = NodePgDatabase<typeof schema>;

export type OnboardingStatus = (typeof schema.onboardingProjectStatuses)[number];

export type OnboardingDraft = Readonly<{
  projectId: string;
  status: OnboardingStatus;
  version: number;
  schemaId: string;
  schemaVersion: string;
  answers: Record<string, unknown>;
  projectBrief: Record<string, unknown>;
  updatedAt: Date;
}>;

export type SaveDraftInput = Readonly<{
  tenantId: string;
  userId: string;
  // Versie waarop de client zijn wijzigingen baseert; 0 als er nog niets is opgeslagen.
  baseVersion: number;
  schemaId: string;
  schemaVersion: string;
  answers: Record<string, unknown>;
  projectBrief: Record<string, unknown>;
}>;

// Saving a draft keeps the editable status (draft or review_needed, see statusAfterSave);
// submitting moves a draft to "submitted" in the same transaction.
export type SaveTarget = "draft" | "submitted";

export type SaveDraftResult =
  | Readonly<{ status: "saved"; draft: OnboardingDraft }>
  | Readonly<{ status: "conflict"; currentVersion: number }>
  | Readonly<{ status: "not_editable" }>;

// What the Owner may see of the reviewer feedback behind review_needed: a change request, a reopen of an
// approved onboarding or an unblock, with reason, note and the reviewed version. Deliberately without the
// reviewer's user ID.
export type ReviewRequestSummary = Readonly<{
  kind: "changes_requested" | "reopened" | "unblocked";
  reasonCode:
    | (typeof schema.reviewRequestReasonCodes)[number]
    | (typeof schema.reopenReasonCodes)[number]
    | (typeof schema.unblockReasonCodes)[number];
  note: string;
  version: number;
  createdAt: Date;
}>;

// The current onboarding plus the open change request; reviewRequest is only set in review_needed.
export type CurrentOnboarding = OnboardingDraft & Readonly<{ reviewRequest: ReviewRequestSummary | null }>;

// "Current" project of a tenant: the open (non-approved) project when one exists, otherwise the most
// recently approved one (decision O-5: an approved onboarding stays the current project). Shared by the
// Owner and reviewer queries so they always look at the same project.
export const currentProjectOrder = [sql`${schema.onboardingProjects.status} = 'approved'`, desc(schema.onboardingProjects.updatedAt)];

// The current onboarding project of exactly this tenant, with its latest version (read-only when approved).
export async function findCurrentOnboarding(db: Db, tenantId: string): Promise<CurrentOnboarding | null> {
  const [row] = await db
    .select({
      projectId: schema.onboardingProjects.id,
      status: schema.onboardingProjects.status,
      version: schema.onboardingVersions.version,
      schemaId: schema.onboardingVersions.schemaId,
      schemaVersion: schema.onboardingVersions.schemaVersion,
      answers: schema.onboardingVersions.answers,
      projectBrief: schema.onboardingVersions.projectBrief,
      updatedAt: schema.onboardingProjects.updatedAt,
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
  if (!row) return null;
  const reviewRequest = row.status === "review_needed" ? await findActiveReviewFeedback(db, tenantId, row.projectId) : null;
  return { ...toDraft(row), reviewRequest };
}

// The feedback behind the current review_needed of this project: the latest change request, reopen or unblock.
// A resubmission (a new version) always lies between feedback actions, so the highest reviewed version is the
// active one. Feedback is not matched on the current version: the Owner's draft saves raise the version while it
// stays open.
async function findActiveReviewFeedback(db: Db, tenantId: string, projectId: string): Promise<ReviewRequestSummary | null> {
  const [[request], [reopen], [unblock]] = await Promise.all([
    db
      .select({
        id: schema.onboardingReviewRequests.id,
        reasonCode: schema.onboardingReviewRequests.reasonCode,
        note: schema.onboardingReviewRequests.note,
        version: schema.onboardingReviewRequests.version,
        createdAt: schema.onboardingReviewRequests.createdAt,
      })
      .from(schema.onboardingReviewRequests)
      .where(and(eq(schema.onboardingReviewRequests.tenantId, tenantId), eq(schema.onboardingReviewRequests.projectId, projectId)))
      .orderBy(desc(schema.onboardingReviewRequests.version), desc(schema.onboardingReviewRequests.createdAt), desc(schema.onboardingReviewRequests.id))
      .limit(1),
    db
      .select({
        id: schema.onboardingReviewActions.id,
        reasonCode: schema.onboardingReviewActions.reasonCode,
        note: schema.onboardingReviewActions.note,
        version: schema.onboardingReviewActions.version,
        createdAt: schema.onboardingReviewActions.createdAt,
      })
      .from(schema.onboardingReviewActions)
      .where(
        and(
          eq(schema.onboardingReviewActions.tenantId, tenantId),
          eq(schema.onboardingReviewActions.projectId, projectId),
          eq(schema.onboardingReviewActions.action, "reopened"),
        ),
      )
      .orderBy(desc(schema.onboardingReviewActions.version), desc(schema.onboardingReviewActions.createdAt), desc(schema.onboardingReviewActions.id))
      .limit(1),
    db
      .select({
        id: schema.onboardingReviewActions.id,
        reasonCode: schema.onboardingReviewActions.reasonCode,
        note: schema.onboardingReviewActions.note,
        version: schema.onboardingReviewActions.version,
        createdAt: schema.onboardingReviewActions.createdAt,
      })
      .from(schema.onboardingReviewActions)
      .where(
        and(
          eq(schema.onboardingReviewActions.tenantId, tenantId),
          eq(schema.onboardingReviewActions.projectId, projectId),
          eq(schema.onboardingReviewActions.action, "unblocked"),
        ),
      )
      .orderBy(desc(schema.onboardingReviewActions.version), desc(schema.onboardingReviewActions.createdAt), desc(schema.onboardingReviewActions.id))
      .limit(1),
  ]);
  const changesRequested = request ? { kind: "changes_requested" as const, ...request } : null;
  // The reason code column of review actions is plain text; the database check limits each action to its own codes.
  const reopened = reopen ? { kind: "reopened" as const, ...reopen, reasonCode: reopen.reasonCode as ReviewRequestSummary["reasonCode"] } : null;
  const unblocked = unblock ? { kind: "unblocked" as const, ...unblock, reasonCode: unblock.reasonCode as ReviewRequestSummary["reasonCode"] } : null;
  return latestReviewFeedback([changesRequested, reopened, unblocked]);
}

type ReviewFeedbackCandidate = Readonly<{
  kind: ReviewRequestSummary["kind"];
  id: string;
  reasonCode: ReviewRequestSummary["reasonCode"];
  note: string;
  version: number;
  createdAt: Date;
}>;

// Version is the primary review sequence. The ID and kind make equal timestamps deterministic within a transaction.
function latestReviewFeedback(candidates: readonly (ReviewFeedbackCandidate | null)[]): ReviewRequestSummary | null {
  const latest = candidates.filter((candidate): candidate is ReviewFeedbackCandidate => candidate !== null).sort((left, right) => {
    if (left.version !== right.version) return right.version - left.version;
    const createdAtDifference = right.createdAt.getTime() - left.createdAt.getTime();
    if (createdAtDifference !== 0) return createdAtDifference;
    const idDifference = right.id === left.id ? 0 : right.id > left.id ? 1 : -1;
    if (idDifference !== 0) return idDifference;
    return right.kind === left.kind ? 0 : right.kind > left.kind ? 1 : -1;
  })[0];
  if (!latest) return null;
  return {
    kind: latest.kind,
    reasonCode: latest.reasonCode,
    note: latest.note,
    version: latest.version,
    createdAt: latest.createdAt,
  };
}

// Slaat een nieuwe versie op, alleen als baseVersion nog de laatste versie is (optimistic concurrency).
// Het project wordt bij de eerste opslag aangemaakt. Alles gebeurt in één transactie met een rijlock.
export async function saveOnboardingDraft(db: Db, input: SaveDraftInput): Promise<SaveDraftResult> {
  return db.transaction((tx) => saveOnboardingVersionInTransaction(tx, input, "draft"));
}

// Submitting: same lock and version rules, plus draft or review_needed → submitted and a submitted or
// resubmitted audit event in the same transaction. Any failure rolls back version, status and event.
export async function submitOnboarding(db: Db, input: SaveDraftInput): Promise<SaveDraftResult> {
  return db.transaction((tx) => saveOnboardingVersionInTransaction(tx, input, "submitted"));
}

// Concept opslaan binnen een al geopende transactie (de aanroeper beheert begin/commit, bijv. in tests).
export function saveOnboardingDraftInTransaction(tx: Tx, input: SaveDraftInput): Promise<SaveDraftResult> {
  return saveOnboardingVersionInTransaction(tx, input, "draft");
}

// Indienen binnen een al geopende transactie.
export function submitOnboardingInTransaction(tx: Tx, input: SaveDraftInput): Promise<SaveDraftResult> {
  return saveOnboardingVersionInTransaction(tx, input, "submitted");
}

export type Tx = Pick<Db, "select" | "insert" | "update">;

// Editing rule for an existing project: the status after saving a new version, or null when the
// project is not editable for this target. A draft may be saved or submitted. In review_needed the
// Owner may save drafts, which keep review_needed (decision O-6), or resubmit, which returns to
// submitted. submitted, blocked and approved are not editable.
export function statusAfterSave(current: OnboardingStatus, target: SaveTarget): OnboardingStatus | null {
  if (current === "draft") return target;
  if (current === "review_needed") return target === "draft" ? "review_needed" : "submitted";
  return null;
}

// Audit event type of a submission: a resubmission after Westend asked for changes, otherwise the first one.
export function submissionEventType(previousStatus: OnboardingStatus | null): "submitted" | "resubmitted" {
  return previousStatus === "review_needed" ? "resubmitted" : "submitted";
}

// Saves a new version when there is no project yet or statusAfterSave allows editing the existing one.
// An approved project is the current project too, so it blocks the save (not_editable) instead of a
// second project being created next to it; its row lock makes concurrent Owner writes wait and fail alike.
async function saveOnboardingVersionInTransaction(tx: Tx, input: SaveDraftInput, target: SaveTarget): Promise<SaveDraftResult> {
  const [project] = await tx
    .select()
    .from(schema.onboardingProjects)
    .where(eq(schema.onboardingProjects.tenantId, input.tenantId))
    .orderBy(...currentProjectOrder)
    .for("update")
    .limit(1);

  let projectId: string;
  let version: number;
  let status: OnboardingStatus;
  let updatedAt: Date;

  if (!project) {
    if (input.baseVersion !== 0) return { status: "conflict", currentVersion: 0 };
    // Bij een gelijktijdige eerste opslag wint één transactie; de unieke index laat de andere niets invoegen.
    const [created] = await tx
      .insert(schema.onboardingProjects)
      .values({ tenantId: input.tenantId, status: target, currentVersion: 1 })
      .onConflictDoNothing()
      .returning();
    if (!created) return { status: "conflict", currentVersion: 1 };
    ({ id: projectId, currentVersion: version, status, updatedAt } = created);
  } else {
    const nextStatus = statusAfterSave(project.status, target);
    if (!nextStatus) return { status: "not_editable" };
    if (project.currentVersion !== input.baseVersion) return { status: "conflict", currentVersion: project.currentVersion };
    const [updated] = await tx
      .update(schema.onboardingProjects)
      .set({ currentVersion: sql`${schema.onboardingProjects.currentVersion} + 1`, status: nextStatus, updatedAt: sql`now()` })
      .where(and(eq(schema.onboardingProjects.id, project.id), eq(schema.onboardingProjects.tenantId, input.tenantId)))
      .returning();
    if (!updated) throw new Error("Onboarding project update returned no row");
    ({ id: projectId, currentVersion: version, status, updatedAt } = updated);
  }

  await tx.insert(schema.onboardingVersions).values({
    tenantId: input.tenantId,
    projectId,
    version,
    schemaId: input.schemaId,
    schemaVersion: input.schemaVersion,
    answers: input.answers,
    projectBrief: input.projectBrief,
    createdBy: input.userId,
  });

  // Het auditevent hoort bij dezelfde transactie: rolt de submit terug, dan verdwijnt het event mee.
  // Bewust zonder antwoorden of Project Brief; tenant en actor komen uit de auth-context via input.
  if (target === "submitted") {
    await tx.insert(schema.onboardingAuditEvents).values({
      tenantId: input.tenantId,
      projectId,
      memberUserId: input.userId,
      eventType: submissionEventType(project?.status ?? null),
      fromStatus: project?.status ?? null,
      toStatus: status,
      version,
    });
  }

  return {
    status: "saved",
    draft: toDraft({
      projectId,
      status,
      version,
      schemaId: input.schemaId,
      schemaVersion: input.schemaVersion,
      answers: input.answers,
      projectBrief: input.projectBrief,
      updatedAt,
    }),
  };
}

function toDraft(row: {
  projectId: string;
  status: OnboardingStatus;
  version: number;
  schemaId: string;
  schemaVersion: string;
  answers: unknown;
  projectBrief: unknown;
  updatedAt: Date;
}): OnboardingDraft {
  return {
    ...row,
    answers: row.answers as Record<string, unknown>,
    projectBrief: row.projectBrief as Record<string, unknown>,
  };
}
