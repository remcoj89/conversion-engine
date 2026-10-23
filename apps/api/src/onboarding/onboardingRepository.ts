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
  return db.transaction((tx) => saveOnboardingDraftInTransaction(tx, input));
}

// Zelfde logica binnen een al geopende transactie (de aanroeper beheert begin/commit, bijv. in tests).
export async function saveOnboardingDraftInTransaction(tx: Pick<Db, "select" | "insert" | "update">, input: SaveDraftInput): Promise<SaveDraftResult> {
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
      .values({ tenantId: input.tenantId, status: "draft", currentVersion: 1 })
      .onConflictDoNothing()
      .returning();
    if (!created) return { status: "conflict", currentVersion: 1 };
    ({ id: projectId, currentVersion: version, status, updatedAt } = created);
  } else {
    if (project.status !== "draft") return { status: "not_editable" };
    if (project.currentVersion !== input.baseVersion) return { status: "conflict", currentVersion: project.currentVersion };
    const [updated] = await tx
      .update(schema.onboardingProjects)
      .set({ currentVersion: sql`${schema.onboardingProjects.currentVersion} + 1`, updatedAt: sql`now()` })
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
