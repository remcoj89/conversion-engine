import assert from "node:assert/strict";
import test from "node:test";
import { UnsecuredJWT } from "jose";
import { inspectAccessToken } from "./tokenDiagnostics";

test("inspectAccessToken reports only safe claim booleans", async () => {
  const token = new UnsecuredJWT({ sub: "subject", ce_aal: "aal2" })
    .setIssuer("https://issuer.test")
    .setAudience("conversion-engine-api")
    .setExpirationTime("5m")
    .encode();

  assert.deepEqual(inspectAccessToken(token), {
    isJwt: true,
    hasIssuer: true,
    hasAudience: true,
    hasSubject: true,
    hasExpiration: true,
    hasConversionEngineAalClaim: true,
    conversionEngineAalIsAal2: true,
  });
  assert.equal(JSON.stringify(inspectAccessToken(token)).includes(token), false);
});

test("inspectAccessToken fails closed for missing or malformed assurance", async () => {
  const token = new UnsecuredJWT({ sub: "subject", ce_aal: "aal1" })
    .setIssuer("https://issuer.test")
    .setAudience("conversion-engine-api")
    .setExpirationTime("5m")
    .encode();

  assert.equal(inspectAccessToken(token).conversionEngineAalIsAal2, false);
  assert.equal(inspectAccessToken("not-a-jwt").isJwt, false);
});
