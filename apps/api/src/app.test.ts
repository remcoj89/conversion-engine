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

test("GET /v1/dashboard/today geeft het Vandaag-contract", async (t) => {
  const app = buildApp({ logger: false });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/dashboard/today",
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /^application\/json/);
  assert.deepEqual(response.json(), {
    actionRequired: [
      {
        id: "leads-needing-attention",
        label: "Leads die aandacht vragen",
        value: null,
        status: "unavailable",
        source: "CRM",
      },
      {
        id: "open-tasks",
        label: "Open taken",
        value: null,
        status: "unavailable",
        source: "CRM",
      },
      {
        id: "confirmed-appointments",
        label: "Bevestigde afspraken",
        value: null,
        status: "unavailable",
        source: "Boekingsprovider",
      },
    ],
    directFollowUp: {
      status: "empty",
      message:
        "Zodra de Conversion Engine API is gekoppeld, verschijnen hier de aanvragen die opvolging nodig hebben.",
    },
  });
});
