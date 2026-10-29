import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, type KeyObject } from "node:crypto";
import test from "node:test";
import { SignJWT, createLocalJWKSet, type JWK, type JWTPayload } from "jose";
import { NextRequest } from "next/server";
import { encryptSecret } from "../session/crypto";
import type { NewSession } from "../session/store";
import { createCallbackHandler } from "./callback";
import type { PostForm } from "./tokenTransport";

const key = randomBytes(32);
const CLIENT_ID = "dashboard-client";
const ISSUER = "https://id.example.test";
const TOKEN_ENDPOINT = "https://id.example.test/oauth/v2/token";
const REDIRECT_URI = "https://app.example.test/auth/callback";
const APP_ORIGIN = "https://app.example.test";
const NOW = new Date("2026-10-22T12:00:00Z");
const NOW_S = Math.floor(NOW.getTime() / 1000);
const SESSION_ID = "session-id-from-store-00000000000000000000000";

const transaction = {
  state: "expected-state",
  nonce: "expected-nonce",
  codeVerifier: "code-verifier-value",
  codeChallenge: "code-challenge-value",
  issuedAt: NOW.getTime() - 60_000,
  returnTo: "/" as const,
};

const ACCESS_TOKEN = "access-token-secret-value";
const REFRESH_TOKEN = "refresh-token-secret-value";
const AUTH_CODE = "authorization-code-secret-value";

// Synchronous key generation: the test file runs as CommonJS, so no top-level await.
const signingKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = { ...signingKeys.publicKey.export({ format: "jwk" }), kid: "key-1", alg: "RS256" } as JWK;
const keys = createLocalJWKSet({ keys: [publicJwk] });

function idToken(claims: JWTPayload = {}, signWith: KeyObject = signingKeys.privateKey) {
  // Overrides go last, so a test can replace or (with undefined) drop any standard claim.
  return new SignJWT({
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: "user-123",
    iat: NOW_S - 5,
    exp: NOW_S + 300,
    nonce: transaction.nonce,
    azp: CLIENT_ID,
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "key-1" })
    .sign(signWith);
}

async function tokenResponse(overrides: Record<string, unknown> = {}) {
  return Response.json({
    access_token: ACCESS_TOKEN,
    refresh_token: REFRESH_TOKEN,
    id_token: await idToken(),
    expires_in: 3600,
    token_type: "Bearer",
    ...overrides,
  });
}

type PostCall = { url: string; form: URLSearchParams; timeoutMs: number };

// Lets tests describe the token endpoint as a Response while the handler sees the transport's shape.
function postFormFrom(tokenEndpoint: () => Response | Promise<Response>, calls: PostCall[] = []): PostForm {
  return async (url, form, timeoutMs) => {
    calls.push({ url, form, timeoutMs });
    const response = await tokenEndpoint();
    return { status: response.status, body: await response.text() };
  };
}

function setup(tokenEndpoint: () => Response | Promise<Response> = () => tokenResponse()) {
  const postCalls: PostCall[] = [];
  const sessions: NewSession[] = [];
  const logs: string[] = [];
  const handler = createCallbackHandler({
    clientId: CLIENT_ID,
    issuer: ISSUER,
    redirectUri: REDIRECT_URI,
    tokenEndpoint: TOKEN_ENDPOINT,
    appOrigin: APP_ORIGIN,
    encryptionKey: key,
    keys,
    createSession: async (session) => {
      sessions.push(session);
      return SESSION_ID;
    },
    postForm: postFormFrom(tokenEndpoint, postCalls),
    now: () => NOW,
    logRejection: (reason) => logs.push(reason),
  });
  return { handler, postCalls, sessions, logs };
}

const sealedTransaction = (value: unknown = transaction) => encryptSecret(JSON.stringify(value), key);

function request(query: string, cookie: string | null = sealedTransaction()) {
  return new NextRequest(`${REDIRECT_URI}?${query}`, {
    headers: cookie === null ? {} : { cookie: `__Host-ce_oidc=${cookie}` },
  });
}

const validQuery = `code=${AUTH_CODE}&state=${transaction.state}`;

function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

function assertTransactionCleared(response: Response) {
  const cookie = setCookies(response).find((value) => value.startsWith("__Host-ce_oidc="));
  assert.ok(cookie, "transaction cookie must be cleared");
  assert.match(cookie, /^__Host-ce_oidc=;/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Secure/);
}

async function assertGenericFailure(response: Response, status = 400, error = "auth_failed") {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(setCookies(response).some((value) => value.startsWith("__Host-ce_session=")), false);
  assertTransactionCleared(response);
}

test("ontbrekende code of state geeft een generieke fout zonder token-call", async () => {
  for (const query of [`state=${transaction.state}`, `code=${AUTH_CODE}`, "", `code=&state=${transaction.state}`]) {
    const { handler, postCalls, sessions } = setup();
    await assertGenericFailure(await handler(request(query)));
    assert.equal(postCalls.length, 0);
    assert.equal(sessions.length, 0);
  }
});

test("dubbele code- of state-parameter wordt geweigerd", async () => {
  const { handler, postCalls } = setup();
  await assertGenericFailure(await handler(request(`${validQuery}&state=other`)));
  assert.equal(postCalls.length, 0);
});

test("OAuth error-response geeft een generieke fout zonder providerdetails", async () => {
  const { handler, postCalls, logs } = setup();
  const response = await handler(
    request(`error=access_denied&error_description=secret+detail&state=${transaction.state}`),
  );
  const body = await response.clone().text();

  await assertGenericFailure(response);
  assert.equal(body.includes("access_denied") || body.includes("secret"), false);
  assert.equal(postCalls.length, 0);
  assert.deepEqual(logs, ["provider_error"]);
});

test("ontbrekende transactiecookie wordt geweigerd", async () => {
  const { handler, postCalls, logs } = setup();
  await assertGenericFailure(await handler(request(validQuery, null)));
  assert.equal(postCalls.length, 0);
  assert.deepEqual(logs, ["missing_transaction"]);
});

test("verkeerde state wordt geweigerd", async () => {
  const { handler, postCalls, logs } = setup();
  await assertGenericFailure(await handler(request(`code=${AUTH_CODE}&state=attacker-state`)));
  assert.equal(postCalls.length, 0);
  assert.deepEqual(logs, ["state_mismatch"]);
});

test("transactiecookie ouder dan tien minuten of uit de toekomst wordt geweigerd", async () => {
  for (const issuedAt of [NOW.getTime() - 10 * 60_000 - 1, NOW.getTime() + 1]) {
    const { handler, postCalls, logs } = setup();
    await assertGenericFailure(await handler(request(validQuery, sealedTransaction({ ...transaction, issuedAt }))));
    assert.equal(postCalls.length, 0);
    assert.deepEqual(logs, ["expired_transaction"]);
  }
});

test("transactiecookie van precies tien minuten oud wordt nog geaccepteerd", async () => {
  const { handler } = setup();
  const cookie = sealedTransaction({ ...transaction, issuedAt: NOW.getTime() - 10 * 60_000 });
  assert.equal((await handler(request(validQuery, cookie))).status, 303);
});

test("gemanipuleerde, met andere sleutel versleutelde of malformed transactiecookie wordt geweigerd", async () => {
  const sealed = sealedTransaction();
  const parts = sealed.split(".");
  const flipped = parts[3][0] === "A" ? "B" : "A";
  const tampered = [...parts.slice(0, 3), flipped + parts[3].slice(1)].join(".");

  const cookies = [
    tampered,
    encryptSecret(JSON.stringify(transaction), randomBytes(32)),
    "not-a-sealed-value",
    encryptSecret("not json", key),
    sealedTransaction({ ...transaction, nonce: undefined }),
    sealedTransaction({ ...transaction, issuedAt: "yesterday" }),
    sealedTransaction(["array"]),
  ];
  for (const cookie of cookies) {
    const { handler, postCalls, logs } = setup();
    await assertGenericFailure(await handler(request(validQuery, cookie)));
    assert.equal(postCalls.length, 0);
    assert.deepEqual(logs, ["invalid_transaction"]);
  }
});

test("token endpoint wordt aangeroepen met PKCE-form-POST en timeout", async () => {
  const { handler, postCalls } = setup();
  await handler(request(validQuery));

  assert.equal(postCalls.length, 1);
  const [{ url, form, timeoutMs }] = postCalls;
  assert.equal(url, TOKEN_ENDPOINT);
  assert.equal(timeoutMs, 5000);
  assert.deepEqual(Object.fromEntries(form), {
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    code: AUTH_CODE,
    redirect_uri: REDIRECT_URI,
    code_verifier: transaction.codeVerifier,
  });
});

test("token endpoint failure geeft een generieke fout en maakt geen sessie", async () => {
  const cases: Array<[() => Response | Promise<Response>, number, string]> = [
    [() => Response.json({ error: "invalid_grant", error_description: AUTH_CODE }, { status: 400 }), 400, "auth_failed"],
    [() => new Response("upstream down", { status: 500 }), 503, "auth_unavailable"],
    [
      () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      },
      503,
      "auth_unavailable",
    ],
  ];
  for (const [tokenEndpoint, status, error] of cases) {
    const { handler, sessions } = setup(tokenEndpoint);
    const response = await handler(request(validQuery));
    const body = await response.clone().text();
    await assertGenericFailure(response, status, error);
    assert.equal(body.includes(AUTH_CODE), false);
    assert.equal(sessions.length, 0);
  }
});

test("ongeldige tokenresponse wordt geweigerd", async () => {
  const invalidBodies = [
    () => new Response("not json", { status: 200 }),
    () => Response.json(null),
    () => tokenResponse({ access_token: undefined }),
    () => tokenResponse({ refresh_token: "" }),
    () => tokenResponse({ id_token: 42 }),
    () => tokenResponse({ expires_in: "3600" }),
    () => tokenResponse({ expires_in: -1 }),
    () => tokenResponse({ expires_in: 1.5 }),
  ];
  for (const tokenEndpoint of invalidBodies) {
    const { handler, sessions } = setup(tokenEndpoint);
    await assertGenericFailure(await handler(request(validQuery)), 503, "auth_unavailable");
    assert.equal(sessions.length, 0);
  }
});

test("ID-token met ongeldige issuer, audience, nonce, exp, azp of handtekening wordt geweigerd", async () => {
  const unsigned = (claims: JWTPayload) =>
    `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(
      JSON.stringify(claims),
    ).toString("base64url")}.`;
  const cases: Array<[Promise<string> | string, string]> = [
    [idToken({ iss: "https://evil.example.test" }), "invalid_id_token"],
    [idToken({ aud: "other-client" }), "invalid_id_token"],
    [idToken({ exp: NOW_S - 1 }), "invalid_id_token"],
    [idToken({ nonce: undefined }), "invalid_id_token"],
    [idToken({ nonce: "replayed-nonce" }), "nonce_mismatch"],
    [idToken({ aud: [CLIENT_ID, "project-id"], azp: "other-client" }), "invalid_authorized_party"],
    [idToken({}, otherKeys.privateKey), "invalid_id_token"],
    [
      unsigned({ iss: ISSUER, aud: CLIENT_ID, sub: "user-123", nonce: transaction.nonce, iat: NOW_S, exp: NOW_S + 300 }),
      "invalid_id_token",
    ],
  ];
  for (const [token, reason] of cases) {
    const id_token = await token;
    const { handler, sessions, logs } = setup(() => tokenResponse({ id_token }));
    await assertGenericFailure(await handler(request(validQuery)));
    assert.equal(sessions.length, 0);
    assert.deepEqual(logs, [reason]);
  }
});

test("succesvolle callback maakt een sessie, zet de sessiecookie en redirect naar APP_ORIGIN", async () => {
  const signedIdToken = await idToken({ aud: [CLIENT_ID, "project-id"] });
  const { handler, sessions, logs } = setup(() => tokenResponse({ id_token: signedIdToken }));
  const response = await handler(request(validQuery));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${APP_ORIGIN}/`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(logs, []);

  const sessionCookie = setCookies(response).find((value) => value.startsWith("__Host-ce_session="));
  assert.ok(sessionCookie);
  assert.match(sessionCookie, new RegExp(`^__Host-ce_session=${SESSION_ID};`));
  assert.match(sessionCookie, /Path=\//);
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /Secure/);
  assert.match(sessionCookie, /SameSite=lax/i);
  assert.doesNotMatch(sessionCookie, /Domain=/i);
  assertTransactionCleared(response);

  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0], {
    subject: "user-123",
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    idToken: signedIdToken,
    accessExpiresAt: new Date(NOW.getTime() + 3600 * 1000),
    absoluteExpiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
  });
});

test("succesvolle callback kan alleen naar de vaste invite-continuatie redirecten", async () => {
  const signedIdToken = await idToken();
  const { handler } = setup(() => tokenResponse({ id_token: signedIdToken }));
  const response = await handler(request(validQuery, sealedTransaction({ ...transaction, returnTo: "/invite" })));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${APP_ORIGIN}/invite`);
});

test("callback weigert een gemanipuleerde returnTo-waarde in de versleutelde transactie", async () => {
  const { handler, postCalls, logs } = setup();
  await assertGenericFailure(await handler(request(validQuery, sealedTransaction({ ...transaction, returnTo: "https://evil.test" }))));
  assert.equal(postCalls.length, 0);
  assert.deepEqual(logs, ["invalid_transaction"]);
});

test("accessExpiresAt valt nooit na de absolute sessie-einde", async () => {
  const { handler, sessions } = setup(() => tokenResponse({ expires_in: 48 * 60 * 60 }));
  await handler(request(validQuery));
  assert.equal(sessions[0].accessExpiresAt.getTime(), sessions[0].absoluteExpiresAt.getTime());
});

test("falende sessiestore geeft een generieke fout zonder sessiecookie", async () => {
  const failing = createCallbackHandler({
    clientId: CLIENT_ID,
    issuer: ISSUER,
    redirectUri: REDIRECT_URI,
    tokenEndpoint: TOKEN_ENDPOINT,
    appOrigin: APP_ORIGIN,
    encryptionKey: key,
    keys,
    createSession: async () => {
      throw new Error(`connection failed for ${ACCESS_TOKEN}`);
    },
    postForm: postFormFrom(() => tokenResponse()),
    now: () => NOW,
    logRejection: () => undefined,
  });
  await assertGenericFailure(await failing(request(validQuery)), 503, "auth_unavailable");
});

test("tokens, code en cookie-inhoud komen nooit in response of logs terecht", async () => {
  const signedIdToken = await idToken();
  const secrets = [ACCESS_TOKEN, REFRESH_TOKEN, signedIdToken, AUTH_CODE, transaction.codeVerifier, transaction.nonce];
  const consoleOutput: string[] = [];
  const originals = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const method of ["log", "warn", "error", "info"] as const) {
    console[method] = (...args: unknown[]) => consoleOutput.push(args.map(String).join(" "));
  }

  try {
    const scenarios: Array<() => Response | Promise<Response>> = [
      () => tokenResponse({ id_token: signedIdToken }),
      () => tokenResponse({ id_token: signedIdToken, expires_in: "bad" }),
      () => Response.json({ error: "invalid_grant", error_description: AUTH_CODE }, { status: 400 }),
      async () => tokenResponse({ id_token: await idToken({ nonce: "other" }) }),
    ];
    for (const tokenEndpoint of scenarios) {
      // Default logger, so real console output is captured too.
      const handler = createCallbackHandler({
        clientId: CLIENT_ID,
        issuer: ISSUER,
        redirectUri: REDIRECT_URI,
        tokenEndpoint: TOKEN_ENDPOINT,
        appOrigin: APP_ORIGIN,
        encryptionKey: key,
        keys,
        createSession: async () => SESSION_ID,
        postForm: postFormFrom(tokenEndpoint),
        now: () => NOW,
      });
      const cookie = sealedTransaction();
      const response = await handler(request(validQuery, cookie));
      const exposed = [await response.text(), ...response.headers.values()].join("\n");
      for (const secret of [...secrets, cookie]) {
        assert.equal(exposed.includes(secret), false, "response must not contain secrets");
      }
    }
  } finally {
    Object.assign(console, originals);
  }

  assert.ok(consoleOutput.length > 0, "rejections are logged");
  for (const line of consoleOutput) {
    for (const secret of secrets) {
      assert.equal(line.includes(secret), false, "logs must not contain secrets");
    }
  }
});
