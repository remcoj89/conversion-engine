import type { FastifyRequest } from "fastify";

// Roles within a tenant. Platform Admin is deliberately not a tenant role.
export type TenantRole = "owner" | "team_member";

export type MembershipStatus = "active" | "invited" | "disabled";

// What the identity provider tells us about the caller, nothing more.
export type ExternalIdentity = {
  issuer: string; // OIDC "iss"; not stored yet (single-issuer assumption)
  subject: string; // OIDC "sub"; only unique within its issuer
};

export type Membership = {
  tenantId: string;
  userId: string;
  role: TenantRole;
  status: MembershipStatus;
};

export type AuthResult =
  | { status: "authenticated"; identity: ExternalIdentity }
  | { status: "anonymous" }
  | { status: "invalid"; reason: string }; // reason is for logs only

export interface AuthAdapter {
  authenticate(request: FastifyRequest): Promise<AuthResult>;
}

// Keeps the HTTP layer independent of Drizzle/PostgreSQL.
export type MembershipResolver = (identity: ExternalIdentity) => Promise<readonly Membership[]>;

// An active Westend reviewer assignment for one tenant. Not a membership and not a tenant role.
export type ReviewerAssignment = {
  tenantId: string;
  userId: string;
};

// Returns only active assignments in active tenants; an unknown user yields an empty list.
export type ReviewerAssignmentResolver = (identity: ExternalIdentity) => Promise<readonly ReviewerAssignment[]>;

// Platform rights are deliberately separate from tenant memberships and reviewer assignments.
// The resolver returns active rights only; revoked rows never enter the auth boundary.
export type PlatformAdminAssignment = Readonly<{
  userId: string;
  permission: "platform_admin";
}>;

// The resolver owns the identity-to-user lookup and returns only persisted platform rights.
// Keeping it behind an interface makes the HTTP auth layer independent of Drizzle/PostgreSQL.
export interface PlatformAdminAssignmentResolver {
  resolve(identity: ExternalIdentity): Promise<readonly PlatformAdminAssignment[]>;
}
