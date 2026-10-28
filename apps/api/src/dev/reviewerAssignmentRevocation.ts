import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { UUID_PATTERN } from "../auth/requestContext.js";
import * as schema from "../db/schema.js";

export const REVIEWER_REVOCATION_CONFIRM_FLAG = "--confirm-reviewer-revocation";

type ReviewerAssignmentRevocationErrorCode =
  | "production_refused"
  | "confirmation_required"
  | "missing_parameter"
  | "invalid_parameter"
  | "invalid_uuid"
  | "tenant_not_found"
  | "tenant_inactive"
  | "reviewer_not_found"
  | "revoked_by_not_found"
  | "assignment_not_found"
  | "assignment_state_unavailable";

export class ReviewerAssignmentRevocationError extends Error {
  constructor(readonly code: ReviewerAssignmentRevocationErrorCode, message: string) {
    super(message);
    this.name = "ReviewerAssignmentRevocationError";
  }
}

export type ReviewerAssignmentRevocationInput = Readonly<{
  tenantId: string;
  reviewerId: string;
  revokedBy: string;
}>;

export type ReviewerAssignmentRevocationResult =
  | Readonly<{ status: "revoked" }>
  | Readonly<{ status: "already_revoked" }>;

type AssignmentRow = Readonly<{
  status: "active" | "revoked";
}>;

export interface ReviewerAssignmentRevocationTx {
  findTenant(tenantId: string): Promise<{ id: string; status: string } | null>;
  findUser(userId: string): Promise<{ id: string } | null>;
  findAssignment(tenantId: string, reviewerId: string): Promise<AssignmentRow | null>;
  revokeAssignment(input: ReviewerAssignmentRevocationInput): Promise<boolean>;
}

export type RunReviewerAssignmentRevocationTransaction = <T>(
  fn: (tx: ReviewerAssignmentRevocationTx) => Promise<T>,
) => Promise<T>;

type InvocationEnvironment = Readonly<Record<string, string | undefined>>;

function throwInvalidUuid(): never {
  throw new ReviewerAssignmentRevocationError(
    "invalid_uuid",
    "Tenant-, reviewer- en revoked_by-identifiers moeten geldige UUID's zijn.",
  );
}

function validateInput(input: ReviewerAssignmentRevocationInput): void {
  if (!input.tenantId || !input.reviewerId || !input.revokedBy) {
    throw new ReviewerAssignmentRevocationError(
      "missing_parameter",
      "Tenant-, reviewer- en revoked_by-identifiers zijn verplicht.",
    );
  }
  if (
    !UUID_PATTERN.test(input.tenantId) ||
    !UUID_PATTERN.test(input.reviewerId) ||
    !UUID_PATTERN.test(input.revokedBy)
  ) {
    throwInvalidUuid();
  }
}

export function parseReviewerAssignmentRevocationInvocation(
  env: InvocationEnvironment,
  argv: readonly string[],
): ReviewerAssignmentRevocationInput {
  if (env.NODE_ENV === "production") {
    throw new ReviewerAssignmentRevocationError(
      "production_refused",
      "Reviewer-revoke is uitgeschakeld wanneer NODE_ENV=production.",
    );
  }

  const values: Partial<Record<"tenantId" | "reviewerId" | "revokedBy", string>> = {};
  let confirmed = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === REVIEWER_REVOCATION_CONFIRM_FLAG) {
      if (confirmed) {
        throw new ReviewerAssignmentRevocationError(
          "invalid_parameter",
          "Gebruik ieder reviewer-revokeargument maximaal één keer.",
        );
      }
      confirmed = true;
      continue;
    }

    const key =
      argument === "--tenant-id"
        ? "tenantId"
        : argument === "--reviewer-id"
          ? "reviewerId"
          : argument === "--revoked-by"
            ? "revokedBy"
            : null;
    if (!key || values[key] !== undefined) {
      throw new ReviewerAssignmentRevocationError(
        "invalid_parameter",
        "Gebruik --tenant-id, --reviewer-id, --revoked-by en de expliciete bevestigingsflag.",
      );
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new ReviewerAssignmentRevocationError(
        "missing_parameter",
        "Tenant-, reviewer- en revoked_by-identifiers zijn verplicht.",
      );
    }
    values[key] = value;
    index += 1;
  }

  if (!confirmed) {
    throw new ReviewerAssignmentRevocationError(
      "confirmation_required",
      `Bevestig reviewer-revoke expliciet met ${REVIEWER_REVOCATION_CONFIRM_FLAG}.`,
    );
  }

  const input = {
    tenantId: values.tenantId ?? "",
    reviewerId: values.reviewerId ?? "",
    revokedBy: values.revokedBy ?? "",
  };
  validateInput(input);
  return input;
}

export async function revokeReviewerAssignment(
  runInTransaction: RunReviewerAssignmentRevocationTransaction,
  input: ReviewerAssignmentRevocationInput,
): Promise<ReviewerAssignmentRevocationResult> {
  validateInput(input);

  return runInTransaction(async (tx) => {
    const tenant = await tx.findTenant(input.tenantId);
    if (!tenant) {
      throw new ReviewerAssignmentRevocationError("tenant_not_found", "De opgegeven tenant bestaat niet.");
    }
    if (tenant.status !== "active") {
      throw new ReviewerAssignmentRevocationError(
        "tenant_inactive",
        "Reviewer-revoke voor een inactieve tenant is niet toegestaan.",
      );
    }

    if (!(await tx.findUser(input.reviewerId))) {
      throw new ReviewerAssignmentRevocationError("reviewer_not_found", "De opgegeven reviewer bestaat niet.");
    }
    if (!(await tx.findUser(input.revokedBy))) {
      throw new ReviewerAssignmentRevocationError(
        "revoked_by_not_found",
        "De opgegeven bevoegde operator bestaat niet.",
      );
    }

    const existing = await tx.findAssignment(input.tenantId, input.reviewerId);
    if (!existing) {
      throw new ReviewerAssignmentRevocationError(
        "assignment_not_found",
        "De reviewer heeft geen assignment voor de opgegeven tenant.",
      );
    }
    if (existing.status === "revoked") {
      return { status: "already_revoked" };
    }

    if (await tx.revokeAssignment(input)) {
      return { status: "revoked" };
    }

    // A concurrent invocation may have revoked the row after the first lookup.
    const concurrent = await tx.findAssignment(input.tenantId, input.reviewerId);
    if (concurrent?.status === "revoked") {
      return { status: "already_revoked" };
    }
    throw new ReviewerAssignmentRevocationError(
      "assignment_state_unavailable",
      "Reviewer-toewijzing kon niet veilig worden ingetrokken.",
    );
  });
}

type Db = NodePgDatabase<typeof schema>;
type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function drizzleReviewerAssignmentRevocationTransactionRunner(
  db: Db,
): RunReviewerAssignmentRevocationTransaction {
  return (fn) => db.transaction((tx) => fn(drizzleReviewerAssignmentRevocationTx(tx)));
}

function drizzleReviewerAssignmentRevocationTx(tx: DbTx): ReviewerAssignmentRevocationTx {
  return {
    async findTenant(tenantId) {
      const [tenant] = await tx
        .select({ id: schema.tenants.id, status: schema.tenants.status })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      return tenant ?? null;
    },

    async findUser(userId) {
      const [user] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      return user ?? null;
    },

    async findAssignment(tenantId, reviewerId) {
      const [assignment] = await tx
        .select({ status: schema.onboardingReviewerAssignments.status })
        .from(schema.onboardingReviewerAssignments)
        .where(
          and(
            eq(schema.onboardingReviewerAssignments.tenantId, tenantId),
            eq(schema.onboardingReviewerAssignments.userId, reviewerId),
          ),
        )
        .limit(1);
      return assignment ?? null;
    },

    async revokeAssignment({ tenantId, reviewerId }) {
      const updated = await tx
        .update(schema.onboardingReviewerAssignments)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(
          and(
            eq(schema.onboardingReviewerAssignments.tenantId, tenantId),
            eq(schema.onboardingReviewerAssignments.userId, reviewerId),
            eq(schema.onboardingReviewerAssignments.status, "active"),
          ),
        )
        .returning({ tenantId: schema.onboardingReviewerAssignments.tenantId });
      return updated.length === 1;
    },
  };
}
