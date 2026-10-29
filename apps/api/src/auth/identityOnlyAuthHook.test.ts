import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import type { AuthAdapter } from "./types.js";
import { createIdentityOnlyAuthHook } from "./identityOnlyAuthHook.js";

const TEST_IDENTITY_HEADER = "x-test-identity";

const authAdapter: AuthAdapter = {
  authenticate: async (request) => {
    const subject = request.headers[TEST_IDENTITY_HEADER];
    if (subject === undefined) return { status: "anonymous" };
    if (subject === "invalid") return { status: "invalid", reason: "test" };
    return {
      status: "authenticated",
      identity: {
        issuer: "https://issuer.test",
        subject: String(subject),
        assurance: { level: subject === "weak" ? "insufficient" : "aal2" },
      },
    };
  },
};

function setup(t: TestContext, seen: string[]) {
  const app = Fastify({ logger: false });
  app.addHook("onRequest", createIdentityOnlyAuthHook({ authAdapter }));
  app.post("/accept", async (request) => {
    seen.push(request.externalIdentity?.subject ?? "missing");
    return { ok: true };
  });
  t.after(() => app.close());
  return app;
}

test("identity-only auth accepteert een onbekende subject zonder membership-resolver", async (t) => {
  const seen: string[] = [];
  const response = await setup(t, seen).inject({
    method: "POST",
    url: "/accept",
    headers: { [TEST_IDENTITY_HEADER]: "new-user" },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(seen, ["new-user"]);
});

test("identity-only auth weigert anonymous, invalid en onvoldoende assurance", async (t) => {
  const app = setup(t, []);

  const anonymous = await app.inject({ method: "POST", url: "/accept" });
  const invalid = await app.inject({ method: "POST", url: "/accept", headers: { [TEST_IDENTITY_HEADER]: "invalid" } });
  const weak = await app.inject({ method: "POST", url: "/accept", headers: { [TEST_IDENTITY_HEADER]: "weak" } });

  assert.equal(anonymous.statusCode, 401);
  assert.equal(invalid.statusCode, 401);
  assert.equal(weak.statusCode, 403);
  assert.equal(anonymous.headers["cache-control"], "no-store");
  assert.equal(weak.headers["cache-control"], "no-store");
});
