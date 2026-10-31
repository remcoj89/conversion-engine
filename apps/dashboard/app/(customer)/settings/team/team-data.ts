import type { WorkspaceFetch } from "../../../../lib/session/context";

export const CRM_PERMISSION_KEYS = [
  "crm:read",
  "crm:create",
  "crm:update",
  "crm:archive",
] as const;

export type CrmPermission = (typeof CRM_PERMISSION_KEYS)[number];
export type TeamMemberRole = "owner" | "tenant_admin" | "team_member";
export type TeamMemberStatus = "active" | "invited" | "disabled";

export type TeamMember = Readonly<{
  id: string;
  label: string;
  role: TeamMemberRole;
  status: TeamMemberStatus;
  permissions: Readonly<Record<CrmPermission, boolean>>;
}>;

export type TeamMembersResult =
  | Readonly<{ status: "ready"; items: readonly TeamMember[] }>
  | Readonly<{ status: "unauthenticated" | "forbidden" | "unavailable" }>;

export async function fetchTeamMembers(fetcher: WorkspaceFetch): Promise<TeamMembersResult> {
  try {
    const response = await fetcher("/api/team/members", { cache: "no-store" });
    if (response.status === 401) return { status: "unauthenticated" };
    if (response.status === 403) return { status: "forbidden" };
    if (!response.ok) return { status: "unavailable" };

    const body: unknown = await response.json();
    const items = parseTeamMemberList(body);
    return items ? { status: "ready", items } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export function parseTeamMemberList(value: unknown): readonly TeamMember[] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["items"]) || !Array.isArray(value.items)) return null;

  const items = value.items.map(parseTeamMember);
  if (items.some((item): item is null => item === null)) return null;

  const parsedItems = items as TeamMember[];
  return new Set(parsedItems.map((item) => item.id)).size === parsedItems.length ? parsedItems : null;
}

export function parseTeamMember(value: unknown): TeamMember | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "label", "role", "status", "permissions"])) return null;
  if (!isBoundedString(value.id, 200) || !isBoundedString(value.label, 200)) return null;
  if (!isTeamMemberRole(value.role) || !isTeamMemberStatus(value.status)) return null;
  const rawPermissions = value.permissions;
  if (!isRecord(rawPermissions) || !hasExactKeys(rawPermissions, CRM_PERMISSION_KEYS)) return null;

  const permissions = Object.fromEntries(
    CRM_PERMISSION_KEYS.map((permission) => [permission, rawPermissions[permission]]),
  ) as Record<CrmPermission, boolean>;
  if (CRM_PERMISSION_KEYS.some((permission) => typeof permissions[permission] !== "boolean")) return null;

  return {
    id: value.id.trim(),
    label: value.label.trim(),
    role: value.role,
    status: value.status,
    permissions,
  };
}

function isTeamMemberRole(value: unknown): value is TeamMemberRole {
  return value === "owner" || value === "tenant_admin" || value === "team_member";
}

function isTeamMemberStatus(value: unknown): value is TeamMemberStatus {
  return value === "active" || value === "invited" || value === "disabled";
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
