// Local development only: grants platform-admin access to the current local user.
// Run explicitly with: NODE_ENV=development npm --workspace api run provision:platform-admin -- --confirm-local
import { createDb } from "../db.js";
import { runWithDatabaseContext } from "../db/requestContext.js";
import {
  assertPlatformAdminInvocation,
  drizzlePlatformAdminTransactionRunner,
  PlatformAdminProvisioningError,
  provisionCurrentPlatformAdmin,
} from "./platformAdminProvisioning.js";

async function main(): Promise<number> {
  try {
    assertPlatformAdminInvocation(process.env, process.argv.slice(2));
  } catch (error) {
    console.error(
      error instanceof PlatformAdminProvisioningError
        ? error.message
        : "Platform-admin provisioning geweigerd.",
    );
    return 1;
  }

  const { db, pool } = createDb();
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
  } catch (error) {
    // Database errors can quote parameter values, so only fixed messages are printed.
    console.error(
      error instanceof PlatformAdminProvisioningError
        ? error.message
        : "Platform-admin provisioning mislukt; de transactie is teruggedraaid.",
    );
    return 1;
  } finally {
    await pool.end();
  }
}

process.exitCode = await main();
