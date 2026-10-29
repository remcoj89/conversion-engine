import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";

const EXPECTED_RLS_TABLES = [
  "tenants",
  "users",
  "memberships",
  "tenant_owner_invitations",
  "websites",
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
] as const;

const EXPECTED_POLICIES = [
  ["tenants", "tenants_access"],
  ["users", "users_access"],
  ["users", "users_identity_only_insert"],
  ["users", "users_identity_only_update"],
  ["memberships", "memberships_access"],
  ["tenant_owner_invitations", "tenant_owner_invitations_access"],
  ["websites", "websites_access"],
  ["leads", "leads_read_access"],
  ["leads", "leads_write_access"],
  ["leads", "leads_update_access"],
  ["leads", "leads_delete_access"],
  ["lead_assignments", "lead_assignments_access"],
  ["onboarding_projects", "onboarding_projects_access"],
  ["onboarding_versions", "onboarding_versions_access"],
  ["onboarding_reviewer_assignments", "onboarding_reviewer_assignments_access"],
  ["platform_admin_assignments", "platform_admin_assignments_access"],
  ["onboarding_audit_events", "onboarding_audit_events_access"],
  ["onboarding_review_requests", "onboarding_review_requests_access"],
  ["onboarding_review_actions", "onboarding_review_actions_access"],
  ["onboarding_review_access_events", "onboarding_review_access_events_access"],
] as const;

const MIGRATION_FILE_PATTERN = /^\d{4}_.+\.sql$/;

type RoleFlags = {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolcanlogin: boolean;
};

type RlsTable = {
  relname: string;
  relrowsecurity: boolean;
  relforcerowsecurity: boolean;
};

type PolicyRow = {
  tablename: string;
  policyname: string;
};

type MigrationRow = {
  id: number;
  hash: string;
  created_at: string | number | null;
};

type CheckContext = {
  failures: string[];
};

function expectedEnvironmentValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function requiredRoleNames() {
  return {
    api: expectedEnvironmentValue("EXPECTED_RUNTIME_ROLE") ?? "ce_api_runtime",
    bff: expectedEnvironmentValue("EXPECTED_BFF_ROLE") ?? "ce_bff_runtime",
    migrator: expectedEnvironmentValue("EXPECTED_MIGRATOR_ROLE") ?? "ce_migrator",
    maintenance: expectedEnvironmentValue("EXPECTED_MAINTENANCE_ROLE") ?? "ce_maintenance",
  } as const;
}

function addFailure(context: CheckContext, label: string): void {
  context.failures.push(label);
}

function assertEqual(context: CheckContext, label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) addFailure(context, label);
}

function assertSetEqual(
  context: CheckContext,
  label: string,
  actualValues: readonly string[],
  expectedValues: readonly string[],
): void {
  const actual = new Set(actualValues);
  const expected = new Set(expectedValues);
  if (actual.size !== expected.size || [...expected].some((value) => !actual.has(value))) {
    addFailure(context, label);
  }
}

function verifyInvocation(): string | undefined {
  const argumentsAfterScript = process.argv.slice(2);
  if (argumentsAfterScript.length !== 1 || argumentsAfterScript[0] !== "--confirm-production") {
    return "explicit production confirmation is required";
  }
  if (process.env.NODE_ENV !== "production") {
    return "NODE_ENV must be production";
  }
  if (!expectedEnvironmentValue("PRODUCTION_DATABASE_URL")) {
    return "PRODUCTION_DATABASE_URL is required";
  }
  if (!expectedEnvironmentValue("EXPECTED_PRODUCTION_DATABASE")) {
    return "EXPECTED_PRODUCTION_DATABASE is required";
  }

  try {
    const url = new URL(process.env.PRODUCTION_DATABASE_URL as string);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      return "PRODUCTION_DATABASE_URL must be a PostgreSQL URL";
    }
  } catch {
    return "PRODUCTION_DATABASE_URL is invalid";
  }

  const roles = Object.values(requiredRoleNames());
  if (new Set(roles).size !== roles.length) {
    return "expected production roles must be distinct";
  }
  return undefined;
}

async function verifyCurrentConnection(client: PoolClient, context: CheckContext): Promise<void> {
  const result = await client.query<{
    database_name: string;
    current_user_name: string;
    session_user_name: string;
    default_transaction_read_only: string;
    transaction_read_only: string;
  }>(
    `
      select
        current_database() as database_name,
        current_user as current_user_name,
        session_user as session_user_name,
        current_setting('default_transaction_read_only', true) as default_transaction_read_only,
        current_setting('transaction_read_only', true) as transaction_read_only
    `,
  );
  const row = result.rows[0];
  if (!row) {
    addFailure(context, "connection identity query returned no row");
    return;
  }

  assertEqual(
    context,
    "current database matches EXPECTED_PRODUCTION_DATABASE",
    row.database_name,
    expectedEnvironmentValue("EXPECTED_PRODUCTION_DATABASE"),
  );
  assertEqual(context, "current user is the expected migrator role", row.current_user_name, requiredRoleNames().migrator);
  assertEqual(context, "session user is the expected migrator role", row.session_user_name, requiredRoleNames().migrator);
  assertEqual(context, "default transaction mode is read-only", row.default_transaction_read_only, "on");
  assertEqual(context, "current transaction mode is read-only", row.transaction_read_only, "on");
}

async function verifyRoleFlags(client: PoolClient, context: CheckContext): Promise<void> {
  const roles = requiredRoleNames();
  const expected = [roles.api, roles.bff, roles.migrator, roles.maintenance];
  const result = await client.query<RoleFlags>(
    `
      select rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin
      from pg_catalog.pg_roles
      where rolname = any($1::text[])
    `,
    [expected],
  );
  const byName = new Map(result.rows.map((row) => [row.rolname, row]));
  const restrictedLoginRoles = [roles.api, roles.bff, roles.migrator];

  for (const roleName of expected) {
    if (!byName.has(roleName)) addFailure(context, `expected role exists: ${roleName}`);
  }
  for (const roleName of [...restrictedLoginRoles, roles.maintenance]) {
    const role = byName.get(roleName);
    if (!role) continue;
    if (role.rolsuper) addFailure(context, `role is not superuser: ${roleName}`);
    if (role.rolbypassrls) addFailure(context, `role cannot bypass RLS: ${roleName}`);
    if (role.rolcreaterole) addFailure(context, `role cannot create roles: ${roleName}`);
    if (role.rolcreatedb) addFailure(context, `role cannot create databases: ${roleName}`);
  }
  for (const roleName of restrictedLoginRoles) {
    const role = byName.get(roleName);
    if (role && !role.rolcanlogin) addFailure(context, `application role can log in: ${roleName}`);
  }
}

async function verifyRlsTables(client: PoolClient, context: CheckContext): Promise<void> {
  const result = await client.query<RlsTable>(
    `
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relname = any($1::text[])
    `,
    [EXPECTED_RLS_TABLES],
  );
  const byName = new Map(result.rows.map((row) => [row.relname, row]));
  for (const tableName of EXPECTED_RLS_TABLES) {
    const table = byName.get(tableName);
    if (!table) {
      addFailure(context, `RLS table exists: ${tableName}`);
      continue;
    }
    if (!table.relrowsecurity) addFailure(context, `RLS enabled: ${tableName}`);
    if (!table.relforcerowsecurity) addFailure(context, `RLS forced: ${tableName}`);
  }
}

async function verifyPolicies(client: PoolClient, context: CheckContext): Promise<void> {
  const result = await client.query<PolicyRow>(
    `
      select tablename, policyname
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = any($1::text[])
    `,
    [EXPECTED_RLS_TABLES],
  );
  const actual = result.rows.map((row) => `${row.tablename}:${row.policyname}`);
  const expected = EXPECTED_POLICIES.map(([tableName, policyName]) => `${tableName}:${policyName}`);
  assertSetEqual(context, "expected RLS policy set matches", actual, expected);
}

async function readLocalMigrations(): Promise<{ name: string; hash: string }[]> {
  const migrationDirectory = fileURLToPath(new URL("../../drizzle/", import.meta.url));
  const names = (await readdir(migrationDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    names.map(async (name) => {
      const contents = await readFile(`${migrationDirectory}/${name}`);
      return { name, hash: createHash("sha256").update(contents).digest("hex") };
    }),
  );
}

async function verifyMigrationJournal(client: PoolClient, context: CheckContext): Promise<void> {
  const tableResult = await client.query<{ migration_table: string | null }>(
    "select to_regclass('drizzle.__drizzle_migrations')::text as migration_table",
  );
  if (tableResult.rows[0]?.migration_table !== "drizzle.__drizzle_migrations") {
    addFailure(context, "Drizzle migration journal exists");
    return;
  }

  const [localMigrations, journalResult] = await Promise.all([
    readLocalMigrations(),
    client.query<MigrationRow>(
      `
        select id, hash, created_at
        from drizzle.__drizzle_migrations
        order by id asc
      `,
    ),
  ]);
  const journal = journalResult.rows;
  if (journal.length !== localMigrations.length) {
    addFailure(context, "migration journal count matches local migrations");
    return;
  }
  for (const [index, migration] of localMigrations.entries()) {
    const journalRow = journal[index];
    if (!journalRow || journalRow.hash !== migration.hash || journalRow.created_at === null) {
      addFailure(context, `migration journal entry matches local migration ${migration.name}`);
    }
  }
}

async function runVerification(client: PoolClient): Promise<string[]> {
  const context: CheckContext = { failures: [] };
  await verifyCurrentConnection(client, context);
  await verifyRoleFlags(client, context);
  await verifyRlsTables(client, context);
  await verifyPolicies(client, context);
  await verifyMigrationJournal(client, context);
  return context.failures;
}

async function main(): Promise<number> {
  const invocationError = verifyInvocation();
  if (invocationError) {
    console.error(`Production database verification refused: ${invocationError}.`);
    return 2;
  }

  const pool = new Pool({
    connectionString: process.env.PRODUCTION_DATABASE_URL,
    max: 1,
    options: "-c default_transaction_read_only=on -c statement_timeout=5000",
  });

  try {
    const client = await pool.connect();
    try {
      await client.query("begin read only");
      let failures: string[];
      try {
        failures = await runVerification(client);
      } finally {
        await client.query("rollback").catch(() => undefined);
      }

      if (failures.length > 0) {
        for (const failure of failures) console.error(`FAIL ${failure}`);
        console.error("Production database verification failed; no changes were made.");
        return 1;
      }

      console.log("Production database verification passed; no changes were made.");
      return 0;
    } finally {
      client.release();
    }
  } catch {
    console.error("Production database verification could not complete; no changes were made.");
    return 1;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

process.exitCode = await main();
