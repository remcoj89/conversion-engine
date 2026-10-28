import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { classifyPlatformContextResponse, createAdminContextRequest } from "./adminAccess";

const SESSION_ID = "server-session-id";

test("synthetic admin request contains only the server session cookie", () => {
  const request = createAdminContextRequest(SESSION_ID);

  assert.equal(request.headers.get("cookie"), `__Host-ce_session=${SESSION_ID}`);
  assert.equal(request.headers.has("authorization"), false);
  assert.equal(request.headers.has("x-tenant-id"), false);
  assert.deepEqual([...request.headers.keys()], ["cookie"]);
});

test("alleen de exacte Platform Admin-context geeft toegang", async () => {
  const result = await classifyPlatformContextResponse(
    Response.json({ workspace: "admin", role: "platform_admin" }),
  );

  assert.deepEqual(result, { status: "authorized" });
});

test("een tenantcontext of onvolledige response wordt niet als admin geaccepteerd", async () => {
  const responses = [
    Response.json({ workspace: "customer", role: "owner" }),
    Response.json({ workspace: "admin" }),
    Response.json({ workspace: "admin", role: "platform_admin", userId: "unexpected" }),
  ];

  for (const response of responses) {
    const result = await classifyPlatformContextResponse(response);
    assert.deepEqual(result, { status: "unavailable" });
  }
});

test("401, 403 en technische fouten behouden hun eigen veilige UI-state", async () => {
  const cases: ReadonlyArray<readonly [Response, string]> = [
    [Response.json({ error: "unauthorized" }, { status: 401 }), "unauthenticated"],
    [Response.json({ error: "forbidden" }, { status: 403 }), "forbidden"],
    [Response.json({ error: "api_unavailable" }, { status: 503 }), "unavailable"],
  ];

  for (const [response, expectedStatus] of cases) {
    const result = await classifyPlatformContextResponse(response);
    assert.equal(result.status, expectedStatus);
  }
});

test("een malformed succesresponse faalt gesloten", async () => {
  const result = await classifyPlatformContextResponse(new Response("not-json", { status: 200 }));

  assert.deepEqual(result, { status: "unavailable" });
});

test("request helper blijft een NextRequest", () => {
  assert.equal(createAdminContextRequest(SESSION_ID) instanceof NextRequest, true);
});
