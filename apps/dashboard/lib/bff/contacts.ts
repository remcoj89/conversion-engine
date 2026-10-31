import { NextRequest, NextResponse } from "next/server";
import { createApiProxy, type ApiProxyDependencies, type ForwardedError } from "./apiProxy";

export type ContactRecord = Readonly<{
  id: string;
  organization_id: string | null;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  function: string | null;
  notes: string | null;
  communication_preference: string | null;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}>;

export type ContactListResponse = Readonly<{
  items: readonly ContactRecord[];
}>;

export type ContactQuery = Readonly<{
  include_archived?: string;
  organization_id?: string;
}>;

type ContactHandler = (request: NextRequest) => Promise<Response>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTACT_QUERY_KEYS = ["include_archived", "organization_id"] as const;
const MAX_BODY_BYTES = 16 * 1024;
const noStore = { "Cache-Control": "no-store" };
const forwardedListErrors: readonly ForwardedError[] = [
  { status: 400, error: "invalid_query" },
  { status: 401, error: "unauthorized" },
  { status: 403, error: "forbidden" },
  { status: 502, error: "api_unavailable" },
  { status: 503, error: "api_unavailable" },
];
const forwardedMutationErrors: readonly ForwardedError[] = [
  { status: 400, error: "invalid_body" },
  { status: 401, error: "unauthorized" },
  { status: 403, error: "forbidden" },
  { status: 404, error: "not_found" },
  { status: 502, error: "api_unavailable" },
  { status: 503, error: "api_unavailable" },
];

const contactBodyFields = {
  organization_id: { maxLength: 36, nullable: true, uuid: true },
  full_name: { required: true, maxLength: 200 },
  first_name: { maxLength: 120, nullable: true },
  last_name: { maxLength: 120, nullable: true },
  email: { required: true, maxLength: 320 },
  phone: { maxLength: 80, nullable: true },
  function: { maxLength: 160, nullable: true },
  notes: { maxLength: 5_000, nullable: true },
  communication_preference: { maxLength: 64, nullable: true },
} as const;

export function createContactsHandler(dependencies: ApiProxyDependencies): ContactHandler {
  return async (request) => {
    if (request.method === "POST") {
      return proxyJsonMutation(dependencies, request, "/v1/contacts", "POST", forwardedMutationErrors);
    }

    const apiPath = buildContactsApiPath(request.url);
    if (!apiPath) return reply({ error: "invalid_query" }, 400);

    return proxyValidatedResponse(
      dependencies,
      request,
      { apiPath, method: "GET", forwardedErrors: forwardedListErrors },
      parseContactListResponse,
    );
  };
}

export function createContactDetailHandler(dependencies: ApiProxyDependencies): ContactHandler {
  return async (request) => {
    const contactId = readId(request.url, "contacts");
    if (!contactId || !UUID_PATTERN.test(contactId)) return reply({ error: "not_found" }, 404);

    if (request.method === "PATCH") {
      return proxyJsonMutation(
        dependencies,
        request,
        `/v1/contacts/${encodeURIComponent(contactId)}`,
        "PATCH",
        forwardedMutationErrors,
        true,
      );
    }

    return proxyValidatedResponse(
      dependencies,
      request,
      {
        apiPath: `/v1/contacts/${encodeURIComponent(contactId)}`,
        method: "GET",
        forwardedErrors: forwardedMutationErrors,
      },
      parseContactResponse,
    );
  };
}

export function createContactArchiveHandler(dependencies: ApiProxyDependencies): ContactHandler {
  return async (request) => {
    const contactId = readId(request.url, "contacts");
    if (!contactId || !UUID_PATTERN.test(contactId)) return reply({ error: "not_found" }, 404);
    if (!isSameOriginRequest(request)) return reply({ error: "forbidden" }, 403);

    const body = await readEmptyBody(request);
    if (body === null) return reply({ error: "invalid_body" }, 400);

    return proxyValidatedResponse(
      dependencies,
      withJsonBody(request, body),
      {
        apiPath: `/v1/contacts/${encodeURIComponent(contactId)}/archive`,
        method: "POST",
        forwardedErrors: forwardedMutationErrors,
        forwardTenantHeader: false,
        requireSameOrigin: true,
        maxBodyBytes: MAX_BODY_BYTES,
      },
      parseContactResponse,
    );
  };
}

export function buildContactsApiPath(requestUrl: string): string | null {
  const source = new URL(requestUrl);
  const params = new URLSearchParams();

  for (const key of CONTACT_QUERY_KEYS) {
    const value = source.searchParams.get(key);
    if (value === null) continue;
    if (key === "include_archived") {
      if (value !== "true" && value !== "false") return null;
    } else if (!UUID_PATTERN.test(value)) {
      return null;
    }
    params.set(key, value);
  }

  const query = params.toString();
  return query ? `/v1/contacts?${query}` : "/v1/contacts";
}

export function parseContactListResponse(value: unknown): ContactListResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, ["items"]) || !Array.isArray(value.items)) return null;

  const items = value.items.map(parseContactResponse);
  if (items.some((item): item is null => item === null)) return null;
  return { items: items as ContactRecord[] };
}

export function parseContactResponse(value: unknown): ContactRecord | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "id",
    "organization_id",
    "full_name",
    "first_name",
    "last_name",
    "email",
    "phone",
    "function",
    "notes",
    "communication_preference",
    "status",
    "created_at",
    "updated_at",
  ])) return null;

  if (
    !isUuid(value.id) ||
    !isNullableUuid(value.organization_id) ||
    !isRequiredString(value.full_name, 200) ||
    !isNullableString(value.first_name, 120) ||
    !isNullableString(value.last_name, 120) ||
    !isRequiredString(value.email, 320) ||
    !isNullableString(value.phone, 80) ||
    !isNullableString(value.function, 160) ||
    !isNullableString(value.notes, 5_000) ||
    !isNullableString(value.communication_preference, 64) ||
    (value.status !== "active" && value.status !== "archived") ||
    !isDateString(value.created_at) ||
    !isDateString(value.updated_at)
  ) return null;

  return {
    id: value.id,
    organization_id: value.organization_id,
    full_name: value.full_name.trim(),
    first_name: normalizeNullableString(value.first_name),
    last_name: normalizeNullableString(value.last_name),
    email: value.email.trim(),
    phone: normalizeNullableString(value.phone),
    function: normalizeNullableString(value.function),
    notes: normalizeNullableString(value.notes),
    communication_preference: normalizeNullableString(value.communication_preference),
    status: value.status,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

async function proxyJsonMutation(
  dependencies: ApiProxyDependencies,
  request: NextRequest,
  apiPath: string,
  method: "POST" | "PATCH",
  forwardedErrors: readonly ForwardedError[],
  patch = false,
): Promise<Response> {
  if (!isSameOriginRequest(request)) return reply({ error: "forbidden" }, 403);

  const body = await readControlledBody(request, contactBodyFields, patch);
  if (body === null) return reply({ error: "invalid_body" }, 400);

  return proxyValidatedResponse(
    dependencies,
    withJsonBody(request, body),
    {
      apiPath,
      method,
      forwardedErrors,
      forwardTenantHeader: false,
      requireSameOrigin: true,
      maxBodyBytes: MAX_BODY_BYTES,
    },
    parseContactResponse,
  );
}

async function proxyValidatedResponse<T>(
  dependencies: ApiProxyDependencies,
  request: NextRequest,
  route: Parameters<typeof createApiProxy>[1],
  parser: (value: unknown) => T | null,
): Promise<Response> {
  const response = await createApiProxy(dependencies, {
    ...route,
    forwardTenantHeader: false,
  })(request);
  if (!response.ok) return response;

  const parsed = parser(await response.json().catch(() => null));
  return parsed ? reply(parsed, response.status) : reply({ error: "api_unavailable" }, 503);
}

async function readControlledBody(
  request: NextRequest,
  fields: Record<string, { readonly required?: boolean; readonly maxLength: number; readonly nullable?: boolean; readonly uuid?: boolean }>,
  patch: boolean,
): Promise<string | null> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return null;
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  const keys = Object.keys(value);
  if (keys.some((key) => !Object.hasOwn(fields, key))) return null;
  if (!patch && keys.some((key) => fields[key]?.required && !Object.hasOwn(value, key))) return null;
  if (patch && keys.length === 0) return null;

  const normalized: Record<string, string | null> = {};
  for (const key of keys) {
    const field = fields[key]!;
    const fieldValue = value[key];
    if (fieldValue === null) {
      if (!field.nullable) return null;
      normalized[key] = null;
      continue;
    }
    if (field.uuid && (typeof fieldValue !== "string" || !UUID_PATTERN.test(fieldValue))) return null;
    if (!isInputString(fieldValue, field.maxLength)) return null;
    normalized[key] = fieldValue.trim();
  }

  for (const [key, field] of Object.entries(fields)) {
    if (!patch && field.required && (!Object.hasOwn(normalized, key) || !normalized[key])) return null;
  }
  return JSON.stringify(normalized);
}

async function readEmptyBody(request: NextRequest): Promise<string | null> {
  const raw = await request.text();
  return raw.trim().length === 0 ? "" : null;
}

function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === request.nextUrl.origin;
}

function withJsonBody(request: NextRequest, body: string): NextRequest {
  return new NextRequest(request.url, {
    method: request.method,
    headers: request.headers,
    body,
  });
}

function readId(requestUrl: string, segment: string): string | null {
  const parts = new URL(requestUrl).pathname.split("/").filter(Boolean);
  const index = parts.lastIndexOf(segment);
  return index >= 0 ? parts[index + 1] ?? null : null;
}

function reply(body: unknown, status: number): Response {
  return NextResponse.json(body, { status, headers: noStore });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isRequiredString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isNullableString(value: unknown, maxLength: number): value is string | null {
  return value === null || isRequiredString(value, maxLength);
}

function normalizeNullableString(value: string | null): string | null {
  return value === null ? null : value.trim();
}

function isInputString(value: unknown, maxLength: number): value is string {
  return isRequiredString(value, maxLength) && !containsControlCharacter(value);
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}
