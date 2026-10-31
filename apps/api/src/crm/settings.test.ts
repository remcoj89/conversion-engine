import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultCrmSettings,
  CrmSettingsValidationError,
  parseCrmSettings,
} from "./settings.js";

test("default CRM settings are valid and explicit", () => {
  const settings = createDefaultCrmSettings();

  assert.equal(settings.timezone, "Europe/Amsterdam");
  assert.deepEqual(settings.workingDays, ["monday", "tuesday", "wednesday", "thursday", "friday"]);
  assert.deepEqual(settings.workingHours, { start: "09:00", end: "17:00" });
  assert.deepEqual(settings.leadFollowUp, {
    enabled: true,
    deadlineBusinessDays: 1,
    assignmentStrategy: "owner",
    notifications: { inApp: true, email: true },
  });
  assert.equal(settings.leadSources.length, 10);
  assert.equal(settings.leadSources.every((source) => source.enabled), true);
});

test("omitted settings receive defaults while valid changes are preserved", () => {
  const settings = parseCrmSettings({
    timezone: "America/New_York",
    leadFollowUp: {
      enabled: false,
      assignmentStrategy: "round_robin",
    },
    leadSources: [
      { id: "website", label: "Inbound website", enabled: true },
      { id: "manual", label: "Handmatig", enabled: false },
    ],
  });

  assert.equal(settings.timezone, "America/New_York");
  assert.deepEqual(settings.workingHours, { start: "09:00", end: "17:00" });
  assert.equal(settings.leadFollowUp.enabled, false);
  assert.equal(settings.leadFollowUp.assignmentStrategy, "round_robin");
  assert.deepEqual(settings.leadSources, [
    { id: "website", label: "Inbound website", enabled: true },
    { id: "manual", label: "Handmatig", enabled: false },
  ]);
});

test("invalid timezone fails closed", () => {
  assert.throws(
    () => parseCrmSettings({ timezone: "Not/A-Timezone" }),
    (error: unknown) => error instanceof CrmSettingsValidationError
      && error.issues.some((issue) => issue.includes("timezone")),
  );
});

test("invalid working times fail closed", () => {
  assert.throws(
    () => parseCrmSettings({ workingHours: { start: "25:00", end: "17:00" } }),
    /workingHours\.start must use HH:mm/,
  );
  assert.throws(
    () => parseCrmSettings({ workingHours: { start: "17:00", end: "09:00" } }),
    /workingHours\.end must be later than workingHours\.start/,
  );
});

test("invalid assignment strategy fails closed", () => {
  assert.throws(
    () => parseCrmSettings({
      leadFollowUp: { assignmentStrategy: "automatic" },
    }),
    /assignmentStrategy must be owner, manual or round_robin/,
  );
});

test("unknown settings fail closed", () => {
  assert.throws(
    () => parseCrmSettings({ workday: ["monday"] }),
    /contains unknown setting\(s\): workday/,
  );
});
