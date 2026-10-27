import { and, eq, ne, sql } from "drizzle-orm";
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

// Het lopende (niet goedgekeurde) onboardingproject van precies deze tenant, met de laatste versie.
export async function findCurrentOnboarding(db: Db, tenantId: string): Promise<OnboardingDraft | null> {
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
    .where(and(eq(schema.onboardingProjects.tenantId, tenantId), ne(schema.onboardingProjects.status, "approved")))
    .limit(1);
  return row ? toDraft(row) : null;
}

// Slaat een nieuwe versie op, alleen als baseVersion nog de laatste versie is (optimistic concurrency).
// Het project wordt bij de eerste opslag aangemaakt. Alles gebeurt in één transactie met een rijlock.
export async function saveOnboardingDraft(db: Db, input: SaveDraftInput): Promise<SaveDraftResult> {
  return db.transaction((tx) => saveOnboardingVersionInTransaction(tx, input, "draft"));
}

// Indienen: zelfde lock- en versieregels, plus statusovergang draft → submitted en een auditevent
// in dezelfde transactie. Faalt een stap, dan rolt alles terug: geen versie, statuswijziging of event.
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
// Owner may only save drafts and the status stays review_needed (decision O-6); resubmitting is a
// separate slice. submitted, blocked and approved are not editable.
export function statusAfterSave(current: OnboardingStatus, target: SaveTarget): OnboardingStatus | null {
  if (current === "draft") return target;
  if (current === "review_needed" && target === "draft") return "review_needed";
  return null;
}

// Saves a new version when there is no project yet or statusAfterSave allows editing the existing one.
async function saveOnboardingVersionInTransaction(tx: Tx, input: SaveDraftInput, target: SaveTarget): Promise<SaveDraftResult> {
  const [project] = await tx
    .select()
    .from(schema.onboardingProjects)
    .where(and(eq(schema.onboardingProjects.tenantId, input.tenantId), ne(schema.onboardingProjects.status, "approved")))
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
      eventType: "submitted",
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
