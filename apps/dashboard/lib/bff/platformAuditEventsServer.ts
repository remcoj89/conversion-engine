import { cookies } from "next/headers";
import {
  createPlatformAuditEventsHandler,
  createPlatformAuditEventsRequest,
  parsePlatformAuditEventResponse,
  type PlatformAuditEventListResult,
  type PlatformAuditEventQuery,
} from "./platformAuditEvents";
import { getBffDependencies } from "./serverDependencies";
import { SESSION_COOKIE_NAME } from "../session/cookies";

// Server-only loader for Platform Admin audit data. The browser never supplies the session cookie
// or access token directly.
export async function readPlatformAuditEvents(query: PlatformAuditEventQuery): Promise<PlatformAuditEventListResult> {
  try {
    const sessionCookieValue = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookieValue) return { status: "unauthenticated", data: null };

    const request = createPlatformAuditEventsRequest(sessionCookieValue, query);
    const response = await createPlatformAuditEventsHandler(getBffDependencies())(request);
    return parsePlatformAuditEventResponse(response);
  } catch {
    return { status: "unavailable", data: null };
  }
}
