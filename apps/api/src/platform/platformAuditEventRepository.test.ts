import assert from "node:assert/strict";
import test from "node:test";
import {
  decodePlatformAuditEventCursor,
  encodePlatformAuditEventCursor,
  mergePlatformAuditEventRows,
  type PlatformAuditEventListItem,
  type PlatformAuditEventRepositoryRow,
} from "./platformAuditEventRepository.js";

const eventId = "00000000-0000-4000-8000-000000000001";
const tenantId = "00000000-0000-4000-8000-000000000002";
const projectId = "00000000-0000-4000-8000-000000000003";

const baseEvent: PlatformAuditEventListItem = {
  id: eventId,
  tenantId,
  projectId,
  eventType: "submitted",
  fromStatus: "draft",
  toStatus: "submitted",
  version: 2,
  actorType: "member",
  actorId: "00000000-0000-4000-8000-000000000004",
  createdAt: new Date("2026-10-29T09:00:00.000Z"),
  requestOrCorrelationId: null,
};

test("audit cursor encodeert en valideert alleen de interne totaalvolgorde", () => {
  const cursor = {
    createdAt: baseEvent.createdAt,
    id: baseEvent.id,
    source: "audit" as const,
  };

  const encoded = encodePlatformAuditEventCursor(cursor);
  assert.deepEqual(decodePlatformAuditEventCursor(encoded), cursor);
  assert.equal(decodePlatformAuditEventCursor("not-a-cursor"), null);
  assert.equal(decodePlatformAuditEventCursor("") , null);
});

test("audit event metadata contract bevat geen klantinhoud of provideridentiteit", () => {
  assert.deepEqual(Object.keys(baseEvent).sort(), [
    "actorId",
    "actorType",
    "createdAt",
    "eventType",
    "fromStatus",
    "id",
    "projectId",
    "requestOrCorrelationId",
    "tenantId",
    "toStatus",
    "version",
  ]);

  for (const forbidden of ["answers", "projectBrief", "reviewNote", "reason", "token", "authProviderUserId"]) {
    assert.equal(forbidden in baseEvent, false, forbidden);
  }
});

test("merge sorteert status- en inzage-events newest-first en geeft een stabiele cursor", () => {
  const rows: PlatformAuditEventRepositoryRow[] = [
    { ...baseEvent, createdAt: new Date("2026-10-29T08:00:00.000Z"), source: "audit" },
    {
      ...baseEvent,
      id: "00000000-0000-4000-8000-000000000005",
      eventType: "read_onboarding_content",
      fromStatus: null,
      toStatus: null,
      actorType: "reviewer",
      actorId: "00000000-0000-4000-8000-000000000006",
      createdAt: new Date("2026-10-29T09:00:00.000Z"),
      requestOrCorrelationId: "req-1",
      source: "access",
    },
    { ...baseEvent, createdAt: new Date("2026-10-29T10:00:00.000Z"), source: "audit" },
  ];

  const result = mergePlatformAuditEventRows(rows, 2);
  assert.deepEqual(result.items.map((event) => event.createdAt.toISOString()), [
    "2026-10-29T10:00:00.000Z",
    "2026-10-29T09:00:00.000Z",
  ]);
  assert.deepEqual(result.items.map((event) => event.requestOrCorrelationId), [null, "req-1"]);
  assert.deepEqual(result.nextCursor, {
    createdAt: new Date("2026-10-29T09:00:00.000Z"),
    id: "00000000-0000-4000-8000-000000000005",
    source: "access",
  });
  assert.equal("source" in result.items[0]!, false);
});
