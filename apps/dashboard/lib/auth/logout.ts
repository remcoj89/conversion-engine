import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, sessionCookiePolicy } from "../session/cookies";

export type LogoutHandlerDependencies = Readonly<{
  clientId: string;
  endSessionEndpoint: string;
  postLogoutRedirectUri: string;
  deleteSession: (sessionId: string) => Promise<void>;
  // Receives only fixed reason codes, never session IDs or tokens.
  logFailure?: (reason: string) => void;
}>;

// Takes the raw session cookie value (undefined when absent); the route reads it from the request.
export function createLogoutHandler(deps: LogoutHandlerDependencies) {
  const logFailure = deps.logFailure ?? ((reason) => console.error("Logout failed:", reason));

  return async function logout(sessionId: string | undefined): Promise<Response> {
    if (sessionId) {
      try {
        await deps.deleteSession(sessionId);
      } catch {
        // No provider redirect: the user should not believe they are logged out while the session row survives.
        logFailure("session_delete_failed");
        return logoutUnavailable();
      }
    }

    // RP-initiated logout without id_token_hint, so no token ever ends up in a URL.
    const endSessionUrl = new URL(deps.endSessionEndpoint);
    endSessionUrl.search = new URLSearchParams({
      client_id: deps.clientId,
      post_logout_redirect_uri: deps.postLogoutRedirectUri,
    }).toString();

    const response = NextResponse.redirect(endSessionUrl, 303);
    response.headers.set("Cache-Control", "no-store");
    clearSessionCookie(response);
    return response;
  };
}

// Generic failure that still clears the local session cookie; also used by the route on config errors.
export function logoutUnavailable(): Response {
  const response = NextResponse.json(
    { error: "logout_unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
  clearSessionCookie(response);
  return response;
}

// __Host- cookies are only overwritten by a Set-Cookie with Secure and Path=/.
function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: sessionCookiePolicy.httpOnly,
    secure: sessionCookiePolicy.secure,
    sameSite: sessionCookiePolicy.sameSite,
    path: sessionCookiePolicy.path,
    maxAge: 0,
  });
}
