import assert from "node:assert/strict";
import test from "node:test";
import { createLogoutHandler, logoutUnavailable } from "./logout";

const CLIENT_ID = "dashboard-client";
const END_SESSION_ENDPOINT = "https://id.example.test/oidc/v1/end_session";
const POST_LOGOUT_REDIRECT_URI = "http://localhost:3000/";
const SESSION_ID = "session-id-from-store-00000000000000000000000";
const ACCESS_TOKEN = "access-token-secret-value";
const REFRESH_TOKEN = "refresh-token-secret-value";
const ID_TOKEN = "id-token-secret-value";

function setup(deleteSession: (sessionId: string) => Promise<void> = async () => undefined) {
  const deleted: string[] = [];
  const logs: string[] = [];
  const handler = createLogoutHandler({
    clientId: CLIENT_ID,
    endSessionEndpoint: END_SESSION_ENDPOINT,
    postLogoutRedirectUri: POST_LOGOUT_REDIRECT_URI,
    deleteSession: async (sessionId) => {
      deleted.push(sessionId);
      await deleteSession(sessionId);
    },
    logFailure: (reason) => logs.push(reason),
  });
  return { handler, deleted, logs };
}

function assertSessionCookieCleared(response: Response) {
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith("__Host-ce_session="));
  assert.ok(cookie, "session cookie must be cleared");
  assert.match(cookie, /^__Host-ce_session=;/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.doesNotMatch(cookie, /Domain=/i);
}

function assertEndSessionRedirect(response: Response) {
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("cache-control"), "no-store");

  const location = response.headers.get("location");
  assert.ok(location);
  const url = new URL(location);
  assert.equal(`${url.origin}${url.pathname}`, END_SESSION_ENDPOINT);
  // Exactly these two parameters, nothing else (no id_token_hint, no state, no tokens).
  assert.deepEqual([...url.searchParams.keys()].sort(), ["client_id", "post_logout_redirect_uri"]);
  assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(url.searchParams.get("post_logout_redirect_uri"), POST_LOGOUT_REDIRECT_URI);
  assert.ok(location.includes("post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000%2F"));
  assert.equal(location.includes("id_token_hint"), false);
  for (const secret of [ACCESS_TOKEN, REFRESH_TOKEN, ID_TOKEN, SESSION_ID]) {
    assert.equal(location.includes(secret), false);
  }
}

test("logout met geldige sessie verwijdert de sessie, wist de cookie en redirect naar Zitadel", async () => {
  const { handler, deleted, logs } = setup();
  const response = await handler(SESSION_ID);

  assert.deepEqual(deleted, [SESSION_ID]);
  assertSessionCookieCleared(response);
  assertEndSessionRedirect(response);
  assert.deepEqual(logs, []);
});

test("logout zonder cookie wist de cookie en redirect zonder sessie te verwijderen", async () => {
  for (const cookie of [undefined, ""]) {
    const { handler, deleted } = setup();
    const response = await handler(cookie);

    assert.deepEqual(deleted, []);
    assertSessionCookieCleared(response);
    assertEndSessionRedirect(response);
  }
});

test("bestaande query op het end-session endpoint wordt niet meegestuurd", async () => {
  const handler = createLogoutHandler({
    clientId: CLIENT_ID,
    endSessionEndpoint: `${END_SESSION_ENDPOINT}?id_token_hint=${ID_TOKEN}`,
    postLogoutRedirectUri: POST_LOGOUT_REDIRECT_URI,
    deleteSession: async () => undefined,
  });
  assertEndSessionRedirect(await handler(SESSION_ID));
});

test("databasefout wist de cookie, geeft een generieke 503 en stuurt niet door naar Zitadel", async () => {
  const { handler, deleted, logs } = setup(async () => {
    throw new Error(`connection failed for ${SESSION_ID} ${ACCESS_TOKEN}`);
  });
  const response = await handler(SESSION_ID);

  assert.deepEqual(deleted, [SESSION_ID]);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "logout_unavailable" });
  assertSessionCookieCleared(response);
  assert.deepEqual(logs, ["session_delete_failed"]);
});

test("logoutUnavailable wist de cookie en geeft een generieke 503", async () => {
  const response = logoutUnavailable();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "logout_unavailable" });
  assertSessionCookieCleared(response);
});

test("session ID en tokens komen nooit in response of logs terecht", async () => {
  const secrets = [SESSION_ID, ACCESS_TOKEN, REFRESH_TOKEN, ID_TOKEN];
  const consoleOutput: string[] = [];
  const originals = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const method of ["log", "warn", "error", "info"] as const) {
    console[method] = (...args: unknown[]) => consoleOutput.push(args.map(String).join(" "));
  }

  try {
    const deleteBehaviours: Array<() => Promise<void>> = [
      async () => undefined,
      async () => {
        throw new Error(`delete failed for ${SESSION_ID} with ${ACCESS_TOKEN} ${REFRESH_TOKEN} ${ID_TOKEN}`);
      },
    ];
    for (const deleteSession of deleteBehaviours) {
      // Default logger, so real console output is captured too.
      const handler = createLogoutHandler({
        clientId: CLIENT_ID,
        endSessionEndpoint: END_SESSION_ENDPOINT,
        postLogoutRedirectUri: POST_LOGOUT_REDIRECT_URI,
        deleteSession,
      });
      const response = await handler(SESSION_ID);
      const exposed = [await response.text(), ...response.headers.values()].join("\n");
      for (const secret of secrets) {
        assert.equal(exposed.includes(secret), false, "response must not contain secrets");
      }
    }
  } finally {
    Object.assign(console, originals);
  }

  assert.ok(consoleOutput.length > 0, "failures are logged");
  for (const line of consoleOutput) {
    for (const secret of secrets) {
      assert.equal(line.includes(secret), false, "logs must not contain secrets");
    }
  }
});
