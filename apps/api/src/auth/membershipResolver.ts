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
  const rows = await db
    .select({
      tenantId: schema.memberships.tenantId,
      userId: schema.memberships.userId,
      role: schema.memberships.role,
      status: schema.memberships.status,
      permission: schema.teamMemberCrmPermissions.permission,
      enabled: schema.teamMemberCrmPermissions.enabled,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.memberships.tenantId))
    .leftJoin(
      schema.teamMemberCrmPermissions,
      and(
        eq(schema.teamMemberCrmPermissions.tenantId, schema.memberships.tenantId),
        eq(schema.teamMemberCrmPermissions.userId, schema.memberships.userId),
        eq(schema.teamMemberCrmPermissions.enabled, true),
      ),
    )
    .where(
      and(
        eq(schema.users.authProviderUserId, identity.subject),
        eq(schema.users.status, "active"),
        eq(schema.memberships.status, "active"),
        eq(schema.tenants.status, "active"),
      ),
    );

  const memberships = new Map<string, Membership>();
  for (const row of rows) {
    const key = `${row.tenantId}:${row.userId}`;
    const membership = memberships.get(key) ?? {
      tenantId: row.tenantId,
      userId: row.userId,
      role: row.role,
      status: row.status,
    };
    if (row.permission && row.enabled === true) {
      membership.teamMemberPermissions = {
        ...membership.teamMemberPermissions,
        [row.permission]: true,
      };
    }
    memberships.set(key, membership);
  }
  return [...memberships.values()];
}
