import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { createTestDb } from "../db.js";
import * as schema from "../db/schema.js";
import { runWithDatabaseContext } from "../db/requestContext.js";
import {
  archiveContact,
  archiveOrganization,
  createContact,
  createOrganization,
  findContact,
  findOrganization,
  listContacts,
  listOrganizations,
  updateContact,
  updateOrganization,
} from "./organizationContactRepository.js";

type Tx = NodePgDatabase<typeof schema>;

async function withRollback(fn: (tx: Tx, client: PoolClient) => Promise<void>): Promise<void> {
  const databaseUrl = process.env.DATABASE_TEST_URL;
  assert.ok(databaseUrl, "DATABASE_TEST_URL is required");

  const { pool } = createTestDb(databaseUrl);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await fn(drizzle(client, { schema }), client);
  } finally {
    await client.query("rollback");
    client.release();
    await pool.end();
  }
}

test("organization and contact repository supports tenant-bound CRUD and safe archiving", async () => {
  await withRollback(async (tx) => {
    const tenantId = randomUUID();
    await tx.insert(schema.tenants).values({ id: tenantId, name: "CRM tenant" });

    const organization = await createOrganization(tx, {
      tenantId,
      name: "Acme B.V.",
      kvkNumber: "12345678",
      website: "https://acme.example",
    });
    const linkedContact = await createContact(tx, {
      tenantId,
      organizationId: organization.id,
      fullName: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@acme.example",
      communicationPreference: "email",
    });
    const secondLinkedContact = await createContact(tx, {
      tenantId,
      organizationId: organization.id,
      fullName: "Katherine Johnson",
      email: "katherine@acme.example",
    });
    const standaloneContact = await createContact(tx, {
      tenantId,
      fullName: "Grace Hopper",
      email: "grace@example.test",
    });

    assert.equal(linkedContact.organizationId, organization.id);
    assert.equal(standaloneContact.organizationId, null);
    assert.deepEqual(
      (await listContacts(tx, tenantId)).map((contact) => contact.id),
      [linkedContact.id, standaloneContact.id, secondLinkedContact.id],
    );
    assert.deepEqual(
      (await listContacts(tx, tenantId, { organizationId: organization.id })).map((contact) => contact.id),
      [linkedContact.id, secondLinkedContact.id],
    );

    const updatedOrganization = await updateOrganization(tx, {
      tenantId,
      organizationId: organization.id,
      industry: "Software",
    });
    const updatedContact = await updateContact(tx, {
      tenantId,
      contactId: linkedContact.id,
      phone: "+31 20 123 4567",
    });
    assert.equal(updatedOrganization?.industry, "Software");
    assert.equal(updatedContact?.phone, "+31 20 123 4567");

    const archivedContact = await archiveContact(tx, tenantId, linkedContact.id);
    await archiveContact(tx, tenantId, secondLinkedContact.id);
    const archivedOrganization = await archiveOrganization(tx, tenantId, organization.id);
    assert.equal(archivedContact?.status, "archived");
    assert.equal(archivedOrganization?.status, "archived");
    assert.deepEqual((await listOrganizations(tx, tenantId)).map((item) => item.id), []);
    assert.deepEqual((await listContacts(tx, tenantId)).map((item) => item.id), [standaloneContact.id]);
    assert.deepEqual((await listOrganizations(tx, tenantId, { includeArchived: true })).map((item) => item.id), [organization.id]);
    assert.equal((await findOrganization(tx, tenantId, organization.id))?.status, "archived");
    assert.equal((await findContact(tx, tenantId, linkedContact.id))?.status, "archived");
  });
});

test("organization and contact repository keeps tenants isolated", async () => {
  await withRollback(async (tx, client) => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    await tx.insert(schema.tenants).values([
      { id: tenantA, name: "Tenant A" },
      { id: tenantB, name: "Tenant B" },
    ]);
    const organizationB = await createOrganization(tx, { tenantId: tenantB, name: "Tenant B org" });
    const contactB = await createContact(tx, {
      tenantId: tenantB,
      organizationId: organizationB.id,
      fullName: "Tenant B contact",
      email: "b@example.test",
    });

    assert.equal(await findOrganization(tx, tenantA, organizationB.id), null);
    assert.equal(await findContact(tx, tenantA, contactB.id), null);
    assert.equal(await updateOrganization(tx, {
      tenantId: tenantA,
      organizationId: organizationB.id,
      name: "Should not update",
    }), null);
    assert.equal(await archiveContact(tx, tenantA, contactB.id), null);

    await client.query("savepoint cross_tenant_contact");
    try {
      await assert.rejects(
        createContact(tx, {
          tenantId: tenantA,
          organizationId: organizationB.id,
          fullName: "Invalid cross-tenant contact",
          email: "invalid@example.test",
        }),
        (error: { cause?: { code?: string }; code?: string }) => error.cause?.code === "23503" || error.code === "23503",
      );
    } finally {
      await client.query("rollback to savepoint cross_tenant_contact");
    }
  });
});

test("CRM RLS allows only active customer memberships and excludes platform/reviewer scopes", async () => {
  await withRollback(async (_tx, client) => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const customerA = randomUUID();
    await client.query(
      `insert into tenants (id, name, status) values ($1, 'CRM RLS A', 'active'), ($2, 'CRM RLS B', 'active')`,
      [tenantA, tenantB],
    );
    await client.query(
      `insert into users (id, auth_provider_user_id, status) values ($1, 'crm-rls-customer-a', 'active')`,
      [customerA],
    );
    await client.query(
      `insert into memberships (tenant_id, user_id, role, status) values ($1, $2, 'owner', 'active')`,
      [tenantA, customerA],
    );
    await client.query(
      `insert into organizations (id, tenant_id, name) values ($1, $2, 'CRM organization A'), ($3, $4, 'CRM organization B')`,
      [randomUUID(), tenantA, randomUUID(), tenantB],
    );
    const organizationIds = await client.query<{ id: string; tenant_id: string }>(
      `select id, tenant_id from organizations where tenant_id in ($1, $2) order by tenant_id`,
      [tenantA, tenantB],
    );

    await client.query("set local app.rls_test_mode = 'off'");
    await runWithDatabaseContext({ scope: "customer", subject: "crm-rls-customer-a", tenantId: tenantA }, async () => {
      const organizations = await client.query<{ tenant_id: string }>("select tenant_id from organizations");
      assert.deepEqual(organizations.rows.map((row) => row.tenant_id), [tenantA]);
      const contacts = await client.query("select id from contacts");
      assert.deepEqual(contacts.rows, []);

      await client.query("savepoint crm_cross_tenant_organization");
      try {
        await assert.rejects(
          client.query("insert into organizations (tenant_id, name) values ($1, 'Cross-tenant organization')", [tenantB]),
          (error: { code?: string }) => error.code === "42501",
        );
      } finally {
        await client.query("rollback to savepoint crm_cross_tenant_organization");
      }
    });
    await runWithDatabaseContext({ scope: "platform_admin", subject: "crm-rls-platform" }, async () => {
      assert.deepEqual((await client.query("select id from organizations")).rows, []);
      assert.deepEqual((await client.query("select id from contacts")).rows, []);
      await client.query("savepoint crm_platform_organization");
      try {
        await assert.rejects(
          client.query("insert into organizations (tenant_id, name) values ($1, 'Platform organization')", [tenantA]),
          (error: { code?: string }) => error.code === "42501",
        );
      } finally {
        await client.query("rollback to savepoint crm_platform_organization");
      }
    });
    await runWithDatabaseContext({ scope: "reviewer", subject: "crm-rls-reviewer", tenantId: tenantA }, async () => {
      assert.deepEqual((await client.query("select id from organizations")).rows, []);
      assert.deepEqual((await client.query("select id from contacts")).rows, []);
      await client.query("savepoint crm_reviewer_organization");
      try {
        await assert.rejects(
          client.query("insert into organizations (tenant_id, name) values ($1, 'Reviewer organization')", [tenantA]),
          (error: { code?: string }) => error.code === "42501",
        );
      } finally {
        await client.query("rollback to savepoint crm_reviewer_organization");
      }
    });

    assert.equal(organizationIds.rows.length, 2);
  });
});
