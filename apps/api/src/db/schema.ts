import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { generateWebsitePublicKey, WEBSITE_PUBLIC_KEY_PATTERN } from "../websites/websitePublicKey.js";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authProviderUserId: text("auth_provider_user_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: ["owner", "team_member"] }).notNull(),
    status: text("status", { enum: ["active", "invited", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userId] }),
    index("memberships_user_id_idx").on(table.userId),
    check("memberships_role_check", sql`${table.role} in ('owner', 'team_member')`),
    check(
      "memberships_status_check",
      sql`${table.status} in ('active', 'invited', 'disabled')`,
    ),
  ],
);

// A registered public website of exactly one tenant. New websites start disabled until activated.
export const websites = pgTable(
  "websites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    publicKey: text("public_key").notNull().unique().$defaultFn(generateWebsitePublicKey),
    status: text("status", { enum: ["active", "disabled"] }).notNull().default("disabled"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("websites_tenant_id_idx").on(table.tenantId),
    check("websites_status_check", sql`${table.status} in ('active', 'disabled')`),
    check("websites_public_key_check", sql`${table.publicKey} ~ ${sql.raw(`'${WEBSITE_PUBLIC_KEY_PATTERN}'`)}`),
  ],
);

// Minimal start: every lead begins as "new". Later statuses are added with their own migration.
export const leadStatuses = ["new"] as const;

// A lead always belongs to exactly one tenant; tenant_id is required and must reference an existing tenant.
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    message: text("message").notNull(),
    source: text("source").notNull(),
    status: text("status", { enum: leadStatuses }).notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("leads_tenant_id_idx").on(table.tenantId),
    check("leads_status_check", sql`${table.status} in ('new')`),
  ],
);

// Statusmodel uit de onboardingspecificatie (§3). Deze slice gebruikt alleen "draft"; "approved" zet alleen Westend.
export const onboardingProjectStatuses = ["draft", "submitted", "review_needed", "blocked", "approved"] as const;

// Eén onboardingtraject van een tenant. Een toekomstig websiteproject kan via (tenant_id, id) tenantveilig
// naar een onboardingproject verwijzen; daarvoor bestaat de samengestelde unieke sleutel hieronder.
export const onboardingProjects = pgTable(
  "onboarding_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    status: text("status", { enum: onboardingProjectStatuses }).notNull().default("draft"),
    // Laatst opgeslagen versienummer; basis voor optimistic concurrency.
    currentVersion: integer("current_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("onboarding_projects_tenant_id_id_unique").on(table.tenantId, table.id),
    // Maximaal één lopend onboardingproject per tenant.
    uniqueIndex("onboarding_projects_one_active_per_tenant")
      .on(table.tenantId)
      .where(sql`${table.status} <> 'approved'`),
    check("onboarding_projects_status_check", sql`${table.status} in ('draft', 'submitted', 'review_needed', 'blocked', 'approved')`),
    check("onboarding_projects_current_version_check", sql`${table.currentVersion} >= 1`),
  ],
);

// Onveranderlijke versies van de antwoorden plus de server-side gegenereerde Project Brief.
export const onboardingVersions = pgTable(
  "onboarding_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: uuid("project_id").notNull(),
    version: integer("version").notNull(),
    schemaId: text("schema_id").notNull(),
    schemaVersion: text("schema_version").notNull(),
    answers: jsonb("answers").notNull(),
    projectBrief: jsonb("project_brief").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Tenantveilig: een versie kan alleen bij een project van dezelfde tenant horen.
    foreignKey({
      name: "onboarding_versions_project_tenant_fk",
      columns: [table.tenantId, table.projectId],
      foreignColumns: [onboardingProjects.tenantId, onboardingProjects.id],
    }),
    unique("onboarding_versions_project_id_version_unique").on(table.projectId, table.version),
    check("onboarding_versions_version_check", sql`${table.version} >= 1`),
    check("onboarding_versions_answers_check", sql`jsonb_typeof(${table.answers}) = 'object'`),
    check("onboarding_versions_project_brief_check", sql`jsonb_typeof(${table.projectBrief}) = 'object'`),
  ],
);

// Server-side BFF sessions. Only the SHA-256 hash of the session ID and encrypted tokens are stored.
export const bffSessions = pgTable(
  "bff_sessions",
  {
    idHash: text("id_hash").primaryKey(),
    subject: text("subject").notNull(),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    idTokenEnc: text("id_token_enc"),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("bff_sessions_id_hash_check", sql`${table.idHash} ~ '^[0-9a-f]{64}$'`),
    // Encrypted values use the "v1.<iv>.<tag>.<ciphertext>" format from the dashboard crypto module.
    check("bff_sessions_access_token_enc_check", sql`${table.accessTokenEnc} like 'v1.%'`),
    check("bff_sessions_refresh_token_enc_check", sql`${table.refreshTokenEnc} like 'v1.%'`),
    check(
      "bff_sessions_id_token_enc_check",
      sql`${table.idTokenEnc} is null or ${table.idTokenEnc} like 'v1.%'`,
    ),
  ],
);
