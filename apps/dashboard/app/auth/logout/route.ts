import type { NextRequest } from "next/server";
import { Pool } from "pg";
import { readLogoutConfig } from "../../../lib/auth/config";
import { createLogoutHandler, logoutUnavailable } from "../../../lib/auth/logout";
import { SESSION_COOKIE_NAME } from "../../../lib/session/cookies";
import { readSessionConfig } from "../../../lib/session/config";
import { deleteSession } from "../../../lib/session/store";

let handler: ReturnType<typeof createLogoutHandler> | undefined;

// Lazy, so `next build` does not need auth configuration; a failed attempt is retried next request.
function getHandler() {
  if (!handler) {
    const logout = readLogoutConfig();
    const session = readSessionConfig();
    const pool = new Pool({ connectionString: session.databaseUrl });
    handler = createLogoutHandler({
      clientId: logout.clientId,
      endSessionEndpoint: logout.endSessionEndpoint,
      postLogoutRedirectUri: logout.postLogoutRedirectUri,
      deleteSession: (sessionId) => deleteSession(pool, sessionId),
    });
  }
  return handler;
}

export async function GET(request: NextRequest): Promise<Response> {
  let logout: ReturnType<typeof createLogoutHandler>;
  try {
    logout = getHandler();
  } catch (error) {
    // Config errors name the missing variable, never its value.
    console.error("Logout configuration invalid:", error instanceof Error ? error.message : "unknown");
    return logoutUnavailable();
  }
  return logout(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}
