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
