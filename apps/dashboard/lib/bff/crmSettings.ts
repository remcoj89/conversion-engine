/** Frontend contract for the tenant CRM settings response and BFF boundary. */

import { NextRequest, NextResponse } from "next/server";
import { createApiProxy, type ApiProxyDependencies, type ForwardedError } from "./apiProxy";

export const CRM_WORKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
export type CrmWorkday = (typeof CRM_WORKDAYS)[number];

export const CRM_ASSIGNMENT_STRATEGIES = ["owner", "manual", "round_robin"] as const;
export type CrmAssignmentStrategy = (typeof CRM_ASSIGNMENT_STRATEGIES)[number];
const CRM_SOURCE_ID_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export type CrmLeadSource = Readonly<{
  id: string;
  label: string;
  enabled: boolean;
}>;

export type CrmSettingsResponse = Readonly<{
  timezone: string;
  workingDays: readonly CrmWorkday[];
  workingHours: Readonly<{ start: string; end: string }>;
  leadFollowUp: Readonly<{
    enabled: boolean;
    deadlineBusinessDays: number;
    assignmentStrategy: CrmAssignmentStrategy;
    notifications: Readonly<{ inApp: boolean; email: boolean }>;
  }>;
  leadSources: readonly CrmLeadSource[];
}>;

export type CrmSettingsFetchResult =
  | Readonly<{ status: "ready"; data: CrmSettingsResponse }>
  | Readonly<{ status: "unauthenticated" | "forbidden" | "unavailable" }>;

type CrmSettingsHandler = (request: NextRequest) => Promise<Response>;

const MAX_BODY_BYTES = 32 * 1024;
const noStore = { "Cache-Control": "no-store" };
const forwardedErrors: readonly ForwardedError[] = [
  { status: 400, error: "invalid_body" },
  { status: 401, error: "unauthorized" },
  { status: 403, error: "forbidden" },
  { status: 502, error: "api_unavailable" },
  { status: 503, error: "api_unavailable" },
];

export function createCrmSettingsHandler(dependencies: ApiProxyDependencies): CrmSettingsHandler {
  return async (request) => {
    if (request.method === "PATCH") {
      if (!isSameOriginRequest(request)) return reply({ error: "forbidden" }, 403);
      const body = await readSettingsBody(request);
      if (body === null) return reply({ error: "invalid_body" }, 400);
      return proxyValidatedResponse(
        dependencies,
        withJsonBody(request, body),
        {
          apiPath: "/v1/crm/settings",
          method: "PATCH",
          forwardedErrors,
          forwardTenantHeader: false,
          requireSameOrigin: true,
          maxBodyBytes: MAX_BODY_BYTES,
        },
      );
    }

    return proxyValidatedResponse(
      dependencies,
      request,
      {
        apiPath: "/v1/crm/settings",
        method: "GET",
        forwardedErrors,
        forwardTenantHeader: false,
      },
    );
  };
}

export async function fetchCrmSettings(
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): Promise<CrmSettingsFetchResult> {
  try {
    const response = await fetcher("/api/settings/crm", { cache: "no-store" });
    if (response.status === 401) return { status: "unauthenticated" };
    if (response.status === 403) return { status: "forbidden" };
    if (!response.ok) return { status: "unavailable" };
    const parsed = parseCrmSettingsResponse(await response.json().catch(() => null));
    return parsed ? { status: "ready", data: parsed } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function updateCrmSettings(
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  settings: CrmSettingsResponse,
): Promise<CrmSettingsFetchResult> {
  try {
    const response = await fetcher("/api/settings/crm", {
      method: "PATCH",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (response.status === 401) return { status: "unauthenticated" };
    if (response.status === 403) return { status: "forbidden" };
    if (!response.ok) return { status: "unavailable" };
    const parsed = parseCrmSettingsResponse(await response.json().catch(() => null));
    return parsed ? { status: "ready", data: parsed } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export function parseCrmSettingsResponse(value: unknown): CrmSettingsResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, ["timezone", "workingDays", "workingHours", "leadFollowUp", "leadSources"])) {
    return null;
  }
  if (!isBoundedString(value.timezone, 100) || !isCanonicalWorkingDays(value.workingDays)) {
    return null;
  }

  const workingHours = parseWorkingHours(value.workingHours);
  const leadFollowUp = parseLeadFollowUp(value.leadFollowUp);
  const leadSources = parseLeadSources(value.leadSources);
  if (!workingHours || !leadFollowUp || !leadSources) return null;

  return {
    timezone: value.timezone.trim(),
    workingDays: [...value.workingDays],
    workingHours,
    leadFollowUp,
    leadSources,
  };
}

function parseWorkingHours(value: unknown): CrmSettingsResponse["workingHours"] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["start", "end"])) return null;
  if (!isTime(value.start) || !isTime(value.end) || value.start >= value.end) return null;
  return { start: value.start, end: value.end };
}

function parseLeadFollowUp(value: unknown): CrmSettingsResponse["leadFollowUp"] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["enabled", "deadlineBusinessDays", "assignmentStrategy", "notifications"])) return null;
  if (typeof value.enabled !== "boolean") return null;
  if (typeof value.deadlineBusinessDays !== "number" || !Number.isInteger(value.deadlineBusinessDays) || value.deadlineBusinessDays < 1 || value.deadlineBusinessDays > 30) return null;
  if (!isAssignmentStrategy(value.assignmentStrategy)) return null;
  const notifications = parseNotifications(value.notifications);
  if (!notifications) return null;
  return {
    enabled: value.enabled,
    deadlineBusinessDays: value.deadlineBusinessDays,
    assignmentStrategy: value.assignmentStrategy,
    notifications,
  };
}

function parseNotifications(value: unknown): CrmSettingsResponse["leadFollowUp"]["notifications"] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["inApp", "email"])) return null;
  if (typeof value.inApp !== "boolean" || typeof value.email !== "boolean") return null;
  return { inApp: value.inApp, email: value.email };
}

function parseLeadSources(value: unknown): readonly CrmLeadSource[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const sources = value.map((source) => {
    if (!isRecord(source) || !hasExactKeys(source, ["id", "label", "enabled"])) return null;
    if (!isBoundedString(source.id, 64) || !CRM_SOURCE_ID_PATTERN.test(source.id) || !isTrimmedBoundedString(source.label, 80) || typeof source.enabled !== "boolean") return null;
    return { id: source.id.trim(), label: source.label.trim(), enabled: source.enabled };
  });
  if (sources.some((source): source is null => source === null)) return null;
  const parsed = sources as CrmLeadSource[];
  const sourceIds = new Set(parsed.map((source) => source.id.toLocaleLowerCase()));
  const sourceLabels = new Set(parsed.map((source) => source.label.toLocaleLowerCase()));
  if (sourceIds.size !== parsed.length || sourceLabels.size !== parsed.length || !parsed.some((source) => source.enabled)) return null;
  return parsed;
}

function isCanonicalWorkingDays(value: unknown): value is readonly CrmWorkday[] {
  return Array.isArray(value)
    && value.length === CRM_WORKDAYS.length
    && value.every((day, index) => day === CRM_WORKDAYS[index]);
}

function isAssignmentStrategy(value: unknown): value is CrmAssignmentStrategy {
  return (CRM_ASSIGNMENT_STRATEGIES as readonly string[]).includes(value as string);
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isTrimmedBoundedString(value: unknown, maxLength: number): value is string {
  return isBoundedString(value, maxLength) && value === value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

async function readSettingsBody(request: NextRequest): Promise<string | null> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return null;
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  const parsed = parseCrmSettingsResponse(value);
  return parsed ? JSON.stringify(parsed) : null;
}

async function proxyValidatedResponse(
  dependencies: ApiProxyDependencies,
  request: NextRequest,
  route: Parameters<typeof createApiProxy>[1],
): Promise<Response> {
  const response = await createApiProxy(dependencies, { ...route, forwardTenantHeader: false })(request);
  if (!response.ok) return response;
  const parsed = parseCrmSettingsResponse(await response.json().catch(() => null));
  return parsed ? reply(parsed, response.status) : reply({ error: "api_unavailable" }, 503);
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
