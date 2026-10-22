import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { RefreshOutcome } from "../session/refresh";
import { createTodayHandler } from "./today";

const API_BASE_URL = "http://api.test";
const VALID_SESSION_ID = "valid-session-id-000000000000000000000000000";
const ACCESS_TOKEN = "server-side-access-token";
const REFRESHED_ACCESS_TOKEN = "refreshed-access-token";
const TENANT_ID = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const NOW = new Date("2026-10-22T12:00:00Z");
const MINUTE = 60_000;

type FetchCall = { url: string; headers: Headers };
type RefreshCall = { sessionId: string; rejectedAccessToken?: string };

type SetupOptions = {
  accessExpiresAt?: Date;
  refresh?: () => Promise<RefreshOutcome>;
};

// Nep-API: legt binnenkomende requests vast en geeft een vooraf gekozen response terug.
// apiResponse krijgt het volgnummer van de API-call, zodat een eerste 401 en een tweede 200 te testen zijn.
function setup(
  apiResponse: (call: number) => Response | Promise<Response> = () => Response.json({ ok: true }),
  options: SetupOptions = {},
) {
  const calls: FetchCall[] = [];
  const lookups: string[] = [];
  const refreshes: RefreshCall[] = [];
  const handler = createTodayHandler({
    apiBaseUrl: API_BASE_URL,
    lookupSession: async (sessionId) => {
      lookups.push(sessionId);
      return sessionId === VALID_SESSION_ID
        ? {
            accessToken: ACCESS_TOKEN,
            accessExpiresAt: options.accessExpiresAt ?? new Date(NOW.getTime() + 30 * MINUTE),
            absoluteExpiresAt: new Date(NOW.getTime() + 12 * 60 * MINUTE),
          }
        : null;
    },
    refreshSession: async (sessionId, rejectedAccessToken) => {
      refreshes.push(rejectedAccessToken === undefined ? { sessionId } : { sessionId, rejectedAccessToken });
      return options.refresh ? options.refresh() : { status: "ok", accessToken: REFRESHED_ACCESS_TOKEN };
    },
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers) });
      return apiResponse(calls.length);
    }) as typeof fetch,
    now: () => NOW,
  });
  return { handler, calls, lookups, refreshes };
}

function request(headers: Record<string, string> = {}) {
  return new NextRequest("https://app.test/api/dashboard/today", { headers });
}

const withSession = (headers: Record<string, string> = {}) =>
  request({ cookie: `__Host-ce_session=${VALID_SESSION_ID}`, ...headers });

async function assertUnauthorizedAndCleared(response: Response) {
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /^__Host-ce_session=;/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=lax/i);
}

test("geen cookie geeft 401, wist de cookie en roept de API niet aan", async () => {
  const { handler, calls, lookups } = setup();

  await assertUnauthorizedAndCleared(await handler(request()));
  assert.equal(calls.length, 0);
  assert.equal(lookups.length, 0);
});

test("onbekende of verlopen sessiecookie geeft 401 en wist de cookie", async () => {
  // De store geeft null voor zowel onbekende als verlopen sessies.
  const { handler, calls } = setup();

  for (const sessionId of ["unknown-session", "expired-session"]) {
    await assertUnauthorizedAndCleared(await handler(request({ cookie: `__Host-ce_session=${sessionId}` })));
  }
  assert.equal(calls.length, 0);
});

test("alleen __Host-ce_session telt; andere cookienamen geven 401", async () => {
  const { handler, lookups } = setup();

  const response = await handler(request({ cookie: `ce_session=${VALID_SESSION_ID}; session=${VALID_SESSION_ID}` }));

  await assertUnauthorizedAndCleared(response);
  assert.deepEqual(lookups, []);
});

test("browser-Authorization zonder sessie geeft 401 en wordt niet doorgestuurd", async () => {
  const { handler, calls } = setup();

  await assertUnauthorizedAndCleared(await handler(request({ authorization: "Bearer browser-token" })));
  assert.equal(calls.length, 0);
});

test("geldige sessie stuurt het sessietoken als Bearer en negeert browser-Authorization", async () => {
  const { handler, calls } = setup();

  const response = await handler(withSession({ authorization: "Bearer browser-token" }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${API_BASE_URL}/v1/dashboard/today`);
  assert.equal(calls[0].headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
});

test("alleen authorization en x-tenant-id gaan naar de API", async () => {
  const { handler, calls } = setup();

  await handler(withSession({ "x-tenant-id": TENANT_ID, "x-custom": "leak", "x-forwarded-for": "1.2.3.4" }));

  assert.deepEqual([...calls[0].headers.keys()].sort(), ["authorization", "x-tenant-id"]);
  assert.equal(calls[0].headers.get("x-tenant-id"), TENANT_ID);
});

test("lege of ontbrekende x-tenant-id wordt niet doorgestuurd", async () => {
  const { handler, calls } = setup();

  await handler(withSession());
  await handler(withSession({ "x-tenant-id": "" }));

  for (const call of calls) {
    assert.equal(call.headers.has("x-tenant-id"), false);
  }
});

test("bestaande statusmapping blijft intact en zet altijd no-store", async () => {
  const cases: [string, (call: number) => Response | Promise<Response>, number, unknown][] = [
    ["2xx", () => Response.json({ ok: true }, { status: 200 }), 200, { ok: true }],
    ["400 tenant_required", () => Response.json({ error: "tenant_required" }, { status: 400 }), 400, { error: "tenant_required" }],
    ["400 invalid_tenant", () => Response.json({ error: "invalid_tenant" }, { status: 400 }), 400, { error: "invalid_tenant" }],
    ["400 onbekend", () => Response.json({ error: "secret", detail: "x" }, { status: 400 }), 400, { error: "api_error" }],
    ["400 geen JSON", () => new Response("nope", { status: 400 }), 400, { error: "api_error" }],
    ["401", () => Response.json({ error: "unauthorized", reason: "secret" }, { status: 401 }), 401, { error: "unauthorized" }],
    ["403", () => Response.json({ error: "forbidden", tenant: "secret" }, { status: 403 }), 403, { error: "forbidden" }],
    ["500", () => Response.json({ error: "internal_error", stack: "secret" }, { status: 500 }), 502, { error: "api_unavailable" }],
    ["404", () => Response.json({ message: "not found" }, { status: 404 }), 502, { error: "api_unavailable" }],
    ["2xx zonder JSON", () => new Response("not json", { status: 200 }), 503, { error: "api_unavailable" }],
    ["netwerkfout", () => Promise.reject(new TypeError("fetch failed")), 503, { error: "api_unavailable" }],
    ["timeout", () => Promise.reject(new DOMException("timeout", "TimeoutError")), 503, { error: "api_unavailable" }],
  ];

  for (const [name, apiResponse, status, body] of cases) {
    const { handler } = setup(apiResponse);
    const response = await handler(withSession());

    assert.equal(response.status, status, name);
    assert.deepEqual(await response.json(), body, name);
    assert.equal(response.headers.get("cache-control"), "no-store", name);
    // Ook een blijvende API-401 (na één refresh) wist de sessiecookie niet.
    assert.equal(response.headers.get("set-cookie"), null, name);
  }
});

test("onbereikbare sessiestore geeft 503 en wist de cookie niet", async () => {
  const handler = createTodayHandler({
    apiBaseUrl: API_BASE_URL,
    lookupSession: async () => {
      throw new Error("connection refused");
    },
    refreshSession: async () => ({ status: "ok", accessToken: REFRESHED_ACCESS_TOKEN }),
    fetch: (async () => Response.json({ ok: true })) as typeof fetch,
  });

  const response = await handler(withSession());

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "api_unavailable" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("access-token dat binnen 60 seconden verloopt wordt vóór de API-call ververst", async () => {
  for (const accessExpiresAt of [new Date(NOW.getTime() + MINUTE), new Date(NOW.getTime() - MINUTE)]) {
    const { handler, calls, refreshes } = setup(undefined, { accessExpiresAt });
    const response = await handler(withSession());

    assert.equal(response.status, 200);
    assert.deepEqual(refreshes, [{ sessionId: VALID_SESSION_ID }]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers.get("authorization"), `Bearer ${REFRESHED_ACCESS_TOKEN}`);
  }
});

test("nog geldig access-token wordt niet ververst", async () => {
  const { handler, calls, refreshes } = setup(undefined, { accessExpiresAt: new Date(NOW.getTime() + MINUTE + 1) });

  assert.equal((await handler(withSession())).status, 200);
  assert.deepEqual(refreshes, []);
  assert.equal(calls[0].headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
});

test("API-401 leidt tot precies één refresh en één nieuwe poging met het nieuwe token", async () => {
  const { handler, calls, refreshes } = setup((call) =>
    call === 1 ? Response.json({ error: "unauthorized" }, { status: 401 }) : Response.json({ ok: true }),
  );
  const response = await handler(withSession({ "x-tenant-id": TENANT_ID }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(refreshes, [{ sessionId: VALID_SESSION_ID, rejectedAccessToken: ACCESS_TOKEN }]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(calls[1].headers.get("authorization"), `Bearer ${REFRESHED_ACCESS_TOKEN}`);
  assert.equal(calls[1].headers.get("x-tenant-id"), TENANT_ID);
});

test("blijvende API-401 geeft 401 zonder tweede refresh of retry-loop", async () => {
  const { handler, calls, refreshes } = setup(() => Response.json({ error: "unauthorized" }, { status: 401 }));
  const response = await handler(withSession());

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
  assert.equal(refreshes.length, 1);
  assert.equal(calls.length, 2);
});

test("API-401 waarbij de refresh faalt: ongeldige sessie geeft 401 en wist de cookie", async () => {
  const { handler, calls, refreshes } = setup(() => Response.json({ error: "unauthorized" }, { status: 401 }), {
    refresh: async () => ({ status: "invalid" }),
  });

  await assertUnauthorizedAndCleared(await handler(withSession()));
  assert.equal(refreshes.length, 1);
  assert.equal(calls.length, 1, "geen retry na een mislukte refresh");
});

test("API-401 waarbij de provider onbereikbaar is geeft 503 en laat de cookie staan", async () => {
  const { handler, calls } = setup(() => Response.json({ error: "unauthorized" }, { status: 401 }), {
    refresh: async () => ({ status: "unavailable" }),
  });
  const response = await handler(withSession());

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "api_unavailable" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(calls.length, 1);
});

test("mislukte refresh vóór de API-call roept de API niet aan", async () => {
  const cases: Array<[RefreshOutcome, number]> = [
    [{ status: "invalid" }, 401],
    [{ status: "unavailable" }, 503],
  ];
  for (const [outcome, status] of cases) {
    const { handler, calls } = setup(undefined, {
      accessExpiresAt: new Date(NOW.getTime() + 10_000),
      refresh: async () => outcome,
    });
    const response = await handler(withSession());
    assert.equal(response.status, status);
    assert.equal(calls.length, 0);
  }
});

test("API-403 wordt doorgegeven zonder refresh", async () => {
  const { handler, calls, refreshes } = setup(() => Response.json({ error: "forbidden" }, { status: 403 }));
  const response = await handler(withSession());

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
  assert.deepEqual(refreshes, []);
  assert.equal(calls.length, 1);
});

test("falende refresh-store geeft een generieke 503", async () => {
  const { handler } = setup(() => Response.json({ error: "unauthorized" }, { status: 401 }), {
    refresh: async () => {
      throw new Error(`lock timeout for ${VALID_SESSION_ID}`);
    },
  });
  const response = await handler(withSession());

  assert.equal(response.status, 503);
  const body = await response.text();
  assert.equal(body.includes(VALID_SESSION_ID), false);
});

test("tokens en sessie-ID komen nooit in de BFF-response terecht", async () => {
  const scenarios: Array<[(call: number) => Response, SetupOptions]> = [
    [(call) => (call === 1 ? new Response(null, { status: 401 }) : Response.json({ ok: true })), {}],
    [() => new Response(null, { status: 401 }), { refresh: async () => ({ status: "invalid" }) }],
    [() => new Response(null, { status: 401 }), { refresh: async () => ({ status: "unavailable" }) }],
  ];
  for (const [apiResponse, options] of scenarios) {
    const { handler } = setup(apiResponse, options);
    const response = await handler(withSession());
    const exposed = [await response.text(), ...response.headers.values()].join("\n");
    for (const secret of [ACCESS_TOKEN, REFRESHED_ACCESS_TOKEN, VALID_SESSION_ID]) {
      assert.equal(exposed.includes(secret), false);
    }
  }
});
