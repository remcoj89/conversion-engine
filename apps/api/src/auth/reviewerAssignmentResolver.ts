import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import type { ExternalIdentity, ReviewerAssignment } from "./types.js";

type Db = NodePgDatabase<typeof schema>;

// Returns the reviewer assignments the identity may currently use: active assignment in an active tenant.
// Only tenant and user IDs are returned; an unknown user simply yields an empty list.
export async function findActiveReviewerAssignments(db: Db, identity: ExternalIdentity): Promise<ReviewerAssignment[]> {
  // Same single-issuer assumption as findActiveMemberships: the subject alone identifies the user.
  return db
    .select({
      tenantId: schema.onboardingReviewerAssignments.tenantId,
      userId: schema.onboardingReviewerAssignments.userId,
    })
    .from(schema.onboardingReviewerAssignments)
    .innerJoin(schema.users, eq(schema.users.id, schema.onboardingReviewerAssignments.userId))
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.onboardingReviewerAssignments.tenantId))
    .where(
      and(
        eq(schema.users.authProviderUserId, identity.subject),
        eq(schema.onboardingReviewerAssignments.status, "active"),
        eq(schema.tenants.status, "active"),
      ),
    );
}
