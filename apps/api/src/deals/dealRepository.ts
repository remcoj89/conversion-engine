import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { UUID_PATTERN } from "../auth/requestContext.js";

type Db = NodePgDatabase<typeof schema>;
type DatabaseDeal = typeof schema.deals.$inferSelect;

export type DealStage = (typeof schema.dealStages)[number];
export type DealStatus = (typeof schema.dealStatuses)[number];

const DEAL_STAGE_TRANSITIONS: Readonly<Record<DealStage, readonly DealStage[]>> = {
  new: ["qualified"],
  qualified: ["appointment_scheduled"],
  appointment_scheduled: ["proposal"],
  proposal: ["won", "lost"],
  won: [],
  lost: [],
};

const INITIAL_DEAL_STAGES: readonly DealStage[] = [
  "new",
  "qualified",
  "appointment_scheduled",
  "proposal",
];

export type Deal = DatabaseDeal;

// Tenant IDs stay internal. The contact and owner IDs are tenant-local references and are
// included because the future deal UI needs stable links and assignment context.
export type DealRead = Pick<Deal,
  | "id"
  | "contactId"
  | "title"
  | "description"
  | "amountEur"
  | "ownerUserId"
  | "stage"
  | "expectedCloseDate"
  | "lossReason"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "archivedAt"
>;

export type DealListOptions = Readonly<{ includeArchived?: boolean }>;

export type DealRepository = Readonly<{
  list: (tenantId: string, options?: DealListOptions) => Promise<readonly DealRead[]>;
  find: (tenantId: string, dealId: string) => Promise<DealRead | null>;
  create: (input: CreateDealInput) => Promise<DealRead>;
  update: (input: UpdateDealInput) => Promise<DealRead | null>;
  archive: (tenantId: string, dealId: string) => Promise<DealRead | null>;
}>;

export type CreateDealInput = Readonly<{
  tenantId: string;
  actorUserId: string;
  contactId: string;
  title: string;
  description?: string | null;
  amountEur?: string | null;
  ownerUserId?: string | null;
  stage?: DealStage;
  expectedCloseDate?: string | null;
  lossReason?: string | null;
}>;

export type UpdateDealInput = Readonly<{
  tenantId: string;
  dealId: string;
  actorUserId: string;
  title?: string;
  description?: string | null;
  amountEur?: string | null;
  ownerUserId?: string | null;
  stage?: DealStage;
  expectedCloseDate?: string | null;
  lossReason?: string | null;
}>;

export class InvalidDealContactError extends Error {
  readonly code = "invalid_deal_contact";

  constructor() {
    super("invalid_deal_contact");
    this.name = "InvalidDealContactError";
  }
}

export class InvalidDealOwnerError extends Error {
  readonly code = "invalid_deal_owner";

  constructor() {
    super("invalid_deal_owner");
    this.name = "InvalidDealOwnerError";
  }
}

export class InvalidDealStageError extends Error {
  readonly code = "invalid_deal_stage";

  constructor() {
    super("invalid_deal_stage");
    this.name = "InvalidDealStageError";
  }
}

export class InvalidDealStageTransitionError extends Error {
  readonly code = "invalid_deal_stage_transition";

  constructor() {
    super("invalid_deal_stage_transition");
    this.name = "InvalidDealStageTransitionError";
  }
}

export class DealNotFoundError extends Error {
  readonly code = "deal_not_found";

  constructor() {
    super("deal_not_found");
    this.name = "DealNotFoundError";
  }
}

export class ArchivedDealError extends Error {
  readonly code = "deal_archived";

  constructor() {
    super("deal_archived");
    this.name = "ArchivedDealError";
  }
}

export class InvalidDealLossReasonError extends Error {
  readonly code = "invalid_deal_loss_reason";

  constructor() {
    super("invalid_deal_loss_reason");
    this.name = "InvalidDealLossReasonError";
  }
}

export function isDealStage(value: unknown): value is DealStage {
  return typeof value === "string" && (schema.dealStages as readonly string[]).includes(value);
}

export function isDealStatus(value: unknown): value is DealStatus {
  return typeof value === "string" && (schema.dealStatuses as readonly string[]).includes(value);
}

export function isValidDealStageTransition(fromStage: DealStage, toStage: DealStage): boolean {
  return fromStage === toStage || DEAL_STAGE_TRANSITIONS[fromStage].includes(toStage);
}

export function isInitialDealStage(value: DealStage): boolean {
  return INITIAL_DEAL_STAGES.includes(value);
}

export function createDealRepository(db: Db): DealRepository {
  return {
    list: (tenantId, options) => listDeals(db, tenantId, options),
    find: (tenantId, dealId) => findDeal(db, tenantId, dealId),
    create: (input) => createDeal(db, input),
    update: (input) => updateDeal(db, input),
    archive: (tenantId, dealId) => archiveDeal(db, tenantId, dealId),
  };
}

export async function listDeals(
  db: Db,
  tenantId: string,
  options: DealListOptions = {},
): Promise<readonly DealRead[]> {
  assertUuid(tenantId);
  const conditions = [eq(schema.deals.tenantId, tenantId)];
  if (!options.includeArchived) conditions.push(eq(schema.deals.status, "active"));

  return db
    .select()
    .from(schema.deals)
    .where(and(...conditions))
    .orderBy(desc(schema.deals.createdAt), desc(schema.deals.id));
}

export async function findDeal(db: Db, tenantId: string, dealId: string): Promise<DealRead | null> {
  assertUuid(tenantId);
  assertUuid(dealId);
  const [deal] = await db
    .select()
    .from(schema.deals)
    .where(and(eq(schema.deals.tenantId, tenantId), eq(schema.deals.id, dealId)))
    .limit(1);
  return deal ?? null;
}

export async function createDeal(db: Db, input: CreateDealInput): Promise<DealRead> {
  assertUuid(input.tenantId);
  assertUuid(input.actorUserId);
  assertUuid(input.contactId);
  const stage = input.stage ?? "new";
  if (!isInitialDealStage(stage)) throw new InvalidDealStageError();
  validateDealFields(input.amountEur, input.expectedCloseDate, input.lossReason, stage);

  return db.transaction((tx) => createDealInTransaction(tx, input));
}

export async function createDealInTransaction(db: Db, input: CreateDealInput): Promise<DealRead> {
  assertUuid(input.tenantId);
  assertUuid(input.actorUserId);
  assertUuid(input.contactId);
  const stage = input.stage ?? "new";
  if (!isInitialDealStage(stage)) throw new InvalidDealStageError();
  validateDealFields(input.amountEur, input.expectedCloseDate, input.lossReason, stage);

  await assertActiveMembership(db, input.tenantId, input.actorUserId);
  await assertContact(db, input.tenantId, input.contactId);
  await assertOwner(db, input.tenantId, input.ownerUserId);

  const [created] = await db.insert(schema.deals).values({
      tenantId: input.tenantId,
      contactId: input.contactId,
      title: input.title,
      description: input.description ?? null,
      amountEur: input.amountEur ?? null,
      ownerUserId: input.ownerUserId ?? null,
      stage,
      expectedCloseDate: input.expectedCloseDate ?? null,
      lossReason: null,
  }).returning();
  if (!created) throw new Error("Deal insert returned no row");
  return created;
}

export async function updateDeal(db: Db, input: UpdateDealInput): Promise<DealRead | null> {
  assertUuid(input.tenantId);
  assertUuid(input.dealId);
  assertUuid(input.actorUserId);

  return db.transaction((tx) => updateDealInTransaction(tx, input));
}

export async function updateDealInTransaction(db: Db, input: UpdateDealInput): Promise<DealRead | null> {
  assertUuid(input.tenantId);
  assertUuid(input.dealId);
  assertUuid(input.actorUserId);
  await assertActiveMembership(db, input.tenantId, input.actorUserId);
  const [current] = await db
      .select()
      .from(schema.deals)
      .where(and(eq(schema.deals.tenantId, input.tenantId), eq(schema.deals.id, input.dealId)))
      .for("update")
      .limit(1);
  if (!current) return null;
  if (current.status !== "active") throw new ArchivedDealError();

  const nextStage = input.stage ?? current.stage;
  if (input.stage !== undefined && !isValidDealStageTransition(current.stage, nextStage)) {
    throw new InvalidDealStageTransitionError();
  }
  validateDealFields(
      input.amountEur === undefined ? current.amountEur : input.amountEur,
      input.expectedCloseDate === undefined ? current.expectedCloseDate : input.expectedCloseDate,
      input.lossReason === undefined ? current.lossReason : input.lossReason,
      nextStage,
  );
  if (input.ownerUserId !== undefined) await assertOwner(db, input.tenantId, input.ownerUserId);

  const [updated] = await db
      .update(schema.deals)
      .set({
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.amountEur === undefined ? {} : { amountEur: input.amountEur }),
        ...(input.ownerUserId === undefined ? {} : { ownerUserId: input.ownerUserId }),
        ...(input.stage === undefined ? {} : { stage: input.stage }),
        ...(input.expectedCloseDate === undefined ? {} : { expectedCloseDate: input.expectedCloseDate }),
        ...(input.lossReason === undefined ? {} : { lossReason: input.lossReason }),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.deals.tenantId, input.tenantId), eq(schema.deals.id, input.dealId)))
      .returning();
  if (!updated) throw new DealNotFoundError();

  if (updated.stage !== current.stage) {
      await db.insert(schema.dealLifecycleAuditEvents).values({
        tenantId: input.tenantId,
        dealId: updated.id,
        actorUserId: input.actorUserId,
        eventType: "stage_changed",
        fromStage: current.stage,
        toStage: updated.stage,
      });
  }
  return updated;
}

export async function archiveDeal(db: Db, tenantId: string, dealId: string): Promise<DealRead | null> {
  assertUuid(tenantId);
  assertUuid(dealId);
  const [archived] = await db
    .update(schema.deals)
    .set({ status: "archived", archivedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(schema.deals.tenantId, tenantId), eq(schema.deals.id, dealId)))
    .returning();
  return archived ?? null;
}

async function assertActiveMembership(db: Db, tenantId: string, userId: string): Promise<void> {
  const [membership] = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(and(
      eq(schema.memberships.tenantId, tenantId),
      eq(schema.memberships.userId, userId),
      eq(schema.memberships.status, "active"),
    ))
    .limit(1);
  if (!membership) throw new InvalidDealOwnerError();
}

async function assertOwner(db: Db, tenantId: string, ownerUserId: string | null | undefined): Promise<void> {
  if (ownerUserId === undefined || ownerUserId === null) return;
  assertUuid(ownerUserId);
  await assertActiveMembership(db, tenantId, ownerUserId);
}

async function assertContact(db: Db, tenantId: string, contactId: string): Promise<void> {
  const [contact] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.tenantId, tenantId), eq(schema.contacts.id, contactId)))
    .limit(1);
  if (!contact) throw new InvalidDealContactError();
}

function validateDealFields(
  amountEur: string | null | undefined,
  expectedCloseDate: string | null | undefined,
  lossReason: string | null | undefined,
  stage: DealStage,
): void {
  if (amountEur !== undefined && amountEur !== null && !isValidAmountEur(amountEur)) {
    throw new Error("invalid_deal_amount");
  }
  if (expectedCloseDate !== undefined && expectedCloseDate !== null && !isValidDate(expectedCloseDate)) {
    throw new Error("invalid_deal_date");
  }
  if (stage !== "lost" && lossReason !== undefined && lossReason !== null) {
    throw new InvalidDealLossReasonError();
  }
}

function isValidAmountEur(value: string): boolean {
  return /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error("invalid_uuid");
}
