import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

export const LOCAL_TENANT_NAME = "Local development tenant";
export const CONFIRM_FLAG = "--confirm-local";

// Fixed messages only; never subjects, tokens or session IDs.
export class ProvisioningError extends Error {
  constructor(
    readonly code: "production_refused" | "confirmation_required" | "no_active_session",
    message: string,
  ) {
    super(message);
    this.name = "ProvisioningError";
  }
}

// Everything the provisioning needs inside one transaction.
export interface ProvisioningTx {
  findLatestActiveSessionSubject(): Promise<string | null>;
  // Creates the user when missing, never changes an existing one, and locks the row.
  ensureUser(subject: string): Promise<{ userId: string; created: boolean }>;
  hasActiveMembership(userId: string): Promise<boolean>;
  createTenant(name: string): Promise<string>;
  createOwnerMembership(tenantId: string, userId: string): Promise<void>;
}

// Commits when fn resolves, rolls back when it throws.
export type RunInTransaction = <T>(fn: (tx: ProvisioningTx) => Promise<T>) => Promise<T>;

export type ProvisioningResult =
  | Readonly<{ status: "already_provisioned"; createdUser: boolean }>
  | Readonly<{ status: "provisioned"; createdUser: boolean; tenantId: string }>;

export function assertLocalInvocation(env: Readonly<Record<string, string | undefined>>, argv: readonly string[]): void {
  if (env.NODE_ENV === "production") {
    throw new ProvisioningError("production_refused", "Lokale provisioning is uitgeschakeld wanneer NODE_ENV=production.");
  }
  if (!argv.includes(CONFIRM_FLAG)) {
    throw new ProvisioningError("confirmation_required", `Bevestig lokale provisioning expliciet met ${CONFIRM_FLAG}.`);
  }
}

export async function provisionLocalUser(runInTransaction: RunInTransaction): Promise<ProvisioningResult> {
  return runInTransaction(async (tx) => {
    // The subject stays in memory and is never logged or returned.
    const subject = await tx.findLatestActiveSessionSubject();
    if (!subject) {
      throw new ProvisioningError("no_active_session", "Geen actieve sessie gevonden. Log eerst in via het dashboard.");
    }

    const { userId, created } = await tx.ensureUser(subject);
    if (await tx.hasActiveMembership(userId)) {
      return { status: "already_provisioned", createdUser: created };
    }

    const tenantId = await tx.createTenant(LOCAL_TENANT_NAME);
    await tx.createOwnerMembership(tenantId, userId);
    return { status: "provisioned", createdUser: created, tenantId };
  });
}

type Db = NodePgDatabase<typeof schema>;
type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Drizzle commits the transaction when the callback resolves and rolls back when it throws.
export function drizzleTransactionRunner(db: Db): RunInTransaction {
  return (fn) => db.transaction((tx) => fn(drizzleProvisioningTx(tx)));
}

function drizzleProvisioningTx(tx: DbTx): ProvisioningTx {
  return {
    async findLatestActiveSessionSubject() {
      const [row] = await tx
        .select({ subject: schema.bffSessions.subject })
        .from(schema.bffSessions)
        .where(
          and(
            gt(schema.bffSessions.accessExpiresAt, sql`now()`),
            gt(schema.bffSessions.absoluteExpiresAt, sql`now()`),
          ),
        )
        .orderBy(desc(schema.bffSessions.createdAt))
        .limit(1);
      return row?.subject ?? null;
    },

    async ensureUser(subject) {
      const inserted = await tx
        .insert(schema.users)
        .values({ authProviderUserId: subject })
        .onConflictDoNothing({ target: schema.users.authProviderUserId })
        .returning({ id: schema.users.id });

      // Row lock: a concurrent run for the same user waits here, then sees the committed membership.
      const [user] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.authProviderUserId, subject))
        .for("update");
      if (!user) {
        throw new Error("User row missing after insert");
      }
      return { userId: user.id, created: inserted.length === 1 };
    },

    // Same definition as the API's membership resolver: active membership in an active tenant.
    async hasActiveMembership(userId) {
      const rows = await tx
        .select({ tenantId: schema.memberships.tenantId })
        .from(schema.memberships)
        .innerJoin(schema.tenants, eq(schema.tenants.id, schema.memberships.tenantId))
        .where(
          and(
            eq(schema.memberships.userId, userId),
            eq(schema.memberships.status, "active"),
            eq(schema.tenants.status, "active"),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    async createTenant(name) {
      const [tenant] = await tx.insert(schema.tenants).values({ name }).returning({ id: schema.tenants.id });
      if (!tenant) {
        throw new Error("Tenant insert returned no row");
      }
      return tenant.id;
    },

    async createOwnerMembership(tenantId, userId) {
      await tx.insert(schema.memberships).values({ tenantId, userId, role: "owner", status: "active" });
    },
  };
}
