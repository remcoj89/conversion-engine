import type { FastifyInstance, FastifyReply } from "fastify";
import { getPlatformAdminContext } from "../auth/platformAdminAuthHook.js";
import { onboardingProjectStatuses } from "../db/schema.js";
import {
  decodePlatformTenantCursor,
  encodePlatformTenantCursor,
  type PlatformTenantListQuery,
  type PlatformTenantRepository,
} from "../platform/platformTenantRepository.js";
import {
  buildPlatformTenantMutationResponse,
  PlatformTenantMutationError,
  type PlatformTenantMutationRepository,
} from "../platform/platformTenantMutationRepository.js";

export type PlatformTenantRouteDependencies = Readonly<{
  platformTenantRepository: PlatformTenantRepository;
  platformTenantMutationRepository?: PlatformTenantMutationRepository;
}>;

const NO_STORE_HEADER = { "cache-control": "no-store" };
const ALLOWED_QUERY_KEYS = new Set(["q", "status", "onboarding_status", "limit", "cursor"]);
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const MAX_QUERY_LENGTH = 120;
const STATUS_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const TENANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 200;

// Must be registered behind the Platform Admin sibling scope. Platform routes never accept
// tenant context from the request: the path and the authenticated Platform Admin context are
// the only sources of authority.
export function registerPlatformTenantRoutes(
  app: FastifyInstance,
  { platformTenantRepository, platformTenantMutationRepository }: PlatformTenantRouteDependencies,
) {
  app.get("/v1/platform/tenants", async (request, reply) => {
    getPlatformAdminContext(request);
    reply.headers(NO_STORE_HEADER);

    const query = parsePlatformTenantListQuery(request.query);
    if (!query) return reply.code(400).send({ error: "invalid_query" });

    const result = await platformTenantRepository.list(query);
    return {
      items: result.items.map(toResponseItem),
      next_cursor: result.nextCursor ? encodePlatformTenantCursor(result.nextCursor) : null,
    };
  });

  if (!platformTenantMutationRepository) return;

  app.post("/v1/platform/tenants", async (request, reply) => {
    getPlatformAdminContext(request);
    const name = parseTenantName(request.body);
    if (name === null) return reply.code(400).send({ error: "invalid_body" });

    const tenant = await platformTenantMutationRepository.create({ name });
    reply.code(201).headers(NO_STORE_HEADER);
    return buildPlatformTenantMutationResponse(tenant);
  });

  app.patch("/v1/platform/tenants/:tenantId", async (request, reply) => {
    getPlatformAdminContext(request);
    const tenantId = parseTenantId((request.params as Record<string, unknown>).tenantId);
    if (!tenantId) return reply.code(400).send({ error: "invalid_tenant_id" });

    const name = parseTenantName(request.body);
    if (name === null) return reply.code(400).send({ error: "invalid_body" });

    try {
      const tenant = await platformTenantMutationRepository.rename({ tenantId, name });
      reply.headers(NO_STORE_HEADER);
      return buildPlatformTenantMutationResponse(tenant);
    } catch (error) {
      return sendMutationError(reply, error);
    }
  });

  app.post("/v1/platform/tenants/:tenantId/disable", async (request, reply) => {
    const context = getPlatformAdminContext(request);
    const tenantId = parseTenantId((request.params as Record<string, unknown>).tenantId);
    if (!tenantId) return reply.code(400).send({ error: "invalid_tenant_id" });

    try {
      const tenant = await platformTenantMutationRepository.disable({
        tenantId,
        actorUserId: context.userId,
      });
      reply.headers(NO_STORE_HEADER);
      return buildPlatformTenantMutationResponse(tenant);
    } catch (error) {
      return sendMutationError(reply, error);
    }
  });

  app.post("/v1/platform/tenants/:tenantId/reactivate", async (request, reply) => {
    getPlatformAdminContext(request);
    const tenantId = parseTenantId((request.params as Record<string, unknown>).tenantId);
    if (!tenantId) return reply.code(400).send({ error: "invalid_tenant_id" });

    try {
      const tenant = await platformTenantMutationRepository.reactivate({ tenantId });
      reply.headers(NO_STORE_HEADER);
      return buildPlatformTenantMutationResponse(tenant);
    } catch (error) {
      return sendMutationError(reply, error);
    }
  });
}

function parseTenantId(value: unknown): string | null {
  return typeof value === "string" && TENANT_ID_PATTERN.test(value) ? value : null;
}

function parseTenantName(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || !Object.hasOwn(body, "name") || typeof body.name !== "string") return null;

  const name = body.name.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH || containsControlCharacter(name)) return null;
  return name;
}

function sendMutationError(reply: FastifyReply, error: unknown) {
  if (error instanceof PlatformTenantMutationError && error.code === "tenant_not_found") {
    return reply.code(404).send({ error: "not_found" });
  }
  throw error;
}

type RawQuery = Record<string, unknown>;

export function parsePlatformTenantListQuery(value: unknown): PlatformTenantListQuery | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const query = value as RawQuery;

  if (Object.keys(query).some((key) => !ALLOWED_QUERY_KEYS.has(key))) return null;

  const q = parseSearch(query.q);
  if (q === null) return null;

  const status = parseStatus(query.status);
  if (status === null) return null;

  const onboardingStatus = parseOnboardingStatus(query.onboarding_status);
  if (onboardingStatus === null) return null;

  const limit = parseLimit(query.limit);
  if (limit === null) return null;

  let cursor;
  if (query.cursor !== undefined) {
    const decodedCursor = decodePlatformTenantCursor(query.cursor);
    if (decodedCursor === null) return null;
    cursor = decodedCursor;
  }

  return {
    ...(q === undefined ? {} : { q }),
    ...(status === undefined ? {} : { status }),
    ...(onboardingStatus === undefined ? {} : { onboardingStatus }),
    limit,
    ...(cursor === undefined ? {} : { cursor }),
  };
}

function parseSearch(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  if (normalized.length > MAX_QUERY_LENGTH || containsControlCharacter(normalized)) return null;
  return normalized;
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });
}

function parseStatus(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" && STATUS_PATTERN.test(value) ? value : null;
}

function parseOnboardingStatus(value: unknown): PlatformTenantListQuery["onboardingStatus"] | null {
  if (value === undefined) return undefined;
  return typeof value === "string" && (value === "not_started" || (onboardingProjectStatuses as readonly string[]).includes(value))
    ? value as PlatformTenantListQuery["onboardingStatus"]
    : null;
}

function parseLimit(value: unknown): number | null {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;

  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_LIMIT ? limit : null;
}

function toResponseItem(item: PlatformTenantListQueryItem) {
  return {
    id: item.id,
    name: item.name,
    status: item.status,
    created_at: item.createdAt.toISOString(),
    onboarding: item.onboarding
      ? {
        status: item.onboarding.status,
        version: item.onboarding.version,
        updated_at: item.onboarding.updatedAt.toISOString(),
      }
      : null,
    website_summary: {
      total: item.websiteSummary.total,
      active: item.websiteSummary.active,
    },
  };
}

type PlatformTenantListQueryItem = Awaited<ReturnType<PlatformTenantRepository["list"]>>["items"][number];
