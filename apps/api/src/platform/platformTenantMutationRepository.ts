import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

type Db = NodePgDatabase<typeof schema>;
type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const DISABLE_RETENTION_DAYS = 180;

export type PlatformTenantMutation = Readonly<{
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  disabledAt: Date | null;
  purgeAfterAt: Date | null;
}>;

export type PlatformTenantMutationRepository = Readonly<{
  create: (input: Readonly<{ name: string }>) => Promise<PlatformTenantMutation>;
  rename: (input: Readonly<{ tenantId: string; name: string }>) => Promise<PlatformTenantMutation>;
  disable: (input: Readonly<{ tenantId: string; actorUserId: string }>) => Promise<PlatformTenantMutation>;
  reactivate: (input: Readonly<{ tenantId: string }>) => Promise<PlatformTenantMutation>;
}>;

export type PlatformTenantMutationErrorCode = "tenant_not_found";

export class PlatformTenantMutationError extends Error {
  constructor(readonly code: PlatformTenantMutationErrorCode) {
    super(code);
    this.name = "PlatformTenantMutationError";
  }
}

export function createPlatformTenantMutationRepository(db: Db): PlatformTenantMutationRepository {
  return {
    create: ({ name }) => db.transaction((tx) => insertTenant(tx, name)),
    rename: ({ tenantId, name }) => db.transaction((tx) => renameTenant(tx, tenantId, name)),
    disable: ({ tenantId, actorUserId }) => db.transaction((tx) => disableTenant(tx, tenantId, actorUserId)),
    reactivate: ({ tenantId }) => db.transaction((tx) => reactivateTenant(tx, tenantId)),
  };
}

async function insertTenant(tx: DbTx, name: string): Promise<PlatformTenantMutation> {
  const [tenant] = await tx
    .insert(schema.tenants)
    .values({ name, status: "pending" })
    .returning(tenantMutationSelection);

  if (!tenant) throw new Error("Tenant insert returned no row");
  return tenant;
}

async function renameTenant(tx: DbTx, tenantId: string, name: string): Promise<PlatformTenantMutation> {
  await lockTenant(tx, tenantId);
  const [tenant] = await tx
    .update(schema.tenants)
    .set({ name, updatedAt: sql`now()` })
    .where(eq(schema.tenants.id, tenantId))
    .returning(tenantMutationSelection);

  if (!tenant) throw new PlatformTenantMutationError("tenant_not_found");
  return tenant;
}

async function disableTenant(
  tx: DbTx,
  tenantId: string,
  actorUserId: string,
): Promise<PlatformTenantMutation> {
  const current = await lockTenant(tx, tenantId);
  if (!current) throw new PlatformTenantMutationError("tenant_not_found");
  if (current.status === "disabled") return current;

  const [tenant] = await tx
    .update(schema.tenants)
    .set({
      status: "disabled",
      updatedAt: sql`now()`,
      disabledAt: sql`now()`,
      disabledBy: actorUserId,
      purgeAfterAt: sql`now() + (${DISABLE_RETENTION_DAYS} * interval '1 day')`,
    })
    .where(eq(schema.tenants.id, tenantId))
    .returning(tenantMutationSelection);

  if (!tenant) throw new PlatformTenantMutationError("tenant_not_found");
  return tenant;
}

async function reactivateTenant(tx: DbTx, tenantId: string): Promise<PlatformTenantMutation> {
  const current = await lockTenant(tx, tenantId);
  if (!current) throw new PlatformTenantMutationError("tenant_not_found");
  if (current.status !== "disabled") return current;

  const [tenant] = await tx
    .update(schema.tenants)
    .set({
      status: "active",
      updatedAt: sql`now()`,
      disabledAt: null,
      disabledBy: null,
      purgeAfterAt: null,
    })
    .where(eq(schema.tenants.id, tenantId))
    .returning(tenantMutationSelection);

  if (!tenant) throw new PlatformTenantMutationError("tenant_not_found");
  return tenant;
}

async function lockTenant(tx: DbTx, tenantId: string): Promise<PlatformTenantMutation | null> {
  const [tenant] = await tx
    .select(tenantMutationSelection)
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .for("update")
    .limit(1);
  return tenant ?? null;
}

const tenantMutationSelection = {
  id: schema.tenants.id,
  name: schema.tenants.name,
  status: schema.tenants.status,
  createdAt: schema.tenants.createdAt,
  updatedAt: schema.tenants.updatedAt,
  disabledAt: schema.tenants.disabledAt,
  purgeAfterAt: schema.tenants.purgeAfterAt,
};

export function buildPlatformTenantMutationResponse(tenant: PlatformTenantMutation) {
  return {
    id: tenant.id,
    name: tenant.name,
    status: tenant.status,
    created_at: tenant.createdAt.toISOString(),
    updated_at: tenant.updatedAt.toISOString(),
    disabled_at: tenant.disabledAt?.toISOString() ?? null,
    purge_after_at: tenant.purgeAfterAt?.toISOString() ?? null,
  };
}
