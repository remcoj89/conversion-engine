import type { WorkspaceFetch } from "../../../lib/session/context";
import { parseContact, parseOrganization, type ContactRecord, type OrganizationRecord } from "./crm-data";

export type OrganizationFormValues = Readonly<{
  name: string;
  kvk_number: string;
  website: string;
  general_email: string;
  general_phone: string;
  address: string;
  industry: string;
  notes: string;
  contact_mode: "none" | "existing" | "new";
  contact_id: string;
  contact_full_name: string;
  contact_email: string;
  contact_phone: string;
}>;

type RelationMode = "none" | "existing" | "new";

export type ContactFormValues = Readonly<{
  organization_id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  function: string;
  notes: string;
  communication_preference: string;
  organization_mode: "none" | "existing" | "new";
  new_organization_name: string;
}>;

export type CrmMutationResult<T> =
  | Readonly<{ status: "success"; data: T }>
  | Readonly<{ status: "invalid" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "unavailable" }>;

export type FormValidation = Readonly<{
  values: Record<string, string | null>;
  errors: Readonly<Record<string, string>>;
}>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emptyOrganizationForm(): OrganizationFormValues {
  return {
    name: "",
    kvk_number: "",
    website: "",
    general_email: "",
    general_phone: "",
    address: "",
    industry: "",
    notes: "",
    contact_mode: "none",
    contact_id: "",
    contact_full_name: "",
    contact_email: "",
    contact_phone: "",
  };
}

export function organizationFormFromRecord(record: OrganizationRecord): OrganizationFormValues {
  return {
    name: record.name,
    kvk_number: record.kvk_number ?? "",
    website: record.website ?? "",
    general_email: record.email ?? "",
    general_phone: record.phone ?? "",
    address: record.address ?? "",
    industry: record.industry ?? "",
    notes: record.notes ?? "",
    contact_mode: "none",
    contact_id: "",
    contact_full_name: "",
    contact_email: "",
    contact_phone: "",
  };
}

export function emptyContactForm(): ContactFormValues {
  return {
    organization_id: "",
    full_name: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    function: "",
    notes: "",
    communication_preference: "",
    organization_mode: "none",
    new_organization_name: "",
  };
}

export function contactFormFromRecord(record: ContactRecord): ContactFormValues {
  return {
    organization_id: record.organization_id ?? record.organization?.id ?? "",
    full_name: record.name,
    first_name: record.first_name ?? "",
    last_name: record.last_name ?? "",
    email: record.email ?? "",
    phone: record.phone ?? "",
    function: record.function ?? "",
    notes: record.notes ?? "",
    communication_preference: record.communication_preference ?? "",
    organization_mode: record.organization_id ? "existing" : "none",
    new_organization_name: "",
  };
}

export function validateOrganizationForm(form: OrganizationFormValues): FormValidation {
  const values = normalizeForm(form);
  const errors: Record<string, string> = {};
  if (!values.name) errors.name = "Vul een organisatienaam in.";
  if (values.general_email && !isValidEmail(values.general_email)) errors.general_email = "Vul een geldig e-mailadres in.";
  if (!isRelationMode(values.contact_mode)) errors.contact_mode = "Kies een geldige contactoptie.";
  if (values.contact_mode === "existing" && !values.contact_id) errors.contact_id = "Kies een contactpersoon.";
  if (values.contact_mode === "new") {
    if (!values.contact_full_name) errors.contact_full_name = "Vul een naam in.";
    if (!values.contact_email || !isValidEmail(values.contact_email)) errors.contact_email = "Vul een geldig e-mailadres in.";
  }
  return { values, errors };
}

export function validateContactForm(form: ContactFormValues): FormValidation {
  const values = normalizeForm(form);
  const errors: Record<string, string> = {};
  if (!values.full_name) errors.full_name = "Vul een naam in.";
  if (!values.email || !isValidEmail(values.email)) errors.email = "Vul een geldig e-mailadres in.";
  if (!isRelationMode(values.organization_mode)) errors.organization_mode = "Kies een geldige organisatieoptie.";
  if (values.organization_mode === "existing" && !values.organization_id) errors.organization_id = "Kies een organisatie.";
  if (values.organization_mode === "new" && !values.new_organization_name) errors.new_organization_name = "Vul een organisatienaam in.";
  return { values, errors };
}

export async function saveOrganization(
  fetcher: WorkspaceFetch,
  id: string | null,
  form: OrganizationFormValues,
): Promise<CrmMutationResult<OrganizationRecord>> {
  const validation = validateOrganizationForm(form);
  if (Object.keys(validation.errors).length > 0) return { status: "invalid" };
  const body = id ? organizationUpdateBody(validation.values) : organizationCreateBody(validation.values);
  return mutate(fetcher, id ? `/api/organizations/${encodeURIComponent(id)}` : "/api/organizations", id ? "PATCH" : "POST", body, parseOrganization);
}

export async function saveContact(
  fetcher: WorkspaceFetch,
  id: string | null,
  form: ContactFormValues,
): Promise<CrmMutationResult<ContactRecord>> {
  const validation = validateContactForm(form);
  if (Object.keys(validation.errors).length > 0) return { status: "invalid" };
  const body = id ? contactUpdateBody(validation.values) : contactCreateBody(validation.values);
  return mutate(fetcher, id ? `/api/contacts/${encodeURIComponent(id)}` : "/api/contacts", id ? "PATCH" : "POST", body, parseContact);
}

export function archiveOrganization(fetcher: WorkspaceFetch, id: string): Promise<CrmMutationResult<OrganizationRecord>> {
  return archive(fetcher, `/api/organizations/${encodeURIComponent(id)}`, parseOrganization);
}

export function archiveContact(fetcher: WorkspaceFetch, id: string): Promise<CrmMutationResult<ContactRecord>> {
  return archive(fetcher, `/api/contacts/${encodeURIComponent(id)}`, parseContact);
}

function normalizeForm(form: Readonly<Record<string, string>>): Record<string, string | null> {
  return Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null]));
}

function organizationUpdateBody(values: Record<string, string | null>): Record<string, unknown> {
  return omit(values, ["contact_mode", "contact_id", "contact_full_name", "contact_email", "contact_phone"]);
}

function organizationCreateBody(values: Record<string, string | null>): Record<string, unknown> {
  const body = organizationUpdateBody(values);
  if (values.contact_mode === "existing" && values.contact_id) body.contact_id = values.contact_id;
  if (values.contact_mode === "new") {
    body.contact = {
      full_name: values.contact_full_name ?? "",
      email: values.contact_email ?? "",
      phone: values.contact_phone ?? null,
    };
  }
  return body;
}

function contactUpdateBody(values: Record<string, string | null>): Record<string, unknown> {
  return omit(values, ["organization_mode", "new_organization_name"]);
}

function contactCreateBody(values: Record<string, string | null>): Record<string, unknown> {
  const body = contactUpdateBody(values);
  if (values.organization_mode === "new") {
    delete body.organization_id;
    body.organization = { name: values.new_organization_name ?? "" };
  }
  return body;
}

function omit(values: Record<string, string | null>, keys: readonly string[]): Record<string, string | null> {
  const excluded = new Set(keys);
  return Object.fromEntries(Object.entries(values).filter(([key]) => !excluded.has(key)));
}

function isRelationMode(value: string | null): value is RelationMode {
  return value === "none" || value === "existing" || value === "new";
}

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

async function archive<T>(
  fetcher: WorkspaceFetch,
  path: string,
  parse: (value: unknown) => T | null,
): Promise<CrmMutationResult<T>> {
  return mutate(fetcher, `${path}/archive`, "POST", null, parse);
}

async function mutate<T>(
  fetcher: WorkspaceFetch,
  path: string,
  method: "POST" | "PATCH",
  body: Readonly<Record<string, unknown>> | null,
  parse: (value: unknown) => T | null,
): Promise<CrmMutationResult<T>> {
  try {
    const headers = body ? { "content-type": "application/json" } : undefined;
    const response = await fetcher(path, {
      method,
      credentials: "same-origin",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) return { status: mutationStatus(response.status) };
    const data = parse(payload);
    return data ? { status: "success", data } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

function mutationStatus(status: number): Exclude<CrmMutationResult<unknown>["status"], "success"> {
  if (status === 400) return "invalid";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  return "unavailable";
}
