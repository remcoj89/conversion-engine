import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../session/cookies";
import { createApiProxy, type ApiProxyDependencies, type ForwardedError } from "./apiProxy";

export type PlatformTenantDetailResponse = Readonly<{
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
  }>;
}>;

export type PlatformTenantDetailResult = Readonly<
  | { status: "ready"; data: PlatformTenantDetailResponse }
  | { status: "unauthenticated" | "forbidden" | "not_found" | "invalid_tenant_id" | "unavailable"; data: null }
>;

const forwardedErrors: readonly ForwardedError[] = [
  { status: 400, error: "invalid_tenant_id" },
  { status: 401, error: "unauthorized" },
  { status: 403, error: "forbidden" },
  { status: 404, error: "not_found" },
  { status: 502, error: "api_unavailable" },
  { status: 503, error: "api_unavailable" },
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "no-store" };

type PlatformTenantDetailHandler = (
  request: NextRequest,
  tenantId: string,
) => Promise<Response>;

// The caller supplies the dynamic path segment explicitly. This prevents query parameters or
// browser-selected tenant headers from becoming an alternate tenant selector.
export function createPlatformTenantDetailHandler(
  dependencies: ApiProxyDependencies,
): PlatformTenantDetailHandler {
  return async (request, tenantId) => {
    if (!UUID_PATTERN.test(tenantId)) {
      return NextResponse.json({ error: "invalid_tenant_id" }, { status: 400, headers: noStore });
    }

    const proxy = createApiProxy(dependencies, {
      apiPath: `/v1/platform/tenants/${encodeURIComponent(tenantId)}`,
      method: "GET",
      forwardedErrors,
      forwardTenantHeader: false,
    });
    const response = await proxy(request);

    if (!response.ok) return response;

    const parsed = await response.json().catch(() => null);
    const validated = parsePlatformTenantDetailResponseBody(parsed);
    if (!validated) {
      return NextResponse.json(
        { error: "api_unavailable" },
        { status: 503, headers: noStore },
      );
    }

    // Re-serialize the allowlisted contract so upstream additions cannot reach the browser.
    return NextResponse.json(validated, { status: response.status, headers: noStore });
  };
}

export function createPlatformTenantDetailRequest(
  sessionCookieValue: string,
  tenantId: string,
): NextRequest {
  return new NextRequest(
    `https://conversion-engine.internal/api/admin/clients/${encodeURIComponent(tenantId)}`,
    { headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionCookieValue}` } },
  );
}

export function parsePlatformTenantDetailResponse(
  response: Response,
): Promise<PlatformTenantDetailResult> {
  return response
    .json()
    .catch(() => null)
    .then((body: unknown) => {
      if (response.status === 401) return { status: "unauthenticated", data: null };
      if (response.status === 403) return { status: "forbidden", data: null };
      if (response.status === 404 && isErrorBody(body, "not_found")) {
        return { status: "not_found", data: null };
      }
      if (response.status === 400 && isErrorBody(body, "invalid_tenant_id")) {
        return { status: "invalid_tenant_id", data: null };
      }
      if (!response.ok) return { status: "unavailable", data: null };

      const data = parsePlatformTenantDetailResponseBody(body);
      return data ? { status: "ready", data } : { status: "unavailable", data: null };
    });
}

export function parsePlatformTenantDetailResponseBody(
  value: unknown,
): PlatformTenantDetailResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "name", "status", "created_at", "onboarding", "website_summary"])) {
    return null;
  }
  if (
    typeof value.id !== "string" || !UUID_PATTERN.test(value.id) ||
    !isBoundedString(value.name, 200) ||
    !isBoundedString(value.status, 64) ||
    !isDateString(value.created_at)
  ) {
    return null;
  }

  const onboarding = value.onboarding === null ? null : parseOnboarding(value.onboarding);
  const websiteSummary = parseWebsiteSummary(value.website_summary);
  if (value.onboarding !== null && !onboarding) return null;
  if (!websiteSummary) return null;

  return {
    id: value.id.trim(),
    name: value.name.trim(),
    status: value.status.trim(),
    created_at: value.created_at,
    onboarding,
    website_summary: websiteSummary,
  };
}

function parseOnboarding(value: unknown): PlatformTenantDetailResponse["onboarding"] {
  if (!isRecord(value) || !hasExactKeys(value, ["status", "version", "updated_at"])) return null;
  if (
    !isBoundedString(value.status, 64) ||
    !isPositiveInteger(value.version) ||
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

function parseWebsiteSummary(value: unknown): PlatformTenantDetailResponse["website_summary"] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["total", "active"])) return null;
  if (
    !isNonNegativeInteger(value.total) ||
    !isNonNegativeInteger(value.active) ||
    value.active > value.total
  ) {
    return null;
  }

  return { total: value.total, active: value.active };
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
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

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
