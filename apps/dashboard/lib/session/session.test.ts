import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  OIDC_TRANSACTION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  oidcTransactionCookiePolicy,
  sessionCookiePolicy,
} from "./cookies";
import { readSessionConfig } from "./config";
import {
  decryptSecret,
  encryptSecret,
  generateSessionId,
  hashSessionId,
} from "./crypto";

const key = randomBytes(32);
const otherKey = randomBytes(32);
const validOrigin = "https://app.example.com";
const validKey = key.toString("base64");
const validDatabaseUrl = "postgres://user:secret-password@127.0.0.1:5432/conversion_engine";
const validEnv = {
  APP_ORIGIN: validOrigin,
  SESSION_ENCRYPTION_KEY: validKey,
  SESSION_DATABASE_URL: validDatabaseUrl,
};

test("readSessionConfig reads a valid origin, 32-byte base64 key and database URL", () => {
  const config = readSessionConfig(validEnv);

  assert.equal(config.appOrigin, validOrigin);
  assert.deepEqual(config.encryptionKey, key);
  assert.equal(config.databaseUrl, validDatabaseUrl);
  assert.equal(Object.isFrozen(config), true);
});

test("readSessionConfig rejects missing or invalid configuration", () => {
  assert.throws(() => readSessionConfig({ ...validEnv, APP_ORIGIN: undefined }), /APP_ORIGIN is required/);
  assert.throws(
    () => readSessionConfig({ ...validEnv, SESSION_ENCRYPTION_KEY: undefined }),
    /SESSION_ENCRYPTION_KEY is required/,
  );
  assert.throws(
    () => readSessionConfig({ ...validEnv, SESSION_ENCRYPTION_KEY: randomBytes(31).toString("base64") }),
    /must decode to 32 bytes/,
  );
  assert.throws(() => readSessionConfig({ ...validEnv, APP_ORIGIN: "not-a-url" }), /must be a valid URL/);
  assert.throws(
    () => readSessionConfig({ ...validEnv, APP_ORIGIN: `${validOrigin}/dashboard` }),
    /without a path/,
  );
});

test("readSessionConfig rejects a missing or invalid session database URL without leaking it", () => {
  assert.throws(
    () => readSessionConfig({ ...validEnv, SESSION_DATABASE_URL: undefined }),
    /SESSION_DATABASE_URL is required/,
  );
  assert.throws(() => readSessionConfig({ ...validEnv, SESSION_DATABASE_URL: "" }), /SESSION_DATABASE_URL is required/);
  assert.throws(
    () => readSessionConfig({ ...validEnv, SESSION_DATABASE_URL: "not a url" }),
    /SESSION_DATABASE_URL must be a valid URL/,
  );
  assert.throws(
    () => readSessionConfig({ ...validEnv, SESSION_DATABASE_URL: "mysql://user:secret-password@host/db" }),
    (error: Error) => /PostgreSQL URL/.test(error.message) && !error.message.includes("secret-password"),
  );
});

test("session cookies use the __Host- security policy", () => {
  assert.equal(SESSION_COOKIE_NAME, "__Host-ce_session");
  assert.deepEqual(sessionCookiePolicy, {
    name: "__Host-ce_session",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
  assert.equal("domain" in sessionCookiePolicy, false);
});

test("OIDC transaction cookie expires after ten minutes", () => {
  assert.equal(OIDC_TRANSACTION_COOKIE_NAME, "__Host-ce_oidc");
  assert.deepEqual(oidcTransactionCookiePolicy, {
    name: "__Host-ce_oidc",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAgeSeconds: 600,
  });
});

test("session IDs are opaque 32-byte base64url values", () => {
  const first = generateSessionId();
  const second = generateSessionId();

  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
});

test("session ID hashes are deterministic and one-way shaped", () => {
  const sessionId = generateSessionId();
  const hash = hashSessionId(sessionId);

  assert.equal(hash, hashSessionId(sessionId));
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, sessionId);
});

test("encryptSecret decrypts the original value", () => {
  const plaintext = "refresh-token-value";
  const encrypted = encryptSecret(plaintext, key);

  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptSecret(encrypted, key), plaintext);
});

test("encryptSecret uses a fresh IV for every value", () => {
  const first = encryptSecret("same-value", key);
  const second = encryptSecret("same-value", key);

  assert.notEqual(first, second);
});

test("decryptSecret rejects tampered values and a wrong key", () => {
  const encrypted = encryptSecret("sensitive-value", key);
  const parts = encrypted.split(".");
  parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;

  assert.throws(() => decryptSecret(parts.join("."), key), /Unable to decrypt/);
  assert.throws(() => decryptSecret(encrypted, otherKey), /Unable to decrypt/);
  assert.throws(() => decryptSecret("not-a-protected-value", key), /Unable to decrypt/);
});

test("crypto functions reject keys that are not 32 bytes", () => {
  const invalidKey = randomBytes(31);

  assert.throws(() => encryptSecret("value", invalidKey), /must be 32 bytes/);
  assert.throws(() => decryptSecret("v1.a.b.c", invalidKey), /must be 32 bytes/);
});
