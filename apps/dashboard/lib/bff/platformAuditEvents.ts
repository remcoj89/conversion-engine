import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../session/cookies";
import { createApiProxy, type ApiProxyDependencies, type ForwardedError } from "./apiProxy";

export type PlatformAuditEventQuery = Readonly<{
  tenant_id?: string;
  event_type?: string;
  from?: string;
  to?: string;
  limit?: string;
  cursor?: string;
}>;

export type PlatformAuditEvent = Readonly<{
  id: string;
  tenant_id: string;
  project_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  version: number | null;
  actor_type: "member" | "reviewer";
  actor_id: string | null;
  created_at: string;
  request_or_correlation_id: string | null;
}>;

export type PlatformAuditEventListResponse = Readonly<{
  items: readonly PlatformAuditEvent[];
  next_cursor: string | null;
}>;

export type PlatformAuditEventListResult = Readonly<
  | { status: "ready"; data: PlatformAuditEventListResponse }
  | { status: "unauthenticated" | "forbidden" | "invalid_query" | "unavailable"; data: null }
>;

export const PLATFORM_AUDIT_EVENT_QUERY_KEYS = [
  "tenant_id",
  "event_type",
  "from",
  "to",
  "limit",
  "cursor",
] as const;

const forwardedErrors: readonly ForwardedError[] = [
  { status: 400, error: "invalid_query" },
  { status: 401, error: "unauthorized" },
  { status: 403, error: "forbidden" },
  { status: 502, error: "api_unavailable" },
  { status: 503, error: "api_unavailable" },
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set([
  "submitted",
  "review_requested",
  "resubmitted",
  "blocked",
  "unblocked",
  "approved",
  "reopened",
  "read_onboarding_content",
]);
const STATUS_VALUES = new Set(["draft", "submitted", "review_needed", "blocked", "approved"]);

type PlatformAuditEventsHandler = (request: NextRequest) => Promise<Response>;

// Only the documented audit filters reach the platform API. Browser-controlled tenant context is
// deliberately disabled because this is a platform-scoped route.
export function createPlatformAuditEventsHandler(
  dependencies: ApiProxyDependencies,
): PlatformAuditEventsHandler {
  return async (request) => {
    const apiPath = buildPlatformAuditEventsApiPath(request.url);
    const proxy = createApiProxy(dependencies, {
      apiPath,
      method: "GET",
      forwardedErrors,
      forwardTenantHeader: false,
    });
    const response = await proxy(request);

    if (!response.ok) return response;

    const parsed = await response.json().catch(() => null);
    const validated = parsePlatformAuditEventListResponse(parsed);
    if (!validated) {
      return NextResponse.json(
        { error: "api_unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Return the sanitized contract, never the untrusted upstream object.
    return NextResponse.json(validated, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  };
}

export function createPlatformAuditEventsRequest(
  sessionCookieValue: string,
  query: PlatformAuditEventQuery = {},
): NextRequest {
  const url = new URL("https://conversion-engine.internal/api/admin/audit-events");
  appendWhitelistedQuery(url.searchParams, query);

  return new NextRequest(url, {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${sessionCookieValue}`,
    },
  });
}

export function buildWhitelistedAuditEventQuery(query: PlatformAuditEventQuery): URLSearchParams {
  const params = new URLSearchParams();
  appendWhitelistedQuery(params, query);
  return params;
}

export function parsePlatformAuditEventResponse(
  response: Response,
): Promise<PlatformAuditEventListResult> {
  return response
    .json()
    .catch(() => null)
    .then((body: unknown) => {
      if (response.status === 401) return { status: "unauthenticated", data: null };
      if (response.status === 403) return { status: "forbidden", data: null };
      if (response.status === 400 && isErrorBody(body, "invalid_query")) {
        return { status: "invalid_query", data: null };
      }
      if (!response.ok) return { status: "unavailable", data: null };

      const data = parsePlatformAuditEventListResponse(body);
      return data ? { status: "ready", data } : { status: "unavailable", data: null };
    });
}

export function parsePlatformAuditEventListResponse(value: unknown): PlatformAuditEventListResponse | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  if (value.next_cursor !== null && !isBoundedString(value.next_cursor, 512)) return null;

  const items = value.items.map(parsePlatformAuditEvent);
  if (items.some((item): item is null => item === null)) return null;

  return {
    items: items as PlatformAuditEvent[],
    next_cursor: value.next_cursor,
  };
}

function buildPlatformAuditEventsApiPath(requestUrl: string): string {
  const requestUrlObject = new URL(requestUrl);
  const query = new URLSearchParams();
  for (const key of PLATFORM_AUDIT_EVENT_QUERY_KEYS) {
    const value = requestUrlObject.searchParams.get(key);
    if (value !== null && value.trim().length > 0) query.set(key, value);
  }

  const queryString = query.toString();
  return queryString.length > 0 ? `/v1/platform/audit-events?${queryString}` : "/v1/platform/audit-events";
}

function appendWhitelistedQuery(params: URLSearchParams, query: PlatformAuditEventQuery): void {
  for (const key of PLATFORM_AUDIT_EVENT_QUERY_KEYS) {
    const value = query[key];
    if (typeof value === "string" && value.trim().length > 0) params.set(key, value.trim());
  }
}

function parsePlatformAuditEvent(value: unknown): PlatformAuditEvent | null {
  if (!isRecord(value)) return null;
  if (
    !isUuid(value.id) ||
    !isUuid(value.tenant_id) ||
    !isUuid(value.project_id) ||
    !isBoundedString(value.event_type, 64) ||
    !EVENT_TYPES.has(value.event_type) ||
    !isNullableStatus(value.from_status) ||
    !isNullableStatus(value.to_status) ||
    !isNullablePositiveInteger(value.version) ||
    (value.actor_type !== "member" && value.actor_type !== "reviewer") ||
    !isNullableUuid(value.actor_id) ||
    !isDateString(value.created_at) ||
    !isNullableBoundedString(value.request_or_correlation_id, 255)
  ) {
    return null;
  }

  return {
    id: value.id,
    tenant_id: value.tenant_id,
    project_id: value.project_id,
    event_type: value.event_type,
    from_status: value.from_status,
    to_status: value.to_status,
    version: value.version,
    actor_type: value.actor_type,
    actor_id: value.actor_id,
    created_at: value.created_at,
    request_or_correlation_id: value.request_or_correlation_id,
  };
}

function isNullableStatus(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && STATUS_VALUES.has(value));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
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

function isNullableBoundedString(value: unknown, maxLength: number): value is string | null {
  return value === null || isBoundedString(value, maxLength);
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
