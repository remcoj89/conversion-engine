import assert from "node:assert/strict";
import test from "node:test";
import { RefreshError, type RefreshedTokens } from "../auth/refresh";
import { createSessionRefresher, needsRefresh, type LockSession } from "./refresh";
import type { LockedSession } from "./store";

const SESSION_ID = "session-id-from-store-00000000000000000000000";
const ACCESS_TOKEN = "access-token-secret-value";
const REFRESH_TOKEN = "refresh-token-secret-value";
const NEW_ACCESS_TOKEN = "new-access-token-secret-value";
const NEW_REFRESH_TOKEN = "new-refresh-token-secret-value";
const NOW = new Date("2026-10-22T12:00:00Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type Row = { accessToken: string; refreshToken: string; accessExpiresAt: Date; absoluteExpiresAt: Date };

// In-memory stand-in for withLockedSession(): a per-store mutex plays the row lock,
// and changes are applied before the lock is released, like the real transaction.
function memoryStore(initial: Partial<Row> = {}) {
  let row: Row | null = {
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    accessExpiresAt: new Date(NOW.getTime() + 30 * 1000),
    absoluteExpiresAt: new Date(NOW.getTime() + 12 * HOUR),
    ...initial,
  };
  let queue: Promise<unknown> = Promise.resolve();

  const lockSession: LockSession = (sessionId, work) => {
    const run = queue.then(async () => {
      const session: LockedSession | null = sessionId === SESSION_ID && row ? { ...row } : null;
      const { result, change } = await work(session);
      if (change?.kind === "rotate" && row) {
        row = { ...row, accessToken: change.accessToken, refreshToken: change.refreshToken, accessExpiresAt: change.accessExpiresAt };
      } else if (change?.kind === "delete") {
        row = null;
      }
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  };

  return { lockSession, row: () => row };
}

function setup(
  refreshTokens: (refreshToken: string) => Promise<RefreshedTokens> = async () => ({
    accessToken: NEW_ACCESS_TOKEN,
    refreshToken: NEW_REFRESH_TOKEN,
    expiresIn: 3600,
  }),
  initial: Partial<Row> = {},
) {
  const store = memoryStore(initial);
  const used: string[] = [];
  const logs: string[] = [];
  const refreshSession = createSessionRefresher({
    lockSession: store.lockSession,
    refreshTokens: async (refreshToken) => {
      used.push(refreshToken);
      return refreshTokens(refreshToken);
    },
    now: () => NOW,
    logFailure: (reason) => logs.push(reason),
  });
  return { refreshSession, store, used, logs };
}

test("needsRefresh: binnen 60 seconden wel, daarbuiten niet, en niet als de absolute grens al bereikt is", () => {
  const absoluteExpiresAt = new Date(NOW.getTime() + HOUR);
  const at = (ms: number) => ({ accessToken: ACCESS_TOKEN, accessExpiresAt: new Date(NOW.getTime() + ms), absoluteExpiresAt });

  assert.equal(needsRefresh(at(MINUTE), NOW), true);
  assert.equal(needsRefresh(at(-MINUTE), NOW), true);
  assert.equal(needsRefresh(at(MINUTE + 1), NOW), false);
  assert.equal(needsRefresh({ ...at(30_000), absoluteExpiresAt: new Date(NOW.getTime() + 30_000) }, NOW), false);
});

test("access-token dat binnen 60 seconden verloopt wordt ververst en opgeslagen", async () => {
  const { refreshSession, store, used } = setup();
  assert.deepEqual(await refreshSession(SESSION_ID), { status: "ok", accessToken: NEW_ACCESS_TOKEN });

  assert.deepEqual(used, [REFRESH_TOKEN]);
  assert.equal(store.row()?.accessToken, NEW_ACCESS_TOKEN);
  assert.equal(store.row()?.accessExpiresAt.getTime(), NOW.getTime() + HOUR);
});

test("nog geldig access-token wordt onder de lock niet ververst", async () => {
  const { refreshSession, used } = setup(undefined, { accessExpiresAt: new Date(NOW.getTime() + 10 * MINUTE) });
  assert.deepEqual(await refreshSession(SESSION_ID), { status: "ok", accessToken: ACCESS_TOKEN });
  assert.deepEqual(used, []);
});

test("nieuw refresh-token vervangt het oude (rotatie)", async () => {
  const { refreshSession, store } = setup();
  await refreshSession(SESSION_ID);
  assert.equal(store.row()?.refreshToken, NEW_REFRESH_TOKEN);
});

test("zonder nieuw refresh-token blijft het bestaande behouden", async () => {
  const { refreshSession, store } = setup(async () => ({ accessToken: NEW_ACCESS_TOKEN, expiresIn: 3600 }));
  await refreshSession(SESSION_ID);
  assert.equal(store.row()?.accessToken, NEW_ACCESS_TOKEN);
  assert.equal(store.row()?.refreshToken, REFRESH_TOKEN);
});

test("refresh verlengt de absolute sessiegrens nooit", async () => {
  const absoluteExpiresAt = new Date(NOW.getTime() + 10 * MINUTE);
  const { refreshSession, store } = setup(
    async () => ({ accessToken: NEW_ACCESS_TOKEN, expiresIn: 48 * 3600 }),
    { absoluteExpiresAt },
  );
  await refreshSession(SESSION_ID);

  assert.equal(store.row()?.absoluteExpiresAt.getTime(), absoluteExpiresAt.getTime());
  assert.equal(store.row()?.accessExpiresAt.getTime(), absoluteExpiresAt.getTime());
});

test("bereikte absolute grens: geen refresh, sessie verwijderd", async () => {
  const { refreshSession, store, used, logs } = setup(undefined, {
    accessExpiresAt: new Date(NOW.getTime() - MINUTE),
    absoluteExpiresAt: NOW,
  });
  assert.deepEqual(await refreshSession(SESSION_ID), { status: "invalid" });
  assert.deepEqual(used, []);
  assert.equal(store.row(), null);
  assert.deepEqual(logs, ["session_expired"]);
});

test("onbekende sessie geeft invalid zonder refresh", async () => {
  const { refreshSession, used } = setup();
  assert.deepEqual(await refreshSession("other-session"), { status: "invalid" });
  assert.deepEqual(used, []);
});

test("invalid_grant verwijdert de sessie", async () => {
  const { refreshSession, store, logs } = setup(async () => {
    throw new RefreshError("invalid_grant");
  });
  assert.deepEqual(await refreshSession(SESSION_ID), { status: "invalid" });
  assert.equal(store.row(), null);
  assert.deepEqual(logs, ["refresh_invalid_grant"]);
});

test("provider-timeout of ongeldige providerresponse laat de sessie ongemoeid", async () => {
  for (const reason of ["unavailable", "invalid_response"] as const) {
    const { refreshSession, store, logs } = setup(async () => {
      throw new RefreshError(reason);
    });
    assert.deepEqual(await refreshSession(SESSION_ID), { status: "unavailable" });
    assert.equal(store.row()?.accessToken, ACCESS_TOKEN);
    assert.equal(store.row()?.refreshToken, REFRESH_TOKEN);
    assert.deepEqual(logs, [`refresh_${reason}`]);
  }
});

test("na een API-401 wordt ook een schijnbaar geldig token ververst", async () => {
  const { refreshSession, used } = setup(undefined, { accessExpiresAt: new Date(NOW.getTime() + 10 * MINUTE) });
  assert.deepEqual(await refreshSession(SESSION_ID, ACCESS_TOKEN), { status: "ok", accessToken: NEW_ACCESS_TOKEN });
  assert.deepEqual(used, [REFRESH_TOKEN]);
});

test("na een API-401 op een al vervangen token wordt niet opnieuw ververst", async () => {
  const { refreshSession, used } = setup(undefined, {
    accessToken: NEW_ACCESS_TOKEN,
    accessExpiresAt: new Date(NOW.getTime() + 10 * MINUTE),
  });
  assert.deepEqual(await refreshSession(SESSION_ID, ACCESS_TOKEN), { status: "ok", accessToken: NEW_ACCESS_TOKEN });
  assert.deepEqual(used, []);
});

test("gelijktijdige requests gebruiken het refresh-token maar één keer", async () => {
  let release: () => void = () => undefined;
  const providerCalled = new Promise<void>((resolve) => {
    release = resolve;
  });
  // The provider answers only after all requests are queued, so they really overlap.
  const { refreshSession, used } = setup(async () => {
    await providerCalled;
    return { accessToken: NEW_ACCESS_TOKEN, refreshToken: NEW_REFRESH_TOKEN, expiresIn: 3600 };
  });

  const pending = [
    refreshSession(SESSION_ID),
    refreshSession(SESSION_ID),
    refreshSession(SESSION_ID, ACCESS_TOKEN),
    refreshSession(SESSION_ID, ACCESS_TOKEN),
  ];
  release();
  const outcomes = await Promise.all(pending);

  assert.deepEqual(used, [REFRESH_TOKEN]);
  for (const outcome of outcomes) {
    assert.deepEqual(outcome, { status: "ok", accessToken: NEW_ACCESS_TOKEN });
  }
});

test("tokens en sessie-ID komen nooit in logs terecht", async () => {
  const secrets = [SESSION_ID, ACCESS_TOKEN, REFRESH_TOKEN, NEW_ACCESS_TOKEN, NEW_REFRESH_TOKEN];
  const consoleOutput: string[] = [];
  const originals = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const method of ["log", "warn", "error", "info"] as const) {
    console[method] = (...args: unknown[]) => consoleOutput.push(args.map(String).join(" "));
  }

  try {
    const failures: Array<() => Promise<RefreshedTokens>> = [
      async () => {
        throw new RefreshError("invalid_grant");
      },
      async () => {
        throw new RefreshError("unavailable");
      },
      async () => {
        throw new Error(`unexpected ${REFRESH_TOKEN} ${NEW_ACCESS_TOKEN}`);
      },
    ];
    for (const refreshTokens of failures) {
      // Default logger, so real console output is captured too.
      const store = memoryStore();
      const refreshSession = createSessionRefresher({ lockSession: store.lockSession, refreshTokens, now: () => NOW });
      const outcome = await refreshSession(SESSION_ID);
      const exposed = JSON.stringify(outcome);
      for (const secret of secrets) {
        assert.equal(exposed.includes(secret), false);
      }
    }
  } finally {
    Object.assign(console, originals);
  }

  assert.equal(consoleOutput.length, 3);
  for (const line of consoleOutput) {
    for (const secret of secrets) {
      assert.equal(line.includes(secret), false, "logs must not contain secrets");
    }
  }
});
