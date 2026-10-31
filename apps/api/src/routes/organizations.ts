import type { FastifyInstance } from "fastify";
import { getAuthContext } from "../auth/authHook.js";
import { authorizeForUser } from "../auth/authorization.js";
import { UUID_PATTERN } from "../auth/requestContext.js";
import type {
  CreateOrganizationInput,
  Organization,
  OrganizationContactRepository,
  UpdateOrganizationInput,
} from "../crm/organizationContactRepository.js";

const BODY_LIMIT_BYTES = 32 * 1024;
const ORGANIZATION_FIELDS = [
  "name",
  "kvk_number",
  "website",
  "general_email",
  "general_phone",
  "address",
  "industry",
  "notes",
] as const;
const ORGANIZATION_FIELD_SET = new Set<string>(ORGANIZATION_FIELDS);

export type OrganizationRouteDependencies = Readonly<{
  organizationContactRepository: OrganizationContactRepository;
}>;

export function registerOrganizationRoutes(
  app: FastifyInstance,
  { organizationContactRepository }: OrganizationRouteDependencies,
) {
  app.get("/v1/organizations", async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:read", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const includeArchived = parseIncludeArchived(request.query);
    if (includeArchived === null) return reply.code(400).send({ error: "invalid_query" });

    const organizations = await organizationContactRepository.listOrganizations(
      context.tenantId,
      { includeArchived },
    );
    return { items: organizations.map(toOrganizationResponse) };
  });

  app.post("/v1/organizations", { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:create", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const input = parseOrganizationCreateBody(request.body);
    if (!input) return reply.code(400).send({ error: "invalid_body" });

    const organization = await organizationContactRepository.createOrganization({
      tenantId: context.tenantId,
      ...input,
    });
    return reply.code(201).send(toOrganizationResponse(organization));
  });

  app.get("/v1/organizations/:organizationId", async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:read", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const organizationId = readPathUuid(request.params, "organizationId");
    if (!organizationId) return reply.code(400).send({ error: "invalid_organization_id" });

    const organization = await organizationContactRepository.findOrganization(
      context.tenantId,
      organizationId,
    );
    if (!organization) return reply.code(404).send({ error: "not_found" });
    return toOrganizationResponse(organization);
  });

  app.patch("/v1/organizations/:organizationId", { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:update", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const organizationId = readPathUuid(request.params, "organizationId");
    if (!organizationId) return reply.code(400).send({ error: "invalid_organization_id" });

    const input = parseOrganizationUpdateBody(request.body);
    if (!input) return reply.code(400).send({ error: "invalid_body" });

    const organization = await organizationContactRepository.updateOrganization({
      tenantId: context.tenantId,
      organizationId,
      ...input,
    });
    if (!organization) return reply.code(404).send({ error: "not_found" });
    return toOrganizationResponse(organization);
  });

  app.post("/v1/organizations/:organizationId/archive", async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:archive", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const organizationId = readPathUuid(request.params, "organizationId");
    if (!organizationId) return reply.code(400).send({ error: "invalid_organization_id" });

    const organization = await organizationContactRepository.archiveOrganization(
      context.tenantId,
      organizationId,
    );
    if (!organization) return reply.code(404).send({ error: "not_found" });
    return toOrganizationResponse(organization);
  });
}

export function parseIncludeArchived(value: unknown): boolean | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const query = value as Record<string, unknown>;
  if (Object.keys(query).some((key) => key !== "include_archived")) return null;
  if (query.include_archived === undefined) return false;
  if (query.include_archived === "false") return false;
  if (query.include_archived === "true") return true;
  return null;
}

export function readPathUuid(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && UUID_PATTERN.test(candidate) ? candidate : null;
}

export function toOrganizationResponse(organization: Organization) {
  return {
    id: organization.id,
    name: organization.name,
    kvk_number: organization.kvkNumber,
    website: organization.website,
    general_email: organization.generalEmail,
    general_phone: organization.generalPhone,
    address: organization.address,
    industry: organization.industry,
    notes: organization.notes,
    status: organization.status,
    created_at: organization.createdAt.toISOString(),
    updated_at: organization.updatedAt.toISOString(),
  };
}

type OrganizationBody = Omit<CreateOrganizationInput, "tenantId">;
type OrganizationUpdateBody = Omit<UpdateOrganizationInput, "tenantId" | "organizationId">;

function parseOrganizationCreateBody(value: unknown): OrganizationBody | null {
  if (!isRecordWithAllowedKeys(value) || !Object.hasOwn(value, "name")) return null;
  const body = value as Record<string, unknown>;
  const name = requiredText(body.name, 200);
  if (!name) return null;

  const optional = parseOrganizationFields(body);
  return optional ? { name, ...optional } : null;
}

function parseOrganizationUpdateBody(value: unknown): OrganizationUpdateBody | null {
  if (!isRecordWithAllowedKeys(value) || Object.keys(value as object).length === 0) return null;
  const body = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  if (Object.hasOwn(body, "name")) {
    const name = requiredText(body.name, 200);
    if (!name) return null;
    result.name = name;
  }
  const optional = parseOrganizationFields(body);
  if (!optional) return null;
  Object.assign(result, optional);
  return result as OrganizationUpdateBody;
}

function parseOrganizationFields(body: Record<string, unknown>): Record<string, string | null> | null {
  const fields: Record<string, string | null> = {};
  for (const key of ORGANIZATION_FIELDS.slice(1)) {
    if (!Object.hasOwn(body, key)) continue;
    const value = nullableText(body[key], key === "notes" ? 10_000 : 500);
    if (value === undefined) return null;
    fields[key] = value;
  }
  return fields;
}

function isRecordWithAllowedKeys(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).every((key) => ORGANIZATION_FIELD_SET.has(key));
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
  const normalized = requiredText(value, maxLength);
  return normalized ?? undefined;
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });
}
