const SESSION_KEY_BYTES = 32;

export type SessionConfig = Readonly<{
  appOrigin: string;
  encryptionKey: Buffer;
}>;

export type SessionEnv = Readonly<Record<string, string | undefined>>;

export function readSessionConfig(env: SessionEnv = process.env): SessionConfig {
  const appOrigin = readAppOrigin(env.APP_ORIGIN);
  const encryptionKey = readEncryptionKey(env.SESSION_ENCRYPTION_KEY);

  return Object.freeze({ appOrigin, encryptionKey });
}

function readAppOrigin(value: string | undefined): string {
  if (!value) {
    throw new Error("APP_ORIGIN is required");
  }

  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error("APP_ORIGIN must be a valid URL");
  }

  if (!['http:', 'https:'].includes(origin.protocol) || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("APP_ORIGIN must be an HTTP(S) origin without a path");
  }

  return origin.origin;
}

function readEncryptionKey(value: string | undefined): Buffer {
  if (!value) {
    throw new Error("SESSION_ENCRYPTION_KEY is required");
  }

  const key = Buffer.from(value, "base64");
  if (key.length !== SESSION_KEY_BYTES) {
    throw new Error("SESSION_ENCRYPTION_KEY must decode to 32 bytes");
  }

  return key;
}
