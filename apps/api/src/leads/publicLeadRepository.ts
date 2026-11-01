import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { hashPublicLeadInput, type PublicLeadInput } from "./publicLeadInput.js";

type Db = NodePgDatabase<typeof schema>;

export type PublicWebsiteContext = Readonly<{ websiteId: string; tenantId: string }>;
export type PublicLeadResult = Readonly<{
  status: "accepted" | "replayed" | "rate_limited";
  leadId?: string;
  createdAt?: Date;
}>;

export class PublicLeadIdempotencyConflictError extends Error {
  readonly code = "idempotency_conflict";
}

export class PublicLeadPersistenceError extends Error {
  readonly code = "public_lead_persistence_error";
}

const RATE_LIMIT_PER_MINUTE = 10;

export async function createPublicLead(
  db: Db,
  website: PublicWebsiteContext,
  idempotencyKey: string,
  input: PublicLeadInput,
): Promise<PublicLeadResult> {
  return db.transaction((tx) => createPublicLeadInTransaction(tx, website, idempotencyKey, input));
}

export async function createPublicLeadInTransaction(
  tx: Db,
  website: PublicWebsiteContext,
  idempotencyKey: string,
  input: PublicLeadInput,
): Promise<PublicLeadResult> {
  const requestHash = hashPublicLeadInput(input);

  {
    // Serialize the same website/key pair before checking and claiming idempotency.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${website.websiteId}:${idempotencyKey}`}, 0))`);

    const [existing] = await tx
      .select({ requestHash: schema.publicLeadIdempotencyKeys.requestHash, leadId: schema.publicLeadIdempotencyKeys.leadId })
      .from(schema.publicLeadIdempotencyKeys)
      .where(and(
        eq(schema.publicLeadIdempotencyKeys.websiteId, website.websiteId),
        eq(schema.publicLeadIdempotencyKeys.idempotencyKey, idempotencyKey),
      ))
      .limit(1);

    if (existing) {
      if (existing.requestHash !== requestHash) throw new PublicLeadIdempotencyConflictError();
      const [lead] = await tx
        .select({ id: schema.leads.id, createdAt: schema.leads.createdAt })
        .from(schema.leads)
        .where(and(eq(schema.leads.tenantId, website.tenantId), eq(schema.leads.id, existing.leadId)))
        .limit(1);
      if (!lead) throw new PublicLeadPersistenceError("idempotency record has no lead");
      return { status: "replayed", leadId: lead.id, createdAt: lead.createdAt };
    }

    const rateLimit = await claimRateLimit(tx, website.websiteId);
    if (rateLimit > RATE_LIMIT_PER_MINUTE) return { status: "rate_limited" };

    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${website.tenantId}:${input.email}`}, 0))`);
    const contact = await findOrCreateContact(tx, website.tenantId, input);

    // Generate the identifier before inserting. A public lead is intentionally not
    // readable until its idempotency record exists, so RETURNING here would also
    // require a public SELECT policy before the transaction has established that
    // record.
    const leadId = randomUUID();
    await tx.insert(schema.leads).values({
      id: leadId,
      tenantId: website.tenantId,
      websiteId: website.websiteId,
      contactId: contact.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      organizationName: input.organization,
      message: input.message,
      source: "website_contact",
      privacyConsent: input.privacyConsent,
      marketingConsent: input.marketingConsent,
    });

    await tx.insert(schema.publicLeadOutbox).values({
      tenantId: website.tenantId,
      websiteId: website.websiteId,
      leadId,
      eventType: "lead.created",
      status: "pending",
      payload: {
        event: "lead.created",
        leadId,
        websiteId: website.websiteId,
        source: "website_contact",
      },
    });

    await tx.insert(schema.publicLeadIdempotencyKeys).values({
      tenantId: website.tenantId,
      websiteId: website.websiteId,
      idempotencyKey,
      requestHash,
      leadId,
    });

    const [lead] = await tx
      .select({ id: schema.leads.id, createdAt: schema.leads.createdAt })
      .from(schema.leads)
      .where(and(eq(schema.leads.tenantId, website.tenantId), eq(schema.leads.id, leadId)))
      .limit(1);
    if (!lead) throw new PublicLeadPersistenceError("lead insert returned no row");

    return { status: "accepted", leadId: lead.id, createdAt: lead.createdAt };
  }
}

async function claimRateLimit(tx: Db, websiteId: string): Promise<number> {
  const result = await tx.execute(sql`
    insert into public.public_lead_rate_limits (website_id, bucket_start, request_count, updated_at)
    values (${websiteId}, date_trunc('minute', now()), 1, now())
    on conflict (website_id, bucket_start)
    do update set request_count = public.public_lead_rate_limits.request_count + 1, updated_at = now()
    returning request_count
  `);
  const count = Number(result.rows[0]?.request_count);
  if (!Number.isSafeInteger(count)) throw new PublicLeadPersistenceError("rate limit counter missing");
  return count;
}

async function findOrCreateContact(tx: Db, tenantId: string, input: PublicLeadInput): Promise<{ id: string }> {
  const [existing] = await tx
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(and(
      eq(schema.contacts.tenantId, tenantId),
      sql`lower(btrim(${schema.contacts.email})) = ${input.email}`,
      eq(schema.contacts.status, "active"),
    ))
    .limit(1);
  if (existing) return existing;

  const [created] = await tx.insert(schema.contacts).values({
    tenantId,
    fullName: input.name,
    email: input.email,
    phone: input.phone,
    status: "active",
  }).returning({ id: schema.contacts.id });
  if (!created) throw new PublicLeadPersistenceError("contact insert returned no row");
  return created;
}

export function isPublicLeadRateLimited(result: PublicLeadResult): boolean {
  return result.status === "rate_limited";
}
