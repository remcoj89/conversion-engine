import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { decryptSecret, generateSessionId, hashSessionId } from "./crypto";
import {
  createSession,
  deleteSession,
  findSession,
  touchSession,
  withLockedSession,
  type LockedSession,
  type NewSession,
} from "./store";

const key = randomBytes(32);
const HOUR = 60 * 60 * 1000;

const tokens = {
  subject: "subject-secret-value",
  accessToken: "access-token-secret-value",
  refreshToken: "refresh-token-secret-value",
  idToken: "id-token-secret-value",
};

const newSession = (overrides: Partial<NewSession> = {}): NewSession => ({
  ...tokens,
  accessExpiresAt: new Date(Date.now() + HOUR),
  absoluteExpiresAt: new Date(Date.now() + 24 * HOUR),
  ...overrides,
});

function testPool() {
  const databaseUrl = process.env.SESSION_DATABASE_TEST_URL;
  assert.ok(databaseUrl, "SESSION_DATABASE_TEST_URL is required");
  return new Pool({ connectionString: databaseUrl });
}

// Draait fn in een transactie die altijd wordt teruggedraaid.
async function withRollback(fn: (client: PoolClient) => Promise<void>) {
  const pool = testPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await fn(client);
  } finally {
    await client.query("rollback");
    client.release();
    await pool.end();
  }
}

test("database connection reaches conversion_engine_test", async () => {
  const pool = testPool();
  try {
    const { rows } = await pool.query<{ database: string }>("select current_database() as database");
    assert.equal(rows[0]?.database, "conversion_engine_test");
  } finally {
    await pool.end();
  }
});

test("sessie kan worden aangemaakt en opgehaald", async () => {
  await withRollback(async (client) => {
    const session = newSession();
    const sessionId = await createSession(client, key, session);

    assert.match(sessionId, /^[A-Za-z0-9_-]{43}$/);
    const found = await findSession(client, key, sessionId);
    assert.ok(found);
    assert.equal(found.accessToken, tokens.accessToken);
    assert.equal(found.accessExpiresAt.getTime(), session.accessExpiresAt.getTime());
    assert.equal(found.absoluteExpiresAt.getTime(), session.absoluteExpiresAt.getTime());
    assert.ok(found.lastSeenAt instanceof Date);
    // Refresh- en ID-token worden in deze slice niet gedecrypt of teruggegeven.
    assert.deepEqual(Object.keys(found).sort(), ["absoluteExpiresAt", "accessExpiresAt", "accessToken", "lastSeenAt"]);
  });
});

test("opgeslagen sessie-ID en tokenvelden zijn niet plaintext", async () => {
  await withRollback(async (client) => {
    const sessionId = await createSession(client, key, newSession());

    const { rows } = await client.query<Record<string, unknown>>("select * from bff_sessions");
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.id_hash, hashSessionId(sessionId));

    const stored = JSON.stringify(row);
    for (const secret of [sessionId, tokens.accessToken, tokens.refreshToken, tokens.idToken]) {
      assert.ok(!stored.includes(secret), "plaintext secret in sessierij");
    }
    // Versleuteld in het v1-formaat en terug te lezen met de sleutel.
    assert.equal(decryptSecret(String(row.access_token_enc), key), tokens.accessToken);
    assert.equal(decryptSecret(String(row.refresh_token_enc), key), tokens.refreshToken);
    assert.equal(decryptSecret(String(row.id_token_enc), key), tokens.idToken);
  });
});

test("id_token is optioneel", async () => {
  await withRollback(async (client) => {
    const sessionId = await createSession(client, key, newSession({ idToken: null }));

    const { rows } = await client.query<{ id_token_enc: string | null }>("select id_token_enc from bff_sessions");
    assert.equal(rows[0]?.id_token_enc, null);
    assert.ok(await findSession(client, key, sessionId));
  });
});

test("onbekend of misvormd sessie-ID geeft null", async () => {
  await withRollback(async (client) => {
    await createSession(client, key, newSession());

    for (const sessionId of [generateSessionId(), "", "short", `${generateSessionId()}x`, "' or 1=1 --"]) {
      assert.equal(await findSession(client, key, sessionId), null, sessionId);
    }
  });
});

test("verlopen sessie geeft null; verlopen access token niet, zodat het ververst kan worden", async () => {
  await withRollback(async (client) => {
    const past = new Date(Date.now() - HOUR);
    const accessExpired = await createSession(client, key, newSession({ accessExpiresAt: past }));
    const sessionExpired = await createSession(client, key, newSession({ absoluteExpiresAt: past }));

    assert.equal((await findSession(client, key, accessExpired))?.accessExpiresAt.getTime(), past.getTime());
    assert.equal(await findSession(client, key, sessionExpired), null);
  });
});

test("sessie met een andere sleutel geeft null", async () => {
  await withRollback(async (client) => {
    const sessionId = await createSession(client, key, newSession());

    assert.equal(await findSession(client, randomBytes(32), sessionId), null);
  });
});

test("verwijderen maakt de sessie ongeldig", async () => {
  await withRollback(async (client) => {
    const sessionId = await createSession(client, key, newSession());
    const other = await createSession(client, key, newSession());

    await deleteSession(client, sessionId);

    assert.equal(await findSession(client, key, sessionId), null);
    assert.ok(await findSession(client, key, other), "andere sessie blijft bestaan");
  });
});

test("last_seen_at kan worden bijgewerkt", async () => {
  await withRollback(async (client) => {
    const sessionId = await createSession(client, key, newSession());
    // now() is constant binnen een transactie; zet last_seen_at eerst terug in de tijd.
    await client.query("update bff_sessions set last_seen_at = now() - interval '1 hour', updated_at = now() - interval '1 hour'");

    assert.equal(await touchSession(client, sessionId), true);

    const { rows } = await client.query<{ fresh: boolean }>(
      "select last_seen_at = now() and updated_at = now() as fresh from bff_sessions where id_hash = $1",
      [hashSessionId(sessionId)],
    );
    assert.equal(rows[0]?.fresh, true);
    assert.equal(await touchSession(client, generateSessionId()), false);
  });
});

// Row locks need real, committed rows and two connections, so these tests clean up after themselves.
async function withCommittedSession(fn: (pool: Pool, sessionId: string) => Promise<void>, overrides: Partial<NewSession> = {}) {
  const pool = testPool();
  const sessionId = await createSession(pool, key, newSession(overrides));
  try {
    await fn(pool, sessionId);
  } finally {
    await deleteSession(pool, sessionId);
    await pool.end();
  }
}

test("withLockedSession geeft refresh-token en vervalmomenten en past rotatie toe", async () => {
  await withCommittedSession(async (pool, sessionId) => {
    const accessExpiresAt = new Date(Date.now() + 2 * HOUR);
    const seen = await withLockedSession(pool, key, sessionId, async (session) => ({
      result: session,
      change: { kind: "rotate", accessToken: "rotated-access", refreshToken: "rotated-refresh", accessExpiresAt },
    }));
    assert.equal(seen?.accessToken, tokens.accessToken);
    assert.equal(seen?.refreshToken, tokens.refreshToken);

    const after = await withLockedSession(pool, key, sessionId, async (session) => ({ result: session }));
    assert.equal(after?.accessToken, "rotated-access");
    assert.equal(after?.refreshToken, "rotated-refresh");
    assert.equal(after?.accessExpiresAt.getTime(), accessExpiresAt.getTime());

    const { rows } = await pool.query<Record<string, unknown>>("select * from bff_sessions where id_hash = $1", [
      hashSessionId(sessionId),
    ]);
    const stored = JSON.stringify(rows[0]);
    assert.ok(!stored.includes("rotated-access") && !stored.includes("rotated-refresh"), "plaintext token in sessierij");
  });
});

test("withLockedSession serialiseert gelijktijdige aanroepen op dezelfde sessie", async () => {
  await withCommittedSession(async (pool, sessionId) => {
    const seenRefreshTokens: string[] = [];
    let counter = 0;
    const refreshOnce = () =>
      withLockedSession(pool, key, sessionId, async (session) => {
        assert.ok(session);
        seenRefreshTokens.push(session.refreshToken);
        // Long enough for the other call to reach the lock while this one holds it.
        await new Promise((resolve) => setTimeout(resolve, 200));
        counter += 1;
        return {
          result: counter,
          change: {
            kind: "rotate",
            accessToken: `access-${counter}`,
            refreshToken: `refresh-${counter}`,
            accessExpiresAt: new Date(Date.now() + HOUR),
          },
        };
      });

    await Promise.all([refreshOnce(), refreshOnce()]);

    // De tweede aanroep zag het al geroteerde token, nooit hetzelfde refresh-token als de eerste.
    assert.equal(seenRefreshTokens.length, 2);
    assert.equal(seenRefreshTokens[0], tokens.refreshToken);
    assert.equal(seenRefreshTokens[1], "refresh-1");
  });
});

test("withLockedSession kan de sessie verwijderen en draait terug bij een fout", async () => {
  await withCommittedSession(async (pool, sessionId) => {
    await assert.rejects(
      withLockedSession(pool, key, sessionId, async () => {
        throw new Error("provider exploded");
      }),
    );
    assert.ok(await findSession(pool, key, sessionId), "fout laat de sessie staan");

    await withLockedSession(pool, key, sessionId, async () => ({ result: null, change: { kind: "delete" } }));
    assert.equal(await findSession(pool, key, sessionId), null);
  });
});

test("withLockedSession geeft null voor onbekende, misvormde of verlopen sessies", async () => {
  await withCommittedSession(
    async (pool, sessionId) => {
      for (const id of [sessionId, generateSessionId(), "' or 1=1 --"]) {
        const seen = await withLockedSession<LockedSession | null>(pool, key, id, async (session) => ({ result: session }));
        assert.equal(seen, null);
      }
    },
    { absoluteExpiresAt: new Date(Date.now() - HOUR) },
  );
});

test("testdata is na de tests teruggedraaid", async () => {
  const pool = testPool();
  try {
    const { rows } = await pool.query<{ count: number }>("select count(*)::int as count from bff_sessions");
    assert.equal(rows[0]?.count, 0);
  } finally {
    await pool.end();
  }
});
