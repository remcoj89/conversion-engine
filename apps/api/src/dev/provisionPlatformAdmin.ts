// Local development only: grants platform-admin access to the current local user.
// Run explicitly with: NODE_ENV=development npm --workspace api run provision:platform-admin -- --confirm-local
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMaintenanceDb } from "../db.js";
import { runWithDatabaseContext } from "../db/requestContext.js";
import {
  assertPlatformAdminInvocation,
  drizzlePlatformAdminTransactionRunner,
  PlatformAdminProvisioningError,
  provisionCurrentPlatformAdmin,
} from "./platformAdminProvisioning.js";

export function readMaintenanceDatabaseUrl(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const databaseUrl = env.MAINTENANCE_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("MAINTENANCE_DATABASE_URL is required for local maintenance provisioning.");
  }
  return databaseUrl;
}

async function main(): Promise<number> {
  let maintenanceDatabaseUrl: string;
  try {
    assertPlatformAdminInvocation(process.env, process.argv.slice(2));
    maintenanceDatabaseUrl = readMaintenanceDatabaseUrl();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Platform-admin provisioning geweigerd.",
    );
    return 1;
  }

  try {
    const { db, pool } = await createMaintenanceDb(maintenanceDatabaseUrl);
    try {
      const result = await runWithDatabaseContext({ scope: "maintenance" }, () =>
        provisionCurrentPlatformAdmin(drizzlePlatformAdminTransactionRunner(db)),
      );
      if (result.status === "created") {
        console.log("Platform-adminrechten toegekend aan de huidige lokale gebruiker.");
      } else if (result.status === "reactivated") {
        console.log("Ingetrokken platform-adminrechten opnieuw geactiveerd.");
      } else {
        console.log("Platform-adminrechten waren al actief; er is niets gewijzigd.");
      }
      return 0;
    } finally {
      await pool.end();
    }
  } catch (error) {
    // Database errors can quote parameter values, so only fixed messages are printed.
    console.error(
      error instanceof PlatformAdminProvisioningError
        ? error.message
        : "Platform-admin provisioning mislukt; de transactie is teruggedraaid.",
    );
    return 1;
  }
}

const entryPoint = process.argv[1];
const isDirectExecution = entryPoint && fileURLToPath(import.meta.url) === resolve(entryPoint);
if (isDirectExecution) process.exitCode = await main();
