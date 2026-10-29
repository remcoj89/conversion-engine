import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../session/cookies";
import { createApiProxy, type ApiProxyDependencies, type ForwardedError } from "./apiProxy";

export type PlatformTenantQuery = Readonly<{
  q?: string;
  status?: string;
  onboarding_status?: string;
  limit?: string;
  cursor?: string;
}>;

export type PlatformTenant = Readonly<{
  id: string;
  name: string;
  status: string;
  created_at: string;
  onboarding: Readonly<{
    status: string;
    version: number;
    updated_at: string;
  }> | null;
  website_summary: Readonly<{
    total: number;
    active: number;
  }> | null;
}>;

export type PlatformTenantListResponse = Readonly<{
  items: readonly PlatformTenant[];
  next_cursor: string | null;
}>;

export type PlatformTenantListResult = Readonly<
  | { status: "ready"; data: PlatformTenantListResponse }
  | { status: "unauthenticated" | "forbidden" | "invalid_query" | "unavailable"; data: null }
>;

export const PLATFORM_TENANT_QUERY_KEYS = [
  "q",
  "status",
  "onboarding_status",
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

type PlatformTenantsHandler = (request: NextRequest) => Promise<Response>;

// Only the documented list filters reach the platform API. Browser-controlled tenant
// context is deliberately disabled because this is a platform-scoped route.
export function createPlatformTenantsHandler(
  dependencies: ApiProxyDependencies,
): PlatformTenantsHandler {
  return async (request) => {
    const apiPath = buildPlatformTenantsApiPath(request.url);
    const proxy = createApiProxy(dependencies, {
      apiPath,
      method: "GET",
      forwardedErrors,
      forwardTenantHeader: false,
    });
    const response = await proxy(request);

    if (!response.ok) return response;

    const parsed = await response.json().catch(() => null);
    const validated = parsePlatformTenantListResponse(parsed);
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

export function createPlatformTenantsRequest(
  sessionCookieValue: string,
  query: PlatformTenantQuery = {},
): NextRequest {
  const url = new URL("https://conversion-engine.internal/api/admin/clients");
  appendWhitelistedQuery(url.searchParams, query);

  return new NextRequest(url, {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${sessionCookieValue}`,
    },
  });
}

export function buildWhitelistedQuery(query: PlatformTenantQuery): URLSearchParams {
  const params = new URLSearchParams();
  appendWhitelistedQuery(params, query);
  return params;
}

export function parsePlatformTenantResponse(
  response: Response,
): Promise<PlatformTenantListResult> {
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

      const data = parsePlatformTenantListResponse(body);
      return data ? { status: "ready", data } : { status: "unavailable", data: null };
    });
}

export function parsePlatformTenantListResponse(value: unknown): PlatformTenantListResponse | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  if (value.next_cursor !== null && !isBoundedString(value.next_cursor, 512)) return null;

  const items = value.items.map(parsePlatformTenant);
  if (items.some((item): item is null => item === null)) return null;

  return {
    items: items as PlatformTenant[],
    next_cursor: value.next_cursor,
  };
}

function buildPlatformTenantsApiPath(requestUrl: string): string {
  const requestUrlObject = new URL(requestUrl);
  const query = new URLSearchParams();
  for (const key of PLATFORM_TENANT_QUERY_KEYS) {
    const value = requestUrlObject.searchParams.get(key);
    if (value !== null && value.trim().length > 0) query.set(key, value);
  }

  const queryString = query.toString();
  return queryString.length > 0 ? `/v1/platform/tenants?${queryString}` : "/v1/platform/tenants";
}

function appendWhitelistedQuery(params: URLSearchParams, query: PlatformTenantQuery): void {
  for (const key of PLATFORM_TENANT_QUERY_KEYS) {
    const value = query[key];
    if (typeof value === "string" && value.trim().length > 0) {
      params.set(key, value.trim());
    }
  }
}

function parsePlatformTenant(value: unknown): PlatformTenant | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" || !UUID_PATTERN.test(value.id) ||
    !isBoundedString(value.name, 200) ||
    !isBoundedString(value.status, 64) ||
    !isDateString(value.created_at)
  ) {
    return null;
  }

  const onboarding = value.onboarding === null ? null : parseOnboarding(value.onboarding);
  const websiteSummary = value.website_summary === null
    ? null
    : parseWebsiteSummary(value.website_summary);

  if (value.onboarding !== null && !onboarding) return null;
  if (value.website_summary !== null && !websiteSummary) return null;

  return {
    id: value.id.trim(),
    name: value.name.trim(),
    status: value.status.trim(),
    created_at: value.created_at,
    onboarding,
    website_summary: websiteSummary,
  };
}

function parseOnboarding(value: unknown): PlatformTenant["onboarding"] {
  if (!isRecord(value)) return null;
  if (
    !isBoundedString(value.status, 64) ||
    !isNonNegativeInteger(value.version) ||
    !isDateString(value.updated_at)
  ) {
    return null;
  }

  return {
    status: value.status.trim(),
    version: value.version,
    updated_at: value.updated_at,
  };
}

function parseWebsiteSummary(value: unknown): PlatformTenant["website_summary"] {
  if (!isRecord(value)) return null;
  if (
    !isNonNegativeInteger(value.total) ||
    !isNonNegativeInteger(value.active) ||
    value.active > value.total
  ) {
    return null;
  }

  return { total: value.total, active: value.active };
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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
