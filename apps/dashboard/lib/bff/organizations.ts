import { NextRequest, NextResponse } from "next/server";
import { createApiProxy, type ApiProxyDependencies, type ForwardedError } from "./apiProxy";

export type OrganizationRecord = Readonly<{
  id: string;
  name: string;
  kvk_number: string | null;
  website: string | null;
  general_email: string | null;
  general_phone: string | null;
  address: string | null;
  industry: string | null;
  notes: string | null;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}>;

export type OrganizationListResponse = Readonly<{
  items: readonly OrganizationRecord[];
}>;

export type OrganizationQuery = Readonly<{
  include_archived?: string;
}>;

type OrganizationHandler = (request: NextRequest) => Promise<Response>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORGANIZATION_QUERY_KEYS = ["include_archived"] as const;
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

const organizationBodyFields = {
  name: { required: true, maxLength: 200 },
  kvk_number: { maxLength: 32, nullable: true },
  website: { maxLength: 2_000, nullable: true },
  general_email: { maxLength: 320, nullable: true },
  general_phone: { maxLength: 80, nullable: true },
  address: { maxLength: 500, nullable: true },
  industry: { maxLength: 160, nullable: true },
  notes: { maxLength: 5_000, nullable: true },
} as const;

export function createOrganizationsHandler(dependencies: ApiProxyDependencies): OrganizationHandler {
  return async (request) => {
    if (request.method === "POST") {
      return proxyJsonMutation(dependencies, request, "/v1/organizations", "POST", forwardedMutationErrors);
    }

    const apiPath = buildOrganizationsApiPath(request.url);
    if (!apiPath) return reply({ error: "invalid_query" }, 400);

    return proxyValidatedResponse(
      dependencies,
      request,
      { apiPath, method: "GET", forwardedErrors: forwardedListErrors },
      parseOrganizationListResponse,
    );
  };
}

export function createOrganizationDetailHandler(dependencies: ApiProxyDependencies): OrganizationHandler {
  return async (request) => {
    const organizationId = readId(request.url, "organizations");
    if (!organizationId || !UUID_PATTERN.test(organizationId)) return reply({ error: "not_found" }, 404);

    if (request.method === "PATCH") {
      return proxyJsonMutation(
        dependencies,
        request,
        `/v1/organizations/${encodeURIComponent(organizationId)}`,
        "PATCH",
        forwardedMutationErrors,
        true,
      );
    }

    return proxyValidatedResponse(
      dependencies,
      request,
      {
        apiPath: `/v1/organizations/${encodeURIComponent(organizationId)}`,
        method: "GET",
        forwardedErrors: forwardedMutationErrors,
      },
      parseOrganizationResponse,
    );
  };
}

export function createOrganizationArchiveHandler(dependencies: ApiProxyDependencies): OrganizationHandler {
  return async (request) => {
    const organizationId = readId(request.url, "organizations");
    if (!organizationId || !UUID_PATTERN.test(organizationId)) return reply({ error: "not_found" }, 404);
    if (!isSameOriginRequest(request)) return reply({ error: "forbidden" }, 403);

    const body = await readEmptyBody(request);
    if (body === null) return reply({ error: "invalid_body" }, 400);

    return proxyValidatedResponse(
      dependencies,
      withJsonBody(request, body),
      {
        apiPath: `/v1/organizations/${encodeURIComponent(organizationId)}/archive`,
        method: "POST",
        forwardedErrors: forwardedMutationErrors,
        forwardTenantHeader: false,
        requireSameOrigin: true,
        maxBodyBytes: MAX_BODY_BYTES,
      },
      parseOrganizationResponse,
    );
  };
}

export function buildOrganizationsApiPath(requestUrl: string): string | null {
  const source = new URL(requestUrl);
  const params = new URLSearchParams();

  for (const key of ORGANIZATION_QUERY_KEYS) {
    const value = source.searchParams.get(key);
    if (value === null) continue;
    if (value !== "true" && value !== "false") return null;
    params.set(key, value);
  }

  const query = params.toString();
  return query ? `/v1/organizations?${query}` : "/v1/organizations";
}

export function parseOrganizationListResponse(value: unknown): OrganizationListResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, ["items"]) || !Array.isArray(value.items)) return null;

  const items = value.items.map(parseOrganizationResponse);
  if (items.some((item): item is null => item === null)) return null;
  return { items: items as OrganizationRecord[] };
}

export function parseOrganizationResponse(value: unknown): OrganizationRecord | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "id",
    "name",
    "kvk_number",
    "website",
    "general_email",
    "general_phone",
    "address",
    "industry",
    "notes",
    "status",
    "created_at",
    "updated_at",
  ])) return null;

  if (
    !isUuid(value.id) ||
    !isRequiredString(value.name, 200) ||
    !isNullableString(value.kvk_number, 32) ||
    !isNullableString(value.website, 2_000) ||
    !isNullableString(value.general_email, 320) ||
    !isNullableString(value.general_phone, 80) ||
    !isNullableString(value.address, 500) ||
    !isNullableString(value.industry, 160) ||
    !isNullableString(value.notes, 5_000) ||
    (value.status !== "active" && value.status !== "archived") ||
    !isDateString(value.created_at) ||
    !isDateString(value.updated_at)
  ) return null;

  return {
    id: value.id,
    name: value.name.trim(),
    kvk_number: normalizeNullableString(value.kvk_number),
    website: normalizeNullableString(value.website),
    general_email: normalizeNullableString(value.general_email),
    general_phone: normalizeNullableString(value.general_phone),
    address: normalizeNullableString(value.address),
    industry: normalizeNullableString(value.industry),
    notes: normalizeNullableString(value.notes),
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

  const body = await readControlledBody(request, organizationBodyFields, patch);
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
    parseOrganizationResponse,
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
  fields: Record<string, { readonly required?: boolean; readonly maxLength: number; readonly nullable?: boolean }>,
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
