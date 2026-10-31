import type { FastifyInstance, FastifyReply } from "fastify";
import { getAuthContext } from "../auth/authHook.js";
import { authorizeForUser } from "../auth/authorization.js";
import { UUID_PATTERN } from "../auth/requestContext.js";
import {
  TEAM_MEMBER_CRM_PERMISSION_KEYS,
  type TeamMemberCrmPermission,
  type TeamMemberMutationResult,
  type TeamMemberRepository,
} from "../team/teamMemberRepository.js";

const BODY_LIMIT_BYTES = 4 * 1024;
const NO_STORE_HEADER = { "cache-control": "no-store" };

export type TeamMemberRouteDependencies = Readonly<{
  teamMemberRepository: TeamMemberRepository;
}>;

export function registerTeamMemberRoutes(
  app: FastifyInstance,
  { teamMemberRepository }: TeamMemberRouteDependencies,
) {
  app.get("/v1/team/members", async (request, reply) => {
    reply.headers(NO_STORE_HEADER);
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "team:manage", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const members = await teamMemberRepository.list(context.tenantId);
    return { items: members };
  });

  app.patch("/v1/team/members/:memberId/permissions", { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    reply.headers(NO_STORE_HEADER);
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "team:manage", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const memberId = readMemberId(request.params);
    const body = parsePermissionBody(request.body);
    if (!memberId || !body) return reply.code(400).send({ error: "invalid_body" });

    const result = await teamMemberRepository.updatePermission({
      tenantId: context.tenantId,
      memberId,
      ...body,
    });
    return sendMutationResult(reply, result);
  });

  app.patch("/v1/team/members/:memberId/role", { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    reply.headers(NO_STORE_HEADER);
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "team:manage", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const memberId = readMemberId(request.params);
    const body = parseRoleBody(request.body);
    if (!memberId || !body) return reply.code(400).send({ error: "invalid_body" });

    const result = await teamMemberRepository.updateRole({
      tenantId: context.tenantId,
      memberId,
      ...body,
    });
    return sendMutationResult(reply, result);
  });
}

function sendMutationResult(reply: FastifyReply, result: TeamMemberMutationResult) {
  if (result.status === "updated") return reply.send(result.member);
  if (result.status === "not_found") return reply.code(404).send({ error: "not_found" });
  // The detailed repository reason is intentionally not exposed to callers.
  return reply.code(409).send({ error: "conflict" });
}

function readMemberId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const memberId = (value as Record<string, unknown>).memberId;
  return typeof memberId === "string" && UUID_PATTERN.test(memberId) ? memberId : null;
}

function parsePermissionBody(value: unknown): Readonly<{ permission: TeamMemberCrmPermission; enabled: boolean }> | null {
  if (!isRecord(value) || !hasExactKeys(value, ["permission", "enabled"])) return null;
  if (!isTeamMemberCrmPermission(value.permission) || typeof value.enabled !== "boolean") return null;
  return { permission: value.permission, enabled: value.enabled };
}

function parseRoleBody(value: unknown): Readonly<{ role: "tenant_admin" | "team_member" }> | null {
  if (!isRecord(value) || !hasExactKeys(value, ["role"])) return null;
  return value.role === "tenant_admin" || value.role === "team_member" ? { role: value.role } : null;
}

function isTeamMemberCrmPermission(value: unknown): value is TeamMemberCrmPermission {
  return typeof value === "string" && (TEAM_MEMBER_CRM_PERMISSION_KEYS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}
