import { NextRequest, NextResponse } from "next/server";
import { createApiProxy, type ApiProxyDependencies, type ForwardedError } from "./apiProxy";

export type AcceptedInvitation = Readonly<{
  tenant_id: string;
  tenant_name: string;
  status: "active";
}>;

const noStore = { "Cache-Control": "no-store" };
const forwardedErrors: readonly ForwardedError[] = [
  { status: 400, error: "invalid_body" },
  { status: 400, error: "invalid_invitation" },
  { status: 400, error: "invalid_token" },
  { status: 401, error: "unauthorized" },
  { status: 403, error: "forbidden" },
  { status: 404, error: "invitation_not_found" },
  { status: 409, error: "invitation_already_accepted" },
  { status: 410, error: "invitation_expired" },
  { status: 410, error: "invitation_revoked" },
  { status: 410, error: "invitation_unavailable" },
  { status: 502, error: "api_unavailable" },
  { status: 503, error: "api_unavailable" },
];

export function createInvitationAcceptHandler(dependencies: ApiProxyDependencies) {
  return async function handle(request: NextRequest): Promise<Response> {
    const response = await createApiProxy(dependencies, {
      apiPath: "/v1/invitations/accept",
      method: "POST",
      forwardedErrors,
      forwardTenantHeader: false,
      requireSameOrigin: true,
      maxBodyBytes: 4_096,
    })(request);

    if (!response.ok) return response;

    const parsed = await response.json().catch(() => null);
    const validated = parseAcceptedInvitation(parsed);
    if (!validated) {
      return NextResponse.json({ error: "api_unavailable" }, { status: 503, headers: noStore });
    }

    return NextResponse.json(validated, { status: response.status, headers: noStore });
  };
}

export function parseAcceptedInvitation(value: unknown): AcceptedInvitation | null {
  if (!isRecord(value) || !hasExactKeys(value, ["tenant_id", "tenant_name", "status"])) return null;
  if (!isUuid(value.tenant_id) || !isBoundedString(value.tenant_name, 200) || value.status !== "active") return null;

  return {
    tenant_id: value.tenant_id,
    tenant_name: value.tenant_name.trim(),
    status: "active",
  };
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
