import type { TenantRole } from "./types.js";

export type Permission =
  | "dashboard:read"
  | "crm:read"
  | "crm:create"
  | "crm:update"
  | "crm:archive"
  | "crm:import"
  | "crm:export"
  | "crm:audit:read"
  | "team:manage"
  // Legacy permissions remain supported while existing routes migrate to the CRM contract.
  | "leads:create"
  | "leads:read"
  | "onboarding:manage";

export type ConfigurableTeamMemberPermission =
  | "dashboard:read"
  | "crm:read"
  | "crm:create"
  | "crm:update"
  | "crm:archive"
  | "crm:import"
  | "crm:export";

export type TeamMemberPermissionContract = Readonly<
  Partial<Record<ConfigurableTeamMemberPermission, boolean>>
>;

type PermissionPolicy = Readonly<{
  tenantAdmin: boolean;
  configurableForTeamMember: boolean;
}>;

// This is the single policy map for the new tenant/CRM permission contract. Owners are handled
// explicitly in authorizeForUser and therefore always receive every known permission.
export const permissionMap: Readonly<Record<Permission, PermissionPolicy>> = {
  "dashboard:read": { tenantAdmin: true, configurableForTeamMember: true },
  "crm:read": { tenantAdmin: true, configurableForTeamMember: true },
  "crm:create": { tenantAdmin: true, configurableForTeamMember: true },
  "crm:update": { tenantAdmin: true, configurableForTeamMember: true },
  "crm:archive": { tenantAdmin: true, configurableForTeamMember: true },
  "crm:import": { tenantAdmin: true, configurableForTeamMember: true },
  "crm:export": { tenantAdmin: true, configurableForTeamMember: true },
  "crm:audit:read": { tenantAdmin: true, configurableForTeamMember: false },
  "team:manage": { tenantAdmin: true, configurableForTeamMember: false },
  "leads:create": { tenantAdmin: true, configurableForTeamMember: false },
  "leads:read": { tenantAdmin: true, configurableForTeamMember: false },
  "onboarding:manage": { tenantAdmin: false, configurableForTeamMember: false },
};

// Existing endpoints use this role-only contract. It intentionally remains unchanged so the
// current dashboard/lead behavior is not broken before those routes adopt per-user CRM rights.
const legacyAllowedRoles: Readonly<Partial<Record<Permission, readonly TenantRole[]>>> = {
  "dashboard:read": ["owner", "team_member"],
  "leads:create": ["owner", "team_member"],
  "leads:read": ["owner", "team_member"],
  // Eerste onboardingslice: alleen de Owner van de actieve tenant leest en wijzigt de intake.
  "onboarding:manage": ["owner"],
};

// Deny by default: unknown permissions or roles (e.g. from an unchecked cast) are refused.
export function authorize(role: TenantRole, permission: Permission): boolean {
  if (!Object.hasOwn(permissionMap, permission)) {
    return false;
  }

  if (role === "owner") return true;
  if (role === "tenant_admin") return permissionMap[permission].tenantAdmin;
  return legacyAllowedRoles[permission]?.includes(role) ?? false;
}

// The explicit per-user contract for Team members. A missing or false permission is denied.
// Owner and tenant_admin are role-governed and do not depend on user-supplied grants.
export function authorizeForUser(
  role: TenantRole,
  permission: Permission,
  teamMemberPermissions: TeamMemberPermissionContract = {},
): boolean {
  if (!Object.hasOwn(permissionMap, permission)) {
    return false;
  }

  if (role === "owner") return true;
  if (role === "tenant_admin") return permissionMap[permission].tenantAdmin;
  if (role !== "team_member") return false;
  if (!permissionMap[permission].configurableForTeamMember) return false;

  return teamMemberPermissions[permission as ConfigurableTeamMemberPermission] === true;
}
