import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./app.js";

test("GET /health geeft status ok", async (t) => {
  const app = buildApp({ logger: false });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "conversion-engine-api",
  });
});
