import assert from "node:assert/strict";
import test from "node:test";
import {
  hasAvailableTodayData,
  limitDirectFollowUpItems,
  parseTodayResponse,
  type TodayResponse,
} from "./today-overview";

const response = (cards: TodayResponse["actionRequired"]): TodayResponse => ({
  tenant: { id: "tenant-1", name: "Testomgeving", status: "active" },
  actionRequired: cards,
  directFollowUp: { status: "empty", message: "Geen aanvragen." },
});

const lead = (id: string) => ({
  id,
  name: `Lead ${id}`,
  message: `Bericht ${id}`,
  source: "Website",
  createdAt: "2026-11-01T10:00:00.000Z",
});

test("beschouwt uitsluitend unavailable null-kaarten als niet gekoppelde bron", () => {
  assert.equal(
    hasAvailableTodayData(response([
      { id: "leads", label: "Leads", value: null, status: "not-connected", source: "CRM" },
      { id: "tasks", label: "Taken", value: null, status: "not-connected", source: "Taken" },
    ])),
    false,
  );
});

test("normaliseert unavailable bronkaarten naar een niet-gekoppelde status", () => {
  const parsed = parseTodayResponse({
    tenant: { id: "tenant-1", name: "Testomgeving", status: "active" },
    actionRequired: [
      { id: "tasks", label: "Open taken", value: null, status: "unavailable", source: "Taken" },
    ],
    directFollowUp: { status: "empty", message: "Geen aanvragen." },
  });

  assert.equal(parsed?.actionRequired[0]?.status, "not-connected");
});

test("beschouwt een echte nul als beschikbare data", () => {
  assert.equal(
    hasAvailableTodayData(response([
      { id: "leads", label: "Leads", value: 0, status: "available", source: "CRM" },
    ])),
    true,
  );
});

test("verbindt CRM-leads met de telling en toont maximaal vijf follow-ups", () => {
  const parsed = parseTodayResponse({
    tenant: { id: "tenant-1", name: "Testomgeving", status: "active" },
    actionRequired: [
      { id: "leads-needing-attention", label: "Leads die aandacht vragen", value: 6, status: "available", source: "CRM" },
      { id: "tasks", label: "Open taken", value: null, status: "unavailable", source: "Taken" },
    ],
    directFollowUp: {
      status: "available",
      leads: Array.from({ length: 6 }, (_, index) => {
        const item = lead(`lead-${index}`);
        return { ...item, created_at: item.createdAt };
      }),
    },
  });

  assert.equal(parsed?.actionRequired[0]?.value, 6);
  assert.equal(parsed?.actionRequired[0]?.status, "available");
  assert.equal(parsed?.directFollowUp.status, "available");
  if (parsed?.directFollowUp.status === "available") assert.equal(parsed.directFollowUp.leads.length, 5);
});

test("behoudt een expliciete lege follow-up-toestand zonder CRM-leads", () => {
  const today = parseTodayResponse({
    tenant: { id: "tenant-1", name: "Testomgeving", status: "active" },
    actionRequired: [
      { id: "leads-needing-attention", label: "Leads die aandacht vragen", value: 0, status: "available", source: "CRM" },
    ],
    directFollowUp: { status: "empty", message: "Er zijn geen nieuwe aanvragen om op te volgen." },
  });

  assert.deepEqual(today?.directFollowUp, {
    status: "empty",
    message: "Er zijn geen nieuwe aanvragen om op te volgen.",
  });
});

test("begrenst follow-up-items ook bij direct gebruik van de helper", () => {
  assert.equal(limitDirectFollowUpItems(Array.from({ length: 8 }, (_, index) => lead(`lead-${index}`))).length, 5);
});
