import { NextRequest, NextResponse } from "next/server";
import { createApiProxy, type ApiProxyDependencies, type ForwardedError } from "./apiProxy";

export const TEAM_MEMBER_CRM_PERMISSION_KEYS = [
  "crm:read",
  "crm:create",
  "crm:update",
  "crm:archive",
] as const;

export type TeamMemberCrmPermission = (typeof TEAM_MEMBER_CRM_PERMISSION_KEYS)[number];
export type TeamMemberResponse = Readonly<{
  id: string;
  label: string;
  role: "owner" | "tenant_admin" | "team_member";
  status: "active" | "invited" | "disabled";
  permissions: Readonly<Record<TeamMemberCrmPermission, boolean>>;
}>;

export type TeamMemberListResponse = Readonly<{ items: readonly TeamMemberResponse[] }>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4 * 1024;
const noStore = { "Cache-Control": "no-store" };
const forwardedListErrors: readonly ForwardedError[] = [
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
  { status: 409, error: "conflict" },
  { status: 502, error: "api_unavailable" },
  { status: 503, error: "api_unavailable" },
];

type TeamMemberHandler = (request: NextRequest) => Promise<Response>;

export function createTeamMembersHandler(dependencies: ApiProxyDependencies): TeamMemberHandler {
  return async (request) => proxyValidatedResponse(
    dependencies,
    request,
    { apiPath: "/v1/team/members", method: "GET", forwardedErrors: forwardedListErrors },
    parseTeamMemberListResponse,
  );
}

export function createTeamMemberPermissionHandler(dependencies: ApiProxyDependencies): TeamMemberHandler {
  return createMutationHandler(dependencies, "permissions");
}

export function createTeamMemberRoleHandler(dependencies: ApiProxyDependencies): TeamMemberHandler {
  return createMutationHandler(dependencies, "role");
}

function createMutationHandler(
  dependencies: ApiProxyDependencies,
  operation: "permissions" | "role",
): TeamMemberHandler {
  return async (request) => {
    const memberId = readMemberId(request.url);
    if (!memberId) return reply({ error: "not_found" }, 404);
    if (!isSameOriginRequest(request)) return reply({ error: "forbidden" }, 403);

    const body = await readControlledBody(request, operation);
    if (body === null) return reply({ error: "invalid_body" }, 400);

    return proxyValidatedResponse(
      dependencies,
      withJsonBody(request, body),
      {
        apiPath: `/v1/team/members/${encodeURIComponent(memberId)}/${operation}`,
        method: "PATCH",
        forwardedErrors: forwardedMutationErrors,
        forwardTenantHeader: false,
        requireSameOrigin: true,
        maxBodyBytes: MAX_BODY_BYTES,
      },
      parseTeamMemberResponse,
    );
  };
}

export function parseTeamMemberListResponse(value: unknown): TeamMemberListResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, ["items"]) || !Array.isArray(value.items)) return null;
  const items = value.items.map(parseTeamMemberResponse);
  if (items.some((item): item is null => item === null)) return null;
  const parsed = items as TeamMemberResponse[];
  return new Set(parsed.map((item) => item.id)).size === parsed.length ? { items: parsed } : null;
}

export function parseTeamMemberResponse(value: unknown): TeamMemberResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "label", "role", "status", "permissions"])) return null;
  if (!isUuid(value.id) || !isBoundedString(value.label, 200)) return null;
  if (!isTeamMemberRole(value.role) || !isTeamMemberStatus(value.status)) return null;
  const rawPermissions = value.permissions;
  if (!isRecord(rawPermissions) || !hasExactKeys(rawPermissions, TEAM_MEMBER_CRM_PERMISSION_KEYS)) return null;

  const permissions = Object.fromEntries(
    TEAM_MEMBER_CRM_PERMISSION_KEYS.map((permission) => [permission, rawPermissions[permission]]),
  ) as Record<TeamMemberCrmPermission, boolean>;
  if (TEAM_MEMBER_CRM_PERMISSION_KEYS.some((permission) => typeof permissions[permission] !== "boolean")) return null;

  return { id: value.id, label: value.label.trim(), role: value.role, status: value.status, permissions };
}

async function readControlledBody(request: NextRequest, operation: "permissions" | "role"): Promise<string | null> {
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
  if (operation === "permissions") {
    if (!hasExactKeys(value, ["permission", "enabled"]) || !isTeamMemberCrmPermission(value.permission) || typeof value.enabled !== "boolean") return null;
    return JSON.stringify({ permission: value.permission, enabled: value.enabled });
  }
  if (!hasExactKeys(value, ["role"]) || (value.role !== "tenant_admin" && value.role !== "team_member")) return null;
  return JSON.stringify({ role: value.role });
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

function readMemberId(requestUrl: string): string | null {
  const parts = new URL(requestUrl).pathname.split("/").filter(Boolean);
  const membersIndex = parts.lastIndexOf("members");
  const memberId = membersIndex >= 0 ? parts[membersIndex + 1] : undefined;
  return memberId && UUID_PATTERN.test(memberId) ? memberId : null;
}

function withJsonBody(request: NextRequest, body: string): NextRequest {
  return new NextRequest(request.url, { method: request.method, headers: request.headers, body });
}

function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === request.nextUrl.origin;
}

function reply(body: unknown, status: number): Response {
  return NextResponse.json(body, { status, headers: noStore });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isTeamMemberCrmPermission(value: unknown): value is TeamMemberCrmPermission {
  return typeof value === "string" && (TEAM_MEMBER_CRM_PERMISSION_KEYS as readonly string[]).includes(value);
}

function isTeamMemberRole(value: unknown): value is TeamMemberResponse["role"] {
  return value === "owner" || value === "tenant_admin" || value === "team_member";
}

function isTeamMemberStatus(value: unknown): value is TeamMemberResponse["status"] {
  return value === "active" || value === "invited" || value === "disabled";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}
