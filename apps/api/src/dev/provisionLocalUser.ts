// Local development only: links the most recently logged-in session to a local tenant.
// Run explicitly with: npm --workspace api run provision:local -- --confirm-local
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMaintenanceDb } from "../db.js";
import { runWithDatabaseContext } from "../db/requestContext.js";
import {
  ProvisioningError,
  assertLocalInvocation,
  drizzleTransactionRunner,
  provisionLocalUser,
} from "./localProvisioning.js";

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
    assertLocalInvocation(process.env, process.argv.slice(2));
    maintenanceDatabaseUrl = readMaintenanceDatabaseUrl();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Lokale provisioning geweigerd.");
    return 1;
  }

  try {
    const { db, pool } = await createMaintenanceDb(maintenanceDatabaseUrl);
    try {
      const result = await runWithDatabaseContext({ scope: "maintenance" }, () =>
        provisionLocalUser(drizzleTransactionRunner(db)),
      );
      if (result.status === "already_provisioned") {
        console.log("Provisioning was al voltooid: er bestaat al een actieve membership. Er is niets gewijzigd.");
      } else {
        console.log(
          `Provisioning voltooid: ${result.createdUser ? "nieuwe" : "bestaande"} gebruiker is owner van "Local development tenant" (tenant ${result.tenantId}).`,
        );
      }
      return 0;
    } finally {
      await pool.end();
    }
  } catch (error) {
    // Database errors can quote parameter values, so only fixed messages are printed.
    console.error(
      error instanceof ProvisioningError ? error.message : "Lokale provisioning mislukt; de transactie is teruggedraaid.",
    );
    return 1;
  }
}

const entryPoint = process.argv[1];
const isDirectExecution = entryPoint && fileURLToPath(import.meta.url) === resolve(entryPoint);
if (isDirectExecution) process.exitCode = await main();
