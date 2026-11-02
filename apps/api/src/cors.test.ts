import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { PUBLIC_LEAD_ROUTE_PATH, readPublicLeadCorsOrigins, registerPublicLeadCors } from "./cors.js";

const allowedOrigin = "http://localhost:3100";

function createTestApp(origins: readonly string[] = [allowedOrigin]) {
  const app = Fastify({ logger: false });
  registerPublicLeadCors(app, origins);
  app.post(PUBLIC_LEAD_ROUTE_PATH, async (_request, reply) => reply.code(201).send({ accepted: true }));
  app.get("/health", async () => ({ status: "ok" }));
  return app;
}

test("development gebruikt alleen de twee expliciete lokale demo-origins", () => {
  assert.deepEqual(readPublicLeadCorsOrigins({ NODE_ENV: "development" }), [
    "http://localhost:3100",
    "http://127.0.0.1:3100",
  ]);
});

test("production zonder expliciete configuratie heeft geen toegestane origin", () => {
  assert.deepEqual(readPublicLeadCorsOrigins({ NODE_ENV: "production" }), []);
});

test("wildcard, pad en niet-http origins worden geweigerd", () => {
  for (const value of ["*", "http://localhost:3100/contact", "file:///tmp/demo"]) {
    assert.throws(
      () => readPublicLeadCorsOrigins({ NODE_ENV: "development", PUBLIC_LEAD_CORS_ORIGINS: value }),
      /ongeldige origin/,
      value,
    );
  }
});

test("toegestane demo-origin krijgt een geldige POST-preflight", async (t) => {
  const app = createTestApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: "OPTIONS",
    url: PUBLIC_LEAD_ROUTE_PATH,
    headers: {
      origin: allowedOrigin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "accept, content-type, x-website-key, idempotency-key",
    },
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["access-control-allow-origin"], allowedOrigin);
  assert.equal(response.headers["access-control-allow-methods"], "POST");
  assert.equal(response.headers["access-control-allow-headers"], "accept, content-type, idempotency-key, x-website-key");
  assert.equal(response.headers["access-control-allow-credentials"], undefined);
  assert.match(response.headers.vary ?? "", /Origin/);
});

test("niet-toegestane origin krijgt geen CORS-toegang", async (t) => {
  const app = createTestApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: "OPTIONS",
    url: PUBLIC_LEAD_ROUTE_PATH,
    headers: {
      origin: "https://unknown.example",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type, x-website-key, idempotency-key",
    },
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "cors_origin_denied" });
  assert.equal(response.headers["access-control-allow-origin"], undefined);
});

test("preflight met een niet-toegestane methode wordt geweigerd", async (t) => {
  const app = createTestApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: "OPTIONS",
    url: PUBLIC_LEAD_ROUTE_PATH,
    headers: {
      origin: allowedOrigin,
      "access-control-request-method": "GET",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: "cors_preflight_rejected" });
  assert.equal(response.headers["access-control-allow-origin"], allowedOrigin);
});

test("preflight met een niet-toegestane header wordt geweigerd", async (t) => {
  const app = createTestApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: "OPTIONS",
    url: PUBLIC_LEAD_ROUTE_PATH,
    headers: {
      origin: allowedOrigin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type, x-admin-token",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: "cors_preflight_rejected" });
});

test("toegestane gewone POST krijgt alleen de origin terug en geen credentials", async (t) => {
  const app = createTestApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: PUBLIC_LEAD_ROUTE_PATH,
    headers: { origin: allowedOrigin },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.headers["access-control-allow-origin"], allowedOrigin);
  assert.equal(response.headers["access-control-allow-credentials"], undefined);
  assert.match(response.headers.vary ?? "", /Origin/);
});

test("CORS-headers worden niet op niet-publieke routes gezet", async (t) => {
  const app = createTestApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/health",
    headers: { origin: allowedOrigin },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
});
