import type { FastifyInstance } from "fastify";
import { getPlatformAdminContext } from "../auth/platformAdminAuthHook.js";
import {
  decodePlatformAuditEventCursor,
  encodePlatformAuditEventCursor,
  platformAuditEventTypes,
  type PlatformAuditEventListQuery,
  type PlatformAuditEventRepository,
} from "../platform/platformAuditEventRepository.js";
import { UUID_PATTERN } from "../auth/requestContext.js";

export type PlatformAuditEventRouteDependencies = Readonly<{
  platformAuditEventRepository: PlatformAuditEventRepository;
}>;

const NO_STORE_HEADER = { "cache-control": "no-store" };
const ALLOWED_QUERY_KEYS = new Set(["tenant_id", "event_type", "from", "to", "limit", "cursor"]);
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const MAX_TIMESTAMP_LENGTH = 64;
const EVENT_TYPES = new Set<string>(platformAuditEventTypes);

// Must be registered behind the Platform Admin sibling scope. It exposes only immutable,
// content-free audit metadata and never accepts tenant context from a request header.
export function registerPlatformAuditEventRoutes(
  app: FastifyInstance,
  { platformAuditEventRepository }: PlatformAuditEventRouteDependencies,
) {
  app.get("/v1/platform/audit-events", async (request, reply) => {
    getPlatformAdminContext(request);
    reply.headers(NO_STORE_HEADER);

    const query = parsePlatformAuditEventListQuery(request.query);
    if (!query) return reply.code(400).send({ error: "invalid_query" });

    const result = await platformAuditEventRepository.list(query);
    return {
      items: result.items.map(toResponseItem),
      next_cursor: result.nextCursor ? encodePlatformAuditEventCursor(result.nextCursor) : null,
    };
  });
}

type RawQuery = Record<string, unknown>;

export function parsePlatformAuditEventListQuery(value: unknown): PlatformAuditEventListQuery | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const query = value as RawQuery;
  if (Object.keys(query).some((key) => !ALLOWED_QUERY_KEYS.has(key))) return null;

  const tenantId = parseTenantId(query.tenant_id);
  if (tenantId === null) return null;

  const eventType = parseEventType(query.event_type);
  if (eventType === null) return null;

  const from = parseTimestamp(query.from);
  if (from === null) return null;

  const to = parseTimestamp(query.to);
  if (to === null) return null;

  if (from && to && from > to) return null;

  const limit = parseLimit(query.limit);
  if (limit === null) return null;

  let cursor;
  if (query.cursor !== undefined) {
    const decodedCursor = decodePlatformAuditEventCursor(query.cursor);
    if (decodedCursor === null) return null;
    cursor = decodedCursor;
  }

  return {
    ...(tenantId === undefined ? {} : { tenantId }),
    ...(eventType === undefined ? {} : { eventType }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    limit,
    ...(cursor === undefined ? {} : { cursor }),
  };
}

function parseTenantId(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

function parseEventType(value: unknown): PlatformAuditEventListQuery["eventType"] | null {
  if (value === undefined) return undefined;
  return typeof value === "string" && EVENT_TYPES.has(value)
    ? value as PlatformAuditEventListQuery["eventType"]
    : null;
}

function parseTimestamp(value: unknown): Date | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TIMESTAMP_LENGTH) return null;
  if ([...value].some((character) => (character.codePointAt(0) ?? 0) <= 0x1f)) return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseLimit(value: unknown): number | null {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;

  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_LIMIT ? limit : null;
}

function toResponseItem(item: Awaited<ReturnType<PlatformAuditEventRepository["list"]>>["items"][number]) {
  return {
    id: item.id,
    tenant_id: item.tenantId,
    project_id: item.projectId,
    event_type: item.eventType,
    from_status: item.fromStatus,
    to_status: item.toStatus,
    version: item.version,
    actor_type: item.actorType,
    actor_id: item.actorId,
    created_at: item.createdAt.toISOString(),
    request_or_correlation_id: item.requestOrCorrelationId,
  };
}
