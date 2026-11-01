import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { buildApp, type AppDependencies } from "../app.js";
import type { AuthAdapter } from "../auth/types.js";
import { PublicLeadIdempotencyConflictError, type PublicWebsiteContext } from "../leads/publicLeadRepository.js";
import type { PublicLeadInput } from "../leads/publicLeadInput.js";

const websiteKey = "site_abcdefghijklmnopqrstuvwxyz123456";
const website: PublicWebsiteContext = { websiteId: randomUUID(), tenantId: randomUUID() };

const authAdapter: AuthAdapter = {
  authenticate: async () => ({ status: "anonymous" }),
};

const validBody = {
  name: "  Ada Lovelace  ",
  email: " ADA@EXAMPLE.TEST ",
  message: "Ik wil graag kennismaken.",
  phone: "+31 6 1234 5678",
  organization: "Analytical Engines",
  privacyConsent: true,
  marketingConsent: false,
};

function dependencies(
  overrides: Partial<Pick<AppDependencies, "websiteResolver" | "publicLeadCreator">> = {},
): AppDependencies {
  return {
    authAdapter,
    membershipResolver: async () => [],
    tenantLoader: async () => null,
    leadCreator: async () => {
      throw new Error("not used");
    },
    onboardingStore: {
      findCurrent: async () => null,
      saveDraft: async () => { throw new Error("not used"); },
      submit: async () => { throw new Error("not used"); },
    },
    reviewerAssignmentResolver: async () => [],
    reviewStore: {
      findReviewable: async () => null,
      readContent: async () => ({ status: "not_found" }),
      requestChanges: async () => { throw new Error("not used"); },
      block: async () => { throw new Error("not used"); },
      unblock: async () => { throw new Error("not used"); },
      approve: async () => { throw new Error("not used"); },
      reopen: async () => { throw new Error("not used"); },
    },
    websiteResolver: async () => website,
    publicLeadCreator: async () => ({ status: "accepted", leadId: randomUUID(), createdAt: new Date() }),
    ...overrides,
  };
}

function setup(t: TestContext, overrides: Partial<Pick<AppDependencies, "websiteResolver" | "publicLeadCreator">> = {}) {
  const app = buildApp(dependencies(overrides), { logger: false });
  t.after(() => app.close());
  return app;
}

test("POST /v1/public/leads is auth-free but requires both bounded headers", async (t) => {
  const app = setup(t);
  for (const headers of [
    {},
    { "x-website-key": websiteKey },
    { "idempotency-key": "request-1" },
    { "x-website-key": websiteKey, "idempotency-key": "bad key" },
  ]) {
    const response = await app.inject({ method: "POST", url: "/v1/public/leads", headers, payload: validBody });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: "invalid_request" });
    assert.equal(response.headers["cache-control"], "no-store");
  }
});

test("POST /v1/public/leads validates the exact visitor contract and never accepts source or tenant fields", async (t) => {
  const app = setup(t);
  for (const payload of [
    { ...validBody, source: "manual" },
    { ...validBody, tenant_id: website.tenantId },
    { ...validBody, privacyConsent: false },
    { ...validBody, marketingConsent: "yes" },
    { ...validBody, email: "not-an-email" },
    { ...validBody, phone: "not a phone" },
  ]) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/public/leads",
      headers: { "x-website-key": websiteKey, "idempotency-key": randomUUID() },
      payload,
    });
    assert.equal(response.statusCode, 400, JSON.stringify(payload));
    assert.deepEqual(response.json(), { error: "invalid_body" });
  }
});

test("POST /v1/public/leads resolves the website server-side and returns no tenant details", async (t) => {
  const calls: { key: string; website: PublicWebsiteContext; keyHeader: string; input: PublicLeadInput }[] = [];
  const app = setup(t, {
    websiteResolver: async (key) => {
      calls.push({ key, website: website, keyHeader: key, input: validBody as unknown as PublicLeadInput });
      return website;
    },
    publicLeadCreator: async (resolvedWebsite, idempotencyKey, input) => {
      calls.push({ key: idempotencyKey, website: resolvedWebsite, keyHeader: idempotencyKey, input });
      return { status: "accepted", leadId: randomUUID(), createdAt: new Date() };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/public/leads",
    headers: { "x-website-key": websiteKey, "idempotency-key": "request-1" },
    payload: validBody,
  });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), { accepted: true });
  assert.ok(!response.body.includes(website.tenantId));
  assert.ok(!response.body.includes(website.websiteId));
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(calls[0]?.key, websiteKey);
  assert.equal(calls[1]?.input.email, "ada@example.test");
});

test("POST /v1/public/leads maps inactive/unknown website, replay, conflict and rate limit generically", async (t) => {
  const notFound = await setup(t, { websiteResolver: async () => null }).inject({
    method: "POST", url: "/v1/public/leads", headers: { "x-website-key": websiteKey, "idempotency-key": "not-found" }, payload: validBody,
  });
  assert.equal(notFound.statusCode, 404);
  assert.deepEqual(notFound.json(), { error: "not_found" });

  const replay = await setup(t, { publicLeadCreator: async () => ({ status: "replayed" }) }).inject({
    method: "POST", url: "/v1/public/leads", headers: { "x-website-key": websiteKey, "idempotency-key": "replay" }, payload: validBody,
  });
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(replay.json(), { accepted: true });

  const conflict = await setup(t, { publicLeadCreator: async () => { throw new PublicLeadIdempotencyConflictError(); } }).inject({
    method: "POST", url: "/v1/public/leads", headers: { "x-website-key": websiteKey, "idempotency-key": "conflict" }, payload: validBody,
  });
  assert.equal(conflict.statusCode, 409);
  assert.deepEqual(conflict.json(), { error: "idempotency_conflict" });

  const limited = await setup(t, { publicLeadCreator: async () => ({ status: "rate_limited" }) }).inject({
    method: "POST", url: "/v1/public/leads", headers: { "x-website-key": websiteKey, "idempotency-key": "limited" }, payload: validBody,
  });
  assert.equal(limited.statusCode, 429);
  assert.deepEqual(limited.json(), { error: "rate_limited" });
});

test("POST /v1/public/leads hides persistence failures behind a generic 503", async (t) => {
  const app = setup(t, { publicLeadCreator: async () => { throw new Error("tenant and provider secret"); } });
  const response = await app.inject({
    method: "POST", url: "/v1/public/leads", headers: { "x-website-key": websiteKey, "idempotency-key": "failure" }, payload: validBody,
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: "temporarily_unavailable" });
  assert.ok(!response.body.includes("tenant and provider secret"));
});
