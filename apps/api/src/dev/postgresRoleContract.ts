export const POSTGRES_ROLE_NAMES = {
  owner: "ce_owner",
  migrator: "ce_migrator",
  api: "ce_api_runtime",
  bff: "ce_bff_runtime",
  maintenance: "ce_maintenance",
} as const;

export type PostgresRoleKey = keyof typeof POSTGRES_ROLE_NAMES;
export type PostgresRoleNames = Record<PostgresRoleKey, string>;

export const LOCAL_DATABASE_DEFAULT = "conversion_engine";

export const LOCAL_ROLE_PASSWORD_ENV = {
  migrator: "CE_MIGRATOR_PASSWORD",
  api: "CE_API_RUNTIME_PASSWORD",
  bff: "CE_BFF_RUNTIME_PASSWORD",
  maintenance: "CE_MAINTENANCE_PASSWORD",
} as const;

export type LocalRolePasswords = Record<keyof typeof LOCAL_ROLE_PASSWORD_ENV, string>;

export function readExpectedRoleNames(env: NodeJS.ProcessEnv = process.env): PostgresRoleNames {
  return {
    owner: env.EXPECTED_OWNER_ROLE?.trim() || POSTGRES_ROLE_NAMES.owner,
    migrator: env.EXPECTED_MIGRATOR_ROLE?.trim() || POSTGRES_ROLE_NAMES.migrator,
    api: env.EXPECTED_RUNTIME_ROLE?.trim() || POSTGRES_ROLE_NAMES.api,
    bff: env.EXPECTED_BFF_ROLE?.trim() || POSTGRES_ROLE_NAMES.bff,
    maintenance: env.EXPECTED_MAINTENANCE_ROLE?.trim() || POSTGRES_ROLE_NAMES.maintenance,
  };
}

export function roleNamesAreDistinct(names: PostgresRoleNames): boolean {
  return new Set(Object.values(names)).size === Object.values(names).length;
}

export function databaseNameFromUrl(databaseUrl: string): string | undefined {
  try {
    const url = new URL(databaseUrl);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return undefined;
    const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    return databaseName || undefined;
  } catch {
    return undefined;
  }
}

export function readRequiredLocalRolePasswords(env: NodeJS.ProcessEnv = process.env): LocalRolePasswords {
  const missing = Object.values(LOCAL_ROLE_PASSWORD_ENV).filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`required local role passwords are missing: ${missing.join(", ")}`);
  }

  return {
    migrator: env[LOCAL_ROLE_PASSWORD_ENV.migrator] as string,
    api: env[LOCAL_ROLE_PASSWORD_ENV.api] as string,
    bff: env[LOCAL_ROLE_PASSWORD_ENV.bff] as string,
    maintenance: env[LOCAL_ROLE_PASSWORD_ENV.maintenance] as string,
  };
}
