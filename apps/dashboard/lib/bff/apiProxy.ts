import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, sessionCookiePolicy } from "../session/cookies";
import { needsRefresh, type RefreshOutcome, type RefreshSession, type SessionTokens } from "../session/refresh";

export type ApiProxyDependencies = Readonly<{
  apiBaseUrl: string;
  // Returns the session's tokens, or null when there is no valid session.
  lookupSession: (sessionId: string) => Promise<SessionTokens | null>;
  // Refreshes under a database lock; see lib/session/refresh.ts.
  refreshSession: RefreshSession;
  fetch: typeof fetch;
  now?: () => Date;
}>;

// Welke API-fouten naar de browser mogen, en met welke extra velden. Al het andere wordt generiek.
export type ForwardedError = Readonly<{ status: number; error: string; fields?: readonly string[] }>;

export type ApiProxyRoute = Readonly<{
  apiPath: string;
  method: "GET" | "PUT";
  forwardedErrors: readonly ForwardedError[];
  // Alleen bij PUT: maximale grootte van de JSON-body die naar de API gaat.
  maxBodyBytes?: number;
}>;

const noStore = { "Cache-Control": "no-store" };

// Gedeeld BFF-patroon: alleen de HttpOnly-sessiecookie telt, het access token blijft server-side,
// verversen vlak vóór verlopen en precies één refresh + nieuwe poging na een API-401.
export function createApiProxy(
  { apiBaseUrl, lookupSession, refreshSession, fetch, now = () => new Date() }: ApiProxyDependencies,
  route: ApiProxyRoute,
) {
  const callApi = (request: NextRequest, accessToken: string, body: string | undefined) =>
    fetch(`${apiBaseUrl}${route.apiPath}`, {
      method: route.method,
      cache: "no-store",
      headers: apiHeaders(request, accessToken, body !== undefined),
      body,
      signal: AbortSignal.timeout(3000),
    });

  return async function handle(request: NextRequest): Promise<Response> {
    try {
      // Alleen de sessiecookie telt; een Authorization-header uit de browser wordt genegeerd.
      const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      const session = sessionId ? await lookupSession(sessionId) : null;
      if (!sessionId || !session) {
        return unauthorizedWithoutSession();
      }

      // De body één keer lezen, zodat dezelfde inhoud na een refresh opnieuw kan worden verstuurd.
      let body: string | undefined;
      if (route.method === "PUT") {
        body = await request.text();
        if (new TextEncoder().encode(body).byteLength > (route.maxBodyBytes ?? 0)) {
          return reply({ error: "payload_too_large" }, 413);
        }
      }

      let accessToken = session.accessToken;
      if (needsRefresh(session, now()) || session.accessExpiresAt.getTime() <= now().getTime()) {
        const outcome = await refreshSession(sessionId);
        if (outcome.status !== "ok") return refreshFailed(outcome);
        accessToken = outcome.accessToken;
      }

      let response = await callApi(request, accessToken, body);

      // Een API-401 betekent een verlopen of ingetrokken token: precies één refresh en één nieuwe poging.
      // Een 403 gaat over autorisatie en leidt nooit tot een refresh.
      if (response.status === 401) {
        await discardBody(response);
        const outcome = await refreshSession(sessionId, accessToken);
        if (outcome.status !== "ok") return refreshFailed(outcome);
        response = await callApi(request, outcome.accessToken, body);
      }

      if (response.ok) {
        return reply(await response.json(), response.status);
      }
      if (route.forwardedErrors.some((forwarded) => forwarded.status === response.status)) {
        const forwarded = await forwardedError(route, response);
        if (forwarded) return reply(forwarded, response.status);
      }

      await discardBody(response);
      // Ook na een verse refresh geweigerd: generiek 401, zonder nog een poging; de sessie blijft.
      if (response.status === 401) return reply({ error: "unauthorized" }, 401);
      if (response.status === 403) return reply({ error: "forbidden" }, 403);
      if (response.status === 400) return reply({ error: "api_error" }, 400);
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
function apiHeaders(request: NextRequest, accessToken: string, hasBody: boolean): Headers {
  const headers = new Headers({ authorization: `Bearer ${accessToken}` });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  const tenantId = request.headers.get("x-tenant-id");
  // Ontbrekend of leeg wordt niet meegestuurd.
  if (tenantId) {
    headers.set("x-tenant-id", tenantId);
  }
  return headers;
}

// Alleen bekende foutcodes met vooraf bekende velden; null betekent: generiek afhandelen.
async function forwardedError(route: ApiProxyRoute, response: Response): Promise<Record<string, unknown> | null> {
  const body: unknown = await response.json().catch(() => null);
  const error = typeof body === "object" && body !== null && "error" in body ? body.error : undefined;
  const match = route.forwardedErrors.find((forwarded) => forwarded.status === response.status && forwarded.error === error);
  if (!match) return null;
  const source = body as Record<string, unknown>;
  return Object.fromEntries([["error", match.error], ...(match.fields ?? []).filter((field) => field in source).map((field) => [field, source[field]])]);
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
