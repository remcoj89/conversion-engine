import type { TenantRole } from "./types.js";

export type Permission = "dashboard:read" | "leads:create";

const allowedRoles: Readonly<Record<Permission, readonly TenantRole[]>> = {
  "dashboard:read": ["owner", "team_member"],
  "leads:create": ["owner", "team_member"],
};

// Deny by default: unknown permissions or roles (e.g. from an unchecked cast) are refused.
export function authorize(role: TenantRole, permission: Permission): boolean {
  if (!Object.hasOwn(allowedRoles, permission)) {
    return false;
  }
  return allowedRoles[permission].includes(role);
}
