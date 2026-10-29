import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import type { ExternalIdentity } from "../auth/types.js";

type Db = NodePgDatabase<typeof schema>;
type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const TENANT_OWNER_INVITATION_TTL_DAYS = 7;
export const TENANT_OWNER_INVITATION_TOKEN_BYTES = 32;
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 320;

export type TenantOwnerInvitationErrorCode =
  | "tenant_not_found"
  | "tenant_disabled"
  | "tenant_unavailable"
  | "invitation_not_found"
  | "invitation_accepted"
  | "invitation_revoked"
  | "invitation_expired"
  | "user_disabled"
  | "membership_conflict";

export class TenantOwnerInvitationError extends Error {
  constructor(readonly code: TenantOwnerInvitationErrorCode) {
    super(code);
    this.name = "TenantOwnerInvitationError";
  }
}

export type CreatedTenantOwnerInvitation = Readonly<{
  id: string;
  tenantId: string;
  tenantName: string;
  email: string;
  expiresAt: Date;
  token: string;
}>;

export type AcceptedTenantOwnerInvitation = Readonly<{
  tenantId: string;
  tenantName: string;
  userId: string;
}>;

export type TenantOwnerInvitationRepository = Readonly<{
  create: (input: Readonly<{ tenantId: string; email: string; createdBy: string }>) => Promise<CreatedTenantOwnerInvitation>;
  accept: (input: Readonly<{ token: string; identity: ExternalIdentity }>) => Promise<AcceptedTenantOwnerInvitation>;
}>;

export type TenantOwnerInvitationRepositoryOptions = Readonly<{
  now?: () => Date;
  createToken?: () => string;
}>;

export function createTenantOwnerInvitationRepository(
  db: Db,
  options: TenantOwnerInvitationRepositoryOptions = {},
): TenantOwnerInvitationRepository {
  const now = options.now ?? (() => new Date());
  const createToken = options.createToken ?? generateInvitationToken;

  return {
    create: (input) => db.transaction((tx) => createInvitation(tx, input, now(), createToken)),
    accept: async ({ token, identity }) => {
      const result = await db.transaction((tx) => acceptInvitation(tx, token, identity, now()));
      if (result.status === "success") return result.invitation;
      throw new TenantOwnerInvitationError(result.code);
    },
  };
}

export function generateInvitationToken(): string {
  return randomBytes(TENANT_OWNER_INVITATION_TOKEN_BYTES).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isInvitationToken(value: unknown): value is string {
  return typeof value === "string" && INVITATION_TOKEN_PATTERN.test(value);
}

export function isInvitationExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function normalizeInvitationEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) return null;
  if ([...email].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  return email;
}

async function createInvitation(
  tx: DbTx,
  input: Readonly<{ tenantId: string; email: string; createdBy: string }>,
  now: Date,
  createToken: () => string,
): Promise<CreatedTenantOwnerInvitation> {
  const tenant = await lockTenant(tx, input.tenantId);
  if (!tenant) throw new TenantOwnerInvitationError("tenant_not_found");
  if (tenant.status === "disabled") throw new TenantOwnerInvitationError("tenant_disabled");
  if (tenant.status !== "pending" && tenant.status !== "active") {
    throw new TenantOwnerInvitationError("tenant_unavailable");
  }

  await tx
    .update(schema.tenantOwnerInvitations)
    .set({ status: "revoked", revokedAt: now })
    .where(
      and(
        eq(schema.tenantOwnerInvitations.tenantId, input.tenantId),
        eq(schema.tenantOwnerInvitations.status, "pending"),
      ),
    );

  const token = createToken();
  if (!isInvitationToken(token)) throw new Error("Generated invitation token has an invalid shape");
  const expiresAt = new Date(now.getTime() + TENANT_OWNER_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const [invitation] = await tx
    .insert(schema.tenantOwnerInvitations)
    .values({
      tenantId: input.tenantId,
      email: input.email,
      tokenHash: hashInvitationToken(token),
      status: "pending",
      expiresAt,
      createdBy: input.createdBy,
    })
    .returning({
      id: schema.tenantOwnerInvitations.id,
      tenantId: schema.tenantOwnerInvitations.tenantId,
      email: schema.tenantOwnerInvitations.email,
      expiresAt: schema.tenantOwnerInvitations.expiresAt,
    });

  if (!invitation) throw new Error("Invitation insert returned no row");
  return {
    ...invitation,
    tenantName: tenant.name,
    token,
  };
}

type AcceptResult =
  | Readonly<{ status: "success"; invitation: AcceptedTenantOwnerInvitation }>
  | Readonly<{ status: "failure"; code: Exclude<TenantOwnerInvitationErrorCode, "tenant_not_found"> }>;

async function acceptInvitation(
  tx: DbTx,
  token: string,
  identity: ExternalIdentity,
  now: Date,
): Promise<AcceptResult> {
  // Read without a lock first so both create and accept can establish the same lock order:
  // tenant first, invitation second. This avoids a tenant/invitation deadlock during a resend.
  const [candidate] = await tx
    .select({
      id: schema.tenantOwnerInvitations.id,
      tenantId: schema.tenantOwnerInvitations.tenantId,
      status: schema.tenantOwnerInvitations.status,
      expiresAt: schema.tenantOwnerInvitations.expiresAt,
    })
    .from(schema.tenantOwnerInvitations)
    .where(eq(schema.tenantOwnerInvitations.tokenHash, hashInvitationToken(token)))
    .limit(1);

  if (!candidate) return { status: "failure", code: "invitation_not_found" };
  if (candidate.status === "accepted") return { status: "failure", code: "invitation_accepted" };
  if (candidate.status === "revoked") return { status: "failure", code: "invitation_revoked" };
  if (candidate.status === "expired") return { status: "failure", code: "invitation_expired" };

  const tenant = await lockTenant(tx, candidate.tenantId);
  if (!tenant || tenant.status === "disabled") return { status: "failure", code: "tenant_disabled" };
  if (tenant.status !== "pending" && tenant.status !== "active") {
    return { status: "failure", code: "tenant_unavailable" };
  }

  const [invitation] = await tx
    .select({
      id: schema.tenantOwnerInvitations.id,
      tenantId: schema.tenantOwnerInvitations.tenantId,
      status: schema.tenantOwnerInvitations.status,
      expiresAt: schema.tenantOwnerInvitations.expiresAt,
    })
    .from(schema.tenantOwnerInvitations)
    .where(eq(schema.tenantOwnerInvitations.id, candidate.id))
    .for("update")
    .limit(1);

  if (!invitation) return { status: "failure", code: "invitation_not_found" };
  if (invitation.status === "accepted") return { status: "failure", code: "invitation_accepted" };
  if (invitation.status === "revoked") return { status: "failure", code: "invitation_revoked" };
  if (invitation.status === "expired") return { status: "failure", code: "invitation_expired" };

  if (isInvitationExpired(invitation.expiresAt, now)) {
    await tx
      .update(schema.tenantOwnerInvitations)
      .set({ status: "expired" })
      .where(eq(schema.tenantOwnerInvitations.id, invitation.id));
    return { status: "failure", code: "invitation_expired" };
  }

  const user = await ensureUser(tx, identity.subject);
  if (user.status === "disabled") return { status: "failure", code: "user_disabled" };

  const membership = await lockMembership(tx, invitation.tenantId, user.id);
  if (membership && !(membership.role === "owner" && membership.status === "active")) {
    if (membership.role === "owner" && membership.status === "invited") {
      await tx
        .update(schema.memberships)
        .set({ status: "active" })
        .where(
          and(
            eq(schema.memberships.tenantId, invitation.tenantId),
            eq(schema.memberships.userId, user.id),
          ),
        );
    } else {
      return { status: "failure", code: "membership_conflict" };
    }
  } else if (!membership) {
    await tx.insert(schema.memberships).values({
      tenantId: invitation.tenantId,
      userId: user.id,
      role: "owner",
      status: "active",
    });
  }

  if (tenant.status === "pending") {
    await tx
      .update(schema.tenants)
      .set({ status: "active", updatedAt: sql`now()` })
      .where(eq(schema.tenants.id, tenant.id));
  }

  const [accepted] = await tx
    .update(schema.tenantOwnerInvitations)
    .set({ status: "accepted", acceptedAt: now, acceptedBy: user.id })
    .where(
      and(
        eq(schema.tenantOwnerInvitations.id, invitation.id),
        eq(schema.tenantOwnerInvitations.status, "pending"),
      ),
    )
    .returning({ id: schema.tenantOwnerInvitations.id });

  if (!accepted) return { status: "failure", code: "invitation_accepted" };
  return {
    status: "success",
    invitation: { tenantId: tenant.id, tenantName: tenant.name, userId: user.id },
  };
}

async function lockTenant(tx: DbTx, tenantId: string) {
  const [tenant] = await tx
    .select({ id: schema.tenants.id, name: schema.tenants.name, status: schema.tenants.status })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .for("update")
    .limit(1);
  return tenant ?? null;
}

async function ensureUser(tx: DbTx, subject: string) {
  await tx
    .insert(schema.users)
    .values({ authProviderUserId: subject })
    .onConflictDoNothing({ target: schema.users.authProviderUserId });

  const [user] = await tx
    .select({ id: schema.users.id, status: schema.users.status })
    .from(schema.users)
    .where(eq(schema.users.authProviderUserId, subject))
    .for("update")
    .limit(1);
  if (!user) throw new Error("User row missing after insert");
  return user;
}

async function lockMembership(tx: DbTx, tenantId: string, userId: string) {
  const [membership] = await tx
    .select({ role: schema.memberships.role, status: schema.memberships.status })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.tenantId, tenantId),
        eq(schema.memberships.userId, userId),
      ),
    )
    .for("update")
    .limit(1);
  return membership ?? null;
}
