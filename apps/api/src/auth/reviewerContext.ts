import { UUID_PATTERN } from "./requestContext.js";
import type { Membership, ReviewerAssignment } from "./types.js";

// Context of a review route. Intentionally a different type than RequestContext: it has no tenant
// role, so a reviewer context can never pass a client permission check, and vice versa.
export type ReviewerContext = Readonly<{
  userId: string;
  tenantId: string;
}>;

export type ReviewerContextResult =
  | { status: "success"; context: ReviewerContext }
  | { status: "tenant_required" }
  | { status: "invalid_tenant" }
  | { status: "assignment_forbidden" }
  | { status: "self_review_forbidden" };

// Selects the reviewed tenant for this request. Unlike client routes the tenant is never inferred:
// the reviewer must name it explicitly, and it must match an active reviewer assignment.
export function resolveReviewerContext(
  assignments: readonly ReviewerAssignment[],
  memberships: readonly Membership[],
  requestedTenantId: string | undefined,
): ReviewerContextResult {
  if (requestedTenantId === undefined) return { status: "tenant_required" };
  if (!UUID_PATTERN.test(requestedTenantId)) return { status: "invalid_tenant" };

  // PostgreSQL returns lowercase UUIDs; compare case-insensitively.
  const requested = requestedTenantId.toLowerCase();
  const assignment = assignments.find((candidate) => candidate.tenantId.toLowerCase() === requested);
  if (!assignment) return { status: "assignment_forbidden" };

  // Separation of duties: nobody reviews a tenant they are an active member of.
  const isMember = memberships.some(
    (membership) => membership.status === "active" && membership.tenantId.toLowerCase() === requested,
  );
  if (isMember) return { status: "self_review_forbidden" };

  return {
    status: "success",
    context: Object.freeze({ userId: assignment.userId, tenantId: assignment.tenantId }),
  };
}
