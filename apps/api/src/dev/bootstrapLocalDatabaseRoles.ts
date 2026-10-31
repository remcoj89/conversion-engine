import { Pool, type PoolClient } from "pg";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  databaseNameFromUrl,
  LOCAL_DATABASE_DEFAULT,
  readRequiredLocalRolePasswords,
  type LocalRolePasswords,
} from "./postgresRoleContract.js";

export const LOCAL_ROLE_CONFIRM_FLAG = "--confirm-local";

/**
 * These allowlists are intentionally explicit. New public objects receive no
 * runtime privileges until a reviewed change adds them here.
 */
export const RUNTIME_TABLE_ALLOWLISTS = {
  api: [
    "tenants",
    "users",
    "memberships",
    "tenant_owner_invitations",
    "websites",
    "organizations",
    "contacts",
    "leads",
    "lead_assignments",
    "onboarding_projects",
    "onboarding_versions",
    "onboarding_reviewer_assignments",
    "platform_admin_assignments",
    "onboarding_audit_events",
    "onboarding_review_requests",
    "onboarding_review_actions",
    "onboarding_review_access_events",
  ],
  bff: ["bff_sessions"],
  maintenance: [],
} as const;

export const RUNTIME_SEQUENCE_ALLOWLISTS = {
  api: [],
  bff: [],
  maintenance: [],
} as const;

export const RUNTIME_FUNCTION_ALLOWLISTS = {
  api: [
    "ce_rls_scope()",
    "ce_rls_subject()",
    "ce_rls_invitation_token_hash()",
    "ce_rls_test_bypass()",
    "ce_rls_current_user_id()",
    "ce_rls_platform_access()",
    "ce_rls_tenant_allowed(uuid)",
    "ce_rls_lead_scope_allowed(uuid)",
    "ce_rls_customer_can_read_lead(uuid, uuid)",
    "ce_rls_crm_scope_allowed(uuid)",
  ],
  bff: [],
  maintenance: [],
} as const;

export type OwnerRoleMembership = {
  member_role: string;
  parent_role: string;
  admin_option: boolean;
  inherit_option: boolean;
  set_option: boolean;
};

export function assertOwnerRoleMembershipBoundary(rows: readonly OwnerRoleMembership[]): void {
  const expected = rows.length === 1 ? rows[0] : undefined;
  if (
    !expected ||
    expected.member_role !== "ce_migrator" ||
    expected.parent_role !== "ce_owner" ||
    expected.admin_option ||
    !expected.inherit_option ||
    !expected.set_option
  ) {
    throw new Error("ce_owner membership boundary must be exactly ce_migrator -> ce_owner with INHERIT and SET only");
  }
}

export type LocalRoleBootstrapInput = {
  databaseUrl: string;
  expectedDatabase: string;
  passwords: LocalRolePasswords;
};

export class LocalRoleBootstrapError extends Error {
  constructor(
    readonly code:
      | "confirmation_required"
      | "production_refused"
      | "local_environment_required"
      | "database_url_required"
      | "database_url_invalid"
      | "database_guard_failed"
      | "passwords_required",
    message: string,
  ) {
    super(message);
    this.name = "LocalRoleBootstrapError";
  }
}

function requiredEnvironmentValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

export function assertLocalRoleBootstrapInvocation(
  env: NodeJS.ProcessEnv = process.env,
  args: readonly string[] = process.argv.slice(2),
): LocalRoleBootstrapInput {
  if (args.length !== 1 || args[0] !== LOCAL_ROLE_CONFIRM_FLAG) {
    throw new LocalRoleBootstrapError("confirmation_required", "explicit local confirmation is required");
  }
  if (env.NODE_ENV === "production") {
    throw new LocalRoleBootstrapError("production_refused", "production environment is not allowed");
  }
  if (env.NODE_ENV && !["development", "test"].includes(env.NODE_ENV)) {
    throw new LocalRoleBootstrapError("local_environment_required", "NODE_ENV must be development or test");
  }

  const databaseUrl = requiredEnvironmentValue(env, "DATABASE_URL");
  if (!databaseUrl) {
    throw new LocalRoleBootstrapError("database_url_required", "DATABASE_URL is required");
  }
  const databaseName = databaseNameFromUrl(databaseUrl);
  if (!databaseName) {
    throw new LocalRoleBootstrapError("database_url_invalid", "DATABASE_URL must be a PostgreSQL URL");
  }

  const expectedDatabase = requiredEnvironmentValue(env, "EXPECTED_LOCAL_DATABASE") ?? LOCAL_DATABASE_DEFAULT;
  if (databaseName !== expectedDatabase) {
    throw new LocalRoleBootstrapError(
      "database_guard_failed",
      `DATABASE_URL must target the expected local database ${expectedDatabase}`,
    );
  }

  try {
    return { databaseUrl, expectedDatabase, passwords: readRequiredLocalRolePasswords(env) };
  } catch (error) {
    throw new LocalRoleBootstrapError(
      "passwords_required",
      error instanceof Error ? error.message : "required local role passwords are missing",
    );
  }
}

function sqlStringLiteral(value: string): string {
  if (value.includes("\0")) throw new Error("role password contains an invalid null byte");
  return `'${value.replaceAll("'", "''")}'`;
}

async function ensureRoles(client: PoolClient, passwords: LocalRolePasswords): Promise<void> {
  await client.query(`
    DO $bootstrap$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ce_owner') THEN
        CREATE ROLE ce_owner NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ce_migrator') THEN
        CREATE ROLE ce_migrator LOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ce_api_runtime') THEN
        CREATE ROLE ce_api_runtime LOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ce_bff_runtime') THEN
        CREATE ROLE ce_bff_runtime LOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ce_maintenance') THEN
        CREATE ROLE ce_maintenance LOGIN;
      END IF;
    END
    $bootstrap$;
  `);

  await client.query(
    `ALTER ROLE ce_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`,
  );
  await client.query(
    `ALTER ROLE ce_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT PASSWORD ${sqlStringLiteral(passwords.migrator)}`,
  );
  await client.query(
    `ALTER ROLE ce_api_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT PASSWORD ${sqlStringLiteral(passwords.api)}`,
  );
  await client.query(
    `ALTER ROLE ce_bff_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT PASSWORD ${sqlStringLiteral(passwords.bff)}`,
  );
  await client.query(
    `ALTER ROLE ce_maintenance LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT PASSWORD ${sqlStringLiteral(passwords.maintenance)}`,
  );

  await client.query(buildRoleMembershipBoundarySql());
}

export function buildRoleMembershipBoundarySql(): string {
  return `
    -- Only the migration role may assume the no-login owner role. Remove every
    -- other owner membership first so stale grants cannot survive a re-bootstrap.
    REVOKE ce_owner FROM ce_api_runtime, ce_bff_runtime, ce_maintenance;

    DO $owner_membership_cleanup$
    DECLARE owner_membership record;
    BEGIN
      FOR owner_membership IN
        SELECT member.rolname AS member_role
        FROM pg_catalog.pg_auth_members memberships
        JOIN pg_catalog.pg_roles member ON member.oid = memberships.member
        JOIN pg_catalog.pg_roles parent ON parent.oid = memberships.roleid
        WHERE parent.rolname = 'ce_owner'
          AND member.rolname <> 'ce_migrator'
      LOOP
        EXECUTE format('REVOKE ce_owner FROM %I', owner_membership.member_role);
      END LOOP;
    END
    $owner_membership_cleanup$;

    GRANT ce_owner TO ce_migrator WITH INHERIT TRUE, SET TRUE, ADMIN FALSE;
  `;
}

async function ensureBootstrapOwnership(client: PoolClient): Promise<string | undefined> {
  const result = await client.query<{ current_user: string; is_superuser: boolean }>(
    `SELECT current_user, rolsuper AS is_superuser FROM pg_catalog.pg_roles WHERE rolname = current_user`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("could not determine bootstrap connection role");

  // Grant temporary owner membership so a non-superuser bootstrap role can transfer ownership.
  // The membership is revoked after the transfer; application roles never receive it.
  if (!row.is_superuser && row.current_user !== "ce_migrator") {
    await client.query(`GRANT ce_owner TO ${quoteIdentifier(row.current_user)} WITH INHERIT TRUE, SET TRUE, ADMIN FALSE`);
    return row.current_user;
  }
  return undefined;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function buildExplicitTableGrants(): string {
  const grants: string[] = [];
  const appendGrant = (tableName: string, roleName: string): void => {
    const qualifiedName = `public.${quoteIdentifier(tableName)}`;
    grants.push(`
    DO $runtime_table_${tableName}$
    BEGIN
      IF to_regclass(${sqlStringLiteral(qualifiedName)}) IS NOT NULL THEN
        EXECUTE ${sqlStringLiteral(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${qualifiedName} TO ${roleName}`)};
      END IF;
    END
    $runtime_table_${tableName}$;`);
  };

  for (const tableName of RUNTIME_TABLE_ALLOWLISTS.api) {
    appendGrant(tableName, "ce_api_runtime");
  }
  for (const tableName of RUNTIME_TABLE_ALLOWLISTS.bff) {
    appendGrant(tableName, "ce_bff_runtime");
  }
  for (const tableName of RUNTIME_TABLE_ALLOWLISTS.maintenance) {
    appendGrant(tableName, "ce_maintenance");
  }
  return grants.join("\n    ");
}

function buildExplicitSequenceGrants(): string {
  const grants: string[] = [];
  const appendGrant = (sequenceName: string, roleName: string): void => {
    const qualifiedName = `public.${quoteIdentifier(sequenceName)}`;
    grants.push(`
    DO $runtime_sequence_${sequenceName}$
    BEGIN
      IF to_regclass(${sqlStringLiteral(qualifiedName)}) IS NOT NULL THEN
        EXECUTE ${sqlStringLiteral(`GRANT USAGE, SELECT, UPDATE ON SEQUENCE ${qualifiedName} TO ${roleName}`)};
      END IF;
    END
    $runtime_sequence_${sequenceName}$;`);
  };

  for (const tableName of RUNTIME_SEQUENCE_ALLOWLISTS.api) {
    appendGrant(tableName, "ce_api_runtime");
  }
  for (const sequenceName of RUNTIME_SEQUENCE_ALLOWLISTS.bff) {
    appendGrant(sequenceName, "ce_bff_runtime");
  }
  for (const sequenceName of RUNTIME_SEQUENCE_ALLOWLISTS.maintenance) {
    appendGrant(sequenceName, "ce_maintenance");
  }
  return grants.join("\n    ");
}

function buildExplicitFunctionGrants(): string {
  const grants: string[] = [];
  const appendGrants = (functionSignatures: readonly string[], roleName: string): void => {
    for (const functionSignature of functionSignatures) {
      const separator = functionSignature.indexOf("(");
      const functionName = functionSignature.slice(0, separator);
      const argumentsList = functionSignature.slice(separator + 1, -1);
      const qualifiedSignature = `public.${quoteIdentifier(functionName)}(${argumentsList})`;
      grants.push(`
    DO $runtime_function_${functionName}$
    BEGIN
      IF to_regprocedure(${sqlStringLiteral(`public.${functionSignature}`)}) IS NOT NULL THEN
        EXECUTE ${sqlStringLiteral(`GRANT EXECUTE ON FUNCTION ${qualifiedSignature} TO ${roleName}`)};
      END IF;
    END
    $runtime_function_${functionName}$;`);
    }
  };

  appendGrants(RUNTIME_FUNCTION_ALLOWLISTS.api, "ce_api_runtime");
  appendGrants(RUNTIME_FUNCTION_ALLOWLISTS.bff, "ce_bff_runtime");
  appendGrants(RUNTIME_FUNCTION_ALLOWLISTS.maintenance, "ce_maintenance");
  return grants.join("\n    ");
}

export function buildDatabaseAndDrizzleOwnershipSql(databaseName: string): string {
  const databaseIdentifier = quoteIdentifier(databaseName);

  return `
    REVOKE CREATE ON DATABASE ${databaseIdentifier} FROM PUBLIC, ce_migrator, ce_api_runtime, ce_bff_runtime, ce_maintenance;
    GRANT CREATE ON DATABASE ${databaseIdentifier} TO ce_owner;

    CREATE SCHEMA IF NOT EXISTS drizzle;
    ALTER SCHEMA drizzle OWNER TO ce_owner;
    GRANT USAGE, CREATE ON SCHEMA drizzle TO ce_owner;
    REVOKE ALL ON SCHEMA drizzle FROM PUBLIC, ce_migrator, ce_api_runtime, ce_bff_runtime, ce_maintenance;

    -- Drizzle creates this metadata table before applying migrations. Creating it
    -- as ce_owner keeps ownership out of the migrator login role.
    SET LOCAL ROLE ce_owner;
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    );
    RESET ROLE;

    ALTER DEFAULT PRIVILEGES FOR ROLE ce_owner IN SCHEMA drizzle REVOKE ALL ON TABLES FROM PUBLIC, ce_migrator, ce_api_runtime, ce_bff_runtime, ce_maintenance;
    ALTER DEFAULT PRIVILEGES FOR ROLE ce_owner IN SCHEMA drizzle REVOKE ALL ON SEQUENCES FROM PUBLIC, ce_migrator, ce_api_runtime, ce_bff_runtime, ce_maintenance;

    GRANT USAGE, CREATE ON SCHEMA public TO ce_owner;
    REVOKE ALL ON SCHEMA public FROM ce_migrator;
    REVOKE ALL ON SCHEMA public FROM ce_api_runtime, ce_bff_runtime, ce_maintenance, PUBLIC;
    GRANT USAGE ON SCHEMA public TO ce_api_runtime, ce_bff_runtime;

    ALTER DEFAULT PRIVILEGES FOR ROLE ce_owner IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, ce_api_runtime, ce_bff_runtime, ce_maintenance;
    ALTER DEFAULT PRIVILEGES FOR ROLE ce_owner IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, ce_api_runtime, ce_bff_runtime, ce_maintenance;
    ALTER DEFAULT PRIVILEGES FOR ROLE ce_owner IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, ce_api_runtime, ce_bff_runtime, ce_maintenance;

    DO $bootstrap$
    DECLARE object_record record;
    BEGIN
      FOR object_record IN
        SELECT c.relname, c.relkind
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      LOOP
        EXECUTE format('ALTER TABLE public.%I OWNER TO ce_owner', object_record.relname);
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, ce_api_runtime, ce_bff_runtime, ce_maintenance', object_record.relname);
      END LOOP;

      FOR object_record IN
        SELECT c.relname
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'S'
      LOOP
        EXECUTE format('ALTER SEQUENCE public.%I OWNER TO ce_owner', object_record.relname);
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM PUBLIC, ce_api_runtime, ce_bff_runtime, ce_maintenance', object_record.relname);
      END LOOP;

      FOR object_record IN
        SELECT p.oid, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
      LOOP
        EXECUTE format('ALTER FUNCTION public.%I(%s) OWNER TO ce_owner', object_record.proname, object_record.identity_arguments);
        EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION public.%I(%s) FROM PUBLIC, ce_api_runtime, ce_bff_runtime, ce_maintenance', object_record.proname, object_record.identity_arguments);
      END LOOP;

      FOR object_record IN
        SELECT c.relname, c.relkind
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'drizzle' AND c.relkind IN ('r', 'p', 'S')
      LOOP
        IF object_record.relkind = 'S' THEN
          EXECUTE format('ALTER SEQUENCE drizzle.%I OWNER TO ce_owner', object_record.relname);
          EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE drizzle.%I FROM PUBLIC, ce_migrator, ce_api_runtime, ce_bff_runtime, ce_maintenance', object_record.relname);
        ELSE
          EXECUTE format('ALTER TABLE drizzle.%I OWNER TO ce_owner', object_record.relname);
          EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE drizzle.%I FROM PUBLIC, ce_migrator, ce_api_runtime, ce_bff_runtime, ce_maintenance', object_record.relname);
        END IF;
      END LOOP;

    END
    $bootstrap$;

    -- Runtime access is deny-by-default. Only the reviewed allowlists below
    -- receive direct privileges; new objects remain inaccessible.
    ${buildExplicitTableGrants()}
    ${buildExplicitSequenceGrants()}
    ${buildExplicitFunctionGrants()}

    -- The failure-injection helper exists only in the local test database.
    -- It is needed by database rollback tests and is never granted elsewhere.
    DO $test_function_grant$
    BEGIN
      IF current_database() = 'conversion_engine_test'
         AND to_regprocedure('public.ce_test_add_forced_failure(text)') IS NOT NULL THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.ce_test_add_forced_failure(text) TO ce_api_runtime';
      END IF;
    END
    $test_function_grant$;
  `;
}

async function transferOwnershipAndPrivileges(client: PoolClient, databaseName: string): Promise<void> {
  await client.query(buildDatabaseAndDrizzleOwnershipSql(databaseName));
}

async function assertDatabaseRoleMembershipBoundary(client: PoolClient): Promise<void> {
  const result = await client.query<OwnerRoleMembership>(`
    SELECT
      member.rolname AS member_role,
      parent.rolname AS parent_role,
      memberships.admin_option,
      memberships.inherit_option,
      memberships.set_option
    FROM pg_catalog.pg_auth_members memberships
    JOIN pg_catalog.pg_roles member ON member.oid = memberships.member
    JOIN pg_catalog.pg_roles parent ON parent.oid = memberships.roleid
    WHERE parent.rolname = 'ce_owner'
  `);
  assertOwnerRoleMembershipBoundary(result.rows);
}

export async function bootstrapLocalDatabaseRoles(input: LocalRoleBootstrapInput): Promise<void> {
  const pool = new Pool({ connectionString: input.databaseUrl, max: 1 });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const currentDatabase = await client.query<{ database_name: string }>(
      `SELECT current_database() AS database_name`,
    );
    if (currentDatabase.rows[0]?.database_name !== input.expectedDatabase) {
      throw new LocalRoleBootstrapError("database_guard_failed", "connected database does not match the local database guard");
    }

    await client.query("BEGIN");
    try {
      await ensureRoles(client, input.passwords);
      const temporaryOwnerMember = await ensureBootstrapOwnership(client);
      await transferOwnershipAndPrivileges(client, currentDatabase.rows[0].database_name);
      if (temporaryOwnerMember) {
        await client.query(`REVOKE ce_owner FROM ${quoteIdentifier(temporaryOwnerMember)}`);
      }
      await assertDatabaseRoleMembershipBoundary(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  } finally {
    client?.release();
    await pool.end().catch(() => undefined);
  }
}

async function main(): Promise<number> {
  try {
    const input = assertLocalRoleBootstrapInvocation();
    await bootstrapLocalDatabaseRoles(input);
    console.log(`Local PostgreSQL roles bootstrapped for ${input.expectedDatabase}.`);
    return 0;
  } catch (error) {
    if (error instanceof LocalRoleBootstrapError) {
      console.error(`Local PostgreSQL role bootstrap refused: ${error.message}.`);
    } else {
      console.error("Local PostgreSQL role bootstrap failed; the transaction was rolled back.");
    }
    return 1;
  }
}

const entryPoint = process.argv[1];
const isDirectExecution = entryPoint && fileURLToPath(import.meta.url) === resolve(entryPoint);
if (isDirectExecution) process.exitCode = await main();
