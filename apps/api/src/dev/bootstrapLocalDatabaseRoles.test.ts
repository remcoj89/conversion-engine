import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLocalRoleBootstrapInvocation,
  assertOwnerRoleMembershipBoundary,
  buildRoleMembershipBoundarySql,
  buildDatabaseAndDrizzleOwnershipSql,
  LOCAL_ROLE_CONFIRM_FLAG,
  LocalRoleBootstrapError,
  RUNTIME_FUNCTION_ALLOWLISTS,
  RUNTIME_TABLE_ALLOWLISTS,
} from "./bootstrapLocalDatabaseRoles.js";
import {
  LOCAL_DATABASE_DEFAULT,
  LOCAL_ROLE_PASSWORD_ENV,
  POSTGRES_ROLE_NAMES,
  readRequiredLocalRolePasswords,
} from "./postgresRoleContract.js";

const rolePasswords = {
  [LOCAL_ROLE_PASSWORD_ENV.migrator]: "migrator-secret",
  [LOCAL_ROLE_PASSWORD_ENV.api]: "api-secret",
  [LOCAL_ROLE_PASSWORD_ENV.bff]: "bff-secret",
  [LOCAL_ROLE_PASSWORD_ENV.maintenance]: "maintenance-secret",
};

const baseEnvironment = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://conversion_engine:local@127.0.0.1:5432/conversion_engine",
  ...rolePasswords,
};

test("local role bootstrap requires explicit confirmation", () => {
  assert.throws(
    () => assertLocalRoleBootstrapInvocation(baseEnvironment, []),
    (error: unknown) => error instanceof LocalRoleBootstrapError && error.code === "confirmation_required",
  );
  assert.doesNotThrow(() => assertLocalRoleBootstrapInvocation(baseEnvironment, [LOCAL_ROLE_CONFIRM_FLAG]));
});

test("local role bootstrap rejects production and non-local environments", () => {
  assert.throws(
    () => assertLocalRoleBootstrapInvocation({ ...baseEnvironment, NODE_ENV: "production" }, [LOCAL_ROLE_CONFIRM_FLAG]),
    (error: unknown) => error instanceof LocalRoleBootstrapError && error.code === "production_refused",
  );
  assert.throws(
    () => assertLocalRoleBootstrapInvocation({ ...baseEnvironment, NODE_ENV: "staging" }, [LOCAL_ROLE_CONFIRM_FLAG]),
    (error: unknown) => error instanceof LocalRoleBootstrapError && error.code === "local_environment_required",
  );
});

test("local role bootstrap enforces the expected database name before connecting", () => {
  assert.throws(
    () =>
      assertLocalRoleBootstrapInvocation(
        { ...baseEnvironment, DATABASE_URL: "postgresql://conversion_engine:local@127.0.0.1:5432/other_database" },
        [LOCAL_ROLE_CONFIRM_FLAG],
      ),
    (error: unknown) => error instanceof LocalRoleBootstrapError && error.code === "database_guard_failed",
  );
  assert.throws(
    () =>
      assertLocalRoleBootstrapInvocation(
        { ...baseEnvironment, EXPECTED_LOCAL_DATABASE: "other_database" },
        [LOCAL_ROLE_CONFIRM_FLAG],
      ),
    (error: unknown) => error instanceof LocalRoleBootstrapError && error.code === "database_guard_failed",
  );
});

test("local role bootstrap requires every LOGIN role password without exposing values", () => {
  const environment: NodeJS.ProcessEnv = { ...baseEnvironment };
  delete environment[LOCAL_ROLE_PASSWORD_ENV.bff];

  assert.throws(
    () => assertLocalRoleBootstrapInvocation(environment, [LOCAL_ROLE_CONFIRM_FLAG]),
    (error: unknown) => {
      assert.ok(error instanceof LocalRoleBootstrapError);
      assert.equal(error.code, "passwords_required");
      assert.match(error.message, /CE_BFF_RUNTIME_PASSWORD/);
      assert.equal(error.message.includes("bff-secret"), false);
      return true;
    },
  );
});

test("role contract uses the separated owner, migrator, API, BFF and maintenance roles", () => {
  assert.deepEqual(POSTGRES_ROLE_NAMES, {
    owner: "ce_owner",
    migrator: "ce_migrator",
    api: "ce_api_runtime",
    bff: "ce_bff_runtime",
    maintenance: "ce_maintenance",
  });
  assert.equal(LOCAL_DATABASE_DEFAULT, "conversion_engine");
  assert.deepEqual(readRequiredLocalRolePasswords(baseEnvironment), {
    migrator: "migrator-secret",
    api: "api-secret",
    bff: "bff-secret",
    maintenance: "maintenance-secret",
  });
});

test("local bootstrap hardens database and Drizzle metadata ownership", () => {
  const sql = buildDatabaseAndDrizzleOwnershipSql("conversion_engine");

  assert.match(sql, /REVOKE CREATE ON DATABASE "conversion_engine" FROM PUBLIC/);
  assert.match(sql, /GRANT CREATE ON DATABASE "conversion_engine" TO ce_owner/);
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS drizzle/);
  assert.match(sql, /ALTER SCHEMA drizzle OWNER TO ce_owner/);
  assert.match(sql, /SET LOCAL ROLE ce_owner/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS drizzle\.__drizzle_migrations/);
  assert.match(sql, /ALTER TABLE drizzle\.%I OWNER TO ce_owner/);
  assert.match(sql, /ALTER SEQUENCE drizzle\.%I OWNER TO ce_owner/);
  assert.match(sql, /REVOKE ALL ON SCHEMA drizzle FROM PUBLIC, ce_migrator/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE drizzle\.%I FROM PUBLIC, ce_migrator/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON SEQUENCE drizzle\.%I FROM PUBLIC, ce_migrator/);
});

test("local bootstrap quotes database names before using them as identifiers", () => {
  const sql = buildDatabaseAndDrizzleOwnershipSql('conversion_engine"test');

  assert.match(sql, /ON DATABASE "conversion_engine""test" FROM PUBLIC/);
  assert.doesNotMatch(sql, /ON DATABASE conversion_engine"test/);
});

test("local bootstrap grants only the explicit runtime table and function allowlists", () => {
  const sql = buildDatabaseAndDrizzleOwnershipSql("conversion_engine");

  for (const tableName of RUNTIME_TABLE_ALLOWLISTS.api) {
    assert.match(sql, new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\\."${tableName}" TO ce_api_runtime`));
  }
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\."bff_sessions" TO ce_bff_runtime/);
  assert.doesNotMatch(sql, /TO ce_api_runtime, ce_maintenance/);
  assert.doesNotMatch(sql, /TO ce_bff_runtime, ce_maintenance/);
  assert.doesNotMatch(sql, /GRANT USAGE ON SCHEMA public TO .*ce_maintenance/);

  for (const functionSignature of RUNTIME_FUNCTION_ALLOWLISTS.api) {
    const [functionName, argumentsList] = functionSignature.replace(")", "").split("(");
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\."${functionName}"\\(${argumentsList}\\) TO ce_api_runtime`));
  }
  assert.doesNotMatch(sql, /TO ce_maintenance/);
  assert.match(sql, /to_regprocedure\('public\.ce_test_add_forced_failure\(text\)'\)/);
});

test("runtime allowlists keep bff sessions exclusive and maintenance empty", () => {
  assert.deepEqual(RUNTIME_TABLE_ALLOWLISTS.bff, ["bff_sessions"]);
  assert.deepEqual(RUNTIME_TABLE_ALLOWLISTS.maintenance, []);
  assert.deepEqual(RUNTIME_FUNCTION_ALLOWLISTS.bff, []);
  assert.deepEqual(RUNTIME_FUNCTION_ALLOWLISTS.maintenance, []);
});

test("role membership SQL removes stale owner memberships and restores only the migrator boundary", () => {
  const sql = buildRoleMembershipBoundarySql();

  assert.match(sql, /REVOKE ce_owner FROM ce_api_runtime, ce_bff_runtime, ce_maintenance/);
  assert.match(sql, /parent\.rolname = 'ce_owner'/);
  assert.match(sql, /member\.rolname <> 'ce_migrator'/);
  assert.match(sql, /REVOKE ce_owner FROM %I/);
  assert.match(sql, /GRANT ce_owner TO ce_migrator WITH INHERIT TRUE, SET TRUE, ADMIN FALSE/);
  assert.doesNotMatch(sql, /GRANT ce_owner TO ce_(?:api_runtime|bff_runtime|maintenance)/);
});

test("owner role membership guard accepts exactly the designed migrator membership", () => {
  assert.doesNotThrow(() =>
    assertOwnerRoleMembershipBoundary([
      {
        member_role: "ce_migrator",
        parent_role: "ce_owner",
        admin_option: false,
        inherit_option: true,
        set_option: true,
      },
    ]),
  );
});

test("owner role membership guard rejects unknown, runtime, delegated, or incomplete memberships", () => {
  const valid = {
    member_role: "ce_migrator",
    parent_role: "ce_owner",
    admin_option: false,
    inherit_option: true,
    set_option: true,
  };

  for (const rows of [
    [valid, { ...valid, member_role: "unknown_role" }],
    [{ ...valid, member_role: "ce_api_runtime" }],
    [{ ...valid, admin_option: true }],
    [{ ...valid, inherit_option: false }],
    [{ ...valid, set_option: false }],
    [],
  ]) {
    assert.throws(() => assertOwnerRoleMembershipBoundary(rows));
  }
});
