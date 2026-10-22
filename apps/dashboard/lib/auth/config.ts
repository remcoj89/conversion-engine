import { readSessionConfig } from "../session/config";

export type OidcConfig = Readonly<{
  clientId: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  redirectUri: string;
  encryptionKey: Buffer;
}>;

export type LogoutConfig = Readonly<{
  clientId: string;
  endSessionEndpoint: string;
  postLogoutRedirectUri: string;
}>;

export type OidcEnv = Readonly<Record<string, string | undefined>>;

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export function readOidcConfig(env: OidcEnv = process.env): OidcConfig {
  const session = readSessionConfig(env);

  return Object.freeze({
    clientId: readRequired(env.AUTH_CLIENT_ID, "AUTH_CLIENT_ID"),
    issuer: readIssuer(env.AUTH_ISSUER),
    authorizationEndpoint: readHttpsUrl(
      env.AUTHORIZATION_ENDPOINT,
      "AUTHORIZATION_ENDPOINT",
    ),
    tokenEndpoint: readHttpsUrl(env.TOKEN_ENDPOINT, "TOKEN_ENDPOINT"),
    jwksUri: readHttpsUrl(env.JWKS_URI, "JWKS_URI"),
    redirectUri: readRedirectUri(env.AUTH_REDIRECT_URI),
    encryptionKey: session.encryptionKey,
  });
}

// Separate from readOidcConfig, so login and callback keep working without logout configuration.
export function readLogoutConfig(env: OidcEnv = process.env): LogoutConfig {
  return Object.freeze({
    clientId: readRequired(env.AUTH_CLIENT_ID, "AUTH_CLIENT_ID"),
    endSessionEndpoint: readHttpsUrl(env.END_SESSION_ENDPOINT, "END_SESSION_ENDPOINT"),
    postLogoutRedirectUri: readPostLogoutRedirectUri(env.AUTH_POST_LOGOUT_REDIRECT_URI),
  });
}

function readRequired(value: string | undefined, name: string): string {
  if (!value || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readHttpsUrl(value: string | undefined, name: string): string {
  const raw = readRequired(value, name);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`${name} must be an https URL without credentials or fragment`);
  }

  return url.href;
}

function readIssuer(value: string | undefined): string {
  return readHttpsUrl(value, "AUTH_ISSUER").replace(/\/+$/, "");
}

function readRedirectUri(value: string | undefined): string {
  const raw = readRequired(value, "AUTH_REDIRECT_URI");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("AUTH_REDIRECT_URI must be a valid URL");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("AUTH_REDIRECT_URI must be an HTTP(S) URL without credentials, query or fragment");
  }

  return url.href;
}

// HTTPS, with plain HTTP only for loopback during local development.
// Returned unnormalised: Zitadel compares it byte for byte with the registered URI.
function readPostLogoutRedirectUri(value: string | undefined): string {
  const raw = readRequired(value, "AUTH_POST_LOGOUT_REDIRECT_URI");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("AUTH_POST_LOGOUT_REDIRECT_URI must be a valid URL");
  }

  const secure = url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname));
  if (!secure || raw !== raw.trim() || url.username || url.password || url.search || url.hash) {
    throw new Error(
      "AUTH_POST_LOGOUT_REDIRECT_URI must be an https URL (http only for localhost) without credentials, query or fragment",
    );
  }

  return raw;
}
