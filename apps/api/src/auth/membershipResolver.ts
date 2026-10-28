import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import type { ExternalIdentity, Membership } from "./types.js";

type Db = NodePgDatabase<typeof schema>;

// Returns the memberships an active identity may currently use: active membership in an active tenant.
// An unknown user simply yields an empty list.
export async function findActiveMemberships(
  db: Db,
  identity: ExternalIdentity,
): Promise<Membership[]> {
  // Single-issuer assumption: users does not store the issuer yet, so the subject alone
  // identifies the user. The auth adapter must accept exactly one configured issuer.
  return db
    .select({
      tenantId: schema.memberships.tenantId,
      userId: schema.memberships.userId,
      role: schema.memberships.role,
      status: schema.memberships.status,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.memberships.tenantId))
    .where(
      and(
        eq(schema.users.authProviderUserId, identity.subject),
        eq(schema.users.status, "active"),
        eq(schema.memberships.status, "active"),
        eq(schema.tenants.status, "active"),
      ),
    );
}
