import type { Membership, TenantRole } from "./types.js";

export type RequestContext = Readonly<{
  userId: string;
  tenantId: string;
  role: TenantRole;
}>;

export type RequestContextResult =
  | { status: "success"; context: RequestContext }
  | { status: "tenant_required" }
  | { status: "invalid_tenant" }
  | { status: "membership_forbidden" };

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Selects the tenant for this request. The tenant always comes from a membership, never from the request.
export function resolveRequestContext(
  memberships: readonly Membership[],
  requestedTenantId?: string,
): RequestContextResult {
  // Defense in depth: callers should pass active memberships only.
  const active = memberships.filter((membership) => membership.status === "active");

  if (requestedTenantId === undefined) {
    if (active.length === 0) return { status: "membership_forbidden" };
    if (active.length > 1) return { status: "tenant_required" };
    return success(active[0]!);
  }

  if (!UUID_PATTERN.test(requestedTenantId)) {
    return { status: "invalid_tenant" };
  }

  // PostgreSQL returns lowercase UUIDs; compare case-insensitively.
  const requested = requestedTenantId.toLowerCase();
  const membership = active.find((candidate) => candidate.tenantId.toLowerCase() === requested);
  return membership ? success(membership) : { status: "membership_forbidden" };
}

function success(membership: Membership): RequestContextResult {
  return {
    status: "success",
    context: Object.freeze({
      userId: membership.userId,
      tenantId: membership.tenantId,
      role: membership.role,
    }),
  };
}
