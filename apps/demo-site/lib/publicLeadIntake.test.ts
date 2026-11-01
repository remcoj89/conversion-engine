import assert from "node:assert/strict";
import test from "node:test";
import {
  contactPageLeadContext,
  createConfiguredPublicLeadIntakeClient,
  createIdempotencyKey,
  createPublicLeadApiClient,
  createPublicLeadSubmission,
  getPublicLeadErrorMessage,
  readPublicLeadApiConfig,
  unavailableLeadIntakeClient,
  type PublicLeadFormData,
} from "./publicLeadIntake";

const formData: PublicLeadFormData = {
  name: " Test Persoon ",
  email: " test@voorbeeld.nl ",
  organization: " Westend Digital ",
  message: " Ik heb een vraag. ",
  phone: "+31 6 12345678",
  privacyConsent: true,
  marketingConsent: false,
};

const submission = createPublicLeadSubmission(formData, contactPageLeadContext);

test("configuratie gebruikt alleen geldige publieke environment variables", () => {
  assert.deepEqual(
    readPublicLeadApiConfig({
      NEXT_PUBLIC_CONVERSION_ENGINE_API_BASE_URL: " https://api.example.test/ ",
      NEXT_PUBLIC_CONVERSION_ENGINE_WEBSITE_KEY: " public-site-key ",
    }),
    { apiBaseUrl: "https://api.example.test", websiteKey: "public-site-key" },
  );
  assert.equal(readPublicLeadApiConfig({}), null);
  assert.equal(
    readPublicLeadApiConfig({
      NEXT_PUBLIC_CONVERSION_ENGINE_API_BASE_URL: "javascript:alert(1)",
      NEXT_PUBLIC_CONVERSION_ENGINE_WEBSITE_KEY: "public-site-key",
    }),
    null,
  );
  assert.equal(
    readPublicLeadApiConfig({
      NEXT_PUBLIC_CONVERSION_ENGINE_API_BASE_URL: "https://api.example.test",
      NEXT_PUBLIC_CONVERSION_ENGINE_WEBSITE_KEY: "x".repeat(129),
    }),
    null,
  );
});

test("de fallback claimt geen succes en verstuurt niets zonder configuratie", async () => {
  assert.deepEqual(await unavailableLeadIntakeClient.submitLead(submission), { kind: "unavailable", reason: "not_configured" });

  let called = false;
  const client = createConfiguredPublicLeadIntakeClient({}, async () => {
    called = true;
    return new Response(null, { status: 201 });
  });
  assert.deepEqual(await client.submitLead(submission), { kind: "unavailable", reason: "not_configured" });
  assert.equal(called, false);
});

test("de adapter verstuurt alleen de vaste publieke body en veilige headers", async () => {
  let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;
  const client = createPublicLeadApiClient(
    { apiBaseUrl: "https://api.example.test", websiteKey: "public-site-key" },
    async (input, init) => {
      request = { input, init };
      return new Response(null, { status: 201 });
    },
    () => "lead-attempt-1",
  );

  assert.deepEqual(await client.submitLead(submission), { kind: "accepted" });
  assert.equal(request?.input, "https://api.example.test/v1/public/leads");
  assert.equal(request?.init?.method, "POST");
  assert.equal(request?.init?.mode, "cors");
  assert.equal(request?.init?.credentials, "omit");
  assert.equal(request?.init?.redirect, "error");
  assert.deepEqual(request?.init?.headers, {
    accept: "application/json",
    "content-type": "application/json",
    "x-website-key": "public-site-key",
    "idempotency-key": "lead-attempt-1",
  });
  assert.deepEqual(JSON.parse(String(request?.init?.body)), {
    name: "Test Persoon",
    email: "test@voorbeeld.nl",
    message: "Ik heb een vraag.",
    organization: "Westend Digital",
    phone: "+31 6 12345678",
    privacyConsent: true,
    marketingConsent: false,
  });
  assert.equal(String(request?.init?.body).includes("source"), false);
  assert.equal(String(request?.init?.body).includes("tenant"), false);
});

test("elke submitpoging krijgt een nieuwe geldige idempotency-key", async () => {
  const keys = ["lead-attempt-1", "lead-attempt-2"];
  const sentKeys: string[] = [];
  const client = createPublicLeadApiClient(
    { apiBaseUrl: "https://api.example.test", websiteKey: "public-site-key" },
    async (_input, init) => {
      sentKeys.push((init?.headers as Record<string, string>)["idempotency-key"]);
      return new Response(null, { status: 200 });
    },
    () => keys.shift() ?? "lead-fallback",
  );

  await client.submitLead(submission);
  await client.submitLead(submission);
  assert.deepEqual(sentKeys, ["lead-attempt-1", "lead-attempt-2"]);
  assert.match(createIdempotencyKey(), /^[A-Za-z0-9._~-]{1,128}$/);
});

test("200 en 201 worden als succes behandeld", async () => {
  for (const status of [200, 201]) {
    const client = createPublicLeadApiClient(
      { apiBaseUrl: "https://api.example.test", websiteKey: "public-site-key" },
      async () => new Response(null, { status }),
      () => "lead-attempt",
    );
    assert.deepEqual(await client.submitLead(submission), { kind: "accepted" });
  }
});

test("publieke API-statussen worden naar veilige gebruikersstaten vertaald", async () => {
  const cases = [
    [400, { kind: "error", reason: "invalid_request" }],
    [404, { kind: "unavailable", reason: "not_found" }],
    [409, { kind: "error", reason: "idempotency_conflict" }],
    [429, { kind: "error", reason: "rate_limited" }],
    [503, { kind: "error", reason: "temporarily_unavailable" }],
  ] as const;

  for (const [status, expected] of cases) {
    const client = createPublicLeadApiClient(
      { apiBaseUrl: "https://api.example.test", websiteKey: "public-site-key" },
      async () => new Response(null, { status }),
      () => "lead-attempt",
    );
    assert.deepEqual(await client.submitLead(submission), expected, `status ${status}`);
  }
});

test("elke foutstatus heeft een bruikbare Nederlandse gebruikersmelding", () => {
  for (const reason of ["invalid_request", "not_found", "idempotency_conflict", "rate_limited", "temporarily_unavailable", "network"] as const) {
    const message = getPublicLeadErrorMessage(reason);
    assert.ok(message.length > 20, reason);
    assert.equal(message.includes("503"), false);
    assert.equal(message.includes("fetch"), false);
  }
});

test("netwerkfouten worden niet als succes behandeld", async () => {
  const client = createPublicLeadApiClient(
    { apiBaseUrl: "https://api.example.test", websiteKey: "public-site-key" },
    async () => {
      throw new Error("network failure");
    },
    () => "lead-attempt",
  );

  assert.deepEqual(await client.submitLead(submission), { kind: "error", reason: "network" });
});
