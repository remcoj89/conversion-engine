import { createRemoteJWKSet } from "jose";
import type { NextRequest } from "next/server";
import { createCallbackHandler } from "../../../lib/auth/callback";
import { readOidcConfig } from "../../../lib/auth/config";
import { postForm } from "../../../lib/auth/tokenTransport";
import { readSessionConfig } from "../../../lib/session/config";
import { createBffSessionPool } from "../../../lib/session/database";
import { createSession } from "../../../lib/session/store";

let handler: ReturnType<typeof createCallbackHandler> | undefined;
let handlerInitialization: Promise<ReturnType<typeof createCallbackHandler>> | undefined;

// Lazy, so `next build` does not need auth configuration; a failed attempt is retried next request.
async function initializeHandler(): Promise<ReturnType<typeof createCallbackHandler>> {
  const oidc = readOidcConfig();
  const session = readSessionConfig();
  const pool = await createBffSessionPool(session.databaseUrl);
  return createCallbackHandler({
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

async function getHandler(): Promise<ReturnType<typeof createCallbackHandler>> {
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
  let callback: ReturnType<typeof createCallbackHandler>;
  try {
    callback = await getHandler();
  } catch {
    // Keep initialization failures generic; database errors must not expose connection details.
    console.error("OIDC callback unavailable");
    return Response.json({ error: "auth_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return callback(request);
}
