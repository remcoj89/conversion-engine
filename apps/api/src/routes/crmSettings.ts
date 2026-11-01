import type { FastifyInstance } from "fastify";
import { getAuthContext } from "../auth/authHook.js";
import { authorizeForUser } from "../auth/authorization.js";
import {
  CrmSettingsValidationError,
  parseCrmSettings,
} from "../crm/settings.js";
import type { CrmSettingsRepository } from "../crm/settingsRepository.js";

const BODY_LIMIT_BYTES = 32 * 1024;
const NO_STORE_HEADER = { "cache-control": "no-store" };
const CRM_SETTINGS_KEYS = [
  "timezone",
  "workingDays",
  "workingHours",
  "leadFollowUp",
  "leadSources",
] as const;

export type CrmSettingsRouteDependencies = Readonly<{
  crmSettingsRepository: CrmSettingsRepository;
}>;

export function registerCrmSettingsRoutes(
  app: FastifyInstance,
  { crmSettingsRepository }: CrmSettingsRouteDependencies,
) {
  app.get("/v1/crm/settings", async (request, reply) => {
    reply.headers(NO_STORE_HEADER);
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:read", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const persisted = await crmSettingsRepository.get(context.tenantId);
    return reply.send(persisted.settings);
  });

  app.patch("/v1/crm/settings", { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    reply.headers(NO_STORE_HEADER);
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:update", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const settings = parsePatchBody(request.body);
    if (!settings) return reply.code(400).send({ error: "invalid_body" });

    const persisted = await crmSettingsRepository.update({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      settings,
    });
    return reply.send(persisted.settings);
  });
}

function parsePatchBody(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, CRM_SETTINGS_KEYS)) return null;

  try {
    return parseCrmSettings(value);
  } catch (error) {
    if (error instanceof CrmSettingsValidationError) return null;
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}
