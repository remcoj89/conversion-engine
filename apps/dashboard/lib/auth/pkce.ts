import { createHash, randomBytes } from "node:crypto";

export type OidcTransaction = Readonly<{
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  // Epoch milliseconds; the callback rejects transactions older than ten minutes.
  issuedAt: number;
  returnTo: "/" | "/invite";
}>;

export function createOidcTransaction(now: Date = new Date(), returnTo: "/" | "/invite" = "/"): OidcTransaction {
  const state = randomValue();
  const nonce = randomValue();
  const codeVerifier = randomValue(48);

  return Object.freeze({
    state,
    nonce,
    codeVerifier,
    codeChallenge: createCodeChallenge(codeVerifier),
    issuedAt: now.getTime(),
    returnTo,
  });
}

export function createCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

function randomValue(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
