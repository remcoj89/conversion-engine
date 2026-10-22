import type { QueryResult, QueryResultRow } from "pg";
import { decryptSecret, encryptSecret, generateSessionId, hashSessionId } from "./crypto";

// Minimal query surface, satisfied by a pg Pool and PoolClient; keeps the store testable.
export interface Queryable {
  query<R extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

export type NewSession = Readonly<{
  subject: string;
  accessToken: string;
  refreshToken: string;
  idToken?: string | null;
  accessExpiresAt: Date;
  absoluteExpiresAt: Date;
}>;

// Only what the BFF needs in this slice; the refresh and ID tokens stay encrypted.
export type ActiveSession = Readonly<{
  accessToken: string;
  accessExpiresAt: Date;
  absoluteExpiresAt: Date;
  lastSeenAt: Date;
}>;

// Shape of generateSessionId(); anything else is rejected without a query.
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Returns the plaintext session ID for the cookie; the database only ever sees its hash.
export async function createSession(db: Queryable, key: Buffer, session: NewSession): Promise<string> {
  const sessionId = generateSessionId();
  await db.query(
    `insert into bff_sessions
       (id_hash, subject, access_token_enc, refresh_token_enc, id_token_enc, access_expires_at, absolute_expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      hashSessionId(sessionId),
      session.subject,
      encryptSecret(session.accessToken, key),
      encryptSecret(session.refreshToken, key),
      session.idToken ? encryptSecret(session.idToken, key) : null,
      session.accessExpiresAt,
      session.absoluteExpiresAt,
    ],
  );
  return sessionId;
}

// Unknown, malformed, expired or undecryptable sessions all yield null.
export async function findSession(db: Queryable, key: Buffer, sessionId: string): Promise<ActiveSession | null> {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return null;
  }

  // Expiry is checked in SQL against the database clock, so expired rows are never decrypted.
  const { rows } = await db.query<{
    access_token_enc: string;
    access_expires_at: Date;
    absolute_expires_at: Date;
    last_seen_at: Date;
  }>(
    `select access_token_enc, access_expires_at, absolute_expires_at, last_seen_at
       from bff_sessions
      where id_hash = $1
        and access_expires_at > now()
        and absolute_expires_at > now()`,
    [hashSessionId(sessionId)],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }

  let accessToken: string;
  try {
    accessToken = decryptSecret(row.access_token_enc, key);
  } catch {
    return null;
  }

  return Object.freeze({
    accessToken,
    accessExpiresAt: row.access_expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    lastSeenAt: row.last_seen_at,
  });
}

export async function deleteSession(db: Queryable, sessionId: string): Promise<void> {
  await db.query("delete from bff_sessions where id_hash = $1", [hashSessionId(sessionId)]);
}

// Returns false when the session no longer exists.
export async function touchSession(db: Queryable, sessionId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    "update bff_sessions set last_seen_at = now(), updated_at = now() where id_hash = $1",
    [hashSessionId(sessionId)],
  );
  return rowCount === 1;
}
