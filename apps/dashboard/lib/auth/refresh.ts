import type { FormPostResponse, PostForm } from "./tokenTransport";

const TOKEN_ENDPOINT_TIMEOUT_MS = 5000;

export type RefreshedTokens = Readonly<{
  accessToken: string;
  // Absent when the provider does not rotate; the caller keeps the current refresh token.
  refreshToken?: string;
  expiresIn: number;
}>;

export type RefreshTokens = (refreshToken: string) => Promise<RefreshedTokens>;

export type TokenRefresherDependencies = Readonly<{
  clientId: string;
  tokenEndpoint: string;
  postForm: PostForm;
}>;

// `invalid_grant`: the refresh token is expired, revoked or already used, so the session is dead.
// `unavailable`: the provider could not be reached or failed; the session may still be fine.
// `invalid_response`: the provider answered 2xx with something that is not a usable token response.
export class RefreshError extends Error {
  constructor(readonly reason: "invalid_grant" | "unavailable" | "invalid_response") {
    super(`Token refresh failed: ${reason}`);
    this.name = "RefreshError";
  }
}

export function createTokenRefresher(deps: TokenRefresherDependencies): RefreshTokens {
  return async (refreshToken) => {
    let response: FormPostResponse;
    try {
      response = await deps.postForm(
        deps.tokenEndpoint,
        new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: deps.clientId }),
        TOKEN_ENDPOINT_TIMEOUT_MS,
      );
    } catch {
      throw new RefreshError("unavailable");
    }

    if (response.status < 200 || response.status >= 300) {
      // Only the OAuth error code is read; the rest of the body is never kept or logged.
      // Other 4xx errors (invalid_client, …) are configuration problems, not a dead session.
      throw errorCode(response.body) === "invalid_grant" && response.status >= 400 && response.status < 500
        ? new RefreshError("invalid_grant")
        : new RefreshError("unavailable");
    }

    let body: unknown;
    try {
      body = JSON.parse(response.body);
    } catch {
      throw new RefreshError("invalid_response");
    }

    // An id_token in the response is ignored on purpose: identity is only established at login.
    const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const { access_token, refresh_token, expires_in, token_type, scope } = fields;
    if (
      !isNonEmptyString(access_token) ||
      typeof expires_in !== "number" ||
      !Number.isFinite(expires_in) ||
      expires_in <= 0 ||
      (refresh_token !== undefined && !isNonEmptyString(refresh_token)) ||
      (token_type !== undefined && (typeof token_type !== "string" || token_type.toLowerCase() !== "bearer")) ||
      (scope !== undefined && typeof scope !== "string")
    ) {
      throw new RefreshError("invalid_response");
    }

    return refresh_token === undefined
      ? { accessToken: access_token, expiresIn: expires_in }
      : { accessToken: access_token, refreshToken: refresh_token, expiresIn: expires_in };
  };
}

function errorCode(body: string): unknown {
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>).error : undefined;
  } catch {
    return undefined;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}
