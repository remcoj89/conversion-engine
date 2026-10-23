import type { NextRequest } from "next/server";
import { Pool } from "pg";
import { readOidcConfig } from "../auth/config";
import { createTokenRefresher } from "../auth/refresh";
import { postForm } from "../auth/tokenTransport";
import { readSessionConfig } from "../session/config";
import { createSessionRefresher } from "../session/refresh";
import { findSession, withLockedSession } from "../session/store";
import type { ApiProxyDependencies } from "./apiProxy";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";

let dependencies: ApiProxyDependencies | undefined;

// Gedeeld door alle BFF-routes (één databasepool). Lazy, zodat `next build` geen sessieconfiguratie nodig heeft;
// een mislukte poging wordt bij het volgende request opnieuw geprobeerd.
export function getBffDependencies(): ApiProxyDependencies {
  if (!dependencies) {
    const config = readSessionConfig();
    const oidc = readOidcConfig();
    const pool = new Pool({ connectionString: config.databaseUrl });
    dependencies = {
      apiBaseUrl: API_BASE_URL,
      lookupSession: (sessionId) => findSession(pool, config.encryptionKey, sessionId),
      refreshSession: createSessionRefresher({
        lockSession: (sessionId, work) => withLockedSession(pool, config.encryptionKey, sessionId, work),
        refreshTokens: createTokenRefresher({ clientId: oidc.clientId, tokenEndpoint: oidc.tokenEndpoint, postForm }),
      }),
      fetch,
    };
  }
  return dependencies;
}

// Bouwt de handler pas bij het eerste request; een configuratiefout geeft 503 zonder details.
export function withBffHandler(build: (dependencies: ApiProxyDependencies) => (request: NextRequest) => Promise<Response>) {
  let handler: ((request: NextRequest) => Promise<Response>) | undefined;
  return async (request: NextRequest): Promise<Response> => {
    try {
      handler ??= build(getBffDependencies());
    } catch (error) {
      // Config errors name the missing variable, never its value.
      console.error("Session configuration invalid:", error instanceof Error ? error.message : "unknown");
      return Response.json({ error: "api_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return handler(request);
  };
}
