import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { isWebsitePublicKey } from "./websitePublicKey.js";

type Db = NodePgDatabase<typeof schema>;

// Only what a later public endpoint needs; no tenant details, memberships or leads.
export type WebsiteContext = Readonly<{
  websiteId: string;
  tenantId: string;
}>;

// Resolves a public website key to its tenant, server-side. The tenant always comes from the
// registration in the database, never from the request. Returns null for an empty or malformed key,
// an unknown key, a disabled website or a website whose tenant is not active.
export async function findActiveWebsiteContext(db: Db, publicKey: unknown): Promise<WebsiteContext | null> {
  if (!isWebsitePublicKey(publicKey)) return null;

  const [context] = await db
    .select({ websiteId: schema.websites.id, tenantId: schema.websites.tenantId })
    .from(schema.websites)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.websites.tenantId))
    .where(
      and(
        eq(schema.websites.publicKey, publicKey),
        eq(schema.websites.status, "active"),
        eq(schema.tenants.status, "active"),
      ),
    )
    .limit(1);
  return context ?? null;
}
