import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, sessionCookiePolicy } from "../session/cookies";

export type TodayHandlerDependencies = Readonly<{
  apiBaseUrl: string;
  // Returns the session's access token, or null when there is no valid session.
  lookupSession: (sessionId: string) => Promise<{ accessToken: string } | null>;
  fetch: typeof fetch;
}>;

const noStore = { "Cache-Control": "no-store" };

// Alleen deze 400-codes zijn bedoeld voor de browser; al het andere wordt generiek.
const forwardedBadRequestErrors = new Set(["tenant_required", "invalid_tenant"]);

export function createTodayHandler({ apiBaseUrl, lookupSession, fetch }: TodayHandlerDependencies) {
  return async function GET(request: NextRequest): Promise<Response> {
    try {
      // Alleen de sessiecookie telt; een Authorization-header uit de browser wordt genegeerd.
      const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      const session = sessionId ? await lookupSession(sessionId) : null;
      if (!session) {
        return unauthorizedWithoutSession();
      }

      const response = await fetch(`${apiBaseUrl}/v1/dashboard/today`, {
        cache: "no-store",
        headers: apiHeaders(request, session.accessToken),
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        return reply(await response.json(), response.status);
      }
      if (response.status === 400) {
        return reply({ error: await badRequestError(response) }, 400);
      }

      // Body is niet nodig; vrijgeven zodat de verbinding terug kan naar de pool.
      await response.body?.cancel().catch(() => undefined);
      // Nog geen refresh in deze slice: een API-401 gaat ongewijzigd door en de sessie blijft.
      if (response.status === 401) return reply({ error: "unauthorized" }, 401);
      if (response.status === 403) return reply({ error: "forbidden" }, 403);
      return reply({ error: "api_unavailable" }, 502);
    } catch {
      // Sessiestore of API onbereikbaar, timeout of ongeldige JSON in een succesvolle response.
      return reply({ error: "api_unavailable" }, 503);
    }
  };
}

// De BFF beslist niets over tenanttoegang; x-tenant-id gaat ongewijzigd door, het token komt uit de sessie.
function apiHeaders(request: NextRequest, accessToken: string): Headers {
  const headers = new Headers({ authorization: `Bearer ${accessToken}` });
  const tenantId = request.headers.get("x-tenant-id");
  // Ontbrekend of leeg wordt niet meegestuurd.
  if (tenantId) {
    headers.set("x-tenant-id", tenantId);
  }
  return headers;
}

async function badRequestError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const error = typeof body === "object" && body !== null && "error" in body ? body.error : undefined;
  return typeof error === "string" && forwardedBadRequestErrors.has(error) ? error : "api_error";
}

function reply(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: noStore });
}

function unauthorizedWithoutSession() {
  const response = reply({ error: "unauthorized" }, 401);
  const { name, httpOnly, secure, sameSite, path } = sessionCookiePolicy;
  response.cookies.set(name, "", { httpOnly, secure, sameSite, path, maxAge: 0 });
  return response;
}
