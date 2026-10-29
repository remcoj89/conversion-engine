import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

export const PLATFORM_ADMIN_CONFIRM_FLAG = "--confirm-local";

type PlatformAdminProvisioningErrorCode =
  | "production_refused"
  | "confirmation_required"
  | "no_active_session"
  | "ambiguous_active_sessions"
  | "user_not_found"
  | "user_inactive"
  | "assignment_state_unavailable";

export class PlatformAdminProvisioningError extends Error {
  constructor(readonly code: PlatformAdminProvisioningErrorCode, message: string) {
    super(message);
    this.name = "PlatformAdminProvisioningError";
  }
}

export type PlatformAdminProvisioningResult =
  | Readonly<{ status: "created" }>
  | Readonly<{ status: "reactivated" }>
  | Readonly<{ status: "already_active" }>;

type InvocationEnvironment = Readonly<Record<string, string | undefined>>;
type UserRow = Readonly<{ id: string; status: string }>;
type AssignmentRow = Readonly<{ status: "active" | "revoked" }>;

export interface PlatformAdminProvisioningTx {
  findActiveSessionSubjects(): Promise<string[]>;
  findUserBySubject(subject: string): Promise<UserRow | null>;
  findAssignment(userId: string): Promise<AssignmentRow | null>;
  createAssignment(userId: string, grantedBy: string): Promise<boolean>;
  reactivateAssignment(userId: string, grantedBy: string): Promise<void>;
}

export type RunPlatformAdminTransaction = <T>(
  fn: (tx: PlatformAdminProvisioningTx) => Promise<T>,
) => Promise<T>;

export function assertPlatformAdminInvocation(
  env: InvocationEnvironment,
  argv: readonly string[],
): void {
  if (env.NODE_ENV === "production") {
    throw new PlatformAdminProvisioningError(
      "production_refused",
      "Platform-admin provisioning is uitgeschakeld wanneer NODE_ENV=production.",
    );
  }
  if (env.NODE_ENV !== "development") {
    throw new PlatformAdminProvisioningError(
      "production_refused",
      "Platform-admin provisioning vereist NODE_ENV=development.",
    );
  }
  if (!argv.includes(PLATFORM_ADMIN_CONFIRM_FLAG)) {
    throw new PlatformAdminProvisioningError(
      "confirmation_required",
      `Bevestig platform-admin provisioning expliciet met ${PLATFORM_ADMIN_CONFIRM_FLAG}.`,
    );
  }
}

export async function provisionCurrentPlatformAdmin(
  runInTransaction: RunPlatformAdminTransaction,
): Promise<PlatformAdminProvisioningResult> {
  return runInTransaction(async (tx) => {
    // The subject stays in memory and is never logged or returned.
    const subjects = await tx.findActiveSessionSubjects();
    if (subjects.length === 0) {
      throw new PlatformAdminProvisioningError(
        "no_active_session",
        "Geen actieve sessie gevonden. Log eerst in via het dashboard.",
      );
    }
    if (subjects.length > 1) {
      throw new PlatformAdminProvisioningError(
        "ambiguous_active_sessions",
        "Er zijn meerdere actieve gebruikerssessies. Meld andere gebruikers lokaal af en probeer opnieuw.",
      );
    }
    const subject = subjects[0];
    if (!subject) {
      throw new PlatformAdminProvisioningError(
        "no_active_session",
        "Geen actieve sessie gevonden. Log eerst in via het dashboard.",
      );
    }

    const user = await tx.findUserBySubject(subject);
    if (!user) {
      throw new PlatformAdminProvisioningError(
        "user_not_found",
        "De huidige lokale gebruiker bestaat nog niet. Voer eerst lokale user-provisioning uit.",
      );
    }
    if (user.status !== "active") {
      throw new PlatformAdminProvisioningError(
        "user_inactive",
        "De huidige lokale gebruiker is niet actief en kan geen platform-admin worden.",
      );
    }

    // This is an explicit local bootstrap command, so the user grants the initial
    // assignment to themselves. Normal production grants must use an existing admin.
    const grantedBy = user.id;
    const existing = await tx.findAssignment(user.id);
    if (existing?.status === "active") {
      return { status: "already_active" };
    }
    if (existing?.status === "revoked") {
      await tx.reactivateAssignment(user.id, grantedBy);
      return { status: "reactivated" };
    }

    if (await tx.createAssignment(user.id, grantedBy)) {
      return { status: "created" };
    }

    // A concurrent invocation may have created the row after the first lookup.
    const concurrent = await tx.findAssignment(user.id);
    if (concurrent?.status === "active") {
      return { status: "already_active" };
    }
    if (concurrent?.status === "revoked") {
      await tx.reactivateAssignment(user.id, grantedBy);
      return { status: "reactivated" };
    }
    throw new PlatformAdminProvisioningError(
      "assignment_state_unavailable",
      "Platform-adminassignment kon niet veilig worden bepaald.",
    );
  });
}

type Db = NodePgDatabase<typeof schema>;
type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function drizzlePlatformAdminTransactionRunner(db: Db): RunPlatformAdminTransaction {
  return (fn) => db.transaction((tx) => fn(drizzlePlatformAdminTx(tx)));
}

function drizzlePlatformAdminTx(tx: DbTx): PlatformAdminProvisioningTx {
  return {
    async findActiveSessionSubjects() {
      const rows = await tx
        .select({ subject: schema.bffSessions.subject })
        .from(schema.bffSessions)
        .where(
          and(
            gt(schema.bffSessions.accessExpiresAt, sql`now()`),
            gt(schema.bffSessions.absoluteExpiresAt, sql`now()`),
          ),
        )
        .orderBy(desc(schema.bffSessions.createdAt));
      return [...new Set(rows.map(({ subject }) => subject))];
    },

    async findUserBySubject(subject) {
      const [user] = await tx
        .select({ id: schema.users.id, status: schema.users.status })
        .from(schema.users)
        .where(eq(schema.users.authProviderUserId, subject))
        .for("update")
        .limit(1);
      return user ?? null;
    },

    async findAssignment(userId) {
      const [assignment] = await tx
        .select({ status: schema.platformAdminAssignments.status })
        .from(schema.platformAdminAssignments)
        .where(
          and(
            eq(schema.platformAdminAssignments.userId, userId),
            eq(schema.platformAdminAssignments.permission, "platform_admin"),
          ),
        )
        .for("update")
        .limit(1);
      return assignment ?? null;
    },

    async createAssignment(userId, grantedBy) {
      const inserted = await tx
        .insert(schema.platformAdminAssignments)
        .values({ userId, permission: "platform_admin", status: "active", grantedBy })
        .onConflictDoNothing({
          target: [schema.platformAdminAssignments.userId, schema.platformAdminAssignments.permission],
        })
        .returning({ userId: schema.platformAdminAssignments.userId });
      return inserted.length === 1;
    },

    async reactivateAssignment(userId, grantedBy) {
      await tx
        .update(schema.platformAdminAssignments)
        .set({ status: "active", grantedBy, revokedAt: null })
        .where(
          and(
            eq(schema.platformAdminAssignments.userId, userId),
            eq(schema.platformAdminAssignments.permission, "platform_admin"),
            eq(schema.platformAdminAssignments.status, "revoked"),
          ),
        );
    },
  };
}
