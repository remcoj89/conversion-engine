import type { FastifyInstance } from "fastify";
import { getAuthContext } from "../auth/authHook.js";
import { authorize } from "../auth/authorization.js";
import { parseLeadInput } from "../leads/leadInput.js";
import {
  decodeLeadCursor,
  encodeLeadCursor,
  type Lead,
  type LeadListQuery,
  type LeadReader,
  type NewLead,
} from "../leads/leadRepository.js";

// Keeps the HTTP layer independent of Drizzle/PostgreSQL. Always called with context.tenantId.
export type LeadCreator = (tenantId: string, lead: NewLead, actorUserId?: string) => Promise<Lead>;

export type LeadRouteDependencies = Readonly<{
  leadCreator: LeadCreator;
  // Existing non-CRM test fixtures may omit reads; production wiring always supplies it.
  leadReader?: LeadReader;
}>;

// Well above the field limits in leadInput.ts, far below Fastify's 1 MiB default.
const BODY_LIMIT_BYTES = 16 * 1024;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const MAX_QUERY_LENGTH = 120;
const ALLOWED_QUERY_KEYS = new Set(["q", "status", "limit", "cursor"]);

// Must be registered behind the auth hook; without it getAuthContext fails closed.
// Not a public form endpoint: there is no trusted site-to-tenant resolver yet.
export function registerLeadRoutes(app: FastifyInstance, { leadCreator }: LeadRouteDependencies) {
  app.post("/v1/leads", { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorize(context.role, "leads:create")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const input = parseLeadInput(request.body);
    if (!input.ok) {
      return reply.code(400).send({ error: "invalid_body" });
    }

    // The tenant only ever comes from the auth context, never from the body.
    const lead = await leadCreator(context.tenantId, input.lead, context.userId);
    return reply.code(201).send({ id: lead.id, status: lead.status, createdAt: lead.createdAt.toISOString() });
  });
}

export function registerLeadReadRoutes(app: FastifyInstance, leadReader: LeadReader) {
  app.get("/v1/leads", async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorize(context.role, "leads:read")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const query = parseLeadListQuery(request.query);
    if (!query) return reply.code(400).send({ error: "invalid_query" });

    const result = await leadReader.list({
      ...query,
      tenantId: context.tenantId,
      role: context.role,
      userId: context.userId,
    });
    return {
      items: result.items.map(toLeadResponse),
      next_cursor: result.nextCursor ? encodeLeadCursor(result.nextCursor) : null,
    };
  });

  app.get("/v1/leads/:leadId", async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorize(context.role, "leads:read")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const leadId = parseLeadId((request.params as Record<string, unknown>).leadId);
    if (!leadId) return reply.code(400).send({ error: "invalid_lead_id" });

    const lead = await leadReader.findDetail(context.tenantId, leadId, context.role, context.userId);
    if (!lead) return reply.code(404).send({ error: "not_found" });
    return toLeadResponse(lead);
  });
}

type RawQuery = Record<string, unknown>;

export function parseLeadListQuery(value: unknown): Omit<LeadListQuery, "tenantId"> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const query = value as RawQuery;
  if (Object.keys(query).some((key) => !ALLOWED_QUERY_KEYS.has(key))) return null;

  const q = parseSearch(query.q);
  if (q === null) return null;

  const status = parseStatus(query.status);
  if (status === null) return null;

  const limit = parseLimit(query.limit);
  if (limit === null) return null;

  let cursor;
  if (query.cursor !== undefined) {
    cursor = decodeLeadCursor(query.cursor);
    if (cursor === null) return null;
  }

  return {
    ...(q === undefined ? {} : { q }),
    ...(status === undefined ? {} : { status }),
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

function parseStatus(value: unknown): "new" | undefined | null {
  if (value === undefined) return undefined;
  return value === "new" ? "new" : null;
}

function parseLimit(value: unknown): number | null {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;

  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_LIMIT ? limit : null;
}

function parseLeadId(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });
}

function toLeadResponse(lead: Awaited<ReturnType<LeadReader["findDetail"]>> extends infer T ? Exclude<T, null> : never) {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    source: lead.source,
    status: lead.status,
    created_at: lead.createdAt.toISOString(),
    updated_at: lead.updatedAt.toISOString(),
  };
}
