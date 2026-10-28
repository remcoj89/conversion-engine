import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import type { ExternalIdentity } from "./types.js";

type Db = NodePgDatabase<typeof schema>;

export type PlatformAdminAssignment = {
  userId: string;
  permission: "platform_admin";
};

// Returns only active platform rights for an active local user. No grant metadata is exposed to
// the runtime hook; created/revoked timestamps and the granting actor remain database-only data.
export async function findActivePlatformAdminAssignments(
  db: Db,
  identity: ExternalIdentity,
): Promise<PlatformAdminAssignment[]> {
  // The current identity model has one configured issuer, so the subject identifies the local user.
  return db
    .select({
      userId: schema.platformAdminAssignments.userId,
      permission: schema.platformAdminAssignments.permission,
    })
    .from(schema.platformAdminAssignments)
    .innerJoin(schema.users, eq(schema.users.id, schema.platformAdminAssignments.userId))
    .where(
      and(
        eq(schema.users.authProviderUserId, identity.subject),
        eq(schema.users.status, "active"),
        eq(schema.platformAdminAssignments.permission, "platform_admin"),
        eq(schema.platformAdminAssignments.status, "active"),
      ),
    );
}
