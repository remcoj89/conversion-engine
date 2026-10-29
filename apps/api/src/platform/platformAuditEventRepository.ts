import { and, desc, eq, gte, lte, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { UUID_PATTERN } from "../auth/requestContext.js";
import type { OnboardingStatus } from "../onboarding/onboardingRepository.js";

type Db = NodePgDatabase<typeof schema>;

export const platformAuditEventTypes = [
  ...schema.onboardingAuditEventTypes,
  ...schema.reviewAccessEventActions,
] as const;

export type PlatformAuditEventType = (typeof platformAuditEventTypes)[number];
export type PlatformAuditEventSource = "audit" | "access";

export type PlatformAuditEventCursor = Readonly<{
  createdAt: Date;
  id: string;
  source: PlatformAuditEventSource;
}>;

export type PlatformAuditEventListQuery = Readonly<{
  tenantId?: string;
  eventType?: PlatformAuditEventType;
  from?: Date;
  to?: Date;
  limit: number;
  cursor?: PlatformAuditEventCursor;
}>;

export type PlatformAuditEventListItem = Readonly<{
  id: string;
  tenantId: string;
  projectId: string;
  eventType: PlatformAuditEventType;
  fromStatus: OnboardingStatus | null;
  toStatus: OnboardingStatus | null;
  version: number | null;
  actorType: "member" | "reviewer";
  actorId: string | null;
  createdAt: Date;
  requestOrCorrelationId: string | null;
}>;

export type PlatformAuditEventListResult = Readonly<{
  items: readonly PlatformAuditEventListItem[];
  nextCursor: PlatformAuditEventCursor | null;
}>;

export type PlatformAuditEventRepository = Readonly<{
  list: (query: PlatformAuditEventListQuery) => Promise<PlatformAuditEventListResult>;
}>;

export type PlatformAuditEventRepositoryRow = PlatformAuditEventListItem & Readonly<{
  source: PlatformAuditEventSource;
}>;
type PlatformAuditEventRow = PlatformAuditEventRepositoryRow;

const CURSOR_MAX_LENGTH = 512;

// The cursor is opaque at the HTTP boundary, but remains a typed value inside the repository.
export function encodePlatformAuditEventCursor(cursor: PlatformAuditEventCursor): string {
  return Buffer.from(
    JSON.stringify({
      created_at: cursor.createdAt.toISOString(),
      id: cursor.id,
      source: cursor.source,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodePlatformAuditEventCursor(value: unknown): PlatformAuditEventCursor | null {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > CURSOR_MAX_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

    const fields = parsed as Record<string, unknown>;
    if (
      Object.keys(fields).sort().join(",") !== "created_at,id,source"
      || typeof fields.created_at !== "string"
      || typeof fields.id !== "string"
      || !UUID_PATTERN.test(fields.id)
      || (fields.source !== "audit" && fields.source !== "access")
    ) {
      return null;
    }

    const createdAt = new Date(fields.created_at);
    if (Number.isNaN(createdAt.getTime())) return null;

    return {
      createdAt,
      id: fields.id,
      source: fields.source,
    };
  } catch {
    return null;
  }
}

export function createPlatformAuditEventRepository(db: Db): PlatformAuditEventRepository {
  return {
    list: (query) => listPlatformAuditEvents(db, query),
  };
}

export async function listPlatformAuditEvents(
  db: Db,
  query: PlatformAuditEventListQuery,
): Promise<PlatformAuditEventListResult> {
  const [auditRows, accessRows] = await Promise.all([
    listStatusAuditEvents(db, query),
    listReviewerAccessEvents(db, query),
  ]);

  return mergePlatformAuditEventRows([...auditRows, ...accessRows], query.limit);
}

export function mergePlatformAuditEventRows(
  rows: readonly PlatformAuditEventRepositoryRow[],
  limit: number,
): PlatformAuditEventListResult {
  const ordered = [...rows].sort(compareEvents);
  const page = ordered.slice(0, limit);

  return {
    items: page.map((event) => ({
      id: event.id,
      tenantId: event.tenantId,
      projectId: event.projectId,
      eventType: event.eventType,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      version: event.version,
      actorType: event.actorType,
      actorId: event.actorId,
      createdAt: event.createdAt,
      requestOrCorrelationId: event.requestOrCorrelationId,
    })),
    nextCursor: ordered.length > limit
      ? {
        createdAt: page[page.length - 1]!.createdAt,
        id: page[page.length - 1]!.id,
        source: page[page.length - 1]!.source,
      }
      : null,
  };
}

async function listStatusAuditEvents(
  db: Db,
  query: PlatformAuditEventListQuery,
): Promise<readonly PlatformAuditEventRow[]> {
  if (query.eventType === "read_onboarding_content") return [];

  const conditions = buildBaseConditions(
    schema.onboardingAuditEvents.tenantId,
    schema.onboardingAuditEvents.createdAt,
    schema.onboardingAuditEvents.id,
    query,
    "audit",
  );
  if (query.eventType) conditions.push(eq(schema.onboardingAuditEvents.eventType, query.eventType));

  const rows = await db
    .select({
      id: schema.onboardingAuditEvents.id,
      tenantId: schema.onboardingAuditEvents.tenantId,
      projectId: schema.onboardingAuditEvents.projectId,
      eventType: schema.onboardingAuditEvents.eventType,
      fromStatus: schema.onboardingAuditEvents.fromStatus,
      toStatus: schema.onboardingAuditEvents.toStatus,
      version: schema.onboardingAuditEvents.version,
      memberUserId: schema.onboardingAuditEvents.memberUserId,
      reviewerUserId: schema.onboardingAuditEvents.reviewerUserId,
      createdAt: schema.onboardingAuditEvents.createdAt,
    })
    .from(schema.onboardingAuditEvents)
    .where(and(...conditions))
    .orderBy(desc(schema.onboardingAuditEvents.createdAt), desc(schema.onboardingAuditEvents.id))
    .limit(query.limit + 1);

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    projectId: row.projectId,
    eventType: row.eventType,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    version: row.version,
    actorType: row.reviewerUserId === null ? "member" : "reviewer",
    actorId: row.reviewerUserId ?? row.memberUserId,
    createdAt: row.createdAt,
    requestOrCorrelationId: null,
    source: "audit",
  }));
}

async function listReviewerAccessEvents(
  db: Db,
  query: PlatformAuditEventListQuery,
): Promise<readonly PlatformAuditEventRow[]> {
  if (query.eventType && query.eventType !== "read_onboarding_content") return [];

  const conditions = buildBaseConditions(
    schema.onboardingReviewAccessEvents.tenantId,
    schema.onboardingReviewAccessEvents.createdAt,
    schema.onboardingReviewAccessEvents.id,
    query,
    "access",
  );

  const rows = await db
    .select({
      id: schema.onboardingReviewAccessEvents.id,
      tenantId: schema.onboardingReviewAccessEvents.tenantId,
      projectId: schema.onboardingReviewAccessEvents.projectId,
      version: schema.onboardingReviewAccessEvents.version,
      reviewerUserId: schema.onboardingReviewAccessEvents.reviewerUserId,
      createdAt: schema.onboardingReviewAccessEvents.createdAt,
      requestOrCorrelationId: schema.onboardingReviewAccessEvents.requestOrCorrelationId,
    })
    .from(schema.onboardingReviewAccessEvents)
    .where(and(...conditions))
    .orderBy(desc(schema.onboardingReviewAccessEvents.createdAt), desc(schema.onboardingReviewAccessEvents.id))
    .limit(query.limit + 1);

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    projectId: row.projectId,
    eventType: "read_onboarding_content",
    fromStatus: null,
    toStatus: null,
    version: row.version,
    actorType: "reviewer",
    actorId: row.reviewerUserId,
    createdAt: row.createdAt,
    requestOrCorrelationId: row.requestOrCorrelationId,
    source: "access",
  }));
}

function buildBaseConditions(
  tenantIdColumn: typeof schema.onboardingAuditEvents.tenantId | typeof schema.onboardingReviewAccessEvents.tenantId,
  createdAtColumn: typeof schema.onboardingAuditEvents.createdAt | typeof schema.onboardingReviewAccessEvents.createdAt,
  idColumn: typeof schema.onboardingAuditEvents.id | typeof schema.onboardingReviewAccessEvents.id,
  query: PlatformAuditEventListQuery,
  source: PlatformAuditEventSource,
) {
  const conditions = [sql`true`];
  if (query.tenantId) conditions.push(eq(tenantIdColumn, query.tenantId));
  if (query.from) conditions.push(gte(createdAtColumn, query.from));
  if (query.to) conditions.push(lte(createdAtColumn, query.to));
  if (query.cursor) conditions.push(afterCursorCondition(createdAtColumn, idColumn, query.cursor, source));
  return conditions;
}

function afterCursorCondition(
  createdAtColumn: typeof schema.onboardingAuditEvents.createdAt | typeof schema.onboardingReviewAccessEvents.createdAt,
  idColumn: typeof schema.onboardingAuditEvents.id | typeof schema.onboardingReviewAccessEvents.id,
  cursor: PlatformAuditEventCursor,
  source: PlatformAuditEventSource,
) {
  const olderTimestamp = lt(createdAtColumn, cursor.createdAt);
  const sameTimestamp = eq(createdAtColumn, cursor.createdAt);
  const olderId = lt(idColumn, cursor.id);
  const sameId = eq(idColumn, cursor.id);

  // The total order is created_at DESC, id DESC, source DESC. "audit" sorts before
  // "access" for equal timestamps and IDs, so the source only matters at the final tie.
  const sourceAfterCursor = source === cursor.source
    ? olderId
    : source === "access" && cursor.source === "audit"
      ? or(olderId, sameId)!
      : olderId;

  return or(olderTimestamp, and(sameTimestamp, sourceAfterCursor)!)!;
}

function compareEvents(left: PlatformAuditEventRow, right: PlatformAuditEventRow): number {
  const createdAtDifference = right.createdAt.getTime() - left.createdAt.getTime();
  if (createdAtDifference !== 0) return createdAtDifference;

  if (left.id !== right.id) return right.id > left.id ? 1 : -1;
  if (left.source === right.source) return 0;
  return left.source === "audit" ? -1 : 1;
}
