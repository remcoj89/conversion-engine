import type { NextRequest } from "next/server";
import { readOidcConfig } from "../auth/config";
import { createTokenRefresher } from "../auth/refresh";
import { postForm } from "../auth/tokenTransport";
import { readSessionConfig } from "../session/config";
import { createBffSessionPool } from "../session/database";
import { createSessionRefresher } from "../session/refresh";
import { findSession, withLockedSession } from "../session/store";
import type { ApiProxyDependencies } from "./apiProxy";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";

let dependencies: ApiProxyDependencies | undefined;
let dependencyInitialization: Promise<ApiProxyDependencies> | undefined;
let dependencyProxy: ApiProxyDependencies | undefined;

// Gedeeld door alle BFF-routes (één databasepool). Lazy, zodat `next build` geen sessieconfiguratie nodig heeft;
// een mislukte poging wordt bij het volgende request opnieuw geprobeerd.
async function initializeBffDependencies(): Promise<ApiProxyDependencies> {
  const config = readSessionConfig();
  const oidc = readOidcConfig();
  const pool = await createBffSessionPool(config.databaseUrl);
  return {
    apiBaseUrl: API_BASE_URL,
    lookupSession: (sessionId) => findSession(pool, config.encryptionKey, sessionId),
    refreshSession: createSessionRefresher({
      lockSession: (sessionId, work) => withLockedSession(pool, config.encryptionKey, sessionId, work),
      refreshTokens: createTokenRefresher({ clientId: oidc.clientId, tokenEndpoint: oidc.tokenEndpoint, postForm }),
    }),
    fetch,
  };
}

async function getReadyBffDependencies(): Promise<ApiProxyDependencies> {
  if (dependencies) return dependencies;

  if (!dependencyInitialization) {
    dependencyInitialization = initializeBffDependencies().then((value) => {
      dependencies = value;
      return value;
    });
    dependencyInitialization = dependencyInitialization.finally(() => {
      dependencyInitialization = undefined;
    });
  }

  return dependencyInitialization;
}

// Existing server-side loaders use this synchronous accessor. Its database operations remain
// fail-closed because every operation waits for the same async identity-verified dependencies.
export function getBffDependencies(): ApiProxyDependencies {
  if (dependencies) return dependencies;
  if (dependencyProxy) return dependencyProxy;

  dependencyProxy = {
    apiBaseUrl: API_BASE_URL,
    lookupSession: (sessionId) => getReadyBffDependencies().then((ready) => ready.lookupSession(sessionId)),
    refreshSession: (sessionId, rejectedAccessToken) =>
      getReadyBffDependencies().then((ready) => ready.refreshSession(sessionId, rejectedAccessToken)),
    fetch,
  };
  return dependencyProxy;
}

// Bouwt de handler pas bij het eerste request; een configuratiefout geeft 503 zonder details.
export function withBffHandler(build: (dependencies: ApiProxyDependencies) => (request: NextRequest) => Promise<Response>) {
  let handler: ((request: NextRequest) => Promise<Response>) | undefined;
  return async (request: NextRequest): Promise<Response> => {
    try {
      handler ??= build(await getReadyBffDependencies());
    } catch {
      // Keep initialization failures generic; database errors must not expose connection details.
      console.error("Session dependencies unavailable");
      return Response.json({ error: "api_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return handler(request);
  };
}
