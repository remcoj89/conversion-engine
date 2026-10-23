import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { readCode } from "../errors.js";

type Db = NodePgDatabase<typeof schema>;

export type Lead = typeof schema.leads.$inferSelect;

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

// PostgreSQL: 23503 = foreign key violation (unknown tenant), 22P02 = invalid uuid syntax.
const INVALID_TENANT_CODES = new Set(["23503", "22P02"]);

// Stores a lead for exactly this tenant. tenantId must come from the auth context, never from input.
export async function createLead(db: Db, tenantId: string, lead: NewLead): Promise<Lead> {
  try {
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
  } catch (error) {
    // Drizzle wraps the driver error; the SQLSTATE sits on the cause.
    const code = readCode(error instanceof Error ? error.cause : undefined) ?? readCode(error);
    if (code && INVALID_TENANT_CODES.has(code)) throw new InvalidLeadTenantError();
    throw error;
  }
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
