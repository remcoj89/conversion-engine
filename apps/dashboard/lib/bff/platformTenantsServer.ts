import { cookies } from "next/headers";
import { createPlatformTenantsHandler, createPlatformTenantsRequest, parsePlatformTenantResponse, type PlatformTenantListResult, type PlatformTenantQuery } from "./platformTenants";
import { getBffDependencies } from "./serverDependencies";
import { SESSION_COOKIE_NAME } from "../session/cookies";

// Server-only loader for admin pages. The browser never supplies the session cookie or token.
export async function readPlatformTenantList(query: PlatformTenantQuery): Promise<PlatformTenantListResult> {
  try {
    const sessionCookieValue = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookieValue) return { status: "unauthenticated", data: null };

    const request = createPlatformTenantsRequest(sessionCookieValue, query);
    const response = await createPlatformTenantsHandler(getBffDependencies())(request);
    return parsePlatformTenantResponse(response);
  } catch {
    return { status: "unavailable", data: null };
  }
}
