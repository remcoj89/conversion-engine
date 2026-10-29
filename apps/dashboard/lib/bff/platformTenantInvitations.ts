import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../session/cookies";
import { createApiProxy, type ApiProxyDependencies, type ForwardedError } from "./apiProxy";

export type PlatformTenantInvitation = Readonly<{
  invitation_id: string;
  expires_at: string;
  invite_url: string;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "no-store" };
const forwardedErrors: readonly ForwardedError[] = [
  { status: 400, error: "invalid_body" },
  { status: 400, error: "invalid_tenant_id" },
  { status: 401, error: "unauthorized" },
  { status: 403, error: "forbidden" },
  { status: 404, error: "not_found" },
  { status: 409, error: "tenant_unavailable" },
  { status: 409, error: "invitation_exists" },
  { status: 502, error: "api_unavailable" },
  { status: 503, error: "api_unavailable" },
];

export function createPlatformTenantInvitationHandler(dependencies: ApiProxyDependencies) {
  return async function handle(request: NextRequest, tenantId: string): Promise<Response> {
    if (!UUID_PATTERN.test(tenantId)) {
      return NextResponse.json({ error: "invalid_tenant_id" }, { status: 400, headers: noStore });
    }

    const response = await createApiProxy(dependencies, {
      apiPath: `/v1/platform/tenants/${encodeURIComponent(tenantId)}/invitations`,
      method: "POST",
      forwardedErrors,
      forwardTenantHeader: false,
      requireSameOrigin: true,
      maxBodyBytes: 4_096,
    })(request);

    if (!response.ok) return response;

    const parsed = await response.json().catch(() => null);
    const validated = parsePlatformTenantInvitation(parsed);
    if (!validated) {
      return NextResponse.json({ error: "api_unavailable" }, { status: 503, headers: noStore });
    }

    return NextResponse.json(validated, { status: response.status, headers: noStore });
  };
}

export function createPlatformTenantInvitationRequest(
  sessionCookieValue: string,
  tenantId: string,
  body: Readonly<{ email: string }>,
): NextRequest {
  const url = new URL(`https://conversion-engine.internal/v1/platform/tenants/${encodeURIComponent(tenantId)}/invitations`);
  return new NextRequest(url, {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${sessionCookieValue}`,
      origin: url.origin,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export function parsePlatformTenantInvitation(value: unknown): PlatformTenantInvitation | null {
  if (!isRecord(value) || !hasExactKeys(value, ["invitation_id", "expires_at", "invite_url"])) return null;
  if (
    !isUuid(value.invitation_id) ||
    !isDateString(value.expires_at) ||
    !isInviteUrl(value.invite_url)
  ) return null;

  return {
    invitation_id: value.invitation_id,
    expires_at: value.expires_at,
    invite_url: value.invite_url,
  };
}

function isInviteUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_048) return false;
  if (value.startsWith("/invite#")) {
    return value.length > "/invite#".length
      && !value.includes("?")
      && !value.includes("\\")
      && !containsControlCharacter(value);
  }
  try {
    const url = new URL(value);
    const secureProtocol = url.protocol === "https:" || (
      url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)
    );
    return secureProtocol && url.pathname === "/invite" && url.hash.length > 1 && url.search === "";
  } catch {
    return false;
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
