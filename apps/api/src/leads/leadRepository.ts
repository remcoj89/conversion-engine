import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { UUID_PATTERN } from "../auth/requestContext.js";
import type { TenantRole } from "../auth/types.js";
import { readCode } from "../errors.js";

type Db = NodePgDatabase<typeof schema>;

export type Lead = typeof schema.leads.$inferSelect;

// Read models deliberately exclude tenantId. The route already enforces tenant scope and the
// client has no reason to receive an internal isolation key.
export type LeadRead = Pick<Lead, "id" | "name" | "email" | "phone" | "message" | "source" | "status" | "createdAt" | "updatedAt">;

export type LeadCursor = Readonly<{
  // Keep PostgreSQL's microsecond precision. JavaScript Date only preserves milliseconds,
  // which is not sufficient for a stable keyset cursor.
  createdAt: string;
  id: string;
}>;

export type LeadListQuery = Readonly<{
  tenantId: string;
  role?: TenantRole;
  userId?: string;
  q?: string;
  status?: "new";
  limit: number;
  cursor?: LeadCursor;
}>;

export type LeadListResult = Readonly<{
  items: readonly LeadRead[];
  nextCursor: LeadCursor | null;
}>;

export type LeadReader = Readonly<{
  list: (query: LeadListQuery) => Promise<LeadListResult>;
  findDetail: (tenantId: string, leadId: string, role?: TenantRole, userId?: string) => Promise<LeadRead | null>;
}>;

const CURSOR_MAX_LENGTH = 256;

// What a caller may supply. tenantId, status and timestamps are deliberately not part of it.
export type NewLead = Readonly<{
  name: string;
  email: string;
  phone?: string | null;
  message: string;
  source: string;
}>;

// Fixed message only; never the tenant ID or lead contents.
export class InvalidLeadTenantError extends Error {
  readonly code = "invalid_tenant";
  constructor() {
    super("invalid_tenant");
    this.name = "InvalidLeadTenantError";
  }
}

export class InvalidLeadActorError extends Error {
  readonly code = "invalid_lead_actor";
  constructor() {
    super("invalid_lead_actor");
    this.name = "InvalidLeadActorError";
  }
}

// PostgreSQL: 23503 = foreign key violation (unknown tenant), 22P02 = invalid uuid syntax.
const INVALID_TENANT_CODES = new Set(["23503", "22P02"]);

// Stores a lead for exactly this tenant. tenantId must come from the auth context, never from input.
export async function createLead(db: Db, tenantId: string, lead: NewLead, actorUserId?: string): Promise<Lead> {
  try {
    if (!actorUserId) return await insertLead(db, tenantId, lead);
    return await db.transaction((tx) => insertLeadWithAssignment(tx, tenantId, lead, actorUserId));
  } catch (error) {
    // Drizzle wraps the driver error; the SQLSTATE sits on the cause.
    const code = readCode(error instanceof Error ? error.cause : undefined) ?? readCode(error);
    if (code && INVALID_TENANT_CODES.has(code)) throw new InvalidLeadTenantError();
    throw error;
  }
}

// Use this variant when the caller already owns the transaction boundary. It keeps the lead
// and assignment atomic without opening a nested transaction on the same database client.
export async function createLeadInTransaction(
  db: Db,
  tenantId: string,
  lead: NewLead,
  actorUserId: string,
): Promise<Lead> {
  try {
    return await insertLeadWithAssignment(db, tenantId, lead, actorUserId);
  } catch (error) {
    const code = readCode(error instanceof Error ? error.cause : undefined) ?? readCode(error);
    if (code && INVALID_TENANT_CODES.has(code)) throw new InvalidLeadTenantError();
    throw error;
  }
}

async function insertLead(db: Db, tenantId: string, lead: NewLead): Promise<Lead> {
  const [created] = await db
    .insert(schema.leads)
    .values({
      tenantId,
      name: lead.name,
      email: lead.email,
      phone: lead.phone ?? null,
      message: lead.message,
      source: lead.source,
    })
    .returning();
  if (!created) throw new Error("Lead insert returned no row");
  return created;
}

async function insertLeadWithAssignment(
  db: Db,
  tenantId: string,
  lead: NewLead,
  actorUserId: string,
): Promise<Lead> {
  const [actor] = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(and(
      eq(schema.memberships.tenantId, tenantId),
      eq(schema.memberships.userId, actorUserId),
      eq(schema.memberships.status, "active"),
    ))
    .limit(1);
  if (!actor) throw new InvalidLeadActorError();

  const created = await insertLead(db, tenantId, lead);
  await db.insert(schema.leadAssignments).values({
    tenantId,
    leadId: created.id,
    userId: actorUserId,
    assignedBy: actorUserId,
  });
  return created;
}

// Tenant isolation: the lead is only found when both id and tenant_id match.
export async function findLead(db: Db, tenantId: string, leadId: string): Promise<Lead | null> {
  const [lead] = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.id, leadId)))
    .limit(1);
  return lead ?? null;
}

// The cursor is opaque at the HTTP boundary, but remains a typed value inside the repository.
export function encodeLeadCursor(cursor: LeadCursor): string {
  return Buffer.from(
    JSON.stringify({ created_at: cursor.createdAt, id: cursor.id }),
    "utf8",
  ).toString("base64url");
}

export function decodeLeadCursor(value: unknown): LeadCursor | null {
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
      Object.keys(fields).sort().join(",") !== "created_at,id"
      || typeof fields.created_at !== "string"
      || typeof fields.id !== "string"
      || !UUID_PATTERN.test(fields.id)
    ) {
      return null;
    }

    if (!isValidLeadCursorTimestamp(fields.created_at)) return null;
    return { createdAt: fields.created_at, id: fields.id };
  } catch {
    return null;
  }
}

export function createLeadReader(db: Db): LeadReader {
  return {
    list: (query) => listLeads(db, query),
    findDetail: (tenantId, leadId, role, userId) => findLeadDetail(db, tenantId, leadId, role, userId),
  };
}

export async function listLeads(db: Db, query: LeadListQuery): Promise<LeadListResult> {
  const conditions = [eq(schema.leads.tenantId, query.tenantId)];

  if (query.q) {
    const pattern = `%${escapeLikePattern(query.q)}%`;
    conditions.push(
      or(
        ilike(schema.leads.name, pattern),
        ilike(schema.leads.email, pattern),
        ilike(schema.leads.source, pattern),
        ilike(schema.leads.message, pattern),
      )!,
    );
  }
  if (query.status) conditions.push(eq(schema.leads.status, query.status));
  if (query.cursor) {
    conditions.push(
      or(
        sql`${schema.leads.createdAt} < ${query.cursor.createdAt}::timestamptz`,
        and(
          sql`${schema.leads.createdAt} = ${query.cursor.createdAt}::timestamptz`,
          lt(schema.leads.id, query.cursor.id),
        ),
      )!,
    );
  }

  // Assignments describe responsibility and notifications, not visibility. The HTTP layer
  // already authenticated the active tenant membership; the tenant predicate above remains
  // the repository's explicit cross-tenant boundary.
  const rows = await db
    .select(leadListSelection)
    .from(schema.leads)
    .where(and(...conditions))
    .orderBy(desc(schema.leads.createdAt), desc(schema.leads.id))
    .limit(query.limit + 1);

  const hasMore = rows.length > query.limit;
  const pageRows = rows.slice(0, query.limit);
  const last = pageRows[pageRows.length - 1];
  const items = pageRows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    source: row.source,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  return {
    items,
    nextCursor: hasMore && last ? { createdAt: last.cursorCreatedAt, id: last.id } : null,
  };
}

export async function findLeadDetail(
  db: Db,
  tenantId: string,
  leadId: string,
  role?: TenantRole,
  userId?: string,
): Promise<LeadRead | null> {
  // Kept for API compatibility; authorization and active-membership checks happen at the route
  // and database boundaries, never through assignment-based row filtering.
  void role;
  void userId;
  const conditions = [eq(schema.leads.tenantId, tenantId), eq(schema.leads.id, leadId)];
  const [lead] = await db
    .select(leadReadSelection)
    .from(schema.leads)
    .where(and(...conditions))
    .limit(1);
  return lead ?? null;
}

const leadReadSelection = {
  id: schema.leads.id,
  name: schema.leads.name,
  email: schema.leads.email,
  phone: schema.leads.phone,
  message: schema.leads.message,
  source: schema.leads.source,
  status: schema.leads.status,
  createdAt: schema.leads.createdAt,
  updatedAt: schema.leads.updatedAt,
};

const leadListSelection = {
  ...leadReadSelection,
  cursorCreatedAt: sql<string>`to_char(
    ${schema.leads.createdAt} at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  )`.as("cursor_created_at"),
};

const LEAD_CURSOR_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

function isValidLeadCursorTimestamp(value: string): boolean {
  if (!LEAD_CURSOR_TIMESTAMP_PATTERN.test(value)) return false;
  const datePrefix = `${value.slice(0, 19)}Z`;
  const parsed = new Date(datePrefix);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 19) === value.slice(0, 19);
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
