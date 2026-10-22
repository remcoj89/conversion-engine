import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  UnsecuredJWT,
  type CryptoKey,
  type JWK,
  type JWTPayload,
} from "jose";
import { buildApp } from "./app.js";
import { readAuthConfig } from "./auth/authConfig.js";
import { getAuthContext } from "./auth/authHook.js";
import { authorize, type Permission } from "./auth/authorization.js";
import { createDiscoveredKeySet, OidcDiscoveryError } from "./auth/oidcDiscovery.js";
import { resolveRequestContext } from "./auth/requestContext.js";
import type { AuthResult, Membership } from "./auth/types.js";
import { AuthUnavailableError, createZitadelAdapter } from "./auth/zitadelAdapter.js";

test("authorize: dashboard:read is toegestaan voor owner en team_member", () => {
  assert.equal(authorize("owner", "dashboard:read"), true);
  assert.equal(authorize("team_member", "dashboard:read"), true);
});

test("authorize: onbekende permission wordt geweigerd", () => {
  // Casts simuleren ongecontroleerde invoer die de TypeScript-types omzeilt.
  for (const permission of ["settings:manage", "toString", "__proto__", ""]) {
    assert.equal(authorize("owner", permission as Permission), false, permission);
  }
});

test("getAuthContext: faalt zonder context", () => {
  assert.throws(() => getAuthContext({} as FastifyRequest), /Auth context missing/);
});

const userId: string = randomUUID();
const tenantA: string = randomUUID();
const tenantB: string = randomUUID();

const ownerOfA: Membership = { tenantId: tenantA, userId, role: "owner", status: "active" };
const memberOfB: Membership = { tenantId: tenantB, userId, role: "team_member", status: "active" };

test("resolveRequestContext: één membership zonder tenantkeuze geeft die tenant", () => {
  assert.deepEqual(resolveRequestContext([ownerOfA]), {
    status: "success",
    context: { userId, tenantId: tenantA, role: "owner" },
  });
});

test("resolveRequestContext: meerdere memberships zonder tenantkeuze geeft tenant_required", () => {
  assert.deepEqual(resolveRequestContext([ownerOfA, memberOfB]), { status: "tenant_required" });
});

test("resolveRequestContext: geldige tenantkeuze geeft tenant en rol van die membership", () => {
  assert.deepEqual(resolveRequestContext([ownerOfA], tenantA), {
    status: "success",
    context: { userId, tenantId: tenantA, role: "owner" },
  });
});

test("resolveRequestContext: keuze voor tenant A of B geeft de rol van die tenant", () => {
  const memberships = [ownerOfA, memberOfB];

  assert.deepEqual(resolveRequestContext(memberships, tenantA), {
    status: "success",
    context: { userId, tenantId: tenantA, role: "owner" },
  });
  assert.deepEqual(resolveRequestContext(memberships, tenantB), {
    status: "success",
    context: { userId, tenantId: tenantB, role: "team_member" },
  });
});

test("resolveRequestContext: onbekende UUID geeft membership_forbidden", () => {
  assert.deepEqual(resolveRequestContext([ownerOfA, memberOfB], randomUUID()), {
    status: "membership_forbidden",
  });
});

test("resolveRequestContext: ongeldige UUID geeft invalid_tenant", () => {
  for (const requested of ["", "abc", `${tenantA} `, `${tenantA}x`, tenantA.replaceAll("-", "")]) {
    assert.deepEqual(resolveRequestContext([ownerOfA], requested), { status: "invalid_tenant" }, requested);
  }
});

test("resolveRequestContext: lege memberships geeft membership_forbidden", () => {
  assert.deepEqual(resolveRequestContext([]), { status: "membership_forbidden" });
  assert.deepEqual(resolveRequestContext([], tenantA), { status: "membership_forbidden" });
});

test("resolveRequestContext: accepteert nooit een tenant die niet in memberships zit", () => {
  const memberships = [ownerOfA, memberOfB];
  const outsider = randomUUID();

  for (const requested of [undefined, tenantA, tenantB, outsider, tenantA.toUpperCase()]) {
    const result = resolveRequestContext(memberships, requested);
    if (result.status === "success") {
      assert.ok([tenantA, tenantB].includes(result.context.tenantId), String(requested));
    }
  }
  assert.equal(resolveRequestContext(memberships, outsider).status, "membership_forbidden");
});

test("resolveRequestContext: tenantkeuze is niet hoofdlettergevoelig en geeft de membership-ID terug", () => {
  const result = resolveRequestContext([ownerOfA], tenantA.toUpperCase());
  assert.equal(result.status, "success");
  assert.equal(result.status === "success" && result.context.tenantId, tenantA);
});

test("resolveRequestContext: niet-actieve membership wordt nooit gekozen", () => {
  const disabledInB: Membership = { ...memberOfB, status: "disabled" };

  assert.deepEqual(resolveRequestContext([disabledInB]), { status: "membership_forbidden" });
  assert.deepEqual(resolveRequestContext([disabledInB], tenantB), { status: "membership_forbidden" });
  // With A as the only active membership, no tenant choice is required.
  assert.equal(resolveRequestContext([ownerOfA, disabledInB]).status, "success");
});

// --- ZITADEL JWT-adapter: lokale sleutels en JWKS, geen netwerk ---

const ISSUER = "https://issuer.test";
const AUDIENCE = "conversion-engine-api";
const SUBJECT = "zitadel-subject-123456";

const signingKeys = await generateKeyPair("RS256");
const otherKeys = await generateKeyPair("RS256");
const publicJwk: JWK = { ...(await exportJWK(signingKeys.publicKey)), kid: "key-1", alg: "RS256", use: "sig" };
const localKeys = createLocalJWKSet({ keys: [publicJwk] });

function sign(payload: JWTPayload, options: { key?: CryptoKey; kid?: string; expiresIn?: string | number } = {}) {
  const jwt = new SignJWT(payload).setProtectedHeader({ alg: "RS256", kid: options.kid ?? "key-1" }).setIssuedAt();
  const withIssuer = payload.iss === undefined ? jwt.setIssuer(ISSUER) : jwt;
  const withAudience = payload.aud === undefined ? withIssuer.setAudience(AUDIENCE) : withIssuer;
  return withAudience.setExpirationTime(options.expiresIn ?? "5m").sign(options.key ?? signingKeys.privateKey);
}

const zitadelAdapter = createZitadelAdapter({ issuer: ISSUER, audience: AUDIENCE, keys: localKeys });
const withAuthorization = (authorization?: string) =>
  ({ headers: authorization === undefined ? {} : { authorization } }) as FastifyRequest;
const authenticate = (authorization?: string) => zitadelAdapter.authenticate(withAuthorization(authorization));

// Een afwijzing mag nooit token- of claiminhoud bevatten.
function assertInvalidWithoutLeak(result: AuthResult, token: string) {
  assert.equal(result.status, "invalid");
  const serialized = JSON.stringify(result);
  for (const part of [token, ...token.split("."), SUBJECT].filter((value) => value.length > 8)) {
    assert.ok(!serialized.includes(part), "afwijzing bevat tokeninhoud");
  }
}

test("zitadelAdapter: geldig token geeft alleen issuer en subject", async () => {
  const token = await sign({ sub: SUBJECT, email: "someone@example.com" });

  assert.deepEqual(await authenticate(`Bearer ${token}`), {
    status: "authenticated",
    identity: { issuer: ISSUER, subject: SUBJECT },
  });
  // Bearer-schema is niet hoofdlettergevoelig.
  assert.equal((await authenticate(`bearer ${token}`)).status, "authenticated");
});

test("zitadelAdapter: verlopen token wordt geweigerd", async () => {
  const token = await sign({ sub: SUBJECT }, { expiresIn: Math.floor(Date.now() / 1000) - 60 });
  assertInvalidWithoutLeak(await authenticate(`Bearer ${token}`), token);
});

test("zitadelAdapter: verkeerde issuer en audience worden geweigerd", async () => {
  for (const payload of [
    { sub: SUBJECT, iss: "https://evil.test" },
    { sub: SUBJECT, iss: `${ISSUER}/` },
    { sub: SUBJECT, aud: "other-api" },
  ]) {
    const token = await sign(payload);
    assertInvalidWithoutLeak(await authenticate(`Bearer ${token}`), token);
  }
});

test("zitadelAdapter: ontbrekende, lege of niet-string sub wordt geweigerd", async () => {
  for (const payload of [{}, { sub: "" }, { sub: "   " }]) {
    const token = await sign(payload);
    assert.equal((await authenticate(`Bearer ${token}`)).status, "invalid", JSON.stringify(payload));
  }
});

test("zitadelAdapter: alg none en HS256 worden geweigerd", async () => {
  const unsecured = new UnsecuredJWT({ sub: SUBJECT }).setIssuer(ISSUER).setAudience(AUDIENCE).setExpirationTime("5m").encode();
  assertInvalidWithoutLeak(await authenticate(`Bearer ${unsecured}`), unsecured);

  const hs256 = await new SignJWT({ sub: SUBJECT })
    .setProtectedHeader({ alg: "HS256", kid: "key-1" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode("a-shared-secret-that-is-long-enough-123456"));
  assertInvalidWithoutLeak(await authenticate(`Bearer ${hs256}`), hs256);
});

test("zitadelAdapter: token met een andere sleutel wordt geweigerd", async () => {
  for (const kid of ["key-1", "unknown-key"]) {
    const token = await sign({ sub: SUBJECT }, { key: otherKeys.privateKey, kid });
    assertInvalidWithoutLeak(await authenticate(`Bearer ${token}`), token);
  }
});

test("zitadelAdapter: ontbrekende, lege, niet-Bearer en misvormde credentials", async () => {
  const token = await sign({ sub: SUBJECT });

  assert.deepEqual(await authenticate(undefined), { status: "anonymous" });
  assert.deepEqual(await authenticate(""), { status: "invalid", reason: "empty_credentials" });
  assert.deepEqual(await authenticate(`Basic ${token}`), { status: "invalid", reason: "wrong_scheme" });
  assert.deepEqual(await authenticate(token), { status: "invalid", reason: "wrong_scheme" });
  assert.deepEqual(await authenticate("Bearer"), { status: "invalid", reason: "empty_token" });
  assert.deepEqual(await authenticate("Bearer    "), { status: "invalid", reason: "empty_token" });
  for (const malformed of ["not-a-jwt", "a.b", "a.b.c.d", `${token} extra`, "eyJ$.eyJ.sig"]) {
    assert.deepEqual(await authenticate(`Bearer ${malformed}`), { status: "invalid", reason: "malformed_token" }, malformed);
  }
  // Juiste vorm, maar geen geldige JWS.
  const garbage = "aaaa.bbbb.cccc";
  assertInvalidWithoutLeak(await authenticate(`Bearer ${garbage}`), garbage);
});

test("zitadelAdapter: sleutelbron-fout faalt closed zonder token in de fout", async () => {
  const token = await sign({ sub: SUBJECT });
  const failing = createZitadelAdapter({
    issuer: ISSUER,
    audience: AUDIENCE,
    keys: async () => {
      throw new Error(`jwks down while verifying ${token}`);
    },
  });

  await assert.rejects(failing.authenticate(withAuthorization(`Bearer ${token}`)), (error: unknown) => {
    assert.ok(error instanceof AuthUnavailableError);
    assert.deepEqual(error.cause, { name: "Error", code: undefined });
    const serialized = JSON.stringify({ message: error.message, cause: error.cause, stack: error.stack });
    assert.ok(!serialized.includes(token) && !serialized.includes("jwks down"));
    return true;
  });
});

// --- Configuratie ---

test("readAuthConfig: geldige config wordt genormaliseerd en bevroren", () => {
  for (const issuer of [ISSUER, `${ISSUER}/`, `${ISSUER}//`]) {
    const config = readAuthConfig({ ZITADEL_ISSUER: issuer, API_AUDIENCE: AUDIENCE });
    assert.deepEqual(config, { issuer: ISSUER, audience: AUDIENCE });
    assert.equal(Object.isFrozen(config), true);
  }
  assert.equal(readAuthConfig({ ZITADEL_ISSUER: "https://id.test/tenant/", API_AUDIENCE: "a" }).issuer, "https://id.test/tenant");
});

test("readAuthConfig: faalt closed bij ontbrekende of onveilige config", () => {
  const cases: [Record<string, string | undefined>, RegExp][] = [
    [{ API_AUDIENCE: AUDIENCE }, /ZITADEL_ISSUER is required/],
    [{ ZITADEL_ISSUER: "", API_AUDIENCE: AUDIENCE }, /ZITADEL_ISSUER is required/],
    [{ ZITADEL_ISSUER: "issuer.test", API_AUDIENCE: AUDIENCE }, /must be a valid URL/],
    [{ ZITADEL_ISSUER: "http://issuer.test", API_AUDIENCE: AUDIENCE }, /must use https/],
    [{ ZITADEL_ISSUER: "http://localhost:8080", API_AUDIENCE: AUDIENCE }, /must use https/],
    [{ ZITADEL_ISSUER: "https://u:p@issuer.test", API_AUDIENCE: AUDIENCE }, /must not contain/],
    [{ ZITADEL_ISSUER: "https://issuer.test?x=1", API_AUDIENCE: AUDIENCE }, /must not contain/],
    [{ ZITADEL_ISSUER: ISSUER }, /API_AUDIENCE is required/],
    [{ ZITADEL_ISSUER: ISSUER, API_AUDIENCE: "  " }, /API_AUDIENCE is required/],
  ];
  for (const [env, message] of cases) {
    assert.throws(() => readAuthConfig(env), message, JSON.stringify(env));
  }
});

// --- OIDC-discovery met een nep-fetch ---

const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const JWKS_URL = `${ISSUER}/oauth/v2/keys`;

function fakeFetch(discovery: unknown, jwks: unknown = { keys: [publicJwk] }, discoveryStatus = 200) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url === DISCOVERY_URL) return Response.json(discovery, { status: discoveryStatus });
    if (url === JWKS_URL) return Response.json(jwks);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test("discovery: issuer en jwks_uri kloppen, token verifieert via remote JWKS en discovery wordt gecachet", async () => {
  const { fetchImpl, calls } = fakeFetch({ issuer: ISSUER, jwks_uri: JWKS_URL });
  const adapter = createZitadelAdapter({ issuer: ISSUER, audience: AUDIENCE, keys: createDiscoveredKeySet(ISSUER, fetchImpl) });

  for (let i = 0; i < 3; i += 1) {
    const result = await adapter.authenticate(withAuthorization(`Bearer ${await sign({ sub: SUBJECT })}`));
    assert.equal(result.status, "authenticated");
  }
  assert.equal(calls.filter((url) => url === DISCOVERY_URL).length, 1);
  assert.equal(calls.filter((url) => url === JWKS_URL).length, 1);
});

test("discovery: onjuiste metadata of onbereikbare discovery faalt closed", async () => {
  const token = await sign({ sub: SUBJECT });
  const cases: [string, ReturnType<typeof fakeFetch>["fetchImpl"], string][] = [
    ["issuer mismatch", fakeFetch({ issuer: "https://evil.test", jwks_uri: JWKS_URL }).fetchImpl, "issuer_mismatch"],
    ["issuer met slash", fakeFetch({ issuer: `${ISSUER}/`, jwks_uri: JWKS_URL }).fetchImpl, "issuer_mismatch"],
    ["jwks_uri http", fakeFetch({ issuer: ISSUER, jwks_uri: "http://issuer.test/oauth/v2/keys" }).fetchImpl, "invalid_jwks_uri"],
    ["jwks_uri andere origin", fakeFetch({ issuer: ISSUER, jwks_uri: "https://evil.test/keys" }).fetchImpl, "invalid_jwks_uri"],
    ["jwks_uri ontbreekt", fakeFetch({ issuer: ISSUER }).fetchImpl, "invalid_jwks_uri"],
    ["discovery 500", fakeFetch({}, undefined, 500).fetchImpl, "discovery_unavailable"],
    ["netwerkfout", (async () => { throw new TypeError("fetch failed"); }) as typeof fetch, "discovery_unavailable"],
  ];

  for (const [name, fetchImpl, code] of cases) {
    const adapter = createZitadelAdapter({ issuer: ISSUER, audience: AUDIENCE, keys: createDiscoveredKeySet(ISSUER, fetchImpl) });
    await assert.rejects(adapter.authenticate(withAuthorization(`Bearer ${token}`)), (error: unknown) => {
      assert.ok(error instanceof AuthUnavailableError, name);
      assert.deepEqual(error.cause, { name: "OidcDiscoveryError", code }, name);
      return true;
    });
  }
});

test("discovery: een mislukte discovery wordt bij het volgende request opnieuw geprobeerd", async () => {
  let attempt = 0;
  const { fetchImpl: healthy } = fakeFetch({ issuer: ISSUER, jwks_uri: JWKS_URL });
  const flaky = (async (input: string | URL | Request, init?: RequestInit) => {
    attempt += 1;
    if (attempt === 1) throw new TypeError("fetch failed");
    return healthy(input, init);
  }) as typeof fetch;
  const adapter = createZitadelAdapter({ issuer: ISSUER, audience: AUDIENCE, keys: createDiscoveredKeySet(ISSUER, flaky) });
  const token = await sign({ sub: SUBJECT });

  await assert.rejects(adapter.authenticate(withAuthorization(`Bearer ${token}`)), AuthUnavailableError);
  assert.equal((await adapter.authenticate(withAuthorization(`Bearer ${token}`))).status, "authenticated");
});

test("discovery: onbereikbare JWKS faalt closed", async () => {
  const fetchImpl = (async (input: string | URL | Request) =>
    String(input) === DISCOVERY_URL
      ? Response.json({ issuer: ISSUER, jwks_uri: JWKS_URL })
      : new Response("unavailable", { status: 503 })) as typeof fetch;
  const adapter = createZitadelAdapter({ issuer: ISSUER, audience: AUDIENCE, keys: createDiscoveredKeySet(ISSUER, fetchImpl) });

  await assert.rejects(adapter.authenticate(withAuthorization(`Bearer ${await sign({ sub: SUBJECT })}`)), AuthUnavailableError);
});

test("OidcDiscoveryError draagt alleen een vaste code", () => {
  const error = new OidcDiscoveryError("issuer_mismatch");
  assert.equal(error.message, "issuer_mismatch");
  assert.equal(error.code, "issuer_mismatch");
});

// --- HTTP met de echte adapter ---

function httpSetup(memberships: readonly Membership[] = []) {
  const logs: string[] = [];
  const app = buildApp(
    {
      authAdapter: zitadelAdapter,
      membershipResolver: async ({ subject }) => (subject === SUBJECT ? memberships : []),
    },
    { logger: { level: "trace", stream: { write: (line: string) => logs.push(line) } } },
  );
  return { app, logs };
}

test("HTTP met ZITADEL-adapter: /health 200, zonder of met ongeldig token 401, geldig token 200", async (t) => {
  const tenantId = randomUUID();
  const { app, logs } = httpSetup([{ tenantId, userId: randomUUID(), role: "team_member", status: "active" }]);
  t.after(() => app.close());
  const valid = await sign({ sub: SUBJECT });
  const expired = await sign({ sub: SUBJECT }, { expiresIn: Math.floor(Date.now() / 1000) - 60 });
  const url = "/v1/dashboard/today";

  assert.equal((await app.inject({ method: "GET", url: "/health" })).statusCode, 200);

  for (const authorization of [undefined, "Basic abc", `Bearer ${expired}`, "Bearer garbage"]) {
    const response = await app.inject({ method: "GET", url, headers: authorization ? { authorization } : {} });
    assert.equal(response.statusCode, 401, String(authorization));
    assert.deepEqual(response.json(), { error: "unauthorized" });
  }

  const ok = await app.inject({ method: "GET", url, headers: { authorization: `Bearer ${valid}` } });
  assert.equal(ok.statusCode, 200);

  // Ook op trace-niveau komen token, JWT-delen en subject niet in de log.
  const log = logs.join("");
  for (const secret of [valid, expired, ...valid.split("."), SUBJECT]) {
    assert.ok(!log.includes(secret), "log bevat token- of identitydata");
  }
});

test("HTTP met ZITADEL-adapter: geldig token maar geen membership geeft 403", async (t) => {
  const { app } = httpSetup([]);
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/dashboard/today",
    headers: { authorization: `Bearer ${await sign({ sub: SUBJECT })}` },
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "forbidden" });
});

test("HTTP met ZITADEL-adapter: JWKS-fout geeft 500 internal_error zonder tokendata in response of log", async (t) => {
  const logs: string[] = [];
  const token = await sign({ sub: SUBJECT });
  const app = buildApp(
    {
      authAdapter: createZitadelAdapter({
        issuer: ISSUER,
        audience: AUDIENCE,
        keys: async () => {
          throw new Error(`jwks down ${token}`);
        },
      }),
      membershipResolver: async () => [],
    },
    { logger: { level: "trace", stream: { write: (line: string) => logs.push(line) } } },
  );
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/v1/dashboard/today", headers: { authorization: `Bearer ${token}` } });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: "internal_error" });
  const log = logs.join("");
  assert.match(log, /"errorCode":"auth_unavailable"/);
  for (const secret of [token, ...token.split("."), SUBJECT, "jwks down"]) {
    assert.ok(!log.includes(secret), "log bevat token- of foutdetails");
  }
});
