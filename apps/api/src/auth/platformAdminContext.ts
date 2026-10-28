import type { PlatformAdminAssignment } from "./types.js";

export type PlatformAdminContext = Readonly<{
  userId: string;
  role: "platform_admin";
}>;

export type PlatformAdminAuthorizationResult =
  | { status: "success"; context: PlatformAdminContext }
  | { status: "forbidden" };

// Platform access is intentionally unambiguous: exactly one well-formed active grant is required.
// The resolver supplies active rights only; malformed records and multiple grants fail closed.
export function resolvePlatformAdminContext(
  assignments: unknown,
): PlatformAdminAuthorizationResult {
  if (!Array.isArray(assignments)) {
    return { status: "forbidden" };
  }

  if (!assignments.every(isPlatformAdminAssignment)) {
    return { status: "forbidden" };
  }

  if (assignments.length !== 1) {
    return { status: "forbidden" };
  }

  const [assignment] = assignments;
  return {
    status: "success",
    context: Object.freeze({ userId: assignment!.userId, role: "platform_admin" }),
  };
}

function isPlatformAdminAssignment(value: unknown): value is PlatformAdminAssignment {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === "string" &&
    candidate.userId.length > 0 &&
    candidate.permission === "platform_admin"
  );
}
