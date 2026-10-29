import { cookies } from "next/headers";
import {
  createPlatformTenantDetailHandler,
  createPlatformTenantDetailRequest,
  parsePlatformTenantDetailResponse,
  type PlatformTenantDetailResult,
} from "./platformTenantDetails";
import { getBffDependencies } from "./serverDependencies";
import { SESSION_COOKIE_NAME } from "../session/cookies";

// Server-only loader. The browser never supplies the session cookie or access token.
export async function readPlatformTenantDetail(tenantId: string): Promise<PlatformTenantDetailResult> {
  try {
    const sessionCookieValue = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookieValue) return { status: "unauthenticated", data: null };

    const request = createPlatformTenantDetailRequest(sessionCookieValue, tenantId);
    const response = await createPlatformTenantDetailHandler(getBffDependencies())(request, tenantId);
    return parsePlatformTenantDetailResponse(response);
  } catch {
    return { status: "unavailable", data: null };
  }
}
