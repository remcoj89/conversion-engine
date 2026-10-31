import type { WorkspaceFetch } from "../../../lib/session/context";

export type CrmRecordStatus = "active" | "archived";

export type OrganizationRecord = Readonly<{
  id: string;
  name: string;
  status: CrmRecordStatus;
  kvk_number?: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address?: string | null;
  industry: string | null;
  notes?: string | null;
  contact_count: number | null;
  created_at?: string;
  updated_at?: string;
}>;

export type ContactRecord = Readonly<{
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  function: string | null;
  first_name?: string | null;
  last_name?: string | null;
  notes?: string | null;
  communication_preference?: string | null;
  organization_id?: string | null;
  organization: Readonly<{ id: string; name: string | null }> | null;
  status: CrmRecordStatus;
  created_at?: string;
  updated_at?: string;
}>;

export type CrmListData<T> = Readonly<{
  items: readonly T[];
  next_cursor: string | null;
}>;

export type CrmFetchResult<T> =
  | Readonly<{ status: "ready"; data: CrmListData<T> }>
  | Readonly<{ status: "unauthenticated" | "forbidden" | "unavailable" }>;

export async function fetchOrganizations(fetcher: WorkspaceFetch): Promise<CrmFetchResult<OrganizationRecord>> {
  return fetchOrganizationsWithOptions(fetcher);
}

export async function fetchContacts(fetcher: WorkspaceFetch): Promise<CrmFetchResult<ContactRecord>> {
  return fetchContactsWithOptions(fetcher);
}

export async function fetchOrganizationsWithOptions(
  fetcher: WorkspaceFetch,
  options: Readonly<{ includeArchived?: boolean }> = {},
): Promise<CrmFetchResult<OrganizationRecord>> {
  const query = options.includeArchived ? "?include_archived=true" : "";
  return fetchCrmList(fetcher, `/api/organizations${query}`, parseOrganization);
}

export async function fetchContactsWithOptions(
  fetcher: WorkspaceFetch,
  options: Readonly<{ includeArchived?: boolean }> = {},
): Promise<CrmFetchResult<ContactRecord>> {
  const query = options.includeArchived ? "?include_archived=true" : "";
  return fetchCrmList(fetcher, `/api/contacts${query}`, parseContact);
}

export async function fetchOrganization(
  fetcher: WorkspaceFetch,
  id: string,
): Promise<CrmFetchResult<OrganizationRecord>> {
  return fetchCrmDetail(fetcher, `/api/organizations/${encodeURIComponent(id)}`, parseOrganization);
}

export async function fetchContact(
  fetcher: WorkspaceFetch,
  id: string,
): Promise<CrmFetchResult<ContactRecord>> {
  return fetchCrmDetail(fetcher, `/api/contacts/${encodeURIComponent(id)}`, parseContact);
}

async function fetchCrmList<T>(
  fetcher: WorkspaceFetch,
  path: string,
  parseItem: (value: unknown) => T | null,
): Promise<CrmFetchResult<T>> {
  try {
    const response = await fetcher(path, { cache: "no-store" });

    if (response.status === 401) return { status: "unauthenticated" };
    if (response.status === 403) return { status: "forbidden" };
    if (!response.ok) return { status: "unavailable" };

    const body: unknown = await response.json();
    if (!isRecord(body) || !Array.isArray(body.items)) return { status: "unavailable" };

    const items: T[] = [];
    for (const item of body.items) {
      const parsed = parseItem(item);
      if (!parsed) return { status: "unavailable" };
      items.push(parsed);
    }

    return {
      status: "ready",
      data: {
        items,
        next_cursor: typeof body.next_cursor === "string" ? body.next_cursor : null,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

async function fetchCrmDetail<T>(
  fetcher: WorkspaceFetch,
  path: string,
  parseItem: (value: unknown) => T | null,
): Promise<CrmFetchResult<T>> {
  try {
    const response = await fetcher(path, { cache: "no-store" });
    if (response.status === 401) return { status: "unauthenticated" };
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 404) return { status: "unavailable" };
    if (!response.ok) return { status: "unavailable" };

    const item = parseItem(await response.json());
    return item ? { status: "ready", data: { items: [item], next_cursor: null } } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export function parseOrganization(value: unknown): OrganizationRecord | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim() || typeof value.name !== "string" || !value.name.trim()) return null;
  const status = parseStatus(value.status);
  if (!status) return null;

  const base: OrganizationRecord = {
    id: value.id.trim(),
    name: value.name.trim(),
    status,
    website: nullableString(value.website),
    email: nullableString(value.email ?? value.general_email),
    phone: nullableString(value.phone ?? value.general_phone),
    industry: nullableString(value.industry),
    contact_count: typeof value.contact_count === "number" ? value.contact_count : null,
  };
  return {
    ...base,
    ...(Object.hasOwn(value, "kvk_number") ? { kvk_number: nullableString(value.kvk_number) } : {}),
    ...(Object.hasOwn(value, "address") ? { address: nullableString(value.address) } : {}),
    ...(Object.hasOwn(value, "notes") ? { notes: nullableString(value.notes) } : {}),
    ...(typeof value.created_at === "string" ? { created_at: value.created_at } : {}),
    ...(typeof value.updated_at === "string" ? { updated_at: value.updated_at } : {}),
  };
}

export function parseContact(value: unknown): ContactRecord | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) return null;
  const name = typeof value.name === "string" ? value.name : typeof value.full_name === "string" ? value.full_name : buildContactName(value);
  const status = parseStatus(value.status);
  if (!name?.trim() || !status) return null;

  const base: ContactRecord = {
    id: value.id.trim(),
    name: name.trim(),
    email: nullableString(value.email),
    phone: nullableString(value.phone),
    function: nullableString(value.function ?? value.job_title),
    organization: parseOrganizationReference(value.organization ?? value.organization_name, value.organization_id),
    status,
  };
  return {
    ...base,
    ...(Object.hasOwn(value, "first_name") ? { first_name: nullableString(value.first_name) } : {}),
    ...(Object.hasOwn(value, "last_name") ? { last_name: nullableString(value.last_name) } : {}),
    ...(Object.hasOwn(value, "notes") ? { notes: nullableString(value.notes) } : {}),
    ...(Object.hasOwn(value, "communication_preference") ? { communication_preference: nullableString(value.communication_preference) } : {}),
    ...(Object.hasOwn(value, "organization_id") ? { organization_id: nullableString(value.organization_id) } : {}),
    ...(typeof value.created_at === "string" ? { created_at: value.created_at } : {}),
    ...(typeof value.updated_at === "string" ? { updated_at: value.updated_at } : {}),
  };
}

function parseOrganizationReference(value: unknown, organizationId: unknown): ContactRecord["organization"] {
  if (isRecord(value) && typeof value.id === "string" && typeof value.name === "string") {
    return { id: value.id, name: value.name };
  }

  if (typeof value === "string" && value.trim()) return { id: "", name: value };
  if (typeof organizationId === "string" && organizationId.trim()) return { id: organizationId, name: null };
  return null;
}

function buildContactName(value: Record<string, unknown>): string | null {
  const name = [value.first_name, value.last_name]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .trim();
  return name || null;
}

function parseStatus(value: unknown): CrmRecordStatus | null {
  return value === "active" || value === "archived" ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
