import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  createCrmSettingsHandler,
  fetchCrmSettings,
  parseCrmSettingsResponse,
  updateCrmSettings,
} from "./crmSettings";

const settings = {
  timezone: "Europe/Amsterdam",
  workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  workingHours: { start: "09:00", end: "17:00" },
  leadFollowUp: {
    enabled: true,
    deadlineBusinessDays: 1,
    assignmentStrategy: "owner",
    notifications: { inApp: true, email: true },
  },
  leadSources: [{ id: "website", label: "Website", enabled: true }],
} as const;

test("CRM settings parser accepts the future tenant contract", () => {
  assert.deepEqual(parseCrmSettingsResponse(settings), settings);
});

test("CRM settings parser rejects malformed or over-broad responses", () => {
  assert.equal(parseCrmSettingsResponse({ ...settings, extra: true }), null);
  assert.equal(parseCrmSettingsResponse({ ...settings, workingHours: { start: "17:00", end: "09:00" } }), null);
  for (const workingDays of [[], ["monday"], ["monday", "tuesday", "wednesday", "thursday", "thursday"], ["friday", "thursday", "wednesday", "tuesday", "monday"]]) {
    assert.equal(parseCrmSettingsResponse({ ...settings, workingDays }), null);
  }
  assert.equal(parseCrmSettingsResponse({ ...settings, leadFollowUp: { ...settings.leadFollowUp, enabled: "yes" } }), null);
  assert.equal(parseCrmSettingsResponse({ ...settings, leadFollowUp: { ...settings.leadFollowUp, notifications: ["in_app"] } }), null);
  assert.equal(parseCrmSettingsResponse({ ...settings, leadFollowUp: { ...settings.leadFollowUp, notifications: { inApp: true, email: true, push: true } } }), null);
  assert.equal(parseCrmSettingsResponse({ ...settings, leadFollowUp: { ...settings.leadFollowUp, deadlineBusinessDays: 31 } }), null);
  assert.equal(parseCrmSettingsResponse({ ...settings, leadSources: [] }), null);
  assert.equal(parseCrmSettingsResponse({ ...settings, leadSources: [{ ...settings.leadSources[0], enabled: false }] }), null);
  assert.equal(parseCrmSettingsResponse({ ...settings, leadSources: [{ ...settings.leadSources[0], id: "Website" }] }), null);
  assert.equal(parseCrmSettingsResponse({ ...settings, leadSources: [{ ...settings.leadSources[0], id: "website-source" }] }), null);
  assert.equal(parseCrmSettingsResponse({ ...settings, leadSources: [{ ...settings.leadSources[0], label: " Website" }] }), null);
  assert.equal(parseCrmSettingsResponse({ ...settings, leadSources: [{ ...settings.leadSources[0], label: "   " }] }), null);
  assert.equal(parseCrmSettingsResponse({ ...settings, leadSources: [settings.leadSources[0], { id: "linkedin", label: "website", enabled: false }] }), null);
  assert.equal(parseCrmSettingsResponse({ ...settings, leadSources: [{ ...settings.leadSources[0], id: "a".repeat(65) }] }), null);
  assert.equal(parseCrmSettingsResponse({ ...settings, leadSources: [{ ...settings.leadSources[0], label: "a".repeat(81) }] }), null);
});

const API_BASE_URL = "http://api.test";
const SESSION_ID = "valid-session-id-000000000000000000000000000";
const ACCESS_TOKEN = "server-side-access-token";

function setup(response: () => Response = () => Response.json(settings)) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const dependencies = {
    apiBaseUrl: API_BASE_URL,
    lookupSession: async (sessionId: string) => sessionId === SESSION_ID
      ? { accessToken: ACCESS_TOKEN, accessExpiresAt: new Date(Date.now() + 30 * 60_000), absoluteExpiresAt: new Date(Date.now() + 12 * 60 * 60_000) }
      : null,
    refreshSession: async () => ({ status: "ok", accessToken: ACCESS_TOKEN } as const),
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return response();
    }) as typeof fetch,
  };
  return { handler: createCrmSettingsHandler(dependencies), calls, dependencies };
}

function request(method = "GET", body?: unknown, origin = "https://app.test"): NextRequest {
  return new NextRequest("https://app.test/api/settings/crm", {
    method,
    headers: {
      cookie: `__Host-ce_session=${SESSION_ID}`,
      origin,
      "x-tenant-id": "browser-selected-tenant",
      authorization: "Bearer browser-token",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("CRM settings BFF uses only the HttpOnly session and strips browser tenant/auth headers", async () => {
  const { handler, calls } = setup();
  const response = await handler(request());
  assert.equal(response.status, 200);
  const headers = new Headers(calls[0]!.init.headers);
  assert.equal(headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(headers.has("x-tenant-id"), false);
  assert.equal(headers.has("cookie"), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("CRM settings BFF accepts same-origin validated mutations only", async () => {
  const { handler, calls } = setup();
  const response = await handler(request("PATCH", settings));
  assert.equal(response.status, 200);
  assert.equal(calls[0]!.init.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), settings);

  const crossOrigin = await handler(request("PATCH", settings, "https://evil.test"));
  assert.equal(crossOrigin.status, 403);
  assert.equal(calls.length, 1);

  const malformed = await handler(request("PATCH", { ...settings, extra: true }));
  assert.equal(malformed.status, 400);
  assert.equal(calls.length, 1);
});

test("CRM settings BFF maps known errors and rejects malformed successful responses", async () => {
  for (const [status, error] of [[401, "unauthorized"], [403, "forbidden"], [503, "api_unavailable"]] as const) {
    const { handler } = setup(() => Response.json({ error, secret: "hidden" }, { status }));
    const response = await handler(request());
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error });
  }

  const malformed = setup(() => Response.json({ ...settings, unexpected: true }));
  const malformedResponse = await malformed.handler(request());
  assert.equal(malformedResponse.status, 503);
  assert.deepEqual(await malformedResponse.json(), { error: "api_unavailable" });
});

test("CRM settings client helpers map auth failures and parse responses strictly", async () => {
  const fetcher = async () => Response.json(settings);
  assert.deepEqual(await fetchCrmSettings(fetcher), { status: "ready", data: settings });
  assert.deepEqual(await updateCrmSettings(fetcher, settings), { status: "ready", data: settings });
  assert.deepEqual(await fetchCrmSettings(async () => Response.json({ error: "forbidden" }, { status: 403 })), { status: "forbidden" });
  assert.deepEqual(await fetchCrmSettings(async () => Response.json({ ...settings, extra: true })), { status: "unavailable" });
});
