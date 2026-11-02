import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { readCode, readConstraint } from "../errors.js";

type Db = NodePgDatabase<typeof schema>;

export type Organization = typeof schema.organizations.$inferSelect;
export type Contact = typeof schema.contacts.$inferSelect;

export class DuplicateContactEmailError extends Error {
  readonly code = "duplicate_contact_email";

  constructor() {
    super("duplicate_contact_email");
    this.name = "DuplicateContactEmailError";
  }
}

export class ContactNotFoundForOrganizationError extends Error {
  readonly code = "contact_not_found";

  constructor() {
    super("contact_not_found");
    this.name = "ContactNotFoundForOrganizationError";
  }
}

export class ContactAlreadyLinkedError extends Error {
  readonly code = "contact_already_linked";

  constructor() {
    super("contact_already_linked");
    this.name = "ContactAlreadyLinkedError";
  }
}

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

export type NewOrganizationInput = Omit<CreateOrganizationInput, "tenantId">;
export type NewContactInput = Omit<CreateContactInput, "tenantId" | "organizationId">;

export type CreateContactWithOrganizationInput = Readonly<{
  tenantId: string;
  contact: NewContactInput;
  organization: NewOrganizationInput;
}>;

export type CreateOrganizationWithContactInput = Readonly<{
  tenantId: string;
  organization: NewOrganizationInput;
  contactId?: string | null;
  contact?: NewContactInput | null;
}>;

export type ListOptions = Readonly<{ includeArchived?: boolean }>;

export type OrganizationContactRepository = Readonly<{
  listOrganizations: (tenantId: string, options?: ListOptions) => Promise<readonly Organization[]>;
  createOrganization: (input: CreateOrganizationInput) => Promise<Organization>;
  findOrganization: (tenantId: string, organizationId: string) => Promise<Organization | null>;
  updateOrganization: (input: UpdateOrganizationInput) => Promise<Organization | null>;
  archiveOrganization: (tenantId: string, organizationId: string) => Promise<Organization | null>;
  listContacts: (
    tenantId: string,
    options?: ListOptions & Readonly<{ organizationId?: string }>,
  ) => Promise<readonly Contact[]>;
  createContact: (input: CreateContactInput) => Promise<Contact>;
  createContactWithOrganization: (input: CreateContactWithOrganizationInput) => Promise<Readonly<{ contact: Contact; organization: Organization }>>;
  createOrganizationWithContact: (input: CreateOrganizationWithContactInput) => Promise<Readonly<{ organization: Organization; contact: Contact | null }>>;
  findContact: (tenantId: string, contactId: string) => Promise<Contact | null>;
  updateContact: (input: UpdateContactInput) => Promise<Contact | null>;
  archiveContact: (tenantId: string, contactId: string) => Promise<Contact | null>;
}>;

export function createOrganizationContactRepository(db: Db): OrganizationContactRepository {
  return {
    listOrganizations: (tenantId, options) => listOrganizations(db, tenantId, options),
    createOrganization: (input) => createOrganization(db, input),
    findOrganization: (tenantId, organizationId) => findOrganization(db, tenantId, organizationId),
    updateOrganization: (input) => updateOrganization(db, input),
    archiveOrganization: (tenantId, organizationId) => archiveOrganization(db, tenantId, organizationId),
    listContacts: (tenantId, options) => listContacts(db, tenantId, options),
    createContact: (input) => createContact(db, input),
    createContactWithOrganization: (input) => createContactWithOrganization(db, input),
    createOrganizationWithContact: (input) => createOrganizationWithContact(db, input),
    findContact: (tenantId, contactId) => findContact(db, tenantId, contactId),
    updateContact: (input) => updateContact(db, input),
    archiveContact: (tenantId, contactId) => archiveContact(db, tenantId, contactId),
  };
}

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

export async function createContactWithOrganization(
  db: Db,
  input: CreateContactWithOrganizationInput,
): Promise<Readonly<{ contact: Contact; organization: Organization }>> {
  return db.transaction(async (tx) => {
    const organization = await createOrganization(tx, {
      tenantId: input.tenantId,
      ...input.organization,
    });
    const contact = await createContact(tx, {
      tenantId: input.tenantId,
      organizationId: organization.id,
      ...input.contact,
    });
    return { organization, contact };
  });
}

export async function createOrganizationWithContact(
  db: Db,
  input: CreateOrganizationWithContactInput,
): Promise<Readonly<{ organization: Organization; contact: Contact | null }>> {
  return db.transaction(async (tx) => {
    const organization = await createOrganization(tx, {
      tenantId: input.tenantId,
      ...input.organization,
    });

    if (input.contact) {
      const contact = await createContact(tx, {
        tenantId: input.tenantId,
        organizationId: organization.id,
        ...input.contact,
      });
      return { organization, contact };
    }

    if (!input.contactId) return { organization, contact: null };

    const existingContact = await findContact(tx, input.tenantId, input.contactId);
    if (!existingContact || existingContact.status !== "active") {
      throw new ContactNotFoundForOrganizationError();
    }
    if (existingContact.organizationId) throw new ContactAlreadyLinkedError();

    const [contact] = await tx
      .update(schema.contacts)
      .set({ organizationId: organization.id, updatedAt: sql`now()` })
      .where(and(
        eq(schema.contacts.tenantId, input.tenantId),
        eq(schema.contacts.id, input.contactId),
        eq(schema.contacts.status, "active"),
        sql`${schema.contacts.organizationId} is null`,
      ))
      .returning();

    if (!contact) throw new ContactAlreadyLinkedError();
    return { organization, contact };
  });
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
  const email = normalizeContactEmail(input.email);
  const [contact] = await db
    .insert(schema.contacts)
    .values({
      tenantId: input.tenantId,
      organizationId: input.organizationId ?? null,
      fullName: input.fullName,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      email,
      phone: input.phone ?? null,
      function: input.function ?? null,
      notes: input.notes ?? null,
      communicationPreference: input.communicationPreference ?? null,
    })
    .onConflictDoNothing()
    .returning();

  if (!contact) throw new DuplicateContactEmailError();
  return contact;
}

/**
 * Resolves a tenant-scoped contact identity for lead intake. The unique index is
 * the final race-safe boundary; ON CONFLICT lets concurrent requests reuse the
 * same contact instead of creating a second one.
 */
export async function findOrCreateContactByEmail(
  db: Db,
  input: Readonly<{ tenantId: string; fullName: string; email: string; phone?: string | null }>,
): Promise<Contact> {
  const email = normalizeContactEmail(input.email);
  const [existing] = await findContactByNormalizedEmail(db, input.tenantId, email);
  if (existing) return reactivateContact(db, existing);

  const [created] = await db
    .insert(schema.contacts)
    .values({
      tenantId: input.tenantId,
      fullName: input.fullName,
      email,
      phone: input.phone ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [raced] = await findContactByEmail(db, input.tenantId, email);
  if (!raced) throw new Error("Contact identity resolution returned no row");
  return reactivateContact(db, raced);
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
    ...(input.email === undefined ? {} : { email: normalizeContactEmail(input.email) }),
    ...(input.phone === undefined ? {} : { phone: input.phone }),
    ...(input.function === undefined ? {} : { function: input.function }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    ...(input.communicationPreference === undefined
      ? {}
      : { communicationPreference: input.communicationPreference }),
    updatedAt: sql`now()`,
  };

  let contact: Contact | undefined;
  try {
    [contact] = await db
      .update(schema.contacts)
      .set(values)
      .where(and(
        eq(schema.contacts.tenantId, input.tenantId),
        eq(schema.contacts.id, input.contactId),
      ))
      .returning();
  } catch (error) {
    if (isContactEmailConflict(error)) throw new DuplicateContactEmailError();
    throw error;
  }

  return contact ?? null;
}

function normalizeContactEmail(email: string): string {
  return email.trim().toLowerCase();
}

function findContactByNormalizedEmail(db: Db, tenantId: string, email: string) {
  return db
    .select()
    .from(schema.contacts)
    .where(and(
      eq(schema.contacts.tenantId, tenantId),
      sql`lower(btrim(${schema.contacts.email})) = ${email}`,
    ))
    .limit(1);
}

function findContactByEmail(db: Db, tenantId: string, email: string) {
  return findContactByNormalizedEmail(db, tenantId, email);
}

async function reactivateContact(db: Db, contact: Contact): Promise<Contact> {
  if (contact.status === "active") return contact;
  const [reactivated] = await db
    .update(schema.contacts)
    .set({ status: "active", updatedAt: sql`now()` })
    .where(eq(schema.contacts.id, contact.id))
    .returning();
  return reactivated ?? contact;
}

function isContactEmailConflict(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined;
  return [error, cause].some((candidate) =>
    readCode(candidate) === "23505"
    && readConstraint(candidate) === "contacts_tenant_normalized_email_unique"
  );
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

