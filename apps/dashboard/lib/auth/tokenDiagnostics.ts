import { decodeJwt } from "jose";

export type AccessTokenDiagnostics = Readonly<{
  isJwt: boolean;
  hasIssuer: boolean;
  hasAudience: boolean;
  hasSubject: boolean;
  hasExpiration: boolean;
  hasConversionEngineAalClaim: boolean;
  conversionEngineAalIsAal2: boolean;
}>;

// This function only inspects claim shape. Signature, issuer and audience trust remain the API's job.
export function inspectAccessToken(token: string): AccessTokenDiagnostics {
  try {
    const payload = decodeJwt(token);
    const ceAal = payload.ce_aal;

    return {
      isJwt: true,
      hasIssuer: typeof payload.iss === "string" && payload.iss.length > 0,
      hasAudience:
        (typeof payload.aud === "string" && payload.aud.length > 0) ||
        (Array.isArray(payload.aud) && payload.aud.length > 0 && payload.aud.every((value) => typeof value === "string")),
      hasSubject: typeof payload.sub === "string" && payload.sub.length > 0,
      hasExpiration: typeof payload.exp === "number" && Number.isFinite(payload.exp),
      hasConversionEngineAalClaim: ceAal !== undefined,
      conversionEngineAalIsAal2: ceAal === "aal2",
    };
  } catch {
    return {
      isJwt: false,
      hasIssuer: false,
      hasAudience: false,
      hasSubject: false,
      hasExpiration: false,
      hasConversionEngineAalClaim: false,
      conversionEngineAalIsAal2: false,
    };
  }
}
