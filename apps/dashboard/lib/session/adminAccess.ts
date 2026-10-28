import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "./cookies";

export type AdminAccessResult = Readonly<
  | { status: "authorized" }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "unavailable" }
>;

const authorized: AdminAccessResult = Object.freeze({ status: "authorized" });
const unauthenticated: AdminAccessResult = Object.freeze({ status: "unauthenticated" });
const forbidden: AdminAccessResult = Object.freeze({ status: "forbidden" });
const unavailable: AdminAccessResult = Object.freeze({ status: "unavailable" });

// The platform BFF accepts only the server-owned HttpOnly session cookie.
export function createAdminContextRequest(sessionCookieValue: string): NextRequest {
  return new NextRequest("https://conversion-engine.internal/api/admin/context", {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${sessionCookieValue}`,
    },
  });
}

export async function classifyPlatformContextResponse(response: Response): Promise<AdminAccessResult> {
  if (response.status === 401) return unauthenticated;
  if (response.status === 403) return forbidden;
  if (!response.ok) return unavailable;

  try {
    const body: unknown = await response.json();
    return isPlatformAdminContext(body) ? authorized : unavailable;
  } catch {
    return unavailable;
  }
}

function isPlatformAdminContext(value: unknown): value is { workspace: "admin"; role: "platform_admin" } {
  if (typeof value !== "object" || value === null) return false;

  const context = value as Record<string, unknown>;
  const keys = Object.keys(context);
  return (
    keys.length === 2 &&
    keys.includes("workspace") &&
    keys.includes("role") &&
    context.workspace === "admin" &&
    context.role === "platform_admin"
  );
}
