import { Pool } from "pg";
import type { Connectable, Queryable } from "./store";

export const BFF_SESSION_DATABASE = "conversion_engine";
export const BFF_SESSION_DATABASE_USER = "ce_bff_runtime";

export type BffSessionPool = Queryable & Connectable & Readonly<{ end: () => Promise<void> }>;

type SessionDatabaseClient = Queryable & Readonly<{ release: () => void }>;

type SessionDatabaseIdentity = Readonly<{
  databaseName: string | null;
  userName: string | null;
  isSuperuser: boolean;
  bypassesRls: boolean;
  canCreateRoles: boolean;
  canCreateDatabases: boolean;
  hasReplication: boolean;
}>;

export type BffSessionPoolFactory = (databaseUrl: string) => BffSessionPool;

const createDefaultPool: BffSessionPoolFactory = (databaseUrl) =>
  new Pool({ connectionString: databaseUrl });

// Validate the connection target before pg receives the URL. Error messages intentionally omit the URL.
export function validateConfiguredBffSessionDatabase(databaseUrl: string): void {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("SESSION_DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("SESSION_DATABASE_URL must be a PostgreSQL URL");
  }

  let databaseName: string;
  let userName: string;
  try {
    databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    userName = decodeURIComponent(url.username);
  } catch {
    throw new Error("SESSION_DATABASE_URL contains invalid connection identity encoding");
  }

  if (databaseName !== BFF_SESSION_DATABASE) {
    throw new Error("BFF session database must be conversion_engine");
  }
  if (userName !== BFF_SESSION_DATABASE_USER) {
    throw new Error("BFF session database user must be ce_bff_runtime");
  }
}

// Probe the live identity, rather than trusting only the configured connection URL.
export async function probeBffSessionDatabaseIdentity(client: SessionDatabaseClient): Promise<void> {
  const { rows } = await client.query<SessionDatabaseIdentity>(`
    select
      current_database() as "databaseName",
      current_user as "userName",
      r.rolsuper as "isSuperuser",
      r.rolbypassrls as "bypassesRls",
      r.rolcreaterole as "canCreateRoles",
      r.rolcreatedb as "canCreateDatabases",
      r.rolreplication as "hasReplication"
    from pg_roles as r
    where r.rolname = current_user
  `);

  const identity = rows[0];
  if (!identity || identity.databaseName !== BFF_SESSION_DATABASE || identity.userName !== BFF_SESSION_DATABASE_USER) {
    throw new Error("BFF session database identity is not the expected runtime identity");
  }

  if (
    identity.isSuperuser ||
    identity.bypassesRls ||
    identity.canCreateRoles ||
    identity.canCreateDatabases ||
    identity.hasReplication
  ) {
    throw new Error("BFF session database role has forbidden privileges");
  }
}

// Creates and verifies the pool before it can be used by any BFF route.
// A failed probe closes the pool so a later lazy retry cannot leak connections.
export async function createBffSessionPool(
  databaseUrl: string,
  createPool: BffSessionPoolFactory = createDefaultPool,
): Promise<BffSessionPool> {
  validateConfiguredBffSessionDatabase(databaseUrl);

  let pool: BffSessionPool | undefined;
  try {
    pool = createPool(databaseUrl);
    const client = await pool.connect();
    try {
      await probeBffSessionDatabaseIdentity(client);
    } finally {
      client.release();
    }
    return pool;
  } catch (error) {
    await pool?.end().catch(() => undefined);
    if (error instanceof Error && error.message.startsWith("BFF session database")) {
      throw error;
    }
    throw new Error("BFF session database identity check failed");
  }
}
