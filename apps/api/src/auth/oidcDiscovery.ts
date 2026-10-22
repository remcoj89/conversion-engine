import { createRemoteJWKSet, customFetch, type JWTVerifyGetKey } from "jose";

const DISCOVERY_TIMEOUT_MS = 5000;

// Carries only a fixed code; never the response body or URL details.
export class OidcDiscoveryError extends Error {
  constructor(readonly code: "discovery_unavailable" | "issuer_mismatch" | "invalid_jwks_uri") {
    super(code);
    this.name = "OidcDiscoveryError";
  }
}

// Key set resolved via OIDC discovery on first use. A successful discovery is cached for the
// process lifetime; a failed one is retried on the next request. Keys are cached by jose.
export function createDiscoveredKeySet(issuer: string, fetchImpl: typeof fetch = fetch): JWTVerifyGetKey {
  let keySet: Promise<JWTVerifyGetKey> | undefined;

  return async (protectedHeader, token) => {
    keySet ??= discoverKeySet(issuer, fetchImpl).catch((error: unknown) => {
      keySet = undefined;
      throw error;
    });
    return (await keySet)(protectedHeader, token);
  };
}

async function discoverKeySet(issuer: string, fetchImpl: typeof fetch): Promise<JWTVerifyGetKey> {
  let metadata: unknown;
  try {
    const response = await fetchImpl(`${issuer}/.well-known/openid-configuration`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new OidcDiscoveryError("discovery_unavailable");
    }
    metadata = await response.json();
  } catch {
    throw new OidcDiscoveryError("discovery_unavailable");
  }

  if (typeof metadata !== "object" || metadata === null) {
    throw new OidcDiscoveryError("discovery_unavailable");
  }

  // OIDC Discovery: the published issuer must be exactly the configured one.
  if (!("issuer" in metadata) || metadata.issuer !== issuer) {
    throw new OidcDiscoveryError("issuer_mismatch");
  }

  const jwksUri = "jwks_uri" in metadata ? metadata.jwks_uri : undefined;
  let jwksUrl: URL;
  try {
    jwksUrl = new URL(String(jwksUri));
  } catch {
    throw new OidcDiscoveryError("invalid_jwks_uri");
  }
  if (typeof jwksUri !== "string" || jwksUrl.protocol !== "https:" || jwksUrl.origin !== new URL(issuer).origin) {
    throw new OidcDiscoveryError("invalid_jwks_uri");
  }

  return createRemoteJWKSet(jwksUrl, { [customFetch]: fetchImpl });
}
