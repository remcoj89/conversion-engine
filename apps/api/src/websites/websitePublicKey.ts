import { randomBytes } from "node:crypto";

// Public identifier of a registered website, e.g. "site_3q2…". It is not a secret and not proof of
// anything: it only says which website a request claims to come from. 24 random bytes (192 bits) make
// it opaque, non-sequential and unguessable; it never contains or derives from a tenant ID.
// Used both as the database check and for input validation, so the two cannot drift apart.
export const WEBSITE_PUBLIC_KEY_PATTERN = "^site_[A-Za-z0-9_-]{32}$";

const pattern = new RegExp(WEBSITE_PUBLIC_KEY_PATTERN);

export function generateWebsitePublicKey(): string {
  return `site_${randomBytes(24).toString("base64url")}`;
}

export function isWebsitePublicKey(value: unknown): value is string {
  return typeof value === "string" && pattern.test(value);
}
