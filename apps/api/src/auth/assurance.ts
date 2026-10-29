import {
  INSUFFICIENT_AUTH_ASSURANCE,
  STRONG_AUTH_ASSURANCE,
  type AuthAssurance,
} from "./types.js";

const AAL2_VALUES = new Set(["aal2", "urn:ietf:params:oauth:acr:aal2"]);
const CE_AAL2_VALUE = "aal2";

// Only an explicit provider assertion is accepted. A password plus an inferred signal is not
// enough; the signed token must say aal2, report mfa in amr, or contain the
// explicitly configured Conversion Engine assurance claim.
export function deriveAuthAssurance(payload: unknown): AuthAssurance {
  if (typeof payload !== "object" || payload === null) {
    return INSUFFICIENT_AUTH_ASSURANCE;
  }

  const claims = payload as { acr?: unknown; amr?: unknown; ce_aal?: unknown };
  const { acr, amr, ce_aal: ceAal } = claims;

  if (acr !== undefined && typeof acr !== "string") {
    return INSUFFICIENT_AUTH_ASSURANCE;
  }
  if (amr !== undefined && (!Array.isArray(amr) || !amr.every((method) => typeof method === "string"))) {
    return INSUFFICIENT_AUTH_ASSURANCE;
  }
  if (ceAal !== undefined && typeof ceAal !== "string") {
    return INSUFFICIENT_AUTH_ASSURANCE;
  }
  if (acr !== undefined && !AAL2_VALUES.has(acr)) {
    return INSUFFICIENT_AUTH_ASSURANCE;
  }
  if (ceAal !== undefined && ceAal !== CE_AAL2_VALUE) {
    return INSUFFICIENT_AUTH_ASSURANCE;
  }
  if (acr !== undefined && AAL2_VALUES.has(acr)) {
    return STRONG_AUTH_ASSURANCE;
  }
  if (ceAal === CE_AAL2_VALUE) {
    return STRONG_AUTH_ASSURANCE;
  }
  if (Array.isArray(amr) && amr.includes("mfa")) {
    return STRONG_AUTH_ASSURANCE;
  }
  return INSUFFICIENT_AUTH_ASSURANCE;
}

export function hasStrongAuthAssurance(identity: unknown): boolean {
  if (typeof identity !== "object" || identity === null) {
    return false;
  }

  const assurance = (identity as { assurance?: unknown }).assurance;
  return (
    typeof assurance === "object" &&
    assurance !== null &&
    (assurance as { level?: unknown }).level === "aal2"
  );
}
