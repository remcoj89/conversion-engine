import { timingSafeEqual } from "node:crypto";
import { errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { decryptSecret } from "../session/crypto";
import {
  OIDC_TRANSACTION_COOKIE_NAME,
  oidcTransactionCookiePolicy,
  sessionCookiePolicy,
} from "../session/cookies";
import type { NewSession } from "../session/store";
import type { FormPostResponse, PostForm } from "./tokenTransport";

const TRANSACTION_MAX_AGE_MS = 10 * 60 * 1000;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TOKEN_ENDPOINT_TIMEOUT_MS = 5000;
const ALLOWED_ALGORITHMS = ["RS256"];

// Errors that mean "this ID token is not acceptable". Anything else (e.g. JWKS unreachable)
// is an infrastructure failure.
const ID_TOKEN_ERRORS = [
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
];

export type CallbackHandlerDependencies = Readonly<{
  clientId: string;
  issuer: string;
  redirectUri: string;
  tokenEndpoint: string;
  appOrigin: string;
  encryptionKey: Buffer;
  keys: JWTVerifyGetKey;
  createSession: (session: NewSession) => Promise<string>;
  postForm: PostForm;
  now?: () => Date;
  // Receives only fixed reason codes, never tokens, codes or cookie contents.
  logRejection?: (reason: string) => void;
}>;

type Transaction = Readonly<{ state: string; nonce: string; codeVerifier: string; issuedAt: number }>;

type TokenSet = Readonly<{ accessToken: string; refreshToken: string; idToken: string; expiresIn: number }>;

// Carries a fixed reason for the server log; the browser only ever sees `error`.
class CallbackError extends Error {
  constructor(
    readonly reason: string,
    readonly error: "auth_failed" | "auth_unavailable" = "auth_failed",
  ) {
    super(reason);
    this.name = "CallbackError";
  }
}

export function createCallbackHandler(deps: CallbackHandlerDependencies) {
  const now = deps.now ?? (() => new Date());
  const logRejection = deps.logRejection ?? ((reason) => console.warn("OIDC callback rejected:", reason));

  return async function GET(request: NextRequest): Promise<Response> {
    try {
      const params = request.nextUrl.searchParams;
      // The transaction is single-use, so it is read first and cleared on every outcome.
      const transaction = readTransaction(request, deps.encryptionKey, now());

      if (params.has("error")) {
        throw new CallbackError("provider_error");
      }
      const code = readSingleParam(params, "code");
      const state = readSingleParam(params, "state");
      if (!code || !state) {
        throw new CallbackError("missing_code_or_state");
      }
      if (!safeEqual(state, transaction.state)) {
        throw new CallbackError("state_mismatch");
      }

      const tokens = await exchangeCode(deps, code, transaction.codeVerifier);
      const subject = await verifyIdToken(deps, tokens.idToken, transaction.nonce, now());

      const issuedAt = now().getTime();
      const absoluteExpiresAt = new Date(issuedAt + SESSION_MAX_AGE_MS);
      const accessExpiresAt = new Date(Math.min(issuedAt + tokens.expiresIn * 1000, absoluteExpiresAt.getTime()));

      let sessionId: string;
      try {
        sessionId = await deps.createSession({
          subject,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          idToken: tokens.idToken,
          accessExpiresAt,
          absoluteExpiresAt,
        });
      } catch {
        throw new CallbackError("session_store_failed", "auth_unavailable");
      }

      const response = NextResponse.redirect(new URL("/", deps.appOrigin), 303);
      response.headers.set("Cache-Control", "no-store");
      response.cookies.set({
        name: sessionCookiePolicy.name,
        value: sessionId,
        httpOnly: sessionCookiePolicy.httpOnly,
        secure: sessionCookiePolicy.secure,
        sameSite: sessionCookiePolicy.sameSite,
        path: sessionCookiePolicy.path,
      });
      clearTransactionCookie(response);
      return response;
    } catch (error) {
      const failure = error instanceof CallbackError ? error : new CallbackError("unexpected", "auth_unavailable");
      logRejection(failure.reason);
      const response = NextResponse.json(
        { error: failure.error },
        { status: failure.error === "auth_failed" ? 400 : 503, headers: { "Cache-Control": "no-store" } },
      );
      clearTransactionCookie(response);
      return response;
    }
  };
}

// A repeated parameter is treated as invalid rather than picking one of the values.
function readSingleParam(params: URLSearchParams, name: string): string | null {
  const values = params.getAll(name);
  return values.length === 1 && values[0] !== "" ? values[0] : null;
}

function readTransaction(request: NextRequest, key: Buffer, now: Date): Transaction {
  const sealed = request.cookies.get(OIDC_TRANSACTION_COOKIE_NAME)?.value;
  if (!sealed) {
    throw new CallbackError("missing_transaction");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decryptSecret(sealed, key));
  } catch {
    throw new CallbackError("invalid_transaction");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !isNonEmptyString((parsed as Record<string, unknown>).state) ||
    !isNonEmptyString((parsed as Record<string, unknown>).nonce) ||
    !isNonEmptyString((parsed as Record<string, unknown>).codeVerifier) ||
    !Number.isSafeInteger((parsed as Record<string, unknown>).issuedAt)
  ) {
    throw new CallbackError("invalid_transaction");
  }
  const transaction = parsed as Transaction;

  const age = now.getTime() - transaction.issuedAt;
  if (age < 0 || age > TRANSACTION_MAX_AGE_MS) {
    throw new CallbackError("expired_transaction");
  }
  return transaction;
}

async function exchangeCode(deps: CallbackHandlerDependencies, code: string, codeVerifier: string): Promise<TokenSet> {
  let response: FormPostResponse;
  try {
    response = await deps.postForm(
      deps.tokenEndpoint,
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: deps.clientId,
        code,
        redirect_uri: deps.redirectUri,
        code_verifier: codeVerifier,
      }),
      TOKEN_ENDPOINT_TIMEOUT_MS,
    );
  } catch {
    throw new CallbackError("token_endpoint_unreachable", "auth_unavailable");
  }

  if (response.status < 200 || response.status >= 300) {
    // The body may echo request details; it is discarded unread.
    // 4xx usually means an expired or reused code; anything else is the provider's problem.
    throw response.status >= 400 && response.status < 500
      ? new CallbackError("token_exchange_rejected")
      : new CallbackError("token_endpoint_failed", "auth_unavailable");
  }

  let body: unknown;
  try {
    body = JSON.parse(response.body);
  } catch {
    throw new CallbackError("invalid_token_response", "auth_unavailable");
  }

  const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const { access_token, refresh_token, id_token, expires_in } = fields;
  if (
    !isNonEmptyString(access_token) ||
    !isNonEmptyString(refresh_token) ||
    !isNonEmptyString(id_token) ||
    typeof expires_in !== "number" ||
    !Number.isSafeInteger(expires_in) ||
    expires_in <= 0
  ) {
    throw new CallbackError("invalid_token_response", "auth_unavailable");
  }

  return { accessToken: access_token, refreshToken: refresh_token, idToken: id_token, expiresIn: expires_in };
}

// Returns the subject only after signature, issuer, audience, expiry and nonce all check out.
async function verifyIdToken(
  deps: CallbackHandlerDependencies,
  idToken: string,
  expectedNonce: string,
  now: Date,
): Promise<string> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(idToken, deps.keys, {
      issuer: deps.issuer,
      audience: deps.clientId,
      algorithms: ALLOWED_ALGORITHMS,
      requiredClaims: ["exp", "iat", "sub", "nonce"],
      currentDate: now,
    }));
  } catch (error) {
    if (ID_TOKEN_ERRORS.some((tokenError) => error instanceof tokenError)) {
      throw new CallbackError("invalid_id_token");
    }
    throw new CallbackError("id_token_keys_unavailable", "auth_unavailable");
  }

  if (typeof payload.nonce !== "string" || !safeEqual(payload.nonce, expectedNonce)) {
    throw new CallbackError("nonce_mismatch");
  }

  // OIDC Core 3.1.3.7: with several audiences, azp must name this client.
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if ((audiences.length > 1 || payload.azp !== undefined) && payload.azp !== deps.clientId) {
    throw new CallbackError("invalid_authorized_party");
  }

  if (!isNonEmptyString(payload.sub)) {
    throw new CallbackError("missing_subject");
  }
  return payload.sub;
}

// __Host- cookies are only overwritten by a Set-Cookie with Secure and Path=/.
function clearTransactionCookie(response: NextResponse): void {
  response.cookies.set({
    name: OIDC_TRANSACTION_COOKIE_NAME,
    value: "",
    httpOnly: oidcTransactionCookiePolicy.httpOnly,
    secure: oidcTransactionCookiePolicy.secure,
    sameSite: oidcTransactionCookiePolicy.sameSite,
    path: oidcTransactionCookiePolicy.path,
    maxAge: 0,
  });
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}
