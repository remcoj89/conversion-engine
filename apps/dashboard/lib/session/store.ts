import type { QueryResult, QueryResultRow } from "pg";
import { decryptSecret, encryptSecret, generateSessionId, hashSessionId } from "./crypto";

// Minimal query surface, satisfied by a pg Pool and PoolClient; keeps the store testable.
export interface Queryable {
  query<R extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

// A pg Pool: hands out a dedicated client, needed to hold a row lock for a whole transaction.
export interface Connectable {
  connect(): Promise<Queryable & { release(): void }>;
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

// Everything the refresh flow needs, read under a row lock.
export type LockedSession = Readonly<{
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  absoluteExpiresAt: Date;
}>;

export type SessionChange =
  | Readonly<{ kind: "rotate"; accessToken: string; refreshToken: string; accessExpiresAt: Date }>
  | Readonly<{ kind: "delete" }>;

// `change` is applied in the same transaction, before the lock is released.
export type LockedWork<T> = Readonly<{ result: T; change?: SessionChange }>;

// Waiting for another request's refresh (token endpoint timeout is 5 s) is fine; longer means something is stuck.
const LOCK_TIMEOUT = "10s";

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

// Unknown, malformed, absolutely expired or undecryptable sessions yield null.
// An expired access token still yields the session, so the caller can refresh it.
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

// Runs `work` while holding a row lock on the session, so concurrent requests on any instance
// see each other's refresh instead of spending the same refresh token twice.
// `work` receives null for an unknown, malformed, absolutely expired or undecryptable session.
export async function withLockedSession<T>(
  db: Connectable,
  key: Buffer,
  sessionId: string,
  work: (session: LockedSession | null) => Promise<LockedWork<T>>,
): Promise<T> {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return (await work(null)).result;
  }

  const idHash = hashSessionId(sessionId);
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query(`set local lock_timeout = '${LOCK_TIMEOUT}'`);
    const { rows } = await client.query<{
      access_token_enc: string;
      refresh_token_enc: string;
      access_expires_at: Date;
      absolute_expires_at: Date;
    }>(
      `select access_token_enc, refresh_token_enc, access_expires_at, absolute_expires_at
         from bff_sessions
        where id_hash = $1
          and absolute_expires_at > now()
          for update`,
      [idHash],
    );

    const { result, change } = await work(decryptLocked(rows[0], key));

    if (change?.kind === "rotate") {
      await client.query(
        `update bff_sessions
            set access_token_enc = $2, refresh_token_enc = $3, access_expires_at = $4, updated_at = now()
          where id_hash = $1`,
        [idHash, encryptSecret(change.accessToken, key), encryptSecret(change.refreshToken, key), change.accessExpiresAt],
      );
    } else if (change?.kind === "delete") {
      await client.query("delete from bff_sessions where id_hash = $1", [idHash]);
    }

    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function decryptLocked(
  row: { access_token_enc: string; refresh_token_enc: string; access_expires_at: Date; absolute_expires_at: Date } | undefined,
  key: Buffer,
): LockedSession | null {
  if (!row) {
    return null;
  }
  try {
    return Object.freeze({
      accessToken: decryptSecret(row.access_token_enc, key),
      refreshToken: decryptSecret(row.refresh_token_enc, key),
      accessExpiresAt: row.access_expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
    });
  } catch {
    return null;
  }
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
