import type { FastifyInstance } from "fastify";
import { getAuthContext } from "../auth/authHook.js";
import { authorizeForUser } from "../auth/authorization.js";
import { UUID_PATTERN } from "../auth/requestContext.js";
import type {
  Contact,
  CreateContactInput,
  OrganizationContactRepository,
  UpdateContactInput,
} from "../crm/organizationContactRepository.js";
import { parseIncludeArchived, readPathUuid } from "./organizations.js";

const BODY_LIMIT_BYTES = 32 * 1024;
const CONTACT_FIELDS = [
  "organization_id",
  "full_name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "function",
  "notes",
  "communication_preference",
] as const;
const CONTACT_FIELD_SET = new Set<string>(CONTACT_FIELDS);

export type ContactRouteDependencies = Readonly<{
  organizationContactRepository: OrganizationContactRepository;
}>;

export function registerContactRoutes(
  app: FastifyInstance,
  { organizationContactRepository }: ContactRouteDependencies,
) {
  app.get("/v1/contacts", async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:read", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const query = parseContactQuery(request.query);
    if (!query) return reply.code(400).send({ error: "invalid_query" });

    const contacts = await organizationContactRepository.listContacts(
      context.tenantId,
      query,
    );
    return { items: contacts.map(toContactResponse) };
  });

  app.post("/v1/contacts", { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:create", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const input = parseContactCreateBody(request.body);
    if (!input) return reply.code(400).send({ error: "invalid_body" });
    if (input.organizationId !== undefined && input.organizationId !== null) {
      const organization = await organizationContactRepository.findOrganization(
        context.tenantId,
        input.organizationId,
      );
      if (!organization) return reply.code(400).send({ error: "invalid_organization" });
    }

    const contact = await organizationContactRepository.createContact({
      tenantId: context.tenantId,
      ...input,
    });
    return reply.code(201).send(toContactResponse(contact));
  });

  app.get("/v1/contacts/:contactId", async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:read", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const contactId = readPathUuid(request.params, "contactId");
    if (!contactId) return reply.code(400).send({ error: "invalid_contact_id" });

    const contact = await organizationContactRepository.findContact(context.tenantId, contactId);
    if (!contact) return reply.code(404).send({ error: "not_found" });
    return toContactResponse(contact);
  });

  app.patch("/v1/contacts/:contactId", { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:update", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const contactId = readPathUuid(request.params, "contactId");
    if (!contactId) return reply.code(400).send({ error: "invalid_contact_id" });

    const input = parseContactUpdateBody(request.body);
    if (!input) return reply.code(400).send({ error: "invalid_body" });
    if (input.organizationId !== undefined && input.organizationId !== null) {
      const organization = await organizationContactRepository.findOrganization(
        context.tenantId,
        input.organizationId,
      );
      if (!organization) return reply.code(400).send({ error: "invalid_organization" });
    }

    const contact = await organizationContactRepository.updateContact({
      tenantId: context.tenantId,
      contactId,
      ...input,
    });
    if (!contact) return reply.code(404).send({ error: "not_found" });
    return toContactResponse(contact);
  });

  app.post("/v1/contacts/:contactId/archive", async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorizeForUser(context.role, "crm:archive", context.teamMemberPermissions)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const contactId = readPathUuid(request.params, "contactId");
    if (!contactId) return reply.code(400).send({ error: "invalid_contact_id" });

    const contact = await organizationContactRepository.archiveContact(context.tenantId, contactId);
    if (!contact) return reply.code(404).send({ error: "not_found" });
    return toContactResponse(contact);
  });
}

export function parseContactQuery(value: unknown):
  | Readonly<{ includeArchived: boolean; organizationId?: string }>
  | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const query = value as Record<string, unknown>;
  if (Object.keys(query).some((key) => !["include_archived", "organization_id"].includes(key))) return null;
  const includeArchived = parseIncludeArchived({
    ...(query.include_archived === undefined ? {} : { include_archived: query.include_archived }),
  });
  if (includeArchived === null) return null;
  if (query.organization_id === undefined) return { includeArchived };
  if (typeof query.organization_id !== "string" || !UUID_PATTERN.test(query.organization_id)) return null;
  return { includeArchived, organizationId: query.organization_id };
}

export function toContactResponse(contact: Contact) {
  return {
    id: contact.id,
    organization_id: contact.organizationId,
    full_name: contact.fullName,
    first_name: contact.firstName,
    last_name: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    function: contact.function,
    notes: contact.notes,
    communication_preference: contact.communicationPreference,
    status: contact.status,
    created_at: contact.createdAt.toISOString(),
    updated_at: contact.updatedAt.toISOString(),
  };
}

type ContactCreateBody = Omit<CreateContactInput, "tenantId">;
type ContactUpdateBody = Omit<UpdateContactInput, "tenantId" | "contactId">;

function parseContactCreateBody(value: unknown): ContactCreateBody | null {
  if (!isAllowedContactBody(value)) return null;
  const body = value as Record<string, unknown>;
  const fullName = requiredText(body.full_name, 200);
  const email = parseEmail(body.email);
  if (!fullName || !email) return null;
  const optional = parseContactFields(body);
  return optional ? { fullName, email, ...optional } : null;
}

function parseContactUpdateBody(value: unknown): ContactUpdateBody | null {
  if (!isAllowedContactBody(value) || Object.keys(value as object).length === 0) return null;
  const body = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  if (Object.hasOwn(body, "full_name")) {
    const fullName = requiredText(body.full_name, 200);
    if (!fullName) return null;
    result.fullName = fullName;
  }
  if (Object.hasOwn(body, "email")) {
    const email = parseEmail(body.email);
    if (!email) return null;
    result.email = email;
  }
  const optional = parseContactFields(body);
  if (!optional) return null;
  Object.assign(result, optional);
  return result as ContactUpdateBody;
}

function parseContactFields(body: Record<string, unknown>): Record<string, string | null> | null {
  const fields: Record<string, string | null> = {};
  const mappings = {
    organization_id: ["organizationId", 36],
    first_name: ["firstName", 100],
    last_name: ["lastName", 100],
    phone: ["phone", 100],
    function: ["function", 150],
    notes: ["notes", 10_000],
    communication_preference: ["communicationPreference", 100],
  } as const;

  for (const [inputKey, [outputKey, maxLength]] of Object.entries(mappings)) {
    if (!Object.hasOwn(body, inputKey)) continue;
    const value = body[inputKey];
    if (inputKey === "organization_id") {
      if (value === null) {
        fields[outputKey] = null;
      } else if (typeof value === "string" && UUID_PATTERN.test(value)) {
        fields[outputKey] = value;
      } else {
        return null;
      }
      continue;
    }
    const parsed = nullableText(value, maxLength);
    if (parsed === undefined) return null;
    fields[outputKey] = parsed;
  }
  return fields;
}

function isAllowedContactBody(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).every((key) => CONTACT_FIELD_SET.has(key));
}

function parseEmail(value: unknown): string | null {
  const email = requiredText(value, 320);
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
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
