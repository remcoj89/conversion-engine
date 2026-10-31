import type { NextRequest } from "next/server";
import { readLogoutConfig } from "../../../lib/auth/config";
import { createLogoutHandler, logoutUnavailable } from "../../../lib/auth/logout";
import { SESSION_COOKIE_NAME } from "../../../lib/session/cookies";
import { readSessionConfig } from "../../../lib/session/config";
import { createBffSessionPool } from "../../../lib/session/database";
import { deleteSession } from "../../../lib/session/store";

let handler: ReturnType<typeof createLogoutHandler> | undefined;
let handlerInitialization: Promise<ReturnType<typeof createLogoutHandler>> | undefined;

// Lazy, so `next build` does not need auth configuration; a failed attempt is retried next request.
async function initializeHandler(): Promise<ReturnType<typeof createLogoutHandler>> {
  const logout = readLogoutConfig();
  const session = readSessionConfig();
  const pool = await createBffSessionPool(session.databaseUrl);
  return createLogoutHandler({
    clientId: logout.clientId,
    endSessionEndpoint: logout.endSessionEndpoint,
    postLogoutRedirectUri: logout.postLogoutRedirectUri,
    deleteSession: (sessionId) => deleteSession(pool, sessionId),
  });
}

async function getHandler(): Promise<ReturnType<typeof createLogoutHandler>> {
  if (handler) return handler;
  if (!handlerInitialization) {
    handlerInitialization = initializeHandler().then((value) => {
      handler = value;
      return value;
    });
    handlerInitialization = handlerInitialization.finally(() => {
      handlerInitialization = undefined;
    });
  }
  return handlerInitialization;
}

export async function GET(request: NextRequest): Promise<Response> {
  let logout: ReturnType<typeof createLogoutHandler>;
  try {
    logout = await getHandler();
  } catch {
    // Keep initialization failures generic; database errors must not expose connection details.
    console.error("Logout unavailable");
    return logoutUnavailable();
  }
  return logout(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}
