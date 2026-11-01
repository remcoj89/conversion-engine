import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { createTestDb } from "../db.js";
import * as schema from "../db/schema.js";
import { runWithDatabaseContext } from "../db/requestContext.js";
import { createDefaultCrmSettings } from "./settings.js";
import {
  getOrCreateCrmSettingsInTransaction,
  updateCrmSettingsInTransaction,
} from "./settingsRepository.js";

test("CRM settings are tenant-bound, defaulted and audited in one transaction", async () => {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");
  const { pool } = createTestDb(databaseUrl);
  const client = await pool.connect();
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const actorUserId = randomUUID();
  const actorSubject = `crm-settings-${randomUUID()}`;

  try {
    await client.query("begin");
    const tx = drizzle(client, { schema });
    await tx.insert(schema.tenants).values({ id: tenantId, name: "CRM settings test tenant" });
    await tx.insert(schema.tenants).values({ id: otherTenantId, name: "CRM settings other tenant" });
    await tx.insert(schema.users).values({ id: actorUserId, authProviderUserId: actorSubject });
    await tx.insert(schema.memberships).values({ tenantId, userId: actorUserId, role: "owner" });

    const defaults = await getOrCreateCrmSettingsInTransaction(tx, tenantId);
    assert.deepEqual(defaults.settings, createDefaultCrmSettings());

    const otherTenantDefaults = await getOrCreateCrmSettingsInTransaction(tx, otherTenantId);
    assert.deepEqual(otherTenantDefaults.settings, createDefaultCrmSettings());

    const changedSettings = { ...defaults.settings, timezone: "UTC" };
    const updated = await runWithDatabaseContext(
      { scope: "customer", subject: actorSubject, tenantId },
      () => updateCrmSettingsInTransaction(tx, {
        tenantId,
        actorUserId,
        settings: changedSettings,
      }),
    );
    assert.equal(updated.settings.timezone, "UTC");

    const [stored] = await tx
      .select()
      .from(schema.crmSettings)
      .where(eq(schema.crmSettings.tenantId, tenantId));
    assert.equal(stored?.settings && (stored.settings as { timezone?: string }).timezone, "UTC");

    const events = await tx
      .select()
      .from(schema.crmSettingsAuditEvents)
      .where(eq(schema.crmSettingsAuditEvents.tenantId, tenantId));
    assert.equal(events.length, 1);
    assert.equal(events[0]?.actorUserId, actorUserId);
    assert.equal((events[0]?.settings as { timezone?: string }).timezone, "UTC");

    const [otherTenantStored] = await tx
      .select()
      .from(schema.crmSettings)
      .where(eq(schema.crmSettings.tenantId, otherTenantId));
    assert.equal(
      (otherTenantStored?.settings as { timezone?: string }).timezone,
      createDefaultCrmSettings().timezone,
    );

    await client.query("savepoint crm_settings_audit_immutable");
    await assert.rejects(
      client.query(
        "update crm_settings_audit_events set settings = settings where tenant_id = $1",
        [tenantId],
      ),
      (error: { code?: string }) => error.code === "P0001" || error.code === "42501",
    );
    await client.query("rollback to savepoint crm_settings_audit_immutable");

    await assert.rejects(
      client.query("delete from crm_settings_audit_events where tenant_id = $1", [tenantId]),
      (error: { code?: string }) => error.code === "P0001" || error.code === "42501",
    );
    await client.query("rollback to savepoint crm_settings_audit_immutable");
  } finally {
    await client.query("rollback");
    client.release();
    await pool.end();
  }
});
