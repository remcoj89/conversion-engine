import assert from "node:assert/strict";
import test from "node:test";
import { validateCrmSettings } from "./crm-settings-validation";

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

test("CRM-settingsvalidatie accepteert een geldige configuratie", () => {
  assert.deepEqual(validateCrmSettings(settings), {});
});

test("CRM-settingsvalidatie geeft veldgerichte feedback", () => {
  const errors = validateCrmSettings({
    ...settings,
    timezone: "Not/A-Timezone",
    workingHours: { start: "17:00", end: "09:00" },
    leadFollowUp: { ...settings.leadFollowUp, deadlineBusinessDays: 31 },
    leadSources: [{ ...settings.leadSources[0], enabled: false }],
  });

  assert.deepEqual(errors, {
    timezone: "Vul een geldige IANA-tijdzone in, bijvoorbeeld Europe/Amsterdam.",
    workingEnd: "Het einde van de werkdag moet na de start liggen.",
    deadlineBusinessDays: "Kies een aantal werkdagen tussen 1 en 30.",
    leadSources: "Schakel minimaal één leadbron in.",
  });
});
