import assert from "node:assert/strict";
import test from "node:test";
import { hasAvailableTodayData, type TodayResponse } from "./today-overview";

const response = (cards: TodayResponse["actionRequired"]): TodayResponse => ({
  tenant: { id: "tenant-1", name: "Testomgeving", status: "active" },
  actionRequired: cards,
  directFollowUp: { status: "empty", message: "Geen aanvragen." },
});

test("beschouwt uitsluitend unavailable null-kaarten als niet gekoppelde bron", () => {
  assert.equal(
    hasAvailableTodayData(response([
      { id: "leads", label: "Leads", value: null, status: "unavailable", source: "CRM" },
      { id: "tasks", label: "Taken", value: null, status: "unavailable", source: "CRM" },
    ])),
    false,
  );
});

test("beschouwt een echte nul als beschikbare data", () => {
  assert.equal(
    hasAvailableTodayData(response([
      { id: "leads", label: "Leads", value: 0, status: "available", source: "CRM" },
    ])),
    true,
  );
});
