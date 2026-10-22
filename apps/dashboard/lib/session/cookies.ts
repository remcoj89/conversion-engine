export const SESSION_COOKIE_NAME = "__Host-ce_session";
export const OIDC_TRANSACTION_COOKIE_NAME = "__Host-ce_oidc";

export type CookiePolicy = Readonly<{
  name: string;
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: "/";
  maxAgeSeconds?: number;
}>;

export const sessionCookiePolicy: CookiePolicy = Object.freeze({
  name: SESSION_COOKIE_NAME,
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
});

export const oidcTransactionCookiePolicy: CookiePolicy = Object.freeze({
  name: OIDC_TRANSACTION_COOKIE_NAME,
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAgeSeconds: 600,
});
