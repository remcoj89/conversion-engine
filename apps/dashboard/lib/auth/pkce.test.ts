import { test } from "node:test";
import assert from "node:assert/strict";
import { createCodeChallenge, createOidcTransaction } from "./pkce";

test("OIDC transaction contains independent state, nonce and PKCE values", () => {
  const first = createOidcTransaction();
  const second = createOidcTransaction();

  assert.notEqual(first.state, first.nonce);
  assert.notEqual(first.state, second.state);
  assert.notEqual(first.codeVerifier, second.codeVerifier);
  assert.equal(first.codeChallenge, createCodeChallenge(first.codeVerifier));
  assert.match(first.codeVerifier, /^[A-Za-z0-9_-]+$/);
});
