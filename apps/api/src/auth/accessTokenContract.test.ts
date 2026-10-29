import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWK,
  type JWTPayload,
} from "jose";
import { createZitadelAdapter } from "./zitadelAdapter.js";
import type { AuthResult } from "./types.js";

const ISSUER = "https://issuer.test";
const AUDIENCE = "conversion-engine-api";
const SUBJECT = "zitadel-subject-123456";

const signingKeys = await generateKeyPair("RS256");
const otherKeys = await generateKeyPair("RS256");
const publicJwk: JWK = {
  ...(await exportJWK(signingKeys.publicKey)),
  kid: "key-1",
  alg: "RS256",
  use: "sig",
};
const localKeys = createLocalJWKSet({ keys: [publicJwk] });
const adapter = createZitadelAdapter({ issuer: ISSUER, audience: AUDIENCE, keys: localKeys });

type SignOptions = {
  key?: CryptoKey;
  kid?: string;
  expiresIn?: string | number;
  omitExpiration?: boolean;
};

function signAccessToken(payload: JWTPayload, options: SignOptions = {}) {
  let jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: options.kid ?? "key-1" })
    .setIssuedAt();
  const withIssuer = payload.iss === undefined ? jwt.setIssuer(ISSUER) : jwt;
  const withAudience = payload.aud === undefined ? withIssuer.setAudience(AUDIENCE) : withIssuer;

  jwt = withAudience;
  if (!options.omitExpiration) {
    jwt = jwt.setExpirationTime(options.expiresIn ?? "5m");
  }
  return jwt.sign(options.key ?? signingKeys.privateKey);
}

function requestWithToken(token: string): FastifyRequest {
  return { headers: { authorization: `Bearer ${token}` } } as FastifyRequest;
}

async function authenticate(token: string): Promise<AuthResult> {
  return adapter.authenticate(requestWithToken(token));
}

function assertInvalidWithoutLeak(result: AuthResult, token: string): void {
  assert.deepEqual(result, { status: "invalid", reason: "invalid_token" });
  const serialized = JSON.stringify(result);
  for (const part of [token, ...token.split("."), SUBJECT]) {
    if (part.length > 8) {
      assert.ok(!serialized.includes(part), "afwijzing bevat tokeninhoud");
    }
  }
}

test("access-token contract: ce_aal=aal2 geeft sterke assurance", async () => {
  const token = await signAccessToken({ sub: SUBJECT, ce_aal: "aal2" });

  assert.deepEqual(await authenticate(token), {
    status: "authenticated",
    identity: { issuer: ISSUER, subject: SUBJECT, assurance: { level: "aal2" } },
  });
});

test("access-token contract: ontbrekende, foute en malformed ce_aal zijn onvoldoende", async () => {
  const cases: Array<[string, JWTPayload]> = [
    ["ontbrekend", { sub: SUBJECT }],
    ["leeg", { sub: SUBJECT, ce_aal: "" }],
    ["verkeerde waarde", { sub: SUBJECT, ce_aal: "aal1" }],
    ["hoofdlettergevoelig", { sub: SUBJECT, ce_aal: "AAL2" }],
    ["null", { sub: SUBJECT, ce_aal: null as never }],
    ["array", { sub: SUBJECT, ce_aal: ["aal2"] as never }],
    ["object", { sub: SUBJECT, ce_aal: { level: "aal2" } as never }],
  ];

  for (const [name, payload] of cases) {
    const result = await authenticate(await signAccessToken(payload));
    assert.deepEqual(
      result,
      {
        status: "authenticated",
        identity: { issuer: ISSUER, subject: SUBJECT, assurance: { level: "insufficient" } },
      },
      name,
    );
  }
});

test("access-token contract: ID-tokenclaims worden niet als access-token assurance gebruikt", async () => {
  const idToken = await signAccessToken({ sub: SUBJECT, ce_aal: "aal2" });
  const accessToken = await signAccessToken({ sub: SUBJECT });

  // De adapter ontvangt alleen het access token; de apart uitgegeven ID-token mag geen invloed hebben.
  assert.ok(idToken.length > 0);
  assert.deepEqual(await authenticate(accessToken), {
    status: "authenticated",
    identity: { issuer: ISSUER, subject: SUBJECT, assurance: { level: "insufficient" } },
  });
});

test("access-token contract: issuer, audience, signature en exp blijven verplicht", async () => {
  const cases = [
    await signAccessToken({ sub: SUBJECT, ce_aal: "aal2", iss: "https://evil.test" }),
    await signAccessToken({ sub: SUBJECT, ce_aal: "aal2", aud: "other-api" }),
    await signAccessToken({ sub: SUBJECT, ce_aal: "aal2" }, { omitExpiration: true }),
    await signAccessToken({ sub: SUBJECT, ce_aal: "aal2" }, { key: otherKeys.privateKey }),
  ];

  for (const token of cases) {
    assertInvalidWithoutLeak(await authenticate(token), token);
  }
});

test("access-token contract: malformed tokens en foutresponses lekken geen tokeninhoud", async () => {
  const malformed = "not-a-jwt";
  assert.deepEqual(await adapter.authenticate(requestWithToken(malformed)), {
    status: "invalid",
    reason: "malformed_token",
  });

  const signedButInvalid = await signAccessToken({
    sub: SUBJECT,
    ce_aal: "aal2",
    sensitive_claim: "do-not-leak",
  }, { key: otherKeys.privateKey });
  assertInvalidWithoutLeak(await authenticate(signedButInvalid), signedButInvalid);
});
