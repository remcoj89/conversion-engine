import type { FastifyInstance, FastifyReply } from "fastify";
import { getExternalIdentity } from "../auth/identityOnlyAuthHook.js";
import { getPlatformAdminContext } from "../auth/platformAdminAuthHook.js";
import {
  TenantOwnerInvitationError,
  isInvitationToken,
  normalizeInvitationEmail,
  type TenantOwnerInvitationRepository,
} from "../platform/tenantOwnerInvitationRepository.js";
import { hashInvitationToken } from "../platform/tenantOwnerInvitationRepository.js";
import { ensureDatabaseRequestContext, setDatabaseInvitationTokenHash } from "../db/requestContext.js";

const NO_STORE_HEADER = { "cache-control": "no-store" };
const TENANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TenantOwnerInvitationRouteDependencies = Readonly<{
  tenantOwnerInvitationRepository: TenantOwnerInvitationRepository;
}>;

// Platform Admin endpoint. The generated link uses a URL fragment so the bearer token is not
// sent to the API or included in browser/server request logs. The dashboard must copy it exactly.
export function registerPlatformTenantOwnerInvitationRoutes(
  app: FastifyInstance,
  { tenantOwnerInvitationRepository }: TenantOwnerInvitationRouteDependencies,
) {
  app.post("/v1/platform/tenants/:tenantId/invitations", async (request, reply) => {
    getPlatformAdminContext(request);

    const tenantId = parseTenantId((request.params as Record<string, unknown>).tenantId);
    if (!tenantId) return reply.code(400).send({ error: "invalid_tenant_id" });

    const email = parseInvitationEmail(request.body);
    if (!email) return reply.code(400).send({ error: "invalid_body" });

    const context = getPlatformAdminContext(request);
    try {
      const invitation = await tenantOwnerInvitationRepository.create({
        tenantId,
        email,
        createdBy: context.userId,
      });

      reply.code(201).headers(NO_STORE_HEADER);
      return {
        id: invitation.id,
        tenant_id: invitation.tenantId,
        tenant_name: invitation.tenantName,
        email: invitation.email,
        status: "pending",
        expires_at: invitation.expiresAt.toISOString(),
        invite_url: `/invite#${invitation.token}`,
      };
    } catch (error) {
      return sendInvitationError(reply, error);
    }
  });
}

// Identity-only endpoint. It deliberately does not use session-context or tenant membership
// resolution because the invitation acceptance creates the first local identity link.
export function registerTenantOwnerInvitationAcceptanceRoutes(
  app: FastifyInstance,
  { tenantOwnerInvitationRepository }: TenantOwnerInvitationRouteDependencies,
) {
  app.post("/v1/invitations/accept", async (request, reply) => {
    const token = parseInvitationToken(request.body);
    if (!token) return reply.code(400).send({ error: "invalid_body" });

    const identity = getExternalIdentity(request);
    const databaseContext = ensureDatabaseRequestContext(request);
    setDatabaseInvitationTokenHash(databaseContext, hashInvitationToken(token));
    try {
      const result = await tenantOwnerInvitationRepository.accept({ token, identity });
      reply.headers(NO_STORE_HEADER);
      return {
        status: "accepted",
        tenant_id: result.tenantId,
        tenant_name: result.tenantName,
      };
    } catch (error) {
      return sendInvitationError(reply, error);
    }
  });
}

function parseTenantId(value: unknown): string | null {
  return typeof value === "string" && TENANT_ID_PATTERN.test(value) ? value : null;
}

function parseInvitationEmail(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || !Object.hasOwn(body, "email")) return null;
  return normalizeInvitationEmail(body.email);
}

function parseInvitationToken(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || !Object.hasOwn(body, "token")) return null;
  return isInvitationToken(body.token) ? body.token : null;
}

function sendInvitationError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof TenantOwnerInvitationError)) throw error;

  switch (error.code) {
    case "tenant_not_found":
      return reply.code(404).headers(NO_STORE_HEADER).send({ error: "not_found" });
    case "tenant_disabled":
      return reply.code(403).headers(NO_STORE_HEADER).send({ error: "forbidden" });
    case "tenant_unavailable":
      return reply.code(409).headers(NO_STORE_HEADER).send({ error: "tenant_unavailable" });
    case "membership_conflict":
      return reply.code(409).headers(NO_STORE_HEADER).send({ error: "membership_conflict" });
    case "user_disabled":
      return reply.code(403).headers(NO_STORE_HEADER).send({ error: "forbidden" });
    case "invitation_not_found":
    case "invitation_accepted":
    case "invitation_revoked":
    case "invitation_expired":
      // Do not distinguish token states to a bearer-token caller. This also avoids turning the
      // endpoint into a token-status oracle.
      return reply.code(410).headers(NO_STORE_HEADER).send({ error: "invitation_unavailable" });
    default:
      return reply.code(500).send({ error: "internal_error" });
  }
}
