export type AuthConfig = Readonly<{
  issuer: string; // normalized: no trailing slash
  audience: string;
}>;

type Env = Readonly<Record<string, string | undefined>>;

// Fail-closed: the API does not start without a valid issuer and audience. No development bypass.
export function readAuthConfig(env: Env = process.env): AuthConfig {
  return Object.freeze({
    issuer: readIssuer(env.ZITADEL_ISSUER),
    audience: readAudience(env.API_AUDIENCE),
  });
}

function readIssuer(value: string | undefined): string {
  if (!value) {
    throw new Error("ZITADEL_ISSUER is required");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("ZITADEL_ISSUER must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("ZITADEL_ISSUER must use https");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("ZITADEL_ISSUER must not contain credentials, query or fragment");
  }

  // "https://id.example.com/" and "https://id.example.com" configure the same issuer.
  return url.href.replace(/\/+$/, "");
}

function readAudience(value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error("API_AUDIENCE is required");
  }
  return value;
}
