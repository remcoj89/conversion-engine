import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../session/cookies";
import { createApiProxy, type ApiProxyDependencies, type ForwardedError } from "./apiProxy";

export type PlatformTenantMutation = Readonly<{
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
  purge_after_at: string | null;
}>;

export type PlatformTenantMutationOperation = "create" | "rename" | "disable" | "reactivate";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "no-store" };
const forwardedErrors: readonly ForwardedError[] = [
  { status: 400, error: "invalid_body" },
  { status: 400, error: "invalid_tenant_id" },
  { status: 401, error: "unauthorized" },
  { status: 403, error: "forbidden" },
  { status: 404, error: "not_found" },
  { status: 502, error: "api_unavailable" },
  { status: 503, error: "api_unavailable" },
];

type MutationHandler = (request: NextRequest, tenantId?: string) => Promise<Response>;

export function createPlatformTenantMutationHandler(
  dependencies: ApiProxyDependencies,
  operation: PlatformTenantMutationOperation,
): MutationHandler {
  return async (request, tenantId) => {
    if (operation !== "create" && (!tenantId || !UUID_PATTERN.test(tenantId))) {
      return NextResponse.json({ error: "invalid_tenant_id" }, { status: 400, headers: noStore });
    }

    const proxy = createApiProxy(dependencies, {
      apiPath: buildApiPath(operation, tenantId),
      method: operation === "rename" ? "PATCH" : "POST",
      forwardedErrors,
      forwardTenantHeader: false,
      requireSameOrigin: true,
      maxBodyBytes: 4_096,
    });
    const response = await proxy(request);
    if (!response.ok) return response;

    const parsed = await response.json().catch(() => null);
    const validated = parsePlatformTenantMutation(parsed);
    if (!validated) {
      return NextResponse.json({ error: "api_unavailable" }, { status: 503, headers: noStore });
    }

    return NextResponse.json(validated, { status: response.status, headers: noStore });
  };
}

export function createPlatformTenantMutationRequest(
  sessionCookieValue: string,
  operation: PlatformTenantMutationOperation,
  tenantId?: string,
  body?: Readonly<{ name?: string }>,
): NextRequest {
  const url = new URL(`https://conversion-engine.internal${buildApiPath(operation, tenantId)}`);
  const init = {
    method: operation === "rename" ? "PATCH" : "POST",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${sessionCookieValue}`,
      origin: url.origin,
      "content-type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  };
  return new NextRequest(url, init);
}

export function parsePlatformTenantMutation(value: unknown): PlatformTenantMutation | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "id",
    "name",
    "status",
    "created_at",
    "updated_at",
    "disabled_at",
    "purge_after_at",
  ])) return null;

  if (
    typeof value.id !== "string" || !UUID_PATTERN.test(value.id) ||
    !isBoundedString(value.name, 200) ||
    !isBoundedString(value.status, 64) ||
    !isDateString(value.created_at) ||
    !isDateString(value.updated_at) ||
    !isNullableDateString(value.disabled_at) ||
    !isNullableDateString(value.purge_after_at)
  ) return null;

  return {
    id: value.id.trim(),
    name: value.name.trim(),
    status: value.status.trim(),
    created_at: value.created_at,
    updated_at: value.updated_at,
    disabled_at: value.disabled_at,
    purge_after_at: value.purge_after_at,
  };
}

function buildApiPath(operation: PlatformTenantMutationOperation, tenantId?: string): string {
  if (operation === "create") return "/v1/platform/tenants";
  const encodedTenantId = encodeURIComponent(tenantId ?? "");
  if (operation === "rename") return `/v1/platform/tenants/${encodedTenantId}`;
  return `/v1/platform/tenants/${encodedTenantId}/${operation}`;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function isNullableDateString(value: unknown): value is string | null {
  return value === null || isDateString(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
