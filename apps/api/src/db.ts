import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "./db/schema.js";
import { getDatabaseRequestContext } from "./db/requestContext.js";
import { databaseNameFromUrl, POSTGRES_ROLE_NAMES } from "./dev/postgresRoleContract.js";

const RLS_CONTEXT_SQL = `
  select
    set_config('app.rls_scope', $1, true),
    set_config('app.rls_subject', $2, true),
    set_config('app.rls_tenant_id', $3, true),
    set_config('app.rls_invitation_token_hash', $4, true)
`;

type QueryMethod = PoolClient["query"];
type QueryCallback = (error: Error | null, result?: unknown) => void;
type ClientTransactionState = { inTransaction: boolean };
type DatabaseQueryClient = {
  query(queryText: string): Promise<{ rows: DatabaseIdentityRow[] }>;
};

export type ApiRuntimeDatabaseContract = {
  expectedDatabase: string;
  expectedRole: string;
};

export type MaintenanceDatabaseContract = {
  expectedDatabase: string;
  expectedRole: typeof POSTGRES_ROLE_NAMES.maintenance;
};

type DatabaseIdentityRow = {
  databaseName: string;
  currentUser: string;
  isSuperuser: boolean;
  bypassesRls: boolean;
  canCreateRoles: boolean;
  canCreateDatabases: boolean;
  canReplicate: boolean;
};

const DEFAULT_API_DATABASE = "conversion_engine";
const TEST_DATABASE = "conversion_engine_test";
const DEVELOPMENT_DATABASE = "conversion_engine";
const TEST_DATABASE_ROLES: ReadonlySet<string> = new Set([
  POSTGRES_ROLE_NAMES.api,
  POSTGRES_ROLE_NAMES.migrator,
]);
const TEST_OBSERVER_ROLES: ReadonlySet<string> = new Set([POSTGRES_ROLE_NAMES.api]);

type DatabaseOptions = {
  testMode?: boolean;
  readOnly?: boolean;
};

const transactionStates = new WeakMap<PoolClient, ClientTransactionState>();

function wrapClient(client: PoolClient): PoolClient {
  const originalQuery = client.query.bind(client) as (...args: readonly unknown[]) => unknown;
  const transactionState = { inTransaction: false };
  transactionStates.set(client, transactionState);

  function invokeRaw(query: unknown, values?: unknown, callback?: QueryCallback): unknown {
    return callback
      ? originalQuery(query, values, callback)
      : originalQuery(query, values);
  }

  function updateTransactionState(query: unknown): void {
    if (typeof query !== "string") return;
    const queryText = query.trim().toLowerCase();
    if (/^(begin|start\s+transaction)\b/.test(queryText)) {
      transactionState.inTransaction = true;
    } else if (/^(commit|rollback)(?!\s+to\b)\b/.test(queryText)) {
      transactionState.inTransaction = false;
    }
  }

  async function runWithContext(query: unknown, values?: unknown): Promise<unknown> {
    const context = getDatabaseRequestContext();
    if (!context || context.scope === "anonymous") return invokeRaw(query, values) as Promise<unknown>;

    const contextValues = [
      context.scope,
      context.subject ?? "",
      context.tenantId ?? "",
      context.invitationTokenHash ?? "",
    ];

    if (transactionState.inTransaction) {
      await invokeRaw(RLS_CONTEXT_SQL, contextValues);
      return invokeRaw(query, values);
    }

    transactionState.inTransaction = true;
    await invokeRaw("begin");
    try {
      await invokeRaw(RLS_CONTEXT_SQL, contextValues);
      const result = await invokeRaw(query, values);
      await invokeRaw("commit");
      transactionState.inTransaction = false;
      return result;
    } catch (error) {
      await Promise.resolve(invokeRaw("rollback")).catch(() => undefined);
      transactionState.inTransaction = false;
      throw error;
    }
  }

  client.query = ((query: unknown, values?: unknown, callback?: QueryCallback) => {
    const callbackFunction = typeof values === "function" ? values as QueryCallback : callback;
    const queryValues = callbackFunction === values ? undefined : values;
    const queryText = typeof query === "string" ? query.trim().toLowerCase() : "";
    const isTransactionControl = /^(begin|start\s+transaction|commit|rollback|release|savepoint)\b/.test(queryText);
    if (isTransactionControl || !getDatabaseRequestContext()) {
      const result = invokeRaw(query, queryValues, callbackFunction);
      updateTransactionState(query);
      return result;
    }

    if (callbackFunction) {
      runWithContext(query, queryValues).then(
        (result) => callbackFunction(null, result),
        (error: unknown) => callbackFunction(error instanceof Error ? error : new Error("Database query failed")),
      );
      return undefined;
    }

    return runWithContext(query, queryValues);
  }) as QueryMethod;
  return client;
}

function databaseUserFromUrl(databaseUrl: string): string | undefined {
  try {
    const url = new URL(databaseUrl);
    return url.username ? decodeURIComponent(url.username) : undefined;
  } catch {
    return undefined;
  }
}

function databaseHostFromUrl(databaseUrl: string): string | undefined {
  try {
    const url = new URL(databaseUrl);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return undefined;
    return url.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function assertDatabaseIdentity(
  identity: DatabaseIdentityRow | undefined,
  expectedDatabase: string,
  expectedRole: string,
  label: string,
): void {
  if (
    !identity ||
    typeof identity.databaseName !== "string" ||
    typeof identity.currentUser !== "string" ||
    typeof identity.isSuperuser !== "boolean" ||
    typeof identity.bypassesRls !== "boolean" ||
    typeof identity.canCreateRoles !== "boolean" ||
    typeof identity.canCreateDatabases !== "boolean" ||
    typeof identity.canReplicate !== "boolean"
  ) {
    throw new Error(`${label} database identity check failed: incomplete identity probe`);
  }
  if (identity.databaseName !== expectedDatabase) {
    throw new Error(`${label} database identity check failed: unexpected database`);
  }
  if (identity.currentUser !== expectedRole) {
    throw new Error(`${label} database identity check failed: unexpected role`);
  }
  if (identity.isSuperuser) {
    throw new Error(`${label} database identity check failed: role must not be a superuser`);
  }
  if (identity.bypassesRls) {
    throw new Error(`${label} database identity check failed: role must not bypass RLS`);
  }
  if (identity.canCreateRoles) {
    throw new Error(`${label} database identity check failed: role must not create roles`);
  }
  if (identity.canCreateDatabases) {
    throw new Error(`${label} database identity check failed: role must not create databases`);
  }
  if (identity.canReplicate) {
    throw new Error(`${label} database identity check failed: role must not use replication privileges`);
  }
}

async function probeDatabaseIdentity(
  pool: DatabaseQueryClient,
): Promise<DatabaseIdentityRow | undefined> {
  const result = await pool.query(
    `select
       current_database() as "databaseName",
       current_user as "currentUser",
       coalesce(role.rolsuper, false) as "isSuperuser",
       coalesce(role.rolbypassrls, false) as "bypassesRls",
       coalesce(role.rolcreaterole, false) as "canCreateRoles",
       coalesce(role.rolcreatedb, false) as "canCreateDatabases",
       coalesce(role.rolreplication, false) as "canReplicate"
     from pg_roles role
     where role.rolname = current_user`,
  );
  return result.rows[0];
}

export function readApiRuntimeDatabaseContract(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): ApiRuntimeDatabaseContract {
  const expectedDatabase = env.EXPECTED_API_DATABASE?.trim() || DEFAULT_API_DATABASE;
  const expectedRole = env.EXPECTED_RUNTIME_ROLE?.trim() || POSTGRES_ROLE_NAMES.api;
  const configuredDatabase = databaseNameFromUrl(databaseUrl);
  const configuredRole = databaseUserFromUrl(databaseUrl);

  if (!configuredDatabase || configuredDatabase !== expectedDatabase) {
    throw new Error("DATABASE_URL must target the expected API database");
  }
  if (!configuredRole || configuredRole !== expectedRole) {
    throw new Error("DATABASE_URL must use the expected API runtime role");
  }

  return { expectedDatabase, expectedRole };
}

export function readMaintenanceDatabaseContract(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): MaintenanceDatabaseContract {
  const expectedDatabase = env.EXPECTED_API_DATABASE?.trim() || DEFAULT_API_DATABASE;
  const configuredDatabase = databaseNameFromUrl(databaseUrl);
  const configuredRole = databaseUserFromUrl(databaseUrl);
  const configuredHost = databaseHostFromUrl(databaseUrl);

  if (!configuredDatabase || configuredDatabase !== expectedDatabase) {
    throw new Error("MAINTENANCE_DATABASE_URL must target the expected local API database");
  }
  if (!configuredHost || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(configuredHost)) {
    throw new Error("MAINTENANCE_DATABASE_URL must target a local PostgreSQL host");
  }
  if (configuredRole !== POSTGRES_ROLE_NAMES.maintenance) {
    throw new Error("MAINTENANCE_DATABASE_URL must use ce_maintenance");
  }

  return { expectedDatabase, expectedRole: POSTGRES_ROLE_NAMES.maintenance };
}

export function createTestDb(
  databaseUrl = process.env.DATABASE_TEST_URL,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!databaseUrl) {
    throw new Error("DATABASE_TEST_URL is required for the explicit test database context");
  }

  const databaseName = databaseNameFromUrl(databaseUrl);
  const roleName = databaseUserFromUrl(databaseUrl);
  if (databaseName !== TEST_DATABASE) {
    throw new Error("The explicit test database context requires conversion_engine_test");
  }
  if (!roleName || !TEST_DATABASE_ROLES.has(roleName)) {
    throw new Error("The explicit test database context requires an approved test role");
  }

  const configuredDevelopmentDatabase = env.DATABASE_URL
    ? databaseNameFromUrl(env.DATABASE_URL)
    : undefined;
  if (configuredDevelopmentDatabase === TEST_DATABASE) {
    throw new Error(
      "The explicit test database context requires a separate development database",
    );
  }

  if (env.NODE_ENV !== "test" || env.CE_RLS_TEST_MODE !== "on") {
    throw new Error(
      "The explicit test database context requires NODE_ENV=test and CE_RLS_TEST_MODE=on",
    );
  }

  return createDb(databaseUrl, { testMode: true });
}

export function createTestObserverDb(databaseUrl: string) {
  const databaseName = databaseNameFromUrl(databaseUrl);
  const roleName = databaseUserFromUrl(databaseUrl);
  if (databaseName !== DEVELOPMENT_DATABASE && databaseName !== TEST_DATABASE) {
    throw new Error("The test observer context requires a local development or test database");
  }
  if (!roleName || !TEST_OBSERVER_ROLES.has(roleName)) {
    throw new Error("The test observer context requires the approved read-only observer role");
  }

  return createDb(databaseUrl, { readOnly: true });
}

export async function assertApiRuntimeDatabaseIdentity(
  pool: DatabaseQueryClient,
  contract: ApiRuntimeDatabaseContract,
): Promise<void> {
  const identity = await probeDatabaseIdentity(pool);
  assertDatabaseIdentity(identity, contract.expectedDatabase, contract.expectedRole, "API");
}

export async function assertMaintenanceDatabaseIdentity(
  pool: DatabaseQueryClient,
  contract: MaintenanceDatabaseContract,
): Promise<void> {
  const identity = await probeDatabaseIdentity(pool);
  assertDatabaseIdentity(identity, contract.expectedDatabase, contract.expectedRole, "Maintenance");
}

export async function createApiRuntimeDb(
  databaseUrl = process.env.DATABASE_URL,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const contract = readApiRuntimeDatabaseContract(databaseUrl, env);
  const connection = createDb(databaseUrl);
  try {
    await assertApiRuntimeDatabaseIdentity(connection.pool, contract);
    return connection;
  } catch (error) {
    await connection.pool.end().catch(() => undefined);
    throw error;
  }
}

export async function createMaintenanceDb(
  databaseUrl = process.env.MAINTENANCE_DATABASE_URL,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.NODE_ENV === "production") {
    throw new Error("Local maintenance provisioning is not allowed in production");
  }
  if (!databaseUrl) {
    throw new Error("MAINTENANCE_DATABASE_URL is required for local maintenance provisioning");
  }

  const contract = readMaintenanceDatabaseContract(databaseUrl, env);
  const connection = createDb(databaseUrl);
  try {
    await assertMaintenanceDatabaseIdentity(connection.pool, contract);
    return connection;
  } catch (error) {
    await connection.pool.end().catch(() => undefined);
    throw error;
  }
}

function createDb(databaseUrl = process.env.DATABASE_URL, options: DatabaseOptions = {}) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  if (options.testMode && databaseNameFromUrl(databaseUrl) !== TEST_DATABASE) {
    throw new Error("Test RLS mode requires conversion_engine_test");
  }

  const connectionOptions = [
    ...(options.testMode ? ["-c app.rls_test_mode=on"] : []),
    ...(options.readOnly ? ["-c default_transaction_read_only=on"] : []),
  ];
  const pool = new Pool({
    connectionString: databaseUrl,
    ...(connectionOptions.length > 0 ? { options: connectionOptions.join(" ") } : {}),
  });

  pool.on("connect", (client) => {
    wrapClient(client);
  });

  return {
    db: drizzle(pool, { schema }),
    pool,
  };
}
