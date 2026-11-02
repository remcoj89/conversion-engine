import type { FastifyInstance } from "fastify";
import { getAuthContext } from "../auth/authHook.js";
import { authorizeForUser } from "../auth/authorization.js";
import { UUID_PATTERN } from "../auth/requestContext.js";
import {
  ContactAlreadyLinkedError,
  ContactNotFoundForOrganizationError,
  DuplicateContactEmailError,
} from "../crm/organizationContactRepository.js";
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

    let organization: Organization;
    try {
      organization = input.contactId !== undefined || input.contact
        ? (await organizationContactRepository.createOrganizationWithContact({
          tenantId: context.tenantId,
          organization: input.organization,
          contactId: input.contactId,
          contact: input.contact,
        })).organization
        : await organizationContactRepository.createOrganization({
          tenantId: context.tenantId,
          ...input.organization,
        });
    } catch (error) {
      if (error instanceof DuplicateContactEmailError) {
        return reply.code(409).send({ error: "duplicate_contact_email" });
      }
      if (error instanceof ContactAlreadyLinkedError) {
        return reply.code(409).send({ error: "contact_already_linked" });
      }
      if (error instanceof ContactNotFoundForOrganizationError) {
        return reply.code(400).send({ error: "invalid_contact" });
      }
      throw error;
    }
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

type NewContactBody = Readonly<{
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  phone?: string | null;
  function?: string | null;
  notes?: string | null;
  communicationPreference?: string | null;
}>;
type OrganizationBody = Readonly<{
  organization: Omit<CreateOrganizationInput, "tenantId">;
  contactId?: string | null;
  contact?: NewContactBody;
}>;
type OrganizationUpdateBody = Omit<UpdateOrganizationInput, "tenantId" | "organizationId">;

const INLINE_CONTACT_FIELDS = new Set([
  "full_name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "function",
  "notes",
  "communication_preference",
]);

function parseOrganizationCreateBody(value: unknown): OrganizationBody | null {
  if (!isRecordWithAllowedKeys(value, new Set([...ORGANIZATION_FIELD_SET, "contact_id", "contact"])) || !Object.hasOwn(value, "name")) return null;
  const body = value as Record<string, unknown>;
  const name = requiredText(body.name, 200);
  if (!name) return null;

  const optional = parseOrganizationFields(body);
  if (!optional) return null;

  const contactId = body.contact_id === undefined
    ? undefined
    : body.contact_id === null
      ? null
      : typeof body.contact_id === "string" && UUID_PATTERN.test(body.contact_id)
        ? body.contact_id
        : "invalid";
  if (contactId === "invalid") return null;

  const contact = body.contact === undefined ? undefined : parseInlineContact(body.contact);
  if (contact === null) return null;
  if (contactId !== undefined && contact !== undefined) return null;

  return {
    organization: { name, ...optional },
    ...(contactId === undefined ? {} : { contactId }),
    ...(contact === undefined ? {} : { contact }),
  };
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

function isRecordWithAllowedKeys(value: unknown, allowedKeys = ORGANIZATION_FIELD_SET): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).every((key) => allowedKeys.has(key));
}

function parseInlineContact(value: unknown): NewContactBody | null {
  if (!isRecordWithAllowedKeys(value, INLINE_CONTACT_FIELDS)) return null;
  const body = value as Record<string, unknown>;
  const fullName = requiredText(body.full_name, 200);
  const email = requiredText(body.email, 320);
  if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  const fields: Record<string, string | null> = {};
  const mappings = {
    first_name: ["firstName", 100],
    last_name: ["lastName", 100],
    phone: ["phone", 100],
    function: ["function", 150],
    notes: ["notes", 10_000],
    communication_preference: ["communicationPreference", 100],
  } as const;
  for (const [inputKey, [outputKey, maxLength]] of Object.entries(mappings)) {
    if (!Object.hasOwn(body, inputKey)) continue;
    const parsed = nullableText(body[inputKey], maxLength);
    if (parsed === undefined) return null;
    fields[outputKey] = parsed;
  }

  return { fullName, email: email.toLowerCase(), ...fields };
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
