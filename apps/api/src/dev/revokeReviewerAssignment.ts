import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMaintenanceDb } from "../db.js";
import { runWithDatabaseContext } from "../db/requestContext.js";
import {
  drizzleReviewerAssignmentRevocationTransactionRunner,
  parseReviewerAssignmentRevocationInvocation,
  revokeReviewerAssignment,
  ReviewerAssignmentRevocationError,
} from "./reviewerAssignmentRevocation.js";

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
  let input: ReturnType<typeof parseReviewerAssignmentRevocationInvocation>;
  let maintenanceDatabaseUrl: string;
  try {
    input = parseReviewerAssignmentRevocationInvocation(process.env, process.argv.slice(2));
    maintenanceDatabaseUrl = readMaintenanceDatabaseUrl();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Reviewer-revoke geweigerd.",
    );
    return 1;
  }

  try {
    const { db, pool } = await createMaintenanceDb(maintenanceDatabaseUrl);
    try {
      const result = await runWithDatabaseContext({ scope: "maintenance" }, () =>
        revokeReviewerAssignment(
          drizzleReviewerAssignmentRevocationTransactionRunner(db),
          input,
        ),
      );
      if (result.status === "revoked") {
        console.log("Reviewer-toewijzing ingetrokken.");
      } else {
        console.log("Reviewer-toewijzing was al ingetrokken; er is niets gewijzigd.");
      }
      return 0;
    } finally {
      await pool.end();
    }
  } catch (error) {
    // Database errors can quote parameter values, so only fixed messages are printed.
    console.error(
      error instanceof ReviewerAssignmentRevocationError
        ? error.message
        : "Reviewer-revoke mislukt; de transactie is teruggedraaid.",
    );
    return 1;
  }
}

const entryPoint = process.argv[1];
const isDirectExecution = entryPoint && fileURLToPath(import.meta.url) === resolve(entryPoint);
if (isDirectExecution) process.exitCode = await main();
