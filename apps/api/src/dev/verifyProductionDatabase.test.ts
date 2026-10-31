import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import {
  evaluateDatabaseAcl,
  evaluateDrizzlePrivileges,
  evaluateOwnedObjects,
  evaluatePublicPrivileges,
  evaluateRoleFlags,
  evaluateRoleMemberships,
  requiredRoleNames,
  verifyCurrentConnection,
  verifyInvocation,
} from "./verifyProductionDatabase.js";
import {
  RUNTIME_FUNCTION_ALLOWLISTS,
  RUNTIME_TABLE_ALLOWLISTS,
} from "./bootstrapLocalDatabaseRoles.js";

const baseEnvironment = {
  NODE_ENV: "production",
  PRODUCTION_DATABASE_URL: "postgresql://ce_migrator:secret@db.example.test:5432/conversion_engine",
  EXPECTED_PRODUCTION_DATABASE: "conversion_engine",
};

test("production verifier requires explicit confirmation and production mode", () => {
  assert.equal(verifyInvocation({ ...baseEnvironment, NODE_ENV: "development" }, ["--confirm-production"]), "NODE_ENV must be production");
  assert.equal(verifyInvocation(baseEnvironment, []), "explicit production confirmation is required");
  assert.equal(verifyInvocation(baseEnvironment, ["--confirm-production"]), undefined);
});

test("production verifier includes ce_owner in the default role contract", () => {
  assert.deepEqual(requiredRoleNames({}), {
    owner: "ce_owner",
    migrator: "ce_migrator",
    api: "ce_api_runtime",
    bff: "ce_bff_runtime",
    maintenance: "ce_maintenance",
  });
});

test("production verifier rejects duplicate or incomplete role configuration", () => {
  assert.equal(
    verifyInvocation({ ...baseEnvironment, EXPECTED_OWNER_ROLE: "ce_api_runtime" }, ["--confirm-production"]),
    "expected production roles must be distinct",
  );
  assert.equal(
    verifyInvocation({ NODE_ENV: "production", EXPECTED_PRODUCTION_DATABASE: "conversion_engine" }, ["--confirm-production"]),
    "PRODUCTION_DATABASE_URL is required",
  );
});

const roles = requiredRoleNames({});

function context() {
  return { failures: [] as string[] };
}

test("database ACL evaluation requires owner CREATE and rejects PUBLIC and runtime CREATE", () => {
  const valid = context();
  evaluateDatabaseAcl(
    {
      database_name: "conversion_engine",
      public_create: false,
      owner_create: true,
      migrator_create: false,
      api_create: false,
      bff_create: false,
      maintenance_create: false,
    },
    valid,
    "conversion_engine",
  );
  assert.deepEqual(valid.failures, []);

  const invalid = context();
  evaluateDatabaseAcl(
    {
      database_name: "wrong_database",
      public_create: true,
      owner_create: false,
      migrator_create: true,
      api_create: true,
      bff_create: true,
      maintenance_create: true,
    },
    invalid,
    "conversion_engine",
  );
  assert.equal(invalid.failures.length, 7);
});

test("Drizzle ownership evaluation requires schema, journal table and sequence to belong to ce_owner", () => {
  const valid = context();
  evaluateOwnedObjects(
    [
      { object_kind: "schema", object_name: "drizzle", owner_name: roles.owner },
      { object_kind: "table", object_name: "__drizzle_migrations", owner_name: roles.owner },
      { object_kind: "sequence", object_name: "__drizzle_migrations_id_seq", owner_name: roles.owner },
    ],
    valid,
    roles,
  );
  assert.deepEqual(valid.failures, []);

  const invalid = context();
  evaluateOwnedObjects(
    [{ object_kind: "table", object_name: "__drizzle_migrations", owner_name: roles.migrator }],
    invalid,
    roles,
  );
  assert.equal(invalid.failures.length, 3);
});

test("role flags and memberships enforce the complete SET ROLE boundary", () => {
  const valid = context();
  evaluateRoleFlags(
    [
      {
        rolname: roles.owner,
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolreplication: false,
        rolcanlogin: false,
      },
      ...[roles.migrator, roles.api, roles.bff, roles.maintenance].map((rolname) => ({
        rolname,
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolreplication: false,
        rolcanlogin: true,
      })),
    ],
    valid,
    roles,
  );
  evaluateRoleMemberships(
    [{ member_role: roles.migrator, parent_role: roles.owner, admin_option: false, inherit_option: true, set_option: true }],
    valid,
    roles,
  );
  assert.deepEqual(valid.failures, []);

  const invalid = context();
  evaluateRoleMemberships(
    [
      { member_role: roles.migrator, parent_role: roles.owner, admin_option: true, inherit_option: false, set_option: false },
      { member_role: roles.api, parent_role: roles.owner, admin_option: false, inherit_option: true, set_option: true },
    ],
    invalid,
    roles,
  );
  assert.equal(invalid.failures.length, 4);
});

test("role flags reject replication privileges", () => {
  const failures = context();
  evaluateRoleFlags(
    [
      {
        rolname: roles.owner,
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolreplication: true,
        rolcanlogin: false,
      },
      ...[roles.migrator, roles.api, roles.bff, roles.maintenance].map((rolname) => ({
        rolname,
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolreplication: false,
        rolcanlogin: true,
      })),
    ],
    failures,
    roles,
  );
  assert.deepEqual(failures.failures, [`role cannot use replication privileges: ${roles.owner}`]);
});

test("role membership evaluation rejects unknown memberships", () => {
  const failures = context();
  evaluateRoleMemberships(
    [
      { member_role: roles.migrator, parent_role: roles.owner, admin_option: false, inherit_option: true, set_option: true },
      { member_role: "ce_unknown", parent_role: roles.owner, admin_option: false, inherit_option: true, set_option: true },
    ],
    failures,
    roles,
  );
  assert.deepEqual(failures.failures, ["runtime role memberships are limited to the migration owner membership"]);
});

test("current connection evaluation uses the supplied environment", async () => {
  const configuredEnvironment = {
    ...baseEnvironment,
    EXPECTED_PRODUCTION_DATABASE: "configured_database",
    EXPECTED_MIGRATOR_ROLE: "configured_migrator",
  };
  const client = {
    query: async () => ({
      rows: [
        {
          database_name: "configured_database",
          current_user_name: "configured_migrator",
          session_user_name: "configured_migrator",
          default_transaction_read_only: "on",
          transaction_read_only: "on",
        },
      ],
    }),
  } as unknown as PoolClient;
  const failures = context();

  await verifyCurrentConnection(client, failures, configuredEnvironment);

  assert.deepEqual(failures.failures, []);
});

test("runtime privilege evaluation keeps BFF isolated and rejects direct migrator/PUBLIC grants", () => {
  const valid = context();
  evaluateDrizzlePrivileges([], valid, roles);
  const validRows = [
    { object_kind: "schema" as const, object_name: "public", grantee_name: roles.api, privilege_type: "USAGE", is_grantable: false },
    { object_kind: "schema" as const, object_name: "public", grantee_name: roles.bff, privilege_type: "USAGE", is_grantable: false },
    ...RUNTIME_TABLE_ALLOWLISTS.api.flatMap((tableName) =>
      ["SELECT", "INSERT", "UPDATE", "DELETE"].map((privilege_type) => ({
        object_kind: "table" as const,
        object_name: tableName,
        grantee_name: roles.api,
        privilege_type,
        is_grantable: false,
      })),
    ),
    ...RUNTIME_TABLE_ALLOWLISTS.bff.flatMap((tableName) =>
      ["SELECT", "INSERT", "UPDATE", "DELETE"].map((privilege_type) => ({
        object_kind: "table" as const,
        object_name: tableName,
        grantee_name: roles.bff,
        privilege_type,
        is_grantable: false,
      })),
    ),
    ...RUNTIME_FUNCTION_ALLOWLISTS.api.map((functionSignature) => ({
      object_kind: "function" as const,
      object_name: functionSignature,
      grantee_name: roles.api,
      privilege_type: "EXECUTE",
      is_grantable: false,
    })),
  ];
  evaluatePublicPrivileges(validRows, valid, roles);
  assert.deepEqual(valid.failures, []);

  const invalid = context();
  evaluateDrizzlePrivileges(
    [
      { object_kind: "schema", object_name: "drizzle", grantee_name: roles.migrator, privilege_type: "USAGE", is_grantable: false },
      { object_kind: "schema", object_name: "drizzle", grantee_name: "ce_unknown", privilege_type: "USAGE", is_grantable: false },
    ],
    invalid,
    roles,
  );
  evaluatePublicPrivileges(
    [
      { object_kind: "schema", object_name: "public", grantee_name: roles.bff, privilege_type: "CREATE", is_grantable: false },
      { object_kind: "table", object_name: "tenants", grantee_name: "PUBLIC", privilege_type: "SELECT", is_grantable: false },
      { object_kind: "table", object_name: "tenants", grantee_name: roles.migrator, privilege_type: "SELECT", is_grantable: false },
      { object_kind: "table", object_name: "tenants", grantee_name: roles.bff, privilege_type: "SELECT", is_grantable: false },
      { object_kind: "table", object_name: "bff_sessions", grantee_name: roles.api, privilege_type: "SELECT", is_grantable: false },
      { object_kind: "table", object_name: "tenants", grantee_name: roles.api, privilege_type: "SELECT", is_grantable: true },
      { object_kind: "table", object_name: "unknown_future_table", grantee_name: roles.api, privilege_type: "SELECT", is_grantable: false },
      { object_kind: "function", object_name: "unknown_future_function()", grantee_name: roles.api, privilege_type: "EXECUTE", is_grantable: false },
      { object_kind: "table", object_name: "tenants", grantee_name: roles.maintenance, privilege_type: "SELECT", is_grantable: false },
      { object_kind: "table", object_name: "tenants", grantee_name: "ce_unknown", privilege_type: "SELECT", is_grantable: false },
    ],
    invalid,
    roles,
  );
  assert.ok(invalid.failures.some((failure) => failure.includes("outside the explicit allowlist")));
  assert.ok(invalid.failures.some((failure) => failure.includes("required runtime privilege is missing")));
  assert.ok(invalid.failures.some((failure) => failure.includes("migrator has a direct public-schema privilege")));
  assert.ok(invalid.failures.some((failure) => failure.includes("unknown grantee")));
});
