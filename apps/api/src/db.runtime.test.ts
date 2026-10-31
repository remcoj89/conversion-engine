import assert from "node:assert/strict";
import test from "node:test";
import {
  assertApiRuntimeDatabaseIdentity,
  assertMaintenanceDatabaseIdentity,
  createTestObserverDb,
  createTestDb,
  createMaintenanceDb,
  readMaintenanceDatabaseContract,
  readApiRuntimeDatabaseContract,
} from "./db.js";

const runtimeDatabaseUrl = "postgresql://ce_api_runtime:secret@127.0.0.1:5432/conversion_engine";
const maintenanceDatabaseUrl = "postgresql://ce_maintenance:secret@127.0.0.1:5432/conversion_engine";

const identity = (overrides: Partial<{
  databaseName: string;
  currentUser: string;
  isSuperuser: boolean;
  bypassesRls: boolean;
  canCreateRoles: boolean;
  canCreateDatabases: boolean;
  canReplicate: boolean;
}> = {}) => ({
  databaseName: "conversion_engine",
  currentUser: "ce_maintenance",
  isSuperuser: false,
  bypassesRls: false,
  canCreateRoles: false,
  canCreateDatabases: false,
  canReplicate: false,
  ...overrides,
});

const fakeIdentityProbe = (row: ReturnType<typeof identity>) => ({
  query: async () => ({ rows: [row] }),
});

test("API runtime contract defaults to the hardened database role and database", () => {
  assert.deepEqual(readApiRuntimeDatabaseContract(runtimeDatabaseUrl, {}), {
    expectedDatabase: "conversion_engine",
    expectedRole: "ce_api_runtime",
  });
});

test("API runtime contract rejects a migrator URL before opening a connection", () => {
  assert.throws(
    () => readApiRuntimeDatabaseContract("postgresql://ce_migrator:secret@127.0.0.1:5432/conversion_engine", {}),
    /expected API runtime role/,
  );
});

test("API runtime contract rejects an unexpected database", () => {
  assert.throws(
    () => readApiRuntimeDatabaseContract("postgresql://ce_api_runtime:secret@127.0.0.1:5432/other_database", {}),
    /expected API database/,
  );
});

test("maintenance contract requires the local API database and ce_maintenance", () => {
  assert.deepEqual(readMaintenanceDatabaseContract(maintenanceDatabaseUrl, {}), {
    expectedDatabase: "conversion_engine",
    expectedRole: "ce_maintenance",
  });
  assert.throws(
    () => readMaintenanceDatabaseContract(
      "postgresql://ce_maintenance:secret@db.example.test:5432/conversion_engine",
      {},
    ),
    /local PostgreSQL host/,
  );
  assert.throws(
    () => readMaintenanceDatabaseContract(
      "postgresql://ce_api_runtime:secret@127.0.0.1:5432/conversion_engine",
      {},
    ),
    /must use ce_maintenance/,
  );
  assert.throws(
    () => readMaintenanceDatabaseContract(
      "postgresql://ce_maintenance:secret@127.0.0.1:5432/other_database",
      {},
    ),
    /expected local API database/,
  );
});

test("maintenance factory refuses production before opening a connection", async () => {
  await assert.rejects(
    createMaintenanceDb(maintenanceDatabaseUrl, { NODE_ENV: "production" }),
    /not allowed in production/,
  );
});

test("explicit test database context rejects a development database", () => {
  assert.throws(
    () => createTestDb("postgresql://ce_api_runtime:secret@127.0.0.1:5432/conversion_engine"),
    /requires conversion_engine_test/,
  );
});

test("explicit test database context rejects an unapproved role", () => {
  assert.throws(
    () => createTestDb("postgresql://postgres:secret@127.0.0.1:5432/conversion_engine_test"),
    /requires an approved test role/,
  );
});

test("explicit test database context requires the test environment guard", () => {
  assert.throws(
    () => createTestDb(
      "postgresql://ce_api_runtime:secret@127.0.0.1:5432/conversion_engine_test",
      { NODE_ENV: "development", CE_RLS_TEST_MODE: "off" },
    ),
    /requires NODE_ENV=test and CE_RLS_TEST_MODE=on/,
  );
});

test("explicit test database context rejects a shared development database", () => {
  assert.throws(
    () => createTestDb(
      "postgresql://ce_api_runtime:secret@127.0.0.1:5432/conversion_engine_test",
      {
        NODE_ENV: "test",
        CE_RLS_TEST_MODE: "on",
        DATABASE_URL: "postgresql://ce_api_runtime:secret@127.0.0.1:5432/conversion_engine_test",
      },
    ),
    /requires a separate development database/,
  );
});

test("API runtime identity probe accepts a non-privileged ce_api_runtime connection", async () => {
  const pool = {
    query: async () => ({
      rows: [{
        databaseName: "conversion_engine",
        currentUser: "ce_api_runtime",
        isSuperuser: false,
        bypassesRls: false,
        canCreateRoles: false,
        canCreateDatabases: false,
        canReplicate: false,
      }],
    }),
  };

  await assertApiRuntimeDatabaseIdentity(pool, {
    expectedDatabase: "conversion_engine",
    expectedRole: "ce_api_runtime",
  });
});

test("API runtime identity probe fails closed for an elevated role", async () => {
  const pool = {
    query: async () => ({
      rows: [{
        databaseName: "conversion_engine",
        currentUser: "ce_api_runtime",
        isSuperuser: false,
        bypassesRls: true,
        canCreateRoles: false,
        canCreateDatabases: false,
        canReplicate: false,
      }],
    }),
  };

  await assert.rejects(
    assertApiRuntimeDatabaseIdentity(pool, {
      expectedDatabase: "conversion_engine",
      expectedRole: "ce_api_runtime",
    }),
    /must not bypass RLS/,
  );
});

test("API runtime identity probe fails closed for the wrong database or role", async () => {
  const pool = {
    query: async () => ({
      rows: [{
        databaseName: "other_database",
        currentUser: "ce_migrator",
        isSuperuser: false,
        bypassesRls: false,
        canCreateRoles: false,
        canCreateDatabases: false,
        canReplicate: false,
      }],
    }),
  };

  await assert.rejects(
    assertApiRuntimeDatabaseIdentity(pool, {
      expectedDatabase: "conversion_engine",
      expectedRole: "ce_api_runtime",
    }),
    /unexpected database/,
  );
});

test("API runtime identity probe rejects role-management and replication privileges", async () => {
  const elevatedFlags = [
    ["canCreateRoles", "must not create roles"],
    ["canCreateDatabases", "must not create databases"],
    ["canReplicate", "must not use replication privileges"],
  ] as const;

  for (const [flag, message] of elevatedFlags) {
    const pool = {
      query: async () => ({
        rows: [{
          databaseName: "conversion_engine",
          currentUser: "ce_api_runtime",
          isSuperuser: false,
          bypassesRls: false,
          canCreateRoles: false,
          canCreateDatabases: false,
          canReplicate: false,
          [flag]: true,
        }],
      }),
    };

    await assert.rejects(
      assertApiRuntimeDatabaseIdentity(pool, {
        expectedDatabase: "conversion_engine",
        expectedRole: "ce_api_runtime",
      }),
      new RegExp(message),
    );
  }
});

test("maintenance identity probe accepts the least-privileged maintenance role", async () => {
  await assertMaintenanceDatabaseIdentity(
    fakeIdentityProbe(identity()),
    { expectedDatabase: "conversion_engine", expectedRole: "ce_maintenance" },
  );
});

test("maintenance identity probe fails closed for every elevated role flag", async () => {
  const elevatedFlags = [
    ["isSuperuser", "must not be a superuser"],
    ["bypassesRls", "must not bypass RLS"],
    ["canCreateRoles", "must not create roles"],
    ["canCreateDatabases", "must not create databases"],
    ["canReplicate", "must not use replication privileges"],
  ] as const;

  for (const [flag, message] of elevatedFlags) {
    await assert.rejects(
      assertMaintenanceDatabaseIdentity(
        fakeIdentityProbe(identity({ [flag]: true })),
        { expectedDatabase: "conversion_engine", expectedRole: "ce_maintenance" },
      ),
      new RegExp(message),
    );
  }
});

test("maintenance identity probe fails closed for incomplete or mismatched identity", async () => {
  await assert.rejects(
    assertMaintenanceDatabaseIdentity(
      { query: async () => ({ rows: [] }) },
      { expectedDatabase: "conversion_engine", expectedRole: "ce_maintenance" },
    ),
    /incomplete identity probe/,
  );
  await assert.rejects(
    assertMaintenanceDatabaseIdentity(
      fakeIdentityProbe(identity({ currentUser: "ce_api_runtime" })),
      { expectedDatabase: "conversion_engine", expectedRole: "ce_maintenance" },
    ),
    /unexpected role/,
  );
  await assert.rejects(
    assertMaintenanceDatabaseIdentity(
      {
        query: async () => ({ rows: [{ ...identity(), canCreateRoles: undefined }] }),
      } as unknown as Parameters<typeof assertMaintenanceDatabaseIdentity>[0],
      { expectedDatabase: "conversion_engine", expectedRole: "ce_maintenance" },
    ),
    /incomplete identity probe/,
  );
});

test("test observer rejects the migration role and enables read-only sessions", async () => {
  assert.throws(
    () => createTestObserverDb("postgresql://ce_migrator:secret@127.0.0.1:5432/conversion_engine"),
    /approved read-only observer role/,
  );

  const { pool } = createTestObserverDb(
    "postgresql://ce_api_runtime:secret@127.0.0.1:5432/conversion_engine",
  );
  try {
    assert.match(pool.options.options ?? "", /default_transaction_read_only=on/);
  } finally {
    await pool.end();
  }
});
