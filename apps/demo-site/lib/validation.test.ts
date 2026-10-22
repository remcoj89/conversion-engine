import assert from "node:assert/strict";
import test from "node:test";
import { hasErrors, validateContact, validateSummary, type ContactValues } from "./validation";

const reasons = ["Kennismaking aanvragen", "Andere vraag"];
const validContact: ContactValues = {
  name: "Test Persoon",
  email: "test@voorbeeld.nl",
  reason: reasons[0],
  message: "",
  phone: "",
  privacy: true,
  marketing: false,
};

test("geldig contactformulier heeft geen fouten; marketing en telefoon zijn optioneel", () => {
  assert.deepEqual(validateContact(validContact, reasons), {});
  assert.equal(hasErrors(validateContact(validContact, reasons)), false);
});

test("verplichte velden en privacytoestemming worden gecontroleerd", () => {
  const errors = validateContact({ ...validContact, name: " ", email: "", reason: "", privacy: false }, reasons);
  assert.deepEqual(Object.keys(errors).sort(), ["email", "name", "privacy", "reason"]);
  assert.match(errors.privacy ?? "", /toestemming/);
});

test("e-mailformaat wordt gecontroleerd met een bruikbare melding", () => {
  for (const email of ["geen-at", "a@b", "a b@c.nl", "@voorbeeld.nl"]) {
    assert.match(validateContact({ ...validContact, email }, reasons).email ?? "", /geldig e-mailadres/);
  }
});

test("telefoonnummer is optioneel, maar moet geldig zijn als het is ingevuld", () => {
  assert.equal(validateContact({ ...validContact, phone: "06 12345678" }, reasons).phone, undefined);
  assert.equal(validateContact({ ...validContact, phone: "+31 (0)6-12345678" }, reasons).phone, undefined);
  for (const phone of ["123", "06-abc", "0612345678901234567"]) {
    assert.ok(validateContact({ ...validContact, phone }, reasons).phone, phone);
  }
});

test("onbekende reden wordt geweigerd", () => {
  assert.ok(validateContact({ ...validContact, reason: "gehackt" }, reasons).reason);
});

test("samenvattingsformulier vereist voornaam, e-mail en leveringstoestemming, niet marketing", () => {
  assert.deepEqual(validateSummary({ firstName: "Sam", email: "sam@voorbeeld.nl", consent: true, marketing: false }), {});
  const errors = validateSummary({ firstName: "", email: "x", consent: false, marketing: true });
  assert.deepEqual(Object.keys(errors).sort(), ["consent", "email", "firstName"]);
});
