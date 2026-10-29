import { createDb } from "../db.js";
import { runWithDatabaseContext } from "../db/requestContext.js";
import {
  drizzleReviewerAssignmentTransactionRunner,
  parseReviewerAssignmentInvocation,
  provisionReviewerAssignment,
  ReviewerAssignmentProvisioningError,
} from "./reviewerAssignmentProvisioning.js";

async function main(): Promise<number> {
  let input: ReturnType<typeof parseReviewerAssignmentInvocation>;
  try {
    input = parseReviewerAssignmentInvocation(process.env, process.argv.slice(2));
  } catch (error) {
    console.error(
      error instanceof ReviewerAssignmentProvisioningError ? error.message : "Reviewer-provisioning geweigerd.",
    );
    return 1;
  }

  const { db, pool } = createDb();
  try {
    const result = await runWithDatabaseContext({ scope: "maintenance" }, () =>
      provisionReviewerAssignment(drizzleReviewerAssignmentTransactionRunner(db), input),
    );
    if (result.status === "created") {
      console.log("Reviewer-toewijzing aangemaakt.");
    } else if (result.status === "reactivated") {
      console.log("Ingetrokken reviewer-toewijzing opnieuw geactiveerd.");
    } else {
      console.log("Reviewer-toewijzing was al actief; er is niets gewijzigd.");
    }
    return 0;
  } catch (error) {
    // Database errors can quote parameter values, so only fixed messages are printed.
    console.error(
      error instanceof ReviewerAssignmentProvisioningError
        ? error.message
        : "Reviewer-provisioning mislukt; de transactie is teruggedraaid.",
    );
    return 1;
  } finally {
    await pool.end();
  }
}

process.exitCode = await main();
