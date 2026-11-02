import assert from "node:assert/strict";
import test from "node:test";
import { isLeadStatus, isValidLeadStatusTransition } from "./leadRepository.js";

test("lead lifecycle accepteert alleen de vastgelegde statussen", () => {
  for (const status of ["new", "qualified", "appointment_scheduled", "proposal", "won", "lost"]) {
    assert.equal(isLeadStatus(status), true, status);
  }
  for (const status of ["draft", "closed", "", null, 42]) {
    assert.equal(isLeadStatus(status), false, String(status));
  }
});

test("lead lifecycle volgt de lineaire CRM-pipeline en maakt gesloten statussen terminaal", () => {
  assert.equal(isValidLeadStatusTransition("new", "qualified"), true);
  assert.equal(isValidLeadStatusTransition("qualified", "appointment_scheduled"), true);
  assert.equal(isValidLeadStatusTransition("appointment_scheduled", "proposal"), true);
  assert.equal(isValidLeadStatusTransition("proposal", "won"), true);
  assert.equal(isValidLeadStatusTransition("proposal", "lost"), true);

  for (const [fromStatus, toStatus] of [
    ["new", "proposal"],
    ["qualified", "won"],
    ["proposal", "new"],
    ["won", "proposal"],
    ["lost", "qualified"],
  ] as const) {
    assert.equal(isValidLeadStatusTransition(fromStatus, toStatus), false, `${fromStatus} -> ${toStatus}`);
  }
});
