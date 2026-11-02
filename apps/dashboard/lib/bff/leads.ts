import { NextRequest, NextResponse } from "next/server";
import { createApiProxy, type ApiProxyDependencies, type ForwardedError } from "./apiProxy";

export type LeadRecord = Readonly<{
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  source: string;
  status: LeadLifecycleStatus;
  next_action: LeadNextAction | null;
  created_at: string;
  updated_at: string;
}>;

export const LEAD_LIFECYCLE_STATUSES = [
  "new",
  "qualified",
  "appointment_scheduled",
  "proposal",
  "won",
  "lost",
] as const;

export type LeadLifecycleStatus = (typeof LEAD_LIFECYCLE_STATUSES)[number];

export type LeadNextAction = Readonly<{
  label: string;
  due_at: string | null;
}>;

export type LeadListResponse = Readonly<{
  items: readonly LeadRecord[];
  next_cursor: string | null;
}>;

export type LeadQuery = Readonly<{
  q?: string;
  status?: LeadLifecycleStatus;
  limit?: string;
  cursor?: string;
}>;

export type LeadListResult = Readonly<
  | { status: "ready"; data: LeadListResponse }
  | { status: "unauthenticated" | "forbidden" | "invalid_query" | "error" | "unavailable"; data: null }
>;

export type LeadDetailResult = Readonly<
  | { status: "ready"; data: LeadRecord }
  | { status: "unauthenticated" | "forbidden" | "not_found" | "error" | "unavailable"; data: null }
>;

export type LeadStatusMutationResponse = Readonly<{
  id: string;
  status: LeadLifecycleStatus;
  next_action: null;
  updated_at: string;
}>;

export type LeadStatusUpdateResult = Readonly<
  | { status: "updated"; data: LeadStatusMutationResponse }
  | {
      status:
        | "unauthenticated"
        | "forbidden"
        | "not_found"
        | "invalid_status_transition"
        | "invalid_request"
        | "unavailable";
      data: null;
    }
>;

export const LEAD_QUERY_KEYS = ["q", "status", "limit", "cursor"] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
const forwardedStatusMutationErrors: readonly ForwardedError[] = [
  { status: 401, error: "unauthorized" },
  { status: 403, error: "forbidden" },
  { status: 404, error: "not_found" },
  { status: 409, error: "invalid_status_transition" },
  { status: 502, error: "api_unavailable" },
  { status: 503, error: "api_unavailable" },
];

type LeadHandler = (request: NextRequest) => Promise<Response>;

export function createLeadsHandler(dependencies: ApiProxyDependencies): LeadHandler {
  return async (request) => {
    const apiPath = buildLeadsApiPath(request.url);
    if (!apiPath) return reply({ error: "invalid_query" }, 400);

    const response = await createApiProxy(dependencies, {
      apiPath,
      method: "GET",
      forwardedErrors: forwardedListErrors,
    })(request);

    if (!response.ok) return response;
    const parsed = parseLeadListResponse(await response.json().catch(() => null));
    return parsed ? reply(parsed, response.status) : reply({ error: "api_unavailable" }, 503);
  };
}

export function createLeadDetailHandler(dependencies: ApiProxyDependencies): LeadHandler {
  return async (request) => {
    const leadId = new URL(request.url).pathname.split("/").pop() ?? "";
    if (!UUID_PATTERN.test(leadId)) return reply({ error: "not_found" }, 404);

    const response = await createApiProxy(dependencies, {
      apiPath: `/v1/leads/${encodeURIComponent(leadId)}`,
      method: "GET",
      forwardedErrors: forwardedDetailErrors,
    })(request);

    if (!response.ok) return response;
    const parsed = parseLeadRecord(await response.json().catch(() => null));
    return parsed ? reply(parsed, response.status) : reply({ error: "api_unavailable" }, 503);
  };
}

export function createLeadStatusHandler(dependencies: ApiProxyDependencies): LeadHandler {
  return async (request) => {
    const leadId = new URL(request.url).pathname.split("/").at(-2) ?? "";
    if (!UUID_PATTERN.test(leadId)) return reply({ error: "not_found" }, 404);

    const body = await readLeadStatusBody(request);
    if (body === null) return reply({ error: "invalid_body" }, 400);

    const response = await createApiProxy(dependencies, {
      apiPath: `/v1/leads/${encodeURIComponent(leadId)}/status`,
      method: "PATCH",
      forwardedErrors: forwardedStatusMutationErrors,
      forwardTenantHeader: false,
      requireSameOrigin: true,
      maxBodyBytes: 8 * 1024,
    })(withJsonBody(request, body));

    if (!response.ok) return response;
    const parsed = parseLeadStatusMutationResponse(await response.json().catch(() => null));
    return parsed ? reply(parsed, response.status) : reply({ error: "api_unavailable" }, 503);
  };
}

export function createLeadsRequest(sessionCookieValue: string, query: LeadQuery = {}): NextRequest {
  const url = new URL("https://conversion-engine.internal/api/leads");
  appendWhitelistedQuery(url.searchParams, query);
  return new NextRequest(url, { headers: { cookie: `__Host-ce_session=${sessionCookieValue}` } });
}

export function buildLeadsApiPath(requestUrl: string): string | null {
  const source = new URL(requestUrl);
  const params = new URLSearchParams();

  for (const key of LEAD_QUERY_KEYS) {
    const value = source.searchParams.get(key);
    if (value === null || value.trim().length === 0) continue;
    if (!isValidQueryValue(key, value.trim())) return null;
    params.set(key, value.trim());
  }

  const query = params.toString();
  return query ? `/v1/leads?${query}` : "/v1/leads";
}

export function parseLeadListResponse(value: unknown): LeadListResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, ["items", "next_cursor"]) || !Array.isArray(value.items)) return null;
  if (value.next_cursor !== null && !isBoundedString(value.next_cursor, 512)) return null;

  const items = value.items.map(parseLeadRecord);
  if (items.some((item): item is null => item === null)) return null;
  return { items: items as LeadRecord[], next_cursor: value.next_cursor };
}

export function parseLeadDetailResponse(value: unknown): LeadRecord | null {
  return parseLeadRecord(value);
}

export function parseLeadListResponseResult(response: Response): Promise<LeadListResult> {
  return response.json().catch(() => null).then((body: unknown) => {
    if (response.status === 401) return { status: "unauthenticated", data: null };
    if (response.status === 403) return { status: "forbidden", data: null };
    if (response.status === 400 && isErrorBody(body, "invalid_query")) return { status: "invalid_query", data: null };
    if (response.status === 400 && isErrorBody(body, "api_error")) return { status: "error", data: null };
    if (!response.ok) return { status: "unavailable", data: null };
    const data = parseLeadListResponse(body);
    return data ? { status: "ready", data } : { status: "unavailable", data: null };
  });
}

export function parseLeadDetailResponseResult(response: Response): Promise<LeadDetailResult> {
  return response.json().catch(() => null).then((body: unknown) => {
    if (response.status === 401) return { status: "unauthenticated", data: null };
    if (response.status === 403) return { status: "forbidden", data: null };
    if (response.status === 404 && isErrorBody(body, "not_found")) return { status: "not_found", data: null };
    if (response.status === 400 && isErrorBody(body, "api_error")) return { status: "error", data: null };
    if (!response.ok) return { status: "unavailable", data: null };
    const data = parseLeadDetailResponse(body);
    return data ? { status: "ready", data } : { status: "unavailable", data: null };
  });
}

export async function updateLeadStatus(
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  leadId: string,
  status: LeadLifecycleStatus,
): Promise<LeadStatusUpdateResult> {
  if (!UUID_PATTERN.test(leadId) || !isLeadLifecycleStatus(status)) {
    return { status: "invalid_request", data: null };
  }

  try {
    const response = await fetcher(`/api/leads/${encodeURIComponent(leadId)}/status`, {
      method: "PATCH",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = await response.json().catch(() => null);
    if (response.status === 401) return { status: "unauthenticated", data: null };
    if (response.status === 403) return { status: "forbidden", data: null };
    if (response.status === 404 && isErrorBody(body, "not_found")) return { status: "not_found", data: null };
    if (response.status === 409 && isErrorBody(body, "invalid_status_transition")) {
      return { status: "invalid_status_transition", data: null };
    }
    if (response.status === 400 && isErrorBody(body, "invalid_body")) return { status: "invalid_request", data: null };
    if (!response.ok) return { status: "unavailable", data: null };
    const data = parseLeadStatusMutationResponse(body);
    return data ? { status: "updated", data } : { status: "unavailable", data: null };
  } catch {
    return { status: "unavailable", data: null };
  }
}

function appendWhitelistedQuery(params: URLSearchParams, query: LeadQuery): void {
  for (const key of LEAD_QUERY_KEYS) {
    const value = query[key];
    if (typeof value === "string" && value.trim().length > 0 && isValidQueryValue(key, value.trim())) {
      params.set(key, value.trim());
    }
  }
}

function isValidQueryValue(key: (typeof LEAD_QUERY_KEYS)[number], value: string): boolean {
  if (key === "q") return value.length <= 100;
  if (key === "status") return isLeadLifecycleStatus(value);
  if (key === "limit") return /^(?:[1-9]|[1-4][0-9]|50)$/.test(value);
  return value.length <= 512;
}

function parseLeadRecord(value: unknown): LeadRecord | null {
  if (!isRecord(value)) return null;
  if (!hasExactKeys(value, ["id", "name", "email", "phone", "message", "source", "status", "next_action", "created_at", "updated_at"])) return null;
  if (
    typeof value.id !== "string" || !UUID_PATTERN.test(value.id) ||
    !isBoundedString(value.name, 200) || !isBoundedString(value.email, 320) ||
    (value.phone !== null && !isBoundedString(value.phone, 80)) ||
    !isBoundedString(value.message, 5_000) || !isBoundedString(value.source, 100) ||
    typeof value.status !== "string" || !isLeadLifecycleStatus(value.status) || !isValidLeadNextAction(value.next_action) ||
    !isDateString(value.created_at) || !isDateString(value.updated_at)
  ) return null;

  return {
    id: value.id.trim(),
    name: value.name.trim(),
    email: value.email.trim(),
    phone: value.phone === null ? null : value.phone.trim(),
    message: value.message,
    source: value.source.trim(),
    status: value.status,
    next_action: parseLeadNextAction(value.next_action),
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

export function parseLeadStatusMutationResponse(value: unknown): LeadStatusMutationResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "status", "next_action", "updated_at"])) return null;
  if (
    typeof value.id !== "string" || !UUID_PATTERN.test(value.id) ||
    typeof value.status !== "string" || !isLeadLifecycleStatus(value.status) ||
    value.next_action !== null || !isDateString(value.updated_at)
  ) return null;

  return {
    id: value.id,
    status: value.status,
    next_action: null,
    updated_at: value.updated_at,
  };
}

function parseLeadNextAction(value: unknown): LeadNextAction | null {
  if (value === null) return null;
  if (!isRecord(value) || !hasExactKeys(value, ["label", "due_at"])) return null;
  if (!isBoundedString(value.label, 200)) return null;
  if (value.due_at !== null && !isDateString(value.due_at)) return null;
  return {
    label: value.label.trim(),
    due_at: value.due_at,
  };
}

function isValidLeadNextAction(value: unknown): boolean {
  return value === null || parseLeadNextAction(value) !== null;
}

export function isLeadLifecycleStatus(value: string): value is LeadLifecycleStatus {
  return (LEAD_LIFECYCLE_STATUSES as readonly string[]).includes(value);
}

function isErrorBody(value: unknown, error: string): boolean {
  return isRecord(value) && value.error === error;
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function reply(body: unknown, status: number): Response {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function readLeadStatusBody(request: NextRequest): Promise<string | null> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return null;

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8 * 1024) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !hasExactKeys(value, ["status"]) || typeof value.status !== "string" || !isLeadLifecycleStatus(value.status)) {
      return null;
    }
    return JSON.stringify({ status: value.status });
  } catch {
    return null;
  }
}

function withJsonBody(request: NextRequest, body: string): NextRequest {
  return new NextRequest(request.url, { method: "PATCH", headers: request.headers, body });
}
