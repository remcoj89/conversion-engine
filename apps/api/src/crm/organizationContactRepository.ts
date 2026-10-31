import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

type Db = NodePgDatabase<typeof schema>;

export type Organization = typeof schema.organizations.$inferSelect;
export type Contact = typeof schema.contacts.$inferSelect;

export type CreateOrganizationInput = Readonly<{
  tenantId: string;
  name: string;
  kvkNumber?: string | null;
  website?: string | null;
  generalEmail?: string | null;
  generalPhone?: string | null;
  address?: string | null;
  industry?: string | null;
  notes?: string | null;
}>;

export type UpdateOrganizationInput = Readonly<{
  tenantId: string;
  organizationId: string;
  name?: string;
  kvkNumber?: string | null;
  website?: string | null;
  generalEmail?: string | null;
  generalPhone?: string | null;
  address?: string | null;
  industry?: string | null;
  notes?: string | null;
}>;

export type CreateContactInput = Readonly<{
  tenantId: string;
  organizationId?: string | null;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  phone?: string | null;
  function?: string | null;
  notes?: string | null;
  communicationPreference?: string | null;
}>;

export type UpdateContactInput = Readonly<{
  tenantId: string;
  contactId: string;
  organizationId?: string | null;
  fullName?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
  phone?: string | null;
  function?: string | null;
  notes?: string | null;
  communicationPreference?: string | null;
}>;

export type ListOptions = Readonly<{ includeArchived?: boolean }>;

export async function createOrganization(db: Db, input: CreateOrganizationInput): Promise<Organization> {
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      tenantId: input.tenantId,
      name: input.name,
      kvkNumber: input.kvkNumber ?? null,
      website: input.website ?? null,
      generalEmail: input.generalEmail ?? null,
      generalPhone: input.generalPhone ?? null,
      address: input.address ?? null,
      industry: input.industry ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  if (!organization) throw new Error("Organization insert returned no row");
  return organization;
}

export async function listOrganizations(
  db: Db,
  tenantId: string,
  options: ListOptions = {},
): Promise<readonly Organization[]> {
  const conditions = [eq(schema.organizations.tenantId, tenantId)];
  if (!options.includeArchived) conditions.push(eq(schema.organizations.status, "active"));

  return db
    .select()
    .from(schema.organizations)
    .where(and(...conditions))
    .orderBy(asc(schema.organizations.name), asc(schema.organizations.id));
}

export async function findOrganization(
  db: Db,
  tenantId: string,
  organizationId: string,
): Promise<Organization | null> {
  const [organization] = await db
    .select()
    .from(schema.organizations)
    .where(and(
      eq(schema.organizations.tenantId, tenantId),
      eq(schema.organizations.id, organizationId),
    ))
    .limit(1);

  return organization ?? null;
}

export async function updateOrganization(
  db: Db,
  input: UpdateOrganizationInput,
): Promise<Organization | null> {
  const values = {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.kvkNumber === undefined ? {} : { kvkNumber: input.kvkNumber }),
    ...(input.website === undefined ? {} : { website: input.website }),
    ...(input.generalEmail === undefined ? {} : { generalEmail: input.generalEmail }),
    ...(input.generalPhone === undefined ? {} : { generalPhone: input.generalPhone }),
    ...(input.address === undefined ? {} : { address: input.address }),
    ...(input.industry === undefined ? {} : { industry: input.industry }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    updatedAt: sql`now()`,
  };

  const [organization] = await db
    .update(schema.organizations)
    .set(values)
    .where(and(
      eq(schema.organizations.tenantId, input.tenantId),
      eq(schema.organizations.id, input.organizationId),
    ))
    .returning();

  return organization ?? null;
}

export async function archiveOrganization(
  db: Db,
  tenantId: string,
  organizationId: string,
): Promise<Organization | null> {
  const [organization] = await db
    .update(schema.organizations)
    .set({ status: "archived", updatedAt: sql`now()` })
    .where(and(
      eq(schema.organizations.tenantId, tenantId),
      eq(schema.organizations.id, organizationId),
    ))
    .returning();

  return organization ?? null;
}

export async function createContact(db: Db, input: CreateContactInput): Promise<Contact> {
  const [contact] = await db
    .insert(schema.contacts)
    .values({
      tenantId: input.tenantId,
      organizationId: input.organizationId ?? null,
      fullName: input.fullName,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      email: input.email,
      phone: input.phone ?? null,
      function: input.function ?? null,
      notes: input.notes ?? null,
      communicationPreference: input.communicationPreference ?? null,
    })
    .returning();

  if (!contact) throw new Error("Contact insert returned no row");
  return contact;
}

export async function listContacts(
  db: Db,
  tenantId: string,
  options: ListOptions & Readonly<{ organizationId?: string }> = {},
): Promise<readonly Contact[]> {
  const conditions = [eq(schema.contacts.tenantId, tenantId)];
  if (!options.includeArchived) conditions.push(eq(schema.contacts.status, "active"));
  if (options.organizationId) conditions.push(eq(schema.contacts.organizationId, options.organizationId));

  return db
    .select()
    .from(schema.contacts)
    .where(and(...conditions))
    .orderBy(asc(schema.contacts.fullName), asc(schema.contacts.id));
}

export async function findContact(
  db: Db,
  tenantId: string,
  contactId: string,
): Promise<Contact | null> {
  const [contact] = await db
    .select()
    .from(schema.contacts)
    .where(and(
      eq(schema.contacts.tenantId, tenantId),
      eq(schema.contacts.id, contactId),
    ))
    .limit(1);

  return contact ?? null;
}

export async function updateContact(
  db: Db,
  input: UpdateContactInput,
): Promise<Contact | null> {
  const values = {
    ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
    ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
    ...(input.firstName === undefined ? {} : { firstName: input.firstName }),
    ...(input.lastName === undefined ? {} : { lastName: input.lastName }),
    ...(input.email === undefined ? {} : { email: input.email }),
    ...(input.phone === undefined ? {} : { phone: input.phone }),
    ...(input.function === undefined ? {} : { function: input.function }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    ...(input.communicationPreference === undefined
      ? {}
      : { communicationPreference: input.communicationPreference }),
    updatedAt: sql`now()`,
  };

  const [contact] = await db
    .update(schema.contacts)
    .set(values)
    .where(and(
      eq(schema.contacts.tenantId, input.tenantId),
      eq(schema.contacts.id, input.contactId),
    ))
    .returning();

  return contact ?? null;
}

export async function archiveContact(
  db: Db,
  tenantId: string,
  contactId: string,
): Promise<Contact | null> {
  const [contact] = await db
    .update(schema.contacts)
    .set({ status: "archived", updatedAt: sql`now()` })
    .where(and(
      eq(schema.contacts.tenantId, tenantId),
      eq(schema.contacts.id, contactId),
    ))
    .returning();

  return contact ?? null;
}

