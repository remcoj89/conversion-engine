import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import {
  createDefaultCrmSettings,
  parseCrmSettings,
  type CrmSettings,
} from "./settings.js";

type Db = NodePgDatabase<typeof schema>;
type DbTx = Pick<Db, "select" | "insert" | "update">;

export type PersistedCrmSettings = Readonly<{
  settings: CrmSettings;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CrmSettingsRepository = Readonly<{
  get: (tenantId: string) => Promise<PersistedCrmSettings>;
  update: (input: Readonly<{
    tenantId: string;
    actorUserId: string;
    settings: CrmSettings;
  }>) => Promise<PersistedCrmSettings>;
}>;

export function createCrmSettingsRepository(db: Db): CrmSettingsRepository {
  return {
    get: (tenantId) => getCrmSettings(db, tenantId),
    update: (input) => updateCrmSettings(db, input),
  };
}

export async function getCrmSettings(db: Db, tenantId: string): Promise<PersistedCrmSettings> {
  return db.transaction((tx) => getOrCreateCrmSettingsInTransaction(tx, tenantId));
}

export function getOrCreateCrmSettingsInTransaction(
  tx: DbTx,
  tenantId: string,
): Promise<PersistedCrmSettings> {
  return readOrCreateCrmSettings(tx, tenantId);
}

export async function updateCrmSettings(
  db: Db,
  input: Readonly<{
    tenantId: string;
    actorUserId: string;
    settings: CrmSettings;
  }>,
): Promise<PersistedCrmSettings> {
  return db.transaction((tx) => updateCrmSettingsInTransaction(tx, input));
}

export async function updateCrmSettingsInTransaction(
  tx: DbTx,
  input: Readonly<{
    tenantId: string;
    actorUserId: string;
    settings: CrmSettings;
  }>,
): Promise<PersistedCrmSettings> {
  // Keep the repository boundary safe for non-HTTP callers as well. The route validates
  // the request contract, but every persistence path must protect the audit snapshot too.
  const validatedSettings = parseCrmSettings(input.settings);
  const current = await tx
    .select()
    .from(schema.crmSettings)
    .where(eq(schema.crmSettings.tenantId, input.tenantId))
    .for("update")
    .limit(1);

  const [saved] = current.length === 0
    ? await tx
      .insert(schema.crmSettings)
      .values({ tenantId: input.tenantId, settings: validatedSettings })
      .returning()
    : await tx
      .update(schema.crmSettings)
      .set({ settings: validatedSettings, updatedAt: new Date() })
      .where(eq(schema.crmSettings.tenantId, input.tenantId))
      .returning();

  if (!saved) throw new Error("CRM settings update returned no row");

  await tx.insert(schema.crmSettingsAuditEvents).values({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    eventType: "updated",
    settings: validatedSettings,
  });

  return toPersistedSettings(saved);
}

async function readOrCreateCrmSettings(
  tx: DbTx,
  tenantId: string,
): Promise<PersistedCrmSettings> {
  const [existing] = await tx
    .select()
    .from(schema.crmSettings)
    .where(eq(schema.crmSettings.tenantId, tenantId))
    .for("update")
    .limit(1);

  if (existing) return toPersistedSettings(existing);

  const [created] = await tx
    .insert(schema.crmSettings)
    .values({ tenantId, settings: createDefaultCrmSettings() })
    .onConflictDoNothing({ target: schema.crmSettings.tenantId })
    .returning();

  if (created) return toPersistedSettings(created);

  const [afterRace] = await tx
    .select()
    .from(schema.crmSettings)
    .where(eq(schema.crmSettings.tenantId, tenantId))
    .limit(1);
  if (!afterRace) throw new Error("CRM settings initialization returned no row");
  return toPersistedSettings(afterRace);
}

function toPersistedSettings(row: typeof schema.crmSettings.$inferSelect): PersistedCrmSettings {
  return {
    settings: parseCrmSettings(row.settings),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
