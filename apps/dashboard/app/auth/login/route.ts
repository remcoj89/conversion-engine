import { NextResponse } from "next/server";
import { readOidcConfig } from "../../../lib/auth/config";
import { createOidcTransaction } from "../../../lib/auth/pkce";
import { encryptSecret } from "../../../lib/session/crypto";
import {
  OIDC_TRANSACTION_COOKIE_NAME,
  oidcTransactionCookiePolicy,
} from "../../../lib/session/cookies";

const OIDC_SCOPES = "openid profile email offline_access";

export function GET(): Response {
  try {
    const config = readOidcConfig();
    const transaction = createOidcTransaction();
    const authorizationUrl = new URL(config.authorizationEndpoint);

    authorizationUrl.searchParams.set("client_id", config.clientId);
    authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", OIDC_SCOPES);
    authorizationUrl.searchParams.set("state", transaction.state);
    authorizationUrl.searchParams.set("nonce", transaction.nonce);
    authorizationUrl.searchParams.set("code_challenge", transaction.codeChallenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set({
      name: OIDC_TRANSACTION_COOKIE_NAME,
      value: encryptSecret(JSON.stringify(transaction), config.encryptionKey),
      httpOnly: oidcTransactionCookiePolicy.httpOnly,
      secure: oidcTransactionCookiePolicy.secure,
      sameSite: oidcTransactionCookiePolicy.sameSite,
      path: oidcTransactionCookiePolicy.path,
      maxAge: oidcTransactionCookiePolicy.maxAgeSeconds,
    });

    return response;
  } catch (error) {
    console.error(
      "OIDC login configuration invalid:",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json(
      { error: "auth_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
