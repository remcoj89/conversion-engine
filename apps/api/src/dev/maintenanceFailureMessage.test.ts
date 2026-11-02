import assert from "node:assert/strict";
import test from "node:test";
import { diagnoseMaintenanceFailure, formatMaintenanceFailure } from "./maintenanceFailureMessage.js";

const SECRET_SUBJECT = "zitadel-subject-secret-123";
const SECRET_URL = "postgresql://ce_maintenance:hunter2@127.0.0.1:5432/conversion_engine";

// Shape of a Drizzle query error: the message contains the SQL text and parameter values.
function drizzleError(cause: object): Error {
  return Object.assign(
    new Error(`Failed query: insert into "users" ("auth_provider_user_id") values ($1)\nparams: ${SECRET_SUBJECT}`),
    { cause },
  );
}

function assertNoSecrets(message: string): void {
  assert.equal(message.includes(SECRET_SUBJECT), false);
  assert.equal(message.includes("hunter2"), false);
  assert.equal(message.includes("insert into"), false);
  assert.equal(message.includes("postgresql://"), false);
}

test("42501 toont SQLSTATE en het geweigerde object, niet de query of parameters", () => {
  const error = drizzleError(Object.assign(new Error("permission denied for table websites"), { code: "42501" }));
  const message = formatMaintenanceFailure("Lokale provisioning", error);

  assert.match(message, /SQLSTATE 42501/);
  assert.match(message, /table websites/);
  assert.match(message, /teruggedraaid/);
  assert.match(message, /role-bootstrap/);
  assertNoSecrets(message);
});

test("42501 zonder herkenbaar object (RLS WITH CHECK) toont alleen de SQLSTATE", () => {
  const error = drizzleError(Object.assign(
    new Error(`new row violates row-level security policy for table "users" ${SECRET_SUBJECT}`),
    { code: "42501" },
  ));
  const diagnosis = diagnoseMaintenanceFailure(error);
  assert.equal(diagnosis.sqlState, "42501");
  assert.equal(diagnosis.object, undefined);
  assertNoSecrets(formatMaintenanceFailure("Lokale provisioning", error));
});

test("een gemanipuleerde permission-denied-tekst wordt niet als object overgenomen", () => {
  const error = Object.assign(new Error(`permission denied for table websites ${SECRET_SUBJECT}`), { code: "42501" });
  assert.equal(diagnoseMaintenanceFailure(error).object, undefined);
});

test("onbekende fout zonder code geeft een generieke diagnose zonder de foutmelding", () => {
  const message = formatMaintenanceFailure("Lokale provisioning", new Error(`boom ${SECRET_URL} ${SECRET_SUBJECT}`));
  assert.match(message, /Onbekende fout zonder databasecode/);
  assertNoSecrets(message);
});

test("onbekende SQLSTATE wordt alleen als code getoond", () => {
  const message = formatMaintenanceFailure("Lokale provisioning", drizzleError({ code: "XX000", message: SECRET_SUBJECT }));
  assert.match(message, /SQLSTATE XX000/);
  assertNoSecrets(message);
});

test("ongeldige codes worden niet als SQLSTATE overgenomen", () => {
  const diagnosis = diagnoseMaintenanceFailure({ code: `x'; ${SECRET_SUBJECT}` });
  assert.equal(diagnosis.sqlState, undefined);
});

test("schema-, inlog-, netwerk- en constraintfouten krijgen een concrete volgende stap", () => {
  assert.match(diagnoseMaintenanceFailure({ code: "42P01" }).nextStep, /db:migrate/);
  assert.match(diagnoseMaintenanceFailure({ code: "42883" }).nextStep, /db:migrate/);
  assert.match(diagnoseMaintenanceFailure({ code: "28P01" }).nextStep, /wachtwoord/);
  assert.match(diagnoseMaintenanceFailure({ code: "ECONNREFUSED", message: SECRET_URL }).cause, /niet bereikbaar/);
  const constraint = diagnoseMaintenanceFailure({ code: "23505", constraint: "memberships_pkey", detail: SECRET_SUBJECT });
  assert.equal(constraint.object, "constraint memberships_pkey");
});

test("vaste meldingen van de eigen maintenance-factory worden letterlijk getoond", () => {
  const message = formatMaintenanceFailure(
    "Lokale provisioning",
    new Error("Maintenance database identity check failed: unexpected role"),
  );
  assert.match(message, /identity check failed: unexpected role/);
});
