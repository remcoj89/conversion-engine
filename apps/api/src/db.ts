import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "./db/schema.js";
import { getDatabaseRequestContext } from "./db/requestContext.js";

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

function isTestDatabase(databaseUrl: string): boolean {
  try {
    return new URL(databaseUrl).pathname.replace(/^\//, "") === "conversion_engine_test";
  } catch {
    return false;
  }
}

export function createDb(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ...(isTestDatabase(databaseUrl) ? { options: "-c app.rls_test_mode=on" } : {}),
  });

  pool.on("connect", (client) => {
    wrapClient(client);
  });

  return {
    db: drizzle(pool, { schema }),
    pool,
  };
}
