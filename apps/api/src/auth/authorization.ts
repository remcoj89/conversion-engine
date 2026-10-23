import type { TenantRole } from "./types.js";

export type Permission = "dashboard:read" | "leads:create" | "onboarding:manage";

const allowedRoles: Readonly<Record<Permission, readonly TenantRole[]>> = {
  "dashboard:read": ["owner", "team_member"],
  "leads:create": ["owner", "team_member"],
  // Eerste onboardingslice: alleen de Owner van de actieve tenant leest en wijzigt de intake.
  "onboarding:manage": ["owner"],
};

// Deny by default: unknown permissions or roles (e.g. from an unchecked cast) are refused.
export function authorize(role: TenantRole, permission: Permission): boolean {
  if (!Object.hasOwn(allowedRoles, permission)) {
    return false;
  }
  return allowedRoles[permission].includes(role);
}
