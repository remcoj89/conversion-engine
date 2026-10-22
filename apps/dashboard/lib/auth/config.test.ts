import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readLogoutConfig, readOidcConfig } from "./config";

const encryptionKey = randomBytes(32).toString("base64");

const validEnv = {
  APP_ORIGIN: "http://localhost:3000",
  SESSION_ENCRYPTION_KEY: encryptionKey,
  SESSION_DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/app",
  AUTH_CLIENT_ID: "client-id",
  AUTH_ISSUER: "https://example.zitadel.cloud",
  AUTHORIZATION_ENDPOINT: "https://example.zitadel.cloud/oauth/v2/authorize",
  TOKEN_ENDPOINT: "https://example.zitadel.cloud/oauth/v2/token",
  JWKS_URI: "https://example.zitadel.cloud/oauth/v2/keys",
  AUTH_REDIRECT_URI: "http://localhost:3000/auth/callback",
};

test("readOidcConfig accepts the local PKCE configuration", () => {
  const config = readOidcConfig(validEnv);

  assert.equal(config.clientId, "client-id");
  assert.equal(config.issuer, "https://example.zitadel.cloud");
  assert.equal(config.redirectUri, "http://localhost:3000/auth/callback");
  assert.equal(config.tokenEndpoint, "https://example.zitadel.cloud/oauth/v2/token");
  assert.equal(config.jwksUri, "https://example.zitadel.cloud/oauth/v2/keys");
  assert.equal(config.encryptionKey.length, 32);
});

test("readOidcConfig rejects a non-HTTPS issuer", () => {
  assert.throws(
    () => readOidcConfig({ ...validEnv, AUTH_ISSUER: "http://example.zitadel.cloud" }),
    /AUTH_ISSUER must be an https URL/,
  );
});

test("readOidcConfig rejects a redirect URI with a query string", () => {
  assert.throws(
    () =>
      readOidcConfig({
        ...validEnv,
        AUTH_REDIRECT_URI: "http://localhost:3000/auth/callback?source=test",
      }),
    /AUTH_REDIRECT_URI must be an HTTP\(S\) URL without credentials, query or fragment/,
  );
});

test("readOidcConfig requires HTTPS token and JWKS endpoints", () => {
  assert.throws(() => readOidcConfig({ ...validEnv, TOKEN_ENDPOINT: undefined }), /TOKEN_ENDPOINT is required/);
  assert.throws(
    () => readOidcConfig({ ...validEnv, JWKS_URI: "http://example.zitadel.cloud/oauth/v2/keys" }),
    /JWKS_URI must be an https URL/,
  );
});

const logoutEnv = {
  AUTH_CLIENT_ID: "client-id",
  END_SESSION_ENDPOINT: "https://example.zitadel.cloud/oidc/v1/end_session",
  AUTH_POST_LOGOUT_REDIRECT_URI: "http://localhost:3000/",
};

test("readLogoutConfig accepts the local logout configuration", () => {
  const config = readLogoutConfig(logoutEnv);

  assert.equal(config.clientId, "client-id");
  assert.equal(config.endSessionEndpoint, "https://example.zitadel.cloud/oidc/v1/end_session");
  assert.equal(config.postLogoutRedirectUri, "http://localhost:3000/");
});

test("readLogoutConfig keeps the post-logout redirect URI exactly as registered", () => {
  for (const uri of ["https://app.example.test", "https://app.example.test/signed-out", "http://127.0.0.1:3000/"]) {
    assert.equal(readLogoutConfig({ ...logoutEnv, AUTH_POST_LOGOUT_REDIRECT_URI: uri }).postLogoutRedirectUri, uri);
  }
});

test("readLogoutConfig requires END_SESSION_ENDPOINT and AUTH_POST_LOGOUT_REDIRECT_URI", () => {
  assert.throws(() => readLogoutConfig({ ...logoutEnv, END_SESSION_ENDPOINT: undefined }), /END_SESSION_ENDPOINT is required/);
  assert.throws(() => readLogoutConfig({ ...logoutEnv, END_SESSION_ENDPOINT: " " }), /END_SESSION_ENDPOINT is required/);
  assert.throws(
    () => readLogoutConfig({ ...logoutEnv, AUTH_POST_LOGOUT_REDIRECT_URI: undefined }),
    /AUTH_POST_LOGOUT_REDIRECT_URI is required/,
  );
  assert.throws(() => readLogoutConfig({ ...logoutEnv, AUTH_CLIENT_ID: undefined }), /AUTH_CLIENT_ID is required/);
});

test("readLogoutConfig rejects an insecure or invalid end-session endpoint", () => {
  for (const value of [
    "http://example.zitadel.cloud/oidc/v1/end_session",
    "not a url",
    "https://user:pass@example.zitadel.cloud/oidc/v1/end_session",
    "https://example.zitadel.cloud/oidc/v1/end_session#fragment",
    "javascript:alert(1)",
  ]) {
    assert.throws(() => readLogoutConfig({ ...logoutEnv, END_SESSION_ENDPOINT: value }), /END_SESSION_ENDPOINT must be/);
  }
});

test("readLogoutConfig rejects an insecure or invalid post-logout redirect URI", () => {
  for (const value of [
    "http://app.example.test/",
    "not a url",
    "https://user:pass@app.example.test/",
    "https://app.example.test/?next=/admin",
    "https://app.example.test/#fragment",
    " https://app.example.test/",
    "javascript:alert(1)",
    "ftp://app.example.test/",
  ]) {
    assert.throws(
      () => readLogoutConfig({ ...logoutEnv, AUTH_POST_LOGOUT_REDIRECT_URI: value }),
      /AUTH_POST_LOGOUT_REDIRECT_URI must be/,
    );
  }
});
