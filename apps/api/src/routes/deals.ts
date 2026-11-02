import type { FastifyInstance } from "fastify";
import { getAuthContext } from "../auth/authHook.js";
import { authorizeForUser } from "../auth/authorization.js";
import { UUID_PATTERN } from "../auth/requestContext.js";
import {
  ArchivedDealError,
  DealNotFoundError,
  InvalidDealContactError,
  InvalidDealLossReasonError,
  InvalidDealOwnerError,
  InvalidDealStageError,
  InvalidDealStageTransitionError,
  isDealStage,
  isInitialDealStage,
  type CreateDealInput,
  type DealRead,
  type DealRepository,
  type UpdateDealInput,
} from "../deals/dealRepository.js";

const BODY_LIMIT_BYTES = 32 * 1024;
const DEAL_FIELDS = [
  "contact_id",
  "title",
  "description",
  "amount_eur",
  "owner_user_id",
  "stage",
  "expected_close_date",
  "loss_reason",
] as const;
const DEAL_FIELD_SET = new Set<string>(DEAL_FIELDS);

export type DealRouteDependencies = Readonly<{ dealRepository: DealRepository }>;

export function registerDealRoutes(app: FastifyInstance, { dealRepository }: DealRouteDependencies): void {
  app.get("/v1/deals", async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:read", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const includeArchived = parseIncludeArchived(request.query);
    if (includeArchived === null) return reply.code(400).send({ error: "invalid_query" });

    const deals = await dealRepository.list(context.tenantId, { includeArchived });
    return { items: deals.map(toDealResponse) };
  });

  app.post("/v1/deals", { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:create", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const input = parseDealCreateBody(request.body);
    if (!input) return reply.code(400).send({ error: "invalid_body" });

    try {
      const deal = await dealRepository.create({
        tenantId: context.tenantId,
        actorUserId: context.userId,
        ...input,
      });
      return reply.code(201).send(toDealResponse(deal));
    } catch (error) {
      return dealInputError(reply, error);
    }
  });

  app.get("/v1/deals/:dealId", async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:read", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const dealId = readPathUuid(request.params, "dealId");
    if (!dealId) return reply.code(400).send({ error: "invalid_deal_id" });

    const deal = await dealRepository.find(context.tenantId, dealId);
    if (!deal) return reply.code(404).send({ error: "not_found" });
    return toDealResponse(deal);
  });

  app.patch("/v1/deals/:dealId", { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:update", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const dealId = readPathUuid(request.params, "dealId");
    if (!dealId) return reply.code(400).send({ error: "invalid_deal_id" });
    const input = parseDealUpdateBody(request.body);
    if (!input) return reply.code(400).send({ error: "invalid_body" });

    try {
      const deal = await dealRepository.update({
        tenantId: context.tenantId,
        dealId,
        actorUserId: context.userId,
        ...input,
      });
      if (!deal) return reply.code(404).send({ error: "not_found" });
      return toDealResponse(deal);
    } catch (error) {
      return dealInputError(reply, error);
    }
  });

  app.post("/v1/deals/:dealId/archive", async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:archive", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const dealId = readPathUuid(request.params, "dealId");
    if (!dealId) return reply.code(400).send({ error: "invalid_deal_id" });
    const deal = await dealRepository.archive(context.tenantId, dealId);
    if (!deal) return reply.code(404).send({ error: "not_found" });
    return toDealResponse(deal);
  });
}

export function toDealResponse(deal: DealRead) {
  return {
    id: deal.id,
    contact_id: deal.contactId,
    title: deal.title,
    description: deal.description,
    amount_eur: deal.amountEur,
    owner_user_id: deal.ownerUserId,
    stage: deal.stage,
    expected_close_date: deal.expectedCloseDate,
    loss_reason: deal.lossReason,
    status: deal.status,
    created_at: deal.createdAt.toISOString(),
    updated_at: deal.updatedAt.toISOString(),
    archived_at: deal.archivedAt?.toISOString() ?? null,
  };
}

type DealCreateBody = Omit<CreateDealInput, "tenantId" | "actorUserId">;
type DealUpdateBody = Omit<UpdateDealInput, "tenantId" | "dealId" | "actorUserId">;

function parseDealCreateBody(value: unknown): DealCreateBody | null {
  if (!isAllowedDealBody(value) || !Object.hasOwn(value, "contact_id") || !Object.hasOwn(value, "title")) return null;
  const body = value as Record<string, unknown>;
  const contactId = readUuid(body.contact_id);
  const title = requiredText(body.title, 200);
  if (!contactId || !title) return null;
  const fields = parseDealFields(body, false);
  return fields ? { contactId, title, ...fields } : null;
}

function parseDealUpdateBody(value: unknown): DealUpdateBody | null {
  if (!isAllowedDealBody(value) || Object.keys(value as object).length === 0) return null;
  const body = value as Record<string, unknown>;
  if (Object.hasOwn(body, "contact_id")) return null;
  const result: Record<string, unknown> = {};
  if (Object.hasOwn(body, "title")) {
    const title = requiredText(body.title, 200);
    if (!title) return null;
    result.title = title;
  }
  const fields = parseDealFields(body, true);
  if (!fields) return null;
  Object.assign(result, fields);
  return result as DealUpdateBody;
}

function parseDealFields(body: Record<string, unknown>, allowStageClosed: boolean): Record<string, unknown> | null {
  const fields: Record<string, unknown> = {};

  if (Object.hasOwn(body, "description")) {
    const description = nullableText(body.description, 10_000);
    if (description === undefined) return null;
    fields.description = description;
  }
  if (Object.hasOwn(body, "amount_eur")) {
    const amount = nullableAmount(body.amount_eur);
    if (amount === undefined) return null;
    fields.amountEur = amount;
  }
  if (Object.hasOwn(body, "owner_user_id")) {
    const owner = body.owner_user_id === null ? null : readUuid(body.owner_user_id);
    if (owner === undefined) return null;
    fields.ownerUserId = owner;
  }
  if (Object.hasOwn(body, "stage")) {
    if (!isDealStage(body.stage) || (!allowStageClosed && !isInitialDealStage(body.stage))) return null;
    fields.stage = body.stage;
  }
  if (Object.hasOwn(body, "expected_close_date")) {
    const expectedCloseDate = nullableDate(body.expected_close_date);
    if (expectedCloseDate === undefined) return null;
    fields.expectedCloseDate = expectedCloseDate;
  }
  if (Object.hasOwn(body, "loss_reason")) {
    const lossReason = nullableText(body.loss_reason, 2_000);
    if (lossReason === undefined) return null;
    fields.lossReason = lossReason;
  }
  return fields;
}

function dealInputError(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }, error: unknown) {
  if (error instanceof InvalidDealContactError) return reply.code(400).send({ error: "invalid_contact" });
  if (error instanceof InvalidDealOwnerError) return reply.code(400).send({ error: "invalid_owner" });
  if (error instanceof InvalidDealStageError) return reply.code(400).send({ error: "invalid_stage" });
  if (error instanceof InvalidDealStageTransitionError) return reply.code(409).send({ error: "invalid_stage_transition" });
  if (error instanceof ArchivedDealError) return reply.code(409).send({ error: "archived" });
  if (error instanceof InvalidDealLossReasonError) return reply.code(400).send({ error: "invalid_loss_reason" });
  if (error instanceof DealNotFoundError) return reply.code(404).send({ error: "not_found" });
  throw error;
}

function isAllowedDealBody(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).every((key) => DEAL_FIELD_SET.has(key));
}

function parseIncludeArchived(value: unknown): boolean | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const query = value as Record<string, unknown>;
  if (Object.keys(query).some((key) => key !== "include_archived")) return null;
  if (query.include_archived === undefined || query.include_archived === "false") return false;
  if (query.include_archived === "true") return true;
  return null;
}

function readPathUuid(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return readUuid(candidate) ?? null;
}

function readUuid(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : undefined;
}

function requiredText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength && !containsControlCharacter(normalized)
    ? normalized
    : null;
}

function nullableText(value: unknown, maxLength: number): string | null | undefined {
  if (value === null) return null;
  return requiredText(value, maxLength) ?? undefined;
}

function nullableAmount(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(normalized) ? normalized : undefined;
}

function nullableDate(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });
}
