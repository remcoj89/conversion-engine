import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("invitepagina houdt het token in het fragment en stuurt het alleen in de accept-body", () => {
  assert.match(source, /window\.location\.hash/);
  assert.match(source, /\/api\/invitations\/accept/);
  assert.match(source, /JSON\.stringify\(\{ token: invitationToken \}\)/);
  assert.doesNotMatch(source, /localStorage\.(getItem|setItem)|sessionStorage\.(getItem|setItem)/);
});

test("invitepagina gebruikt een vaste login-continuatie en behandelt alle afgesproken states", () => {
  assert.match(source, /auth\/login\?returnTo=%2Finvite/);
  for (const state of ["missing", "preparing", "unauthenticated", "accepting", "success", "expired", "revoked", "invalid", "forbidden", "unavailable"]) {
    assert.match(source, new RegExp(`kind: "${state}"`));
  }
});
