import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import {
  RUNTIME_FUNCTION_ALLOWLISTS,
  RUNTIME_TABLE_ALLOWLISTS,
} from "./bootstrapLocalDatabaseRoles.js";
import { readExpectedRoleNames, roleNamesAreDistinct, type PostgresRoleNames } from "./postgresRoleContract.js";

const EXPECTED_RLS_TABLES = [
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
] as const;

const EXPECTED_POLICIES = [
  ["tenants", "tenants_access"],
  ["users", "users_access"],
  ["users", "users_identity_only_insert"],
  ["users", "users_identity_only_update"],
  ["memberships", "memberships_access"],
  ["tenant_owner_invitations", "tenant_owner_invitations_access"],
  ["websites", "websites_access"],
  ["organizations", "organizations_access"],
  ["contacts", "contacts_access"],
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
  rolreplication: boolean;
  rolcanlogin: boolean;
};

type RoleMembership = {
  member_role: string;
  parent_role: string;
  admin_option: boolean;
  inherit_option: boolean;
  set_option: boolean;
};

type DatabaseAcl = {
  database_name: string;
  public_create: boolean;
  owner_create: boolean;
  migrator_create: boolean;
  api_create: boolean;
  bff_create: boolean;
  maintenance_create: boolean;
};

type OwnedObject = {
  object_kind: "schema" | "table" | "sequence";
  object_name: string;
  owner_name: string;
};

type ObjectPrivilege = {
  object_kind: "schema" | "table" | "sequence" | "function";
  object_name: string;
  grantee_name: string;
  privilege_type: string;
  is_grantable: boolean;
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

function expectedEnvironmentValue(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

export function requiredRoleNames(env: NodeJS.ProcessEnv = process.env): PostgresRoleNames {
  return readExpectedRoleNames(env);
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

export function verifyInvocation(
  env: NodeJS.ProcessEnv = process.env,
  argumentsAfterScript: readonly string[] = process.argv.slice(2),
): string | undefined {
  if (argumentsAfterScript.length !== 1 || argumentsAfterScript[0] !== "--confirm-production") {
    return "explicit production confirmation is required";
  }
  if (env.NODE_ENV !== "production") {
    return "NODE_ENV must be production";
  }
  if (!expectedEnvironmentValue("PRODUCTION_DATABASE_URL", env)) {
    return "PRODUCTION_DATABASE_URL is required";
  }
  if (!expectedEnvironmentValue("EXPECTED_PRODUCTION_DATABASE", env)) {
    return "EXPECTED_PRODUCTION_DATABASE is required";
  }

  try {
    const url = new URL(env.PRODUCTION_DATABASE_URL as string);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      return "PRODUCTION_DATABASE_URL must be a PostgreSQL URL";
    }
  } catch {
    return "PRODUCTION_DATABASE_URL is invalid";
  }

  const roles = requiredRoleNames(env);
  if (!roleNamesAreDistinct(roles)) {
    return "expected production roles must be distinct";
  }
  return undefined;
}

export async function verifyCurrentConnection(
  client: PoolClient,
  context: CheckContext,
  env: NodeJS.ProcessEnv,
): Promise<void> {
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
    expectedEnvironmentValue("EXPECTED_PRODUCTION_DATABASE", env),
  );
  const migratorRole = requiredRoleNames(env).migrator;
  assertEqual(context, "current user is the expected migrator role", row.current_user_name, migratorRole);
  assertEqual(context, "session user is the expected migrator role", row.session_user_name, migratorRole);
  assertEqual(context, "default transaction mode is read-only", row.default_transaction_read_only, "on");
  assertEqual(context, "current transaction mode is read-only", row.transaction_read_only, "on");
}

export function evaluateRoleFlags(
  rows: readonly RoleFlags[],
  context: CheckContext,
  roles: PostgresRoleNames,
): void {
  const expected = [roles.owner, roles.api, roles.bff, roles.migrator, roles.maintenance];
  const byName = new Map(rows.map((row) => [row.rolname, row]));
  const restrictedLoginRoles = [roles.api, roles.bff, roles.migrator, roles.maintenance];

  for (const roleName of expected) {
    if (!byName.has(roleName)) addFailure(context, `expected role exists: ${roleName}`);
  }
  for (const roleName of expected) {
    const role = byName.get(roleName);
    if (!role) continue;
    if (role.rolsuper) addFailure(context, `role is not superuser: ${roleName}`);
    if (role.rolbypassrls) addFailure(context, `role cannot bypass RLS: ${roleName}`);
    if (role.rolcreaterole) addFailure(context, `role cannot create roles: ${roleName}`);
    if (role.rolcreatedb) addFailure(context, `role cannot create databases: ${roleName}`);
    if (role.rolreplication) addFailure(context, `role cannot use replication privileges: ${roleName}`);
  }
  for (const roleName of restrictedLoginRoles) {
    const role = byName.get(roleName);
    if (role && !role.rolcanlogin) addFailure(context, `application role can log in: ${roleName}`);
  }
  const owner = byName.get(roles.owner);
  if (owner && owner.rolcanlogin) addFailure(context, `owner role cannot log in: ${roles.owner}`);
}

export function evaluateRoleMemberships(
  rows: readonly RoleMembership[],
  context: CheckContext,
  roles: PostgresRoleNames,
): void {
  const actualMemberships = rows.map((row) => `${row.member_role}:${row.parent_role}`);
  assertSetEqual(context, "runtime role memberships are limited to the migration owner membership", actualMemberships, [
    `${roles.migrator}:${roles.owner}`,
  ]);

  const ownerMembership = rows.find(
    (row) => row.member_role === roles.migrator && row.parent_role === roles.owner,
  );
  if (!ownerMembership) return;
  if (ownerMembership.admin_option) addFailure(context, "migration role cannot administer owner membership");
  if (!ownerMembership.inherit_option) addFailure(context, "migration role inherits owner privileges");
  if (!ownerMembership.set_option) addFailure(context, "migration role can SET ROLE to owner for migrations");
}

export function evaluateDatabaseAcl(
  row: DatabaseAcl | undefined,
  context: CheckContext,
  expectedDatabase: string | undefined,
): void {
  if (!row) {
    addFailure(context, "database ACL query returned no row");
    return;
  }
  assertEqual(context, "database ACL is checked for EXPECTED_PRODUCTION_DATABASE", row.database_name, expectedDatabase);
  if (row.public_create) addFailure(context, "PUBLIC cannot CREATE databases objects");
  if (!row.owner_create) addFailure(context, "owner role has CREATE on the database");
  if (row.migrator_create) addFailure(context, "migrator has direct CREATE on the database");
  if (row.api_create) addFailure(context, "API runtime role cannot CREATE on the database");
  if (row.bff_create) addFailure(context, "BFF runtime role cannot CREATE on the database");
  if (row.maintenance_create) addFailure(context, "maintenance role cannot CREATE on the database");
}

export function evaluateOwnedObjects(
  rows: readonly OwnedObject[],
  context: CheckContext,
  roles: PostgresRoleNames,
): void {
  const expected: readonly OwnedObject[] = [
    { object_kind: "schema", object_name: "drizzle", owner_name: roles.owner },
    { object_kind: "table", object_name: "__drizzle_migrations", owner_name: roles.owner },
    { object_kind: "sequence", object_name: "__drizzle_migrations_id_seq", owner_name: roles.owner },
  ];
  for (const expectedObject of expected) {
    const actual = rows.find(
      (row) => row.object_kind === expectedObject.object_kind && row.object_name === expectedObject.object_name,
    );
    if (!actual) {
      addFailure(context, `${expectedObject.object_kind} exists and is owned: ${expectedObject.object_name}`);
      continue;
    }
    if (actual.owner_name !== roles.owner) {
      addFailure(context, `${expectedObject.object_kind} is owned by ${roles.owner}: ${expectedObject.object_name}`);
    }
  }
}

export function evaluateDrizzlePrivileges(
  rows: readonly ObjectPrivilege[],
  context: CheckContext,
  roles: PostgresRoleNames,
): void {
  for (const row of rows) {
    if (row.grantee_name !== roles.owner) {
      addFailure(context, `Drizzle ${row.object_kind} has no direct privilege outside owner: ${row.grantee_name}: ${row.object_name}`);
    }
    if (row.is_grantable && row.grantee_name !== roles.owner) {
      addFailure(context, `Drizzle privilege is not grantable outside owner: ${row.object_name}`);
    }
  }
}

export function evaluatePublicPrivileges(
  rows: readonly ObjectPrivilege[],
  context: CheckContext,
  roles: PostgresRoleNames,
): void {
  const expected = new Set<string>();
  const addExpected = (grantee: string, objectKind: ObjectPrivilege["object_kind"], objectName: string, privilegeType: string) => {
    expected.add(`${grantee}:${objectKind}:${objectName}:${privilegeType}`);
  };

  addExpected(roles.api, "schema", "public", "USAGE");
  addExpected(roles.bff, "schema", "public", "USAGE");
  for (const tableName of RUNTIME_TABLE_ALLOWLISTS.api) {
    for (const privilegeType of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      addExpected(roles.api, "table", tableName, privilegeType);
    }
  }
  for (const tableName of RUNTIME_TABLE_ALLOWLISTS.bff) {
    for (const privilegeType of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      addExpected(roles.bff, "table", tableName, privilegeType);
    }
  }
  for (const functionSignature of RUNTIME_FUNCTION_ALLOWLISTS.api) {
    addExpected(roles.api, "function", functionSignature, "EXECUTE");
  }

  const actual = new Set<string>();
  for (const row of rows) {
    if (row.grantee_name === "PUBLIC") {
      addFailure(context, `PUBLIC has a public-schema privilege: ${row.object_name}`);
      continue;
    }
    if (row.grantee_name === roles.owner) continue;
    if (row.grantee_name === roles.migrator) {
      addFailure(context, `migrator has a direct public-schema privilege: ${row.object_name}`);
      continue;
    }
    if (row.is_grantable) {
      addFailure(context, `runtime privilege is grantable: ${row.grantee_name} on ${row.object_name}`);
    }
    if (row.grantee_name !== roles.api && row.grantee_name !== roles.bff && row.grantee_name !== roles.maintenance) {
      addFailure(context, `runtime privilege has an unknown grantee: ${row.grantee_name} on ${row.object_name}`);
      continue;
    }

    const key = `${row.grantee_name}:${row.object_kind}:${row.object_name}:${row.privilege_type}`;
    actual.add(key);
    if (!expected.has(key)) {
      addFailure(context, `runtime privilege is outside the explicit allowlist: ${key}`);
    }
  }

  for (const expectedPrivilege of expected) {
    if (!actual.has(expectedPrivilege)) {
      addFailure(context, `required runtime privilege is missing: ${expectedPrivilege}`);
    }
  }
}

async function verifyRoleFlags(client: PoolClient, context: CheckContext, env: NodeJS.ProcessEnv): Promise<void> {
  const roles = requiredRoleNames(env);
  const expected = [roles.owner, roles.api, roles.bff, roles.migrator, roles.maintenance];
  const result = await client.query<RoleFlags>(
    `
      select rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication, rolcanlogin
      from pg_catalog.pg_roles
      where rolname = any($1::text[])
    `,
    [expected],
  );
  evaluateRoleFlags(result.rows, context, roles);
}

async function verifyRoleMemberships(client: PoolClient, context: CheckContext, env: NodeJS.ProcessEnv): Promise<void> {
  const roles = requiredRoleNames(env);
  const result = await client.query<RoleMembership>(
    `
      select
        member.rolname as member_role,
        parent.rolname as parent_role,
        memberships.admin_option,
        memberships.inherit_option,
        memberships.set_option
      from pg_catalog.pg_auth_members memberships
      join pg_catalog.pg_roles member on member.oid = memberships.member
      join pg_catalog.pg_roles parent on parent.oid = memberships.roleid
    `,
  );
  evaluateRoleMemberships(result.rows, context, roles);
}

async function verifyDatabaseAcl(client: PoolClient, context: CheckContext, env: NodeJS.ProcessEnv): Promise<void> {
  const roles = requiredRoleNames(env);
  const expectedDatabase = expectedEnvironmentValue("EXPECTED_PRODUCTION_DATABASE", env);
  const result = await client.query<DatabaseAcl>(
    `
      with target as (
        select datname, datacl, datdba
        from pg_catalog.pg_database
        where datname = $1
      ),
      acl as (
        select target.datname, grants.grantee, grants.privilege_type
        from target
        cross join lateral pg_catalog.aclexplode(
          coalesce(target.datacl, pg_catalog.acldefault('d', target.datdba))
        ) grants
      ),
      role_oids as (
        select oid, rolname
        from pg_catalog.pg_roles
        where rolname = any($2::text[])
      )
      select
        target.datname as database_name,
        exists (select 1 from acl where acl.grantee = 0 and acl.privilege_type = 'CREATE') as public_create,
        exists (
          select 1 from acl join role_oids on role_oids.oid = acl.grantee
          where role_oids.rolname = $3 and acl.privilege_type = 'CREATE'
        ) as owner_create,
        exists (
          select 1 from acl join role_oids on role_oids.oid = acl.grantee
          where role_oids.rolname = $4 and acl.privilege_type = 'CREATE'
        ) as migrator_create,
        exists (
          select 1 from acl join role_oids on role_oids.oid = acl.grantee
          where role_oids.rolname = $5 and acl.privilege_type = 'CREATE'
        ) as api_create,
        exists (
          select 1 from acl join role_oids on role_oids.oid = acl.grantee
          where role_oids.rolname = $6 and acl.privilege_type = 'CREATE'
        ) as bff_create,
        exists (
          select 1 from acl join role_oids on role_oids.oid = acl.grantee
          where role_oids.rolname = $7 and acl.privilege_type = 'CREATE'
        ) as maintenance_create
      from target
    `,
    [expectedDatabase, Object.values(roles), roles.owner, roles.migrator, roles.api, roles.bff, roles.maintenance],
  );
  evaluateDatabaseAcl(result.rows[0], context, expectedDatabase);
}

async function verifyDrizzleObjects(client: PoolClient, context: CheckContext, env: NodeJS.ProcessEnv): Promise<void> {
  const roles = requiredRoleNames(env);
  const objectResult = await client.query<OwnedObject>(
    `
      select 'schema'::text as object_kind, nspname as object_name,
             pg_catalog.pg_get_userbyid(nspowner) as owner_name
      from pg_catalog.pg_namespace
      where nspname = 'drizzle'
      union all
      select 'table'::text, c.relname, pg_catalog.pg_get_userbyid(c.relowner)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'drizzle' and c.relname = '__drizzle_migrations' and c.relkind in ('r', 'p')
      union all
      select 'sequence'::text, c.relname, pg_catalog.pg_get_userbyid(c.relowner)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'drizzle' and c.relname = '__drizzle_migrations_id_seq' and c.relkind = 'S'
    `,
  );
  evaluateOwnedObjects(objectResult.rows, context, roles);

  const privilegeResult = await client.query<ObjectPrivilege>(
    `
      with objects as (
        select 'schema'::text as object_kind, n.nspname as object_name,
               n.nspacl as object_acl, 'n'::"char" as acl_type, n.nspowner as owner_oid
        from pg_catalog.pg_namespace n
        where n.nspname = 'drizzle'
        union all
        select 'table'::text, c.relname, c.relacl, 'r'::"char", c.relowner
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'drizzle' and c.relname = '__drizzle_migrations' and c.relkind in ('r', 'p')
        union all
        select 'sequence'::text, c.relname, c.relacl, 'S'::"char", c.relowner
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'drizzle' and c.relname = '__drizzle_migrations_id_seq' and c.relkind = 'S'
      )
      select objects.object_kind, objects.object_name,
             case when grants.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(grants.grantee) end as grantee_name,
             grants.privilege_type, grants.is_grantable
      from objects
      cross join lateral pg_catalog.aclexplode(
        coalesce(objects.object_acl, pg_catalog.acldefault(objects.acl_type, objects.owner_oid))
      ) grants
    `,
  );
  evaluateDrizzlePrivileges(privilegeResult.rows, context, roles);
}

async function verifyPublicPrivileges(client: PoolClient, context: CheckContext, env: NodeJS.ProcessEnv): Promise<void> {
  const roles = requiredRoleNames(env);
  const privilegeResult = await client.query<ObjectPrivilege>(
    `
      with objects as (
        select 'schema'::text as object_kind, n.nspname as object_name,
               n.nspacl as object_acl, 'n'::"char" as acl_type, n.nspowner as owner_oid
        from pg_catalog.pg_namespace n
        where n.nspname = 'public'
        union all
        select 'table'::text as object_kind, c.relname as object_name,
               c.relacl as object_acl, 'r'::"char" as acl_type, c.relowner as owner_oid
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
        union all
        select 'sequence'::text, c.relname, c.relacl, 'S'::"char", c.relowner
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'S'
        union all
        select
          'function'::text,
          format('%s(%s)', p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)),
          p.proacl,
          'f'::"char",
          p.proowner
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
      )
      select objects.object_kind, objects.object_name,
             case when grants.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(grants.grantee) end as grantee_name,
             grants.privilege_type, grants.is_grantable
      from objects
      cross join lateral pg_catalog.aclexplode(
        coalesce(objects.object_acl, pg_catalog.acldefault(objects.acl_type, objects.owner_oid))
      ) grants
    `,
  );
  evaluatePublicPrivileges(privilegeResult.rows, context, roles);
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

async function verifyPublicOwnership(client: PoolClient, context: CheckContext, env: NodeJS.ProcessEnv): Promise<void> {
  const ownerRole = requiredRoleNames(env).owner;
  const relationResult = await client.query<{ object_name: string; owner_name: string }>(
    `
      select c.relname as object_name, pg_catalog.pg_get_userbyid(c.relowner) as owner_name
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'S')
    `,
  );
  for (const row of relationResult.rows) {
    if (row.owner_name !== ownerRole) addFailure(context, `public relation owned by ${ownerRole}: ${row.object_name}`);
  }

  const functionResult = await client.query<{ function_name: string; owner_name: string }>(
    `
      select
        p.oid::text as function_name,
        pg_catalog.pg_get_userbyid(p.proowner) as owner_name
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    `,
  );
  for (const row of functionResult.rows) {
    if (row.owner_name !== ownerRole) addFailure(context, `public function owned by ${ownerRole}: ${row.function_name}`);
  }
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

export async function runVerification(client: PoolClient, env: NodeJS.ProcessEnv): Promise<string[]> {
  const context: CheckContext = { failures: [] };
  await verifyCurrentConnection(client, context, env);
  await verifyRoleFlags(client, context, env);
  await verifyRoleMemberships(client, context, env);
  await verifyDatabaseAcl(client, context, env);
  await verifyDrizzleObjects(client, context, env);
  await verifyPublicPrivileges(client, context, env);
  await verifyPublicOwnership(client, context, env);
  await verifyRlsTables(client, context);
  await verifyPolicies(client, context);
  await verifyMigrationJournal(client, context);
  return context.failures;
}

export async function main(): Promise<number> {
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
        failures = await runVerification(client, process.env);
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

const entryPoint = process.argv[1];
const isDirectExecution = entryPoint && fileURLToPath(import.meta.url) === resolve(entryPoint);
if (isDirectExecution) process.exitCode = await main();
