import assert from "node:assert/strict";
import test from "node:test";
import { hashPublicLeadInput, parsePublicLeadInput } from "./publicLeadInput.js";

const valid = {
  name: "Ada Lovelace",
  email: " ADA@EXAMPLE.TEST ",
  message: "Ik wil graag kennismaken.",
  phone: "+31 6 1234 5678",
  organization: "Analytical Engines",
  privacyConsent: true,
  marketingConsent: false,
};

test("public lead input normalizes the visitor fields and keeps source outside the body", () => {
  const parsed = parsePublicLeadInput(valid);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.input, {
    name: "Ada Lovelace",
    email: "ada@example.test",
    message: "Ik wil graag kennismaken.",
    phone: "+31 6 1234 5678",
    organization: "Analytical Engines",
    privacyConsent: true,
    marketingConsent: false,
  });
  assert.equal("source" in parsed.input, false);
});

test("public lead input rejects unknown fields and unsafe consent values", () => {
  for (const payload of [
    { ...valid, source: "manual" },
    { ...valid, tenant_id: "tenant" },
    { ...valid, privacyConsent: false },
    { ...valid, marketingConsent: "yes" },
    { ...valid, message: "\u0000" },
  ]) {
    assert.equal(parsePublicLeadInput(payload).ok, false, JSON.stringify(payload));
  }
});

test("public lead input accepts optional phone and organization as omitted fields", () => {
  const parsed = parsePublicLeadInput({
    name: "Ada Lovelace",
    email: "ada@example.test",
    message: "Bericht",
    privacyConsent: true,
    marketingConsent: false,
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual({ phone: parsed.input.phone, organization: parsed.input.organization }, { phone: null, organization: null });
});

test("public lead request hash changes when meaningful content changes", () => {
  const first = parsePublicLeadInput(valid);
  const second = parsePublicLeadInput({ ...valid, message: "Andere aanvraag" });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) assert.notEqual(hashPublicLeadInput(first.input), hashPublicLeadInput(second.input));
});
