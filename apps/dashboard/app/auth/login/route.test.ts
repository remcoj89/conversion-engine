import assert from "node:assert/strict";
import test from "node:test";
import { getReturnTo } from "./route";

test("login gebruikt standaard de home-continuatie", () => {
  assert.equal(getReturnTo(null), "/");
  assert.equal(getReturnTo(""), "/");
});

test("login accepteert alleen de vaste invite-continuatie", () => {
  assert.equal(getReturnTo("/invite"), "/invite");
  assert.equal(getReturnTo("https://evil.test"), "/");
  assert.equal(getReturnTo("//evil.test"), "/");
  assert.equal(getReturnTo("/admin"), "/");
});
