import assert from "node:assert/strict";
import test from "node:test";
import {
  TENANT_OWNER_INVITATION_TOKEN_BYTES,
  generateInvitationToken,
  hashInvitationToken,
  isInvitationExpired,
  isInvitationToken,
  normalizeInvitationEmail,
} from "./tenantOwnerInvitationRepository.js";

test("invitation tokens zijn opaak, random en hebben een vaste veilige vorm", () => {
  const first = generateInvitationToken();
  const second = generateInvitationToken();

  assert.equal(first.length, 43);
  assert.equal(second.length, 43);
  assert.equal(TENANT_OWNER_INVITATION_TOKEN_BYTES, 32);
  assert.equal(isInvitationToken(first), true);
  assert.equal(isInvitationToken(second), true);
  assert.notEqual(first, second);
  assert.notEqual(hashInvitationToken(first), first);
  assert.match(hashInvitationToken(first), /^[0-9a-f]{64}$/);
  assert.equal(hashInvitationToken(first), hashInvitationToken(first));
});

test("tokenvalidatie weigert lege, korte en verkeerd gecodeerde waarden", () => {
  assert.equal(isInvitationToken(undefined), false);
  assert.equal(isInvitationToken(""), false);
  assert.equal(isInvitationToken("short"), false);
  assert.equal(isInvitationToken("a".repeat(43)), true);
  assert.equal(isInvitationToken("!".repeat(43)), false);
  assert.equal(isInvitationToken("a".repeat(42)), false);
});

test("invite-email wordt genormaliseerd zonder control characters of ongeldige vorm", () => {
  assert.equal(normalizeInvitationEmail(" OWNER@Example.COM "), "owner@example.com");
  assert.equal(normalizeInvitationEmail("not-an-email"), null);
  assert.equal(normalizeInvitationEmail("owner@example.com\nBcc: attacker@example.com"), null);
  assert.equal(normalizeInvitationEmail("a".repeat(321) + "@example.com"), null);
  assert.equal(normalizeInvitationEmail(undefined), null);
});

test("expiry is fail-closed op het exacte grensmoment", () => {
  const expiresAt = new Date("2026-11-05T10:00:00.000Z");

  assert.equal(isInvitationExpired(expiresAt, new Date("2026-11-05T09:59:59.999Z")), false);
  assert.equal(isInvitationExpired(expiresAt, expiresAt), true);
  assert.equal(isInvitationExpired(expiresAt, new Date("2026-11-05T10:00:00.001Z")), true);
});
