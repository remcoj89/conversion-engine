import { createRemoteJWKSet } from "jose";
import type { NextRequest } from "next/server";
import { Pool } from "pg";
import { createCallbackHandler } from "../../../lib/auth/callback";
import { readOidcConfig } from "../../../lib/auth/config";
import { postForm } from "../../../lib/auth/tokenTransport";
import { readSessionConfig } from "../../../lib/session/config";
import { createSession } from "../../../lib/session/store";

let handler: ReturnType<typeof createCallbackHandler> | undefined;

// Lazy, so `next build` does not need auth configuration; a failed attempt is retried next request.
function getHandler() {
  if (!handler) {
    const oidc = readOidcConfig();
    const session = readSessionConfig();
    const pool = new Pool({ connectionString: session.databaseUrl });
    handler = createCallbackHandler({
      clientId: oidc.clientId,
      issuer: oidc.issuer,
      redirectUri: oidc.redirectUri,
      tokenEndpoint: oidc.tokenEndpoint,
      appOrigin: session.appOrigin,
      encryptionKey: session.encryptionKey,
      keys: createRemoteJWKSet(new URL(oidc.jwksUri)),
      createSession: (newSession) => createSession(pool, session.encryptionKey, newSession),
      postForm,
    });
  }
  return handler;
}

export async function GET(request: NextRequest): Promise<Response> {
  let callback: ReturnType<typeof createCallbackHandler>;
  try {
    callback = getHandler();
  } catch (error) {
    // Config errors name the missing variable, never its value.
    console.error("OIDC callback configuration invalid:", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "auth_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return callback(request);
}
