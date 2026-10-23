import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

type Db = NodePgDatabase<typeof schema>;

export type TenantSummary = Readonly<{
  id: string;
  name: string;
  status: string;
}>;

// Keeps the HTTP layer independent of Drizzle/PostgreSQL. Only ever called with context.tenantId.
export type TenantLoader = (tenantId: string) => Promise<TenantSummary | null>;

// Returns only id, name and status of exactly this tenant, or null when it does not exist.
export async function findTenant(db: Db, tenantId: string): Promise<TenantSummary | null> {
  const [tenant] = await db
    .select({ id: schema.tenants.id, name: schema.tenants.name, status: schema.tenants.status })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);
  return tenant ?? null;
}
