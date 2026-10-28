import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { UUID_PATTERN } from "../auth/requestContext.js";
import * as schema from "../db/schema.js";

export const REVIEWER_CONFIRM_FLAG = "--confirm-reviewer-assignment";

type ReviewerAssignmentProvisioningErrorCode =
  | "production_refused"
  | "confirmation_required"
  | "missing_parameter"
  | "invalid_parameter"
  | "invalid_uuid"
  | "tenant_not_found"
  | "tenant_inactive"
  | "reviewer_not_found"
  | "granted_by_not_found"
  | "assignment_state_unavailable";

export class ReviewerAssignmentProvisioningError extends Error {
  constructor(readonly code: ReviewerAssignmentProvisioningErrorCode, message: string) {
    super(message);
    this.name = "ReviewerAssignmentProvisioningError";
  }
}

export type ReviewerAssignmentProvisioningInput = Readonly<{
  tenantId: string;
  reviewerId: string;
  grantedBy: string;
}>;

export type ReviewerAssignmentProvisioningResult =
  | Readonly<{ status: "created" }>
  | Readonly<{ status: "reactivated" }>
  | Readonly<{ status: "already_active" }>;

type AssignmentRow = Readonly<{
  status: "active" | "revoked";
  grantedBy: string;
  createdAt: Date;
  revokedAt: Date | null;
}>;

export interface ReviewerAssignmentProvisioningTx {
  findTenant(tenantId: string): Promise<{ id: string; status: string } | null>;
  findUser(userId: string): Promise<{ id: string } | null>;
  findAssignment(tenantId: string, reviewerId: string): Promise<AssignmentRow | null>;
  createAssignment(input: ReviewerAssignmentProvisioningInput): Promise<boolean>;
  reactivateAssignment(input: ReviewerAssignmentProvisioningInput): Promise<void>;
}

export type RunReviewerAssignmentTransaction = <T>(
  fn: (tx: ReviewerAssignmentProvisioningTx) => Promise<T>,
) => Promise<T>;

type InvocationEnvironment = Readonly<Record<string, string | undefined>>;

function throwInvalidUuid(): never {
  throw new ReviewerAssignmentProvisioningError(
    "invalid_uuid",
    "Tenant-, reviewer- en granted_by-identifiers moeten geldige UUID's zijn.",
  );
}

function validateInput(input: ReviewerAssignmentProvisioningInput): void {
  if (!input.tenantId || !input.reviewerId || !input.grantedBy) {
    throw new ReviewerAssignmentProvisioningError(
      "missing_parameter",
      "Tenant-, reviewer- en granted_by-identifiers zijn verplicht.",
    );
  }
  if (!UUID_PATTERN.test(input.tenantId) || !UUID_PATTERN.test(input.reviewerId) || !UUID_PATTERN.test(input.grantedBy)) {
    throwInvalidUuid();
  }
}

export function parseReviewerAssignmentInvocation(
  env: InvocationEnvironment,
  argv: readonly string[],
): ReviewerAssignmentProvisioningInput {
  if (env.NODE_ENV === "production") {
    throw new ReviewerAssignmentProvisioningError(
      "production_refused",
      "Reviewer-provisioning is uitgeschakeld wanneer NODE_ENV=production.",
    );
  }

  const values: Partial<Record<"tenantId" | "reviewerId" | "grantedBy", string>> = {};
  let confirmed = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === REVIEWER_CONFIRM_FLAG) {
      if (confirmed) {
        throw new ReviewerAssignmentProvisioningError(
          "invalid_parameter",
          "Gebruik ieder reviewer-provisioningargument maximaal één keer.",
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
          : argument === "--granted-by"
            ? "grantedBy"
            : null;
    if (!key || values[key] !== undefined) {
      throw new ReviewerAssignmentProvisioningError(
        "invalid_parameter",
        "Gebruik --tenant-id, --reviewer-id, --granted-by en de expliciete bevestigingsflag.",
      );
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new ReviewerAssignmentProvisioningError(
        "missing_parameter",
        "Tenant-, reviewer- en granted_by-identifiers zijn verplicht.",
      );
    }
    values[key] = value;
    index += 1;
  }

  if (!confirmed) {
    throw new ReviewerAssignmentProvisioningError(
      "confirmation_required",
      `Bevestig reviewer-provisioning expliciet met ${REVIEWER_CONFIRM_FLAG}.`,
    );
  }

  const input = {
    tenantId: values.tenantId ?? "",
    reviewerId: values.reviewerId ?? "",
    grantedBy: values.grantedBy ?? "",
  };
  validateInput(input);
  return input;
}

export async function provisionReviewerAssignment(
  runInTransaction: RunReviewerAssignmentTransaction,
  input: ReviewerAssignmentProvisioningInput,
): Promise<ReviewerAssignmentProvisioningResult> {
  validateInput(input);

  return runInTransaction(async (tx) => {
    const tenant = await tx.findTenant(input.tenantId);
    if (!tenant) {
      throw new ReviewerAssignmentProvisioningError("tenant_not_found", "De opgegeven tenant bestaat niet.");
    }
    if (tenant.status !== "active") {
      throw new ReviewerAssignmentProvisioningError(
        "tenant_inactive",
        "Reviewer-provisioning voor een inactieve tenant is niet toegestaan.",
      );
    }

    if (!(await tx.findUser(input.reviewerId))) {
      throw new ReviewerAssignmentProvisioningError("reviewer_not_found", "De opgegeven reviewer bestaat niet.");
    }
    if (!(await tx.findUser(input.grantedBy))) {
      throw new ReviewerAssignmentProvisioningError(
        "granted_by_not_found",
        "De opgegeven bevoegde operator bestaat niet.",
      );
    }

    const existing = await tx.findAssignment(input.tenantId, input.reviewerId);
    if (existing?.status === "active") {
      return { status: "already_active" };
    }
    if (existing?.status === "revoked") {
      await tx.reactivateAssignment(input);
      return { status: "reactivated" };
    }

    if (await tx.createAssignment(input)) {
      return { status: "created" };
    }

    // A concurrent invocation may have created the row after the first lookup.
    const concurrent = await tx.findAssignment(input.tenantId, input.reviewerId);
    if (concurrent?.status === "active") {
      return { status: "already_active" };
    }
    if (concurrent?.status === "revoked") {
      await tx.reactivateAssignment(input);
      return { status: "reactivated" };
    }
    throw new ReviewerAssignmentProvisioningError(
      "assignment_state_unavailable",
      "Reviewer-toewijzing kon niet veilig worden bepaald.",
    );
  });
}

type Db = NodePgDatabase<typeof schema>;
type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function drizzleReviewerAssignmentTransactionRunner(db: Db): RunReviewerAssignmentTransaction {
  return (fn) => db.transaction((tx) => fn(drizzleReviewerAssignmentTx(tx)));
}

function drizzleReviewerAssignmentTx(tx: DbTx): ReviewerAssignmentProvisioningTx {
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
      const [user] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      return user ?? null;
    },

    async findAssignment(tenantId, reviewerId) {
      const [assignment] = await tx
        .select({
          status: schema.onboardingReviewerAssignments.status,
          grantedBy: schema.onboardingReviewerAssignments.grantedBy,
          createdAt: schema.onboardingReviewerAssignments.createdAt,
          revokedAt: schema.onboardingReviewerAssignments.revokedAt,
        })
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

    async createAssignment({ tenantId, reviewerId, grantedBy }) {
      const inserted = await tx
        .insert(schema.onboardingReviewerAssignments)
        .values({ tenantId, userId: reviewerId, grantedBy, status: "active" })
        .onConflictDoNothing({
          target: [schema.onboardingReviewerAssignments.tenantId, schema.onboardingReviewerAssignments.userId],
        })
        .returning({ tenantId: schema.onboardingReviewerAssignments.tenantId });
      return inserted.length === 1;
    },

    async reactivateAssignment({ tenantId, reviewerId, grantedBy }) {
      await tx
        .update(schema.onboardingReviewerAssignments)
        .set({ status: "active", grantedBy, revokedAt: null })
        .where(
          and(
            eq(schema.onboardingReviewerAssignments.tenantId, tenantId),
            eq(schema.onboardingReviewerAssignments.userId, reviewerId),
            eq(schema.onboardingReviewerAssignments.status, "revoked"),
          ),
        );
    },
  };
}
