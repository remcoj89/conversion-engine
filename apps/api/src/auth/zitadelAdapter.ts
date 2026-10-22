import { errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AuthAdapter, AuthResult } from "./types.js";

const ALLOWED_ALGORITHMS = ["RS256"];

// Three base64url segments; anything else is rejected before any key lookup.
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

// Fixed, non-sensitive reasons for internal use only; never token contents.
type InvalidReason =
  | "empty_credentials"
  | "wrong_scheme"
  | "empty_token"
  | "malformed_token"
  | "invalid_token"
  | "missing_subject";

// Errors that mean "this token is not acceptable" (401). Anything else is an infrastructure
// failure (e.g. JWKS unreachable) and fails closed as 500.
const TOKEN_ERRORS = [
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
];

// Replaces the original error so no token detail can travel up; the code stays for diagnostics.
export class AuthUnavailableError extends Error {
  readonly code = "auth_unavailable";
  constructor(cause: unknown) {
    super("auth_unavailable", { cause: safeCause(cause) });
    this.name = "AuthUnavailableError";
  }
}

export type ZitadelAdapterOptions = Readonly<{
  issuer: string;
  audience: string;
  keys: JWTVerifyGetKey;
}>;

export function createZitadelAdapter({ issuer, audience, keys }: ZitadelAdapterOptions): AuthAdapter {
  return {
    async authenticate(request): Promise<AuthResult> {
      const header = request.headers.authorization;
      if (header === undefined) {
        return { status: "anonymous" };
      }
      if (header.trim() === "") {
        return invalid("empty_credentials");
      }

      const [scheme, token, ...rest] = header.trim().split(/\s+/);
      if (scheme.toLowerCase() !== "bearer") {
        return invalid("wrong_scheme");
      }
      if (!token) {
        return invalid("empty_token");
      }
      if (rest.length > 0 || !JWT_SHAPE.test(token)) {
        return invalid("malformed_token");
      }

      let subject: unknown;
      try {
        const { payload } = await jwtVerify(token, keys, {
          issuer,
          audience,
          algorithms: ALLOWED_ALGORITHMS,
          requiredClaims: ["exp", "sub"],
        });
        subject = payload.sub;
      } catch (error) {
        if (TOKEN_ERRORS.some((tokenError) => error instanceof tokenError)) {
          return invalid("invalid_token");
        }
        throw new AuthUnavailableError(error);
      }

      if (typeof subject !== "string" || subject.trim() === "") {
        return invalid("missing_subject");
      }
      // The issuer comes from configuration, never from the token.
      return { status: "authenticated", identity: { issuer, subject } };
    },
  };
}

function invalid(reason: InvalidReason): AuthResult {
  return { status: "invalid", reason };
}

// Keeps only the error type and code of the original failure.
function safeCause(cause: unknown): { name: string; code?: string } {
  const name = cause instanceof Error ? cause.name : typeof cause;
  const code =
    typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
      ? cause.code
      : undefined;
  return { name, code };
}
