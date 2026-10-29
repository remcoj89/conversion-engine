// Local development only: links the most recently logged-in session to a local tenant.
// Run explicitly with: npm --workspace api run provision:local -- --confirm-local
import { createDb } from "../db.js";
import { runWithDatabaseContext } from "../db/requestContext.js";
import {
  ProvisioningError,
  assertLocalInvocation,
  drizzleTransactionRunner,
  provisionLocalUser,
} from "./localProvisioning.js";

async function main(): Promise<number> {
  try {
    assertLocalInvocation(process.env, process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof ProvisioningError ? error.message : "Lokale provisioning geweigerd.");
    return 1;
  }

  const { db, pool } = createDb();
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
  } catch (error) {
    // Database errors can quote parameter values, so only fixed messages are printed.
    console.error(
      error instanceof ProvisioningError ? error.message : "Lokale provisioning mislukt; de transactie is teruggedraaid.",
    );
    return 1;
  } finally {
    await pool.end();
  }
}

process.exitCode = await main();
