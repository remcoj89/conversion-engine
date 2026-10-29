import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildAdminAuditHref, getAdminAuditPageState, parseAdminAuditQuery } from "./page";

const tenantId = "6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";

test("geeft alleen ondersteunde auditfilters door", () => {
  assert.deepEqual(
    parseAdminAuditQuery({
      tenant_id: ` ${tenantId} `,
      event_type: "read_onboarding_content",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-29T23:59:59.999Z",
      limit: "25",
      cursor: "next-1",
      unknown: "must-not-forward",
    }),
    {
      tenant_id: tenantId,
      event_type: "read_onboarding_content",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-29T23:59:59.999Z",
      limit: "25",
      cursor: "next-1",
    },
  );
});

test("ongeldige filters vallen veilig terug op alleen de standaardlimiet", () => {
  assert.deepEqual(parseAdminAuditQuery({ tenant_id: "not-a-uuid", event_type: "unknown", from: "invalid", limit: "999" }), {
    limit: "25",
  });
});

test("bouwt paginering-URLs met filters zonder ongewenste queryvelden", () => {
  assert.equal(
    buildAdminAuditHref(
      {
        tenant_id: tenantId,
        event_type: "submitted",
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-29T23:59:59.999Z",
        limit: "25",
        cursor: "old",
      },
      { cursor: "next" },
    ),
    `/admin/audit?tenant_id=${tenantId}&event_type=submitted&from=2026-10-01T00%3A00%3A00.000Z&to=2026-10-29T23%3A59%3A59.999Z&limit=25&cursor=next`,
  );
});

test("onderscheidt ready, empty en veilige auth/error states", () => {
  const empty = { status: "ready" as const, data: { items: [], next_cursor: null } };
  const ready = {
    status: "ready" as const,
    data: {
      items: [{
        id: "7f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e",
        tenant_id: tenantId,
        project_id: "8f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e",
        event_type: "submitted",
        from_status: "draft",
        to_status: "submitted",
        version: 1,
        actor_type: "member" as const,
        actor_id: tenantId,
        created_at: "2026-10-29T09:00:00.000Z",
        request_or_correlation_id: null,
      }],
      next_cursor: null,
    },
  };

  assert.equal(getAdminAuditPageState({ status: "unauthenticated", data: null }), "unauthenticated");
  assert.equal(getAdminAuditPageState({ status: "forbidden", data: null }), "forbidden");
  assert.equal(getAdminAuditPageState({ status: "unavailable", data: null }), "unavailable");
  assert.equal(getAdminAuditPageState({ status: "invalid_query", data: null }), "unavailable");
  assert.equal(getAdminAuditPageState(empty), "empty");
  assert.equal(getAdminAuditPageState(ready), "ready");
});

test("auditpagina gebruikt live BFF-data en geen demo-events of vrije reviewinhoud", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /admin-data/);
  assert.doesNotMatch(source, /reviewNote|projectBrief|answers/);
  assert.match(source, /readPlatformAuditEvents/);
});
