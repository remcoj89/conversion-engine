import { NextRequest, NextResponse } from "next/server";
import { createApiProxy, type ApiProxyDependencies, type ForwardedError } from "./apiProxy";

export const DEAL_STAGES = [
  "new",
  "qualified",
  "appointment_scheduled",
  "proposal",
  "won",
  "lost",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];
export type DealStatus = "active" | "archived";

export type DealRecord = Readonly<{
  id: string;
  title: string;
  amount_eur: string | null;
  stage: DealStage;
  status: DealStatus;
  expected_close_date: string | null;
  loss_reason: string | null;
}>;

export type EditableDealRecord = DealRecord & Readonly<{
  contact_id: string;
  description: string | null;
  owner_user_id: string | null;
}>;

export type DealListResponse = Readonly<{ items: readonly DealRecord[] }>;

export type DealListResult = Readonly<
  | { status: "ready"; data: DealListResponse }
  | { status: "unauthenticated" | "forbidden" | "error" | "unavailable"; data: null }
>;

export type DealDetailResult = Readonly<
  | { status: "ready"; data: EditableDealRecord }
  | { status: "unauthenticated" | "forbidden" | "not_found" | "error" | "unavailable"; data: null }
>;

export type DealMutationResult = Readonly<
  | { status: "ready"; data: EditableDealRecord }
  | { status: "invalid" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "unavailable"; data: null }
>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEAL_QUERY_KEYS = ["include_archived"] as const;
const forwardedListErrors: readonly ForwardedError[] = [
  { status: 400, error: "invalid_query" },
  { status: 401, error: "unauthorized" },
  { status: 403, error: "forbidden" },
  { status: 502, error: "api_unavailable" },
  { status: 503, error: "api_unavailable" },
];
const forwardedDetailErrors: readonly ForwardedError[] = [
  { status: 401, error: "unauthorized" },
  { status: 403, error: "forbidden" },
  { status: 404, error: "not_found" },
  { status: 502, error: "api_unavailable" },
  { status: 503, error: "api_unavailable" },
];
const forwardedMutationErrors: readonly ForwardedError[] = [
  { status: 400, error: "invalid_body" },
  { status: 400, error: "invalid_contact", fields: [] },
  { status: 400, error: "invalid_owner", fields: [] },
  { status: 400, error: "invalid_stage", fields: [] },
  { status: 400, error: "invalid_loss_reason", fields: [] },
  { status: 401, error: "unauthorized" },
  { status: 403, error: "forbidden" },
  { status: 404, error: "not_found" },
  { status: 409, error: "invalid_stage_transition" },
  { status: 409, error: "archived" },
  { status: 502, error: "api_unavailable" },
  { status: 503, error: "api_unavailable" },
];

const MAX_BODY_BYTES = 16 * 1024;
const CREATE_FIELDS = [
  "contact_id",
  "title",
  "description",
  "amount_eur",
  "owner_user_id",
  "stage",
  "expected_close_date",
  "loss_reason",
] as const;
const UPDATE_FIELDS = [
  "title",
  "description",
  "amount_eur",
  "owner_user_id",
  "stage",
  "expected_close_date",
  "loss_reason",
] as const;

type DealHandler = (request: NextRequest) => Promise<Response>;

export function createDealsHandler(dependencies: ApiProxyDependencies): DealHandler {
  return async (request) => {
    if (request.method === "POST") {
      return proxyDealMutation(dependencies, request, "/v1/deals", "POST", CREATE_FIELDS, parseEditableDealResponse, true);
    }

    const apiPath = buildDealsApiPath(request.url);
    if (!apiPath) return reply({ error: "invalid_query" }, 400);

    const response = await createApiProxy(dependencies, {
      apiPath,
      method: "GET",
      forwardedErrors: forwardedListErrors,
      forwardTenantHeader: false,
    })(request);

    if (!response.ok) return response;
    const parsed = parseDealListResponse(await response.json().catch(() => null));
    return parsed ? reply(parsed, response.status) : reply({ error: "api_unavailable" }, 503);
  };
}

export function createDealDetailHandler(dependencies: ApiProxyDependencies): DealHandler {
  return async (request) => {
    const dealId = new URL(request.url).pathname.split("/").pop() ?? "";
    if (!UUID_PATTERN.test(dealId)) return reply({ error: "not_found" }, 404);

    const response = await createApiProxy(dependencies, {
      apiPath: `/v1/deals/${encodeURIComponent(dealId)}`,
      method: "GET",
      forwardedErrors: forwardedDetailErrors,
      forwardTenantHeader: false,
    })(request);

    if (!response.ok) return response;
    const parsed = parseEditableDealResponse(await response.json().catch(() => null));
    return parsed ? reply(parsed, response.status) : reply({ error: "api_unavailable" }, 503);
  };
}

export function createDealUpdateHandler(dependencies: ApiProxyDependencies): DealHandler {
  return async (request) => {
    const dealId = readDealId(request.url);
    if (!dealId) return reply({ error: "not_found" }, 404);
    return proxyDealMutation(
      dependencies,
      request,
      `/v1/deals/${encodeURIComponent(dealId)}`,
      "PATCH",
      UPDATE_FIELDS,
      parseEditableDealResponse,
    );
  };
}

export function createDealArchiveHandler(dependencies: ApiProxyDependencies): DealHandler {
  return async (request) => {
    const dealId = readDealId(request.url);
    if (!dealId) return reply({ error: "not_found" }, 404);
    if (!isSameOriginRequest(request)) return reply({ error: "forbidden" }, 403);
    const raw = await request.text();
    if (raw.trim().length > 0) return reply({ error: "invalid_body" }, 400);

    return proxyValidatedResponse(
      dependencies,
      withJsonBody(request, ""),
      {
        apiPath: `/v1/deals/${encodeURIComponent(dealId)}/archive`,
        method: "POST",
        forwardedErrors: forwardedMutationErrors,
        forwardTenantHeader: false,
        requireSameOrigin: true,
        maxBodyBytes: MAX_BODY_BYTES,
      },
      parseEditableDealResponse,
    );
  };
}

export function buildDealsApiPath(requestUrl: string): string | null {
  const source = new URL(requestUrl);
  const values = new URLSearchParams();
  for (const key of DEAL_QUERY_KEYS) {
    const value = source.searchParams.get(key);
    if (value === null) continue;
    if (value !== "true" && value !== "false") return null;
    values.set(key, value);
  }

  const query = values.toString();
  return query ? `/v1/deals?${query}` : "/v1/deals";
}

export function parseDealListResponse(value: unknown): DealListResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, ["items"]) || !Array.isArray(value.items)) return null;
  const items = value.items.map(parseDealResponse);
  if (items.some((item): item is null => item === null)) return null;
  return { items: items as DealRecord[] };
}

export function parseDealResponse(value: unknown): DealRecord | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "id",
    "contact_id",
    "title",
    "description",
    "amount_eur",
    "owner_user_id",
    "stage",
    "expected_close_date",
    "loss_reason",
    "status",
    "created_at",
    "updated_at",
    "archived_at",
  ])) return null;

  if (
    !isUuid(value.id) ||
    !isUuid(value.contact_id) ||
    !isNullableUuid(value.owner_user_id) ||
    !isRequiredString(value.title, 200) ||
    !isNullableString(value.description, 10_000) ||
    !isNullableAmount(value.amount_eur) ||
    !isDealStage(value.stage) ||
    !isNullableDate(value.expected_close_date) ||
    !isNullableString(value.loss_reason, 2_000) ||
    (value.status !== "active" && value.status !== "archived") ||
    !isDateString(value.created_at) ||
    !isDateString(value.updated_at) ||
    !isNullableDateTime(value.archived_at)
  ) return null;

  return {
    id: value.id,
    title: value.title.trim(),
    amount_eur: value.amount_eur,
    stage: value.stage,
    status: value.status,
    expected_close_date: value.expected_close_date,
    loss_reason: value.loss_reason === null ? null : value.loss_reason.trim(),
  };
}

export function parseEditableDealResponse(value: unknown): EditableDealRecord | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "id",
    "contact_id",
    "title",
    "description",
    "amount_eur",
    "owner_user_id",
    "stage",
    "expected_close_date",
    "loss_reason",
    "status",
    "created_at",
    "updated_at",
    "archived_at",
  ])) return null;

  const base = parseDealResponse(value);
  if (!base || !isUuid(value.contact_id) || !isNullableString(value.description, 10_000) || !isNullableUuid(value.owner_user_id)) return null;
  return {
    ...base,
    contact_id: value.contact_id,
    description: value.description === null ? null : value.description.trim(),
    owner_user_id: value.owner_user_id,
  };
}

export function parseDealListResponseResult(response: Response): Promise<DealListResult> {
  return response.json().catch(() => null).then((body: unknown) => {
    if (response.status === 401) return { status: "unauthenticated", data: null };
    if (response.status === 403) return { status: "forbidden", data: null };
    if (response.status === 400 && isErrorBody(body, "invalid_query")) return { status: "error", data: null };
    if (!response.ok) return { status: "unavailable", data: null };
    const data = parseDealListResponse(body);
    return data ? { status: "ready", data } : { status: "unavailable", data: null };
  });
}

export function parseDealDetailResponseResult(response: Response): Promise<DealDetailResult> {
  return response.json().catch(() => null).then((body: unknown) => {
    if (response.status === 401) return { status: "unauthenticated", data: null };
    if (response.status === 403) return { status: "forbidden", data: null };
    if (response.status === 404 && isErrorBody(body, "not_found")) return { status: "not_found", data: null };
    if (!response.ok) return { status: "unavailable", data: null };
    const data = parseEditableDealResponse(body);
    return data ? { status: "ready", data } : { status: "unavailable", data: null };
  });
}

export function parseDealMutationResponseResult(response: Response): Promise<DealMutationResult> {
  return response.json().catch(() => null).then((body: unknown) => {
    if (response.status === 400) return { status: "invalid", data: null };
    if (response.status === 401) return { status: "unauthenticated", data: null };
    if (response.status === 403) return { status: "forbidden", data: null };
    if (response.status === 404) return { status: "not_found", data: null };
    if (response.status === 409) return { status: "conflict", data: null };
    if (!response.ok) return { status: "unavailable", data: null };
    const data = parseEditableDealResponse(body);
    return data ? { status: "ready", data } : { status: "unavailable", data: null };
  });
}

function isDealStage(value: unknown): value is DealStage {
  return typeof value === "string" && (DEAL_STAGES as readonly string[]).includes(value);
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
  return value === null || (typeof value === "string" && value.length <= maxLength);
}

function isNullableAmount(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value));
}

function isNullableDate(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNullableDateTime(value: unknown): value is string | null {
  return value === null || isDateString(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isErrorBody(value: unknown, error: string): boolean {
  return isRecord(value) && value.error === error;
}

async function proxyDealMutation(
  dependencies: ApiProxyDependencies,
  request: NextRequest,
  apiPath: string,
  method: "POST" | "PATCH",
  allowedFields: readonly string[],
  parser: (value: unknown) => EditableDealRecord | null,
  requireCreateFields = false,
): Promise<Response> {
  if (!isSameOriginRequest(request)) return reply({ error: "forbidden" }, 403);
  const body = await readDealBody(request, allowedFields, requireCreateFields);
  if (body === null) return reply({ error: "invalid_body" }, 400);

  return proxyValidatedResponse(
    dependencies,
    withJsonBody(request, body),
    {
      apiPath,
      method,
      forwardedErrors: forwardedMutationErrors,
      forwardTenantHeader: false,
      requireSameOrigin: true,
      maxBodyBytes: MAX_BODY_BYTES,
    },
    parser,
  );
}

async function proxyValidatedResponse<T>(
  dependencies: ApiProxyDependencies,
  request: NextRequest,
  route: Parameters<typeof createApiProxy>[1],
  parser: (value: unknown) => T | null,
): Promise<Response> {
  const response = await createApiProxy(dependencies, { ...route, forwardTenantHeader: false })(request);
  if (!response.ok) return response;
  const parsed = parser(await response.json().catch(() => null));
  return parsed ? reply(parsed, response.status) : reply({ error: "api_unavailable" }, 503);
}

async function readDealBody(request: NextRequest, allowedFields: readonly string[], requireCreateFields: boolean): Promise<string | null> {
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
  if (keys.length === 0 || keys.some((key) => !allowedFields.includes(key))) return null;
  if (requireCreateFields && (!Object.hasOwn(value, "contact_id") || !Object.hasOwn(value, "title"))) return null;

  const normalized: Record<string, string | null> = {};
  for (const key of keys) {
    const fieldValue = value[key];
    if (key === "contact_id" || key === "owner_user_id") {
      if (fieldValue === null && key === "owner_user_id") {
        normalized[key] = null;
      } else if (typeof fieldValue === "string" && isUuid(fieldValue)) {
        normalized[key] = fieldValue;
      } else {
        return null;
      }
      continue;
    }
    if (key === "stage") {
      if (!isDealStage(fieldValue)) return null;
      normalized[key] = fieldValue;
      continue;
    }
    if (key === "amount_eur") {
      if (fieldValue === null) normalized[key] = null;
      else if (typeof fieldValue === "string" && /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(fieldValue.trim())) normalized[key] = fieldValue.trim();
      else return null;
      continue;
    }
    if (key === "expected_close_date") {
      if (fieldValue === null) normalized[key] = null;
      else if (isValidDate(fieldValue)) normalized[key] = fieldValue;
      else return null;
      continue;
    }
    const maxLength = key === "title" ? 200 : key === "description" ? 10_000 : 2_000;
    if (fieldValue === null) {
      if (key === "title") return null;
      normalized[key] = null;
    } else if (typeof fieldValue === "string" && fieldValue.trim().length > 0 && fieldValue.length <= maxLength && !containsControlCharacter(fieldValue)) {
      normalized[key] = fieldValue.trim();
    } else {
      return null;
    }
  }
  if (requireCreateFields && (!normalized.contact_id || !normalized.title)) return null;
  return JSON.stringify(normalized);
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });
}

function readDealId(requestUrl: string): string | null {
  const parts = new URL(requestUrl).pathname.split("/").filter(Boolean);
  const dealsIndex = parts.lastIndexOf("deals");
  const dealId = dealsIndex >= 0 ? parts[dealsIndex + 1] : undefined;
  return dealId && UUID_PATTERN.test(dealId) ? dealId : null;
}

function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === request.nextUrl.origin;
}

function withJsonBody(request: NextRequest, body: string): NextRequest {
  return new NextRequest(request.url, { method: request.method, headers: request.headers, body });
}

function reply(body: unknown, status: number): Response {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
