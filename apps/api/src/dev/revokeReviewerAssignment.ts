import { createDb } from "../db.js";
import { runWithDatabaseContext } from "../db/requestContext.js";
import {
  drizzleReviewerAssignmentRevocationTransactionRunner,
  parseReviewerAssignmentRevocationInvocation,
  revokeReviewerAssignment,
  ReviewerAssignmentRevocationError,
} from "./reviewerAssignmentRevocation.js";

async function main(): Promise<number> {
  let input: ReturnType<typeof parseReviewerAssignmentRevocationInvocation>;
  try {
    input = parseReviewerAssignmentRevocationInvocation(process.env, process.argv.slice(2));
  } catch (error) {
    console.error(
      error instanceof ReviewerAssignmentRevocationError ? error.message : "Reviewer-revoke geweigerd.",
    );
    return 1;
  }

  const { db, pool } = createDb();
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
  } catch (error) {
    // Database errors can quote parameter values, so only fixed messages are printed.
    console.error(
      error instanceof ReviewerAssignmentRevocationError
        ? error.message
        : "Reviewer-revoke mislukt; de transactie is teruggedraaid.",
    );
    return 1;
  } finally {
    await pool.end();
  }
}

process.exitCode = await main();
