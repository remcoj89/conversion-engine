import assert from "node:assert/strict";
import test from "node:test";
import type { BffSessionPool, BffSessionPoolFactory } from "./database";
import {
  BFF_SESSION_DATABASE,
  BFF_SESSION_DATABASE_USER,
  createBffSessionPool,
  validateConfiguredBffSessionDatabase,
} from "./database";

const VALID_URL = "postgresql://ce_bff_runtime:secret-value@127.0.0.1:5432/conversion_engine";

type IdentityRow = {
  databaseName: string;
  userName: string;
  isSuperuser: boolean;
  bypassesRls: boolean;
  canCreateRoles: boolean;
  canCreateDatabases: boolean;
  hasReplication: boolean;
};

function identity(overrides: Partial<IdentityRow> = {}): IdentityRow {
  return {
    databaseName: BFF_SESSION_DATABASE,
    userName: BFF_SESSION_DATABASE_USER,
    isSuperuser: false,
    bypassesRls: false,
    canCreateRoles: false,
    canCreateDatabases: false,
    hasReplication: false,
    ...overrides,
  };
}

function fakePool(row: IdentityRow | undefined, queryError?: Error) {
  let released = false;
  let ended = false;
  const client = {
    query: async () => {
      if (queryError) throw queryError;
      return { rows: row ? [row] : [] };
    },
    release: () => {
      released = true;
    },
  };
  const pool = {
    connect: async () => client,
    query: async () => ({ rows: [] }),
    end: async () => {
      ended = true;
    },
  } as unknown as BffSessionPool;
  return { pool, state: () => ({ released, ended }) };
}

function factoryFor(pool: BffSessionPool): BffSessionPoolFactory {
  return () => pool;
}

test("configured BFF database identity is exact and URL values are not needed in errors", () => {
  validateConfiguredBffSessionDatabase(VALID_URL);

  for (const value of [
    "postgresql://ce_bff_runtime:secret-value@127.0.0.1:5432/wrong_database",
    "postgresql://other_runtime:secret-value@127.0.0.1:5432/conversion_engine",
    "not-a-database-url",
  ]) {
    assert.throws(() => validateConfiguredBffSessionDatabase(value));
  }
});

test("identity probe accepts the expected database and least-privileged runtime role", async () => {
  const { pool, state } = fakePool(identity());
  const result = await createBffSessionPool(VALID_URL, factoryFor(pool));

  assert.equal(result, pool);
  assert.deepEqual(state(), { released: true, ended: false });
});

test("identity probe rejects an unexpected live database or current user", async () => {
  for (const overrides of [{ databaseName: "wrong_database" }, { userName: "other_runtime" }]) {
    const { pool, state } = fakePool(identity(overrides));
    await assert.rejects(createBffSessionPool(VALID_URL, factoryFor(pool)), /identity is not the expected/);
    assert.deepEqual(state(), { released: true, ended: true });
  }
});

test("identity probe rejects every forbidden PostgreSQL role flag", async () => {
  for (const flag of ["isSuperuser", "bypassesRls", "canCreateRoles", "canCreateDatabases", "hasReplication"] as const) {
    const { pool, state } = fakePool(identity({ [flag]: true }));
    await assert.rejects(createBffSessionPool(VALID_URL, factoryFor(pool)), /forbidden privileges/);
    assert.deepEqual(state(), { released: true, ended: true });
  }
});

test("a failed identity query closes the pool and exposes no connection details", async () => {
  const secret = "query-error-secret-value";
  const { pool, state } = fakePool(undefined, new Error(secret));
  const result = createBffSessionPool(VALID_URL, factoryFor(pool));

  await assert.rejects(result, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message.includes(secret), false);
    return error.message === "BFF session database identity check failed";
  });
  assert.deepEqual(state(), { released: true, ended: true });
});
