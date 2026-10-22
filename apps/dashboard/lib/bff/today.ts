import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, sessionCookiePolicy } from "../session/cookies";
import { needsRefresh, type RefreshOutcome, type RefreshSession, type SessionTokens } from "../session/refresh";

export type TodayHandlerDependencies = Readonly<{
  apiBaseUrl: string;
  // Returns the session's tokens, or null when there is no valid session.
  lookupSession: (sessionId: string) => Promise<SessionTokens | null>;
  // Refreshes under a database lock; see lib/session/refresh.ts.
  refreshSession: RefreshSession;
  fetch: typeof fetch;
  now?: () => Date;
}>;

const noStore = { "Cache-Control": "no-store" };

// Alleen deze 400-codes zijn bedoeld voor de browser; al het andere wordt generiek.
const forwardedBadRequestErrors = new Set(["tenant_required", "invalid_tenant"]);

export function createTodayHandler({ apiBaseUrl, lookupSession, refreshSession, fetch, now = () => new Date() }: TodayHandlerDependencies) {
  const callApi = (request: NextRequest, accessToken: string) =>
    fetch(`${apiBaseUrl}/v1/dashboard/today`, {
      cache: "no-store",
      headers: apiHeaders(request, accessToken),
      signal: AbortSignal.timeout(3000),
    });

  return async function GET(request: NextRequest): Promise<Response> {
    try {
      // Alleen de sessiecookie telt; een Authorization-header uit de browser wordt genegeerd.
      const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      const session = sessionId ? await lookupSession(sessionId) : null;
      if (!sessionId || !session) {
        return unauthorizedWithoutSession();
      }

      let accessToken = session.accessToken;
      if (needsRefresh(session, now()) || session.accessExpiresAt.getTime() <= now().getTime()) {
        const outcome = await refreshSession(sessionId);
        if (outcome.status !== "ok") return refreshFailed(outcome);
        accessToken = outcome.accessToken;
      }

      let response = await callApi(request, accessToken);

      // Een API-401 betekent een verlopen of ingetrokken token: precies één refresh en één nieuwe poging.
      // Een 403 gaat over autorisatie en leidt nooit tot een refresh.
      if (response.status === 401) {
        await discardBody(response);
        const outcome = await refreshSession(sessionId, accessToken);
        if (outcome.status !== "ok") return refreshFailed(outcome);
        response = await callApi(request, outcome.accessToken);
      }

      if (response.ok) {
        return reply(await response.json(), response.status);
      }
      if (response.status === 400) {
        return reply({ error: await badRequestError(response) }, 400);
      }

      await discardBody(response);
      // Ook na een verse refresh geweigerd: generiek 401, zonder nog een poging; de sessie blijft.
      if (response.status === 401) return reply({ error: "unauthorized" }, 401);
      if (response.status === 403) return reply({ error: "forbidden" }, 403);
      return reply({ error: "api_unavailable" }, 502);
    } catch {
      // Sessiestore of API onbereikbaar, timeout of ongeldige JSON in een succesvolle response.
      return reply({ error: "api_unavailable" }, 503);
    }
  };
}

function refreshFailed(outcome: Exclude<RefreshOutcome, { status: "ok" }>): Response {
  // Een ongeldige sessie is al verwijderd; de provider-fout laat de sessie staan.
  return outcome.status === "invalid" ? unauthorizedWithoutSession() : reply({ error: "api_unavailable" }, 503);
}

// Body is niet nodig; vrijgeven zodat de verbinding terug kan naar de pool.
async function discardBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
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
