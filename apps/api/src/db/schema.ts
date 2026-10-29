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

export const tenantStatuses = ["pending", "active", "disabled"] as const;

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  disabledBy: uuid("disabled_by").references(() => users.id),
  purgeAfterAt: timestamp("purge_after_at", { withTimezone: true }),
}, (table) => [
  index("tenants_status_idx").on(table.status),
  check("tenants_status_check", sql`${table.status} in ('pending', 'active', 'disabled')`),
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authProviderUserId: text("auth_provider_user_id").notNull().unique(),
  status: text("status", { enum: ["active", "disabled"] })
    .notNull()
    .default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  check("users_status_check", sql`${table.status} in ('active', 'disabled')`),
]);

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

export const tenantInvitationStatuses = ["pending", "accepted", "revoked", "expired"] as const;

// A tenant owner invitation is a one-time bearer credential. Only the SHA-256 digest of the
// opaque token is persisted; the plaintext token exists only while the create response is built.
export const tenantOwnerInvitations = pgTable(
  "tenant_owner_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    status: text("status", { enum: tenantInvitationStatuses }).notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("tenant_owner_invitations_tenant_status_idx").on(table.tenantId, table.status),
    uniqueIndex("tenant_owner_invitations_one_pending_per_tenant")
      .on(table.tenantId)
      .where(sql`${table.status} = 'pending'`),
    check(
      "tenant_owner_invitations_status_check",
      sql`${table.status} in ('pending', 'accepted', 'revoked', 'expired')`,
    ),
    check(
      "tenant_owner_invitations_token_hash_check",
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "tenant_owner_invitations_terminal_fields_check",
      sql`(
        (${table.status} in ('pending', 'expired') and ${table.acceptedAt} is null and ${table.acceptedBy} is null and ${table.revokedAt} is null)
        or (${table.status} = 'accepted' and ${table.acceptedAt} is not null and ${table.acceptedBy} is not null and ${table.revokedAt} is null)
        or (${table.status} = 'revoked' and ${table.acceptedAt} is null and ${table.acceptedBy} is null and ${table.revokedAt} is not null)
      )`,
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
    // Allows tenant-safe foreign keys from assignment records. The lead id is globally unique,
    // but the composite key keeps the tenant boundary explicit in the relational model.
    unique("leads_tenant_id_id_unique").on(table.tenantId, table.id),
    check("leads_status_check", sql`${table.status} in ('new')`),
  ],
);

export const leadAssignmentStatuses = ["active", "revoked"] as const;

// A lead is visible to a team member only through an active assignment. Owners can read all
// leads in their tenant; assignments remain traceable after revocation.
export const leadAssignments = pgTable(
  "lead_assignments",
  {
    tenantId: uuid("tenant_id").notNull(),
    leadId: uuid("lead_id").notNull(),
    userId: uuid("user_id").notNull(),
    assignedBy: uuid("assigned_by").notNull(),
    status: text("status", { enum: leadAssignmentStatuses }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.leadId, table.userId] }),
    foreignKey({
      name: "lead_assignments_lead_tenant_fk",
      columns: [table.tenantId, table.leadId],
      foreignColumns: [leads.tenantId, leads.id],
    }),
    foreignKey({
      name: "lead_assignments_user_membership_fk",
      columns: [table.tenantId, table.userId],
      foreignColumns: [memberships.tenantId, memberships.userId],
    }),
    foreignKey({
      name: "lead_assignments_assigned_by_membership_fk",
      columns: [table.tenantId, table.assignedBy],
      foreignColumns: [memberships.tenantId, memberships.userId],
    }),
    index("lead_assignments_active_user_idx")
      .on(table.tenantId, table.userId)
      .where(sql`${table.status} = 'active'`),
    check(
      "lead_assignments_status_check",
      sql`${table.status} in ('active', 'revoked')`,
    ),
    check(
      "lead_assignments_revoked_at_check",
      sql`(${table.status} = 'active' and ${table.revokedAt} is null) or (${table.status} = 'revoked' and ${table.revokedAt} is not null)`,
    ),
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

export const reviewerAssignmentStatuses = ["active", "revoked"] as const;

// Explicit, per-tenant permission for a Westend reviewer to review that tenant's onboarding.
// Deliberately separate from memberships: a reviewer is not part of the client's team and gets
// no client permissions. Assignments are revoked, never deleted, so they stay traceable.
export const onboardingReviewerAssignments = pgTable(
  "onboarding_reviewer_assignments",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status", { enum: reviewerAssignmentStatuses }).notNull().default("active"),
    // Who granted the assignment; required so every grant is traceable to a person.
    grantedBy: uuid("granted_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userId] }),
    // Reviewer lookups start from the authenticated user and only need active assignments.
    index("onboarding_reviewer_assignments_active_user_idx").on(table.userId).where(sql`${table.status} = 'active'`),
    check("onboarding_reviewer_assignments_status_check", sql`${table.status} in ('active', 'revoked')`),
    // revoked_at is set exactly when the assignment is revoked.
    check(
      "onboarding_reviewer_assignments_revoked_at_check",
      sql`(${table.status} = 'active' and ${table.revokedAt} is null) or (${table.status} = 'revoked' and ${table.revokedAt} is not null)`,
    ),
  ],
);

export const platformAdminAssignmentPermissions = ["platform_admin"] as const;
export const platformAdminAssignmentStatuses = ["active", "revoked"] as const;

// Platform-wide rights are deliberately separate from tenant memberships and reviewer assignments.
// Revoked rows remain available for auditability and are never treated as active access.
export const platformAdminAssignments = pgTable(
  "platform_admin_assignments",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    permission: text("permission", { enum: platformAdminAssignmentPermissions }).notNull(),
    status: text("status", { enum: platformAdminAssignmentStatuses }).notNull().default("active"),
    grantedBy: uuid("granted_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.permission] }),
    index("platform_admin_assignments_active_user_idx")
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    check(
      "platform_admin_assignments_permission_check",
      sql`${table.permission} in ('platform_admin')`,
    ),
    check(
      "platform_admin_assignments_status_check",
      sql`${table.status} in ('active', 'revoked')`,
    ),
    check(
      "platform_admin_assignments_revoked_at_check",
      sql`(${table.status} = 'active' and ${table.revokedAt} is null) or (${table.status} = 'revoked' and ${table.revokedAt} is not null)`,
    ),
  ],
);

// Event types and their transitions are enforced per type by the check constraints below.
export const onboardingAuditEventTypes = ["submitted", "review_requested", "resubmitted", "blocked", "unblocked", "approved", "reopened"] as const;

// Onveranderlijk auditlog van statusovergangen. Bevat bewust geen antwoorden, Project Brief-inhoud
// of reviewnotities, alleen wie (actor), waar (tenant + project), wat (eventtype) en de statusovergang.
// Een databasetrigger in migratie 0007 weigert UPDATE en DELETE.
// Migration 0010 renamed actor_user_id to member_user_id and added the reviewer actor and version;
// migration 0011 ties a non-null version to an existing onboarding version.
export const onboardingAuditEvents = pgTable(
  "onboarding_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: uuid("project_id").notNull(),
    // Exactly one actor per event: a client member or a Westend reviewer, each tenant-safe.
    memberUserId: uuid("member_user_id").references(() => users.id),
    reviewerUserId: uuid("reviewer_user_id"),
    eventType: text("event_type", { enum: onboardingAuditEventTypes }).notNull(),
    // Null als het project in dezelfde transactie is aangemaakt en er dus geen vorige status was.
    fromStatus: text("from_status", { enum: onboardingProjectStatuses }),
    toStatus: text("to_status", { enum: onboardingProjectStatuses }).notNull(),
    // Project version the event refers to. Nullable only for submitted events written before 0010.
    version: integer("version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Tenantveilig: een event kan alleen naar een project van dezelfde tenant verwijzen.
    foreignKey({
      name: "onboarding_audit_events_project_tenant_fk",
      columns: [table.tenantId, table.projectId],
      foreignColumns: [onboardingProjects.tenantId, onboardingProjects.id],
    }),
    // Tenant-safe member actor: a membership in the same tenant as the event.
    foreignKey({
      name: "onboarding_audit_events_member_membership_fk",
      columns: [table.tenantId, table.memberUserId],
      foreignColumns: [memberships.tenantId, memberships.userId],
    }),
    // Tenant-safe reviewer actor: a reviewer assignment for the same tenant as the event.
    foreignKey({
      name: "onboarding_audit_events_reviewer_assignment_fk",
      columns: [table.tenantId, table.reviewerUserId],
      foreignColumns: [onboardingReviewerAssignments.tenantId, onboardingReviewerAssignments.userId],
    }),
    // A non-null version must exist for this project. NULL (legacy submitted events) is not checked.
    foreignKey({
      name: "onboarding_audit_events_project_version_fk",
      columns: [table.projectId, table.version],
      foreignColumns: [onboardingVersions.projectId, onboardingVersions.version],
    }),
    index("onboarding_audit_events_tenant_project_idx").on(table.tenantId, table.projectId),
    check(
      "onboarding_audit_events_event_type_check",
      sql`${table.eventType} in ('submitted', 'review_requested', 'resubmitted', 'blocked', 'unblocked', 'approved', 'reopened')`,
    ),
    check(
      "onboarding_audit_events_from_status_check",
      sql`${table.fromStatus} is null or ${table.fromStatus} in ('draft', 'submitted', 'review_needed', 'blocked', 'approved')`,
    ),
    check("onboarding_audit_events_to_status_check", sql`${table.toStatus} in ('draft', 'submitted', 'review_needed', 'blocked', 'approved')`),
    check("onboarding_audit_events_version_check", sql`${table.version} is null or ${table.version} >= 1`),
    check("onboarding_audit_events_one_actor_check", sql`num_nonnulls(${table.memberUserId}, ${table.reviewerUserId}) = 1`),
    // Each event type has a fixed kind of actor: clients (re)submit; reviewers request changes, block, unblock,
    // approve and reopen.
    check(
      "onboarding_audit_events_actor_kind_check",
      sql`(${table.eventType} in ('submitted', 'resubmitted') and ${table.memberUserId} is not null) or (${table.eventType} in ('review_requested', 'blocked', 'unblocked', 'approved', 'reopened') and ${table.reviewerUserId} is not null)`,
    ),
    // Een submitted-event beschrijft altijd een overgang naar "submitted".
    check("onboarding_audit_events_submitted_check", sql`${table.eventType} <> 'submitted' or ${table.toStatus} = 'submitted'`),
    // Indienen kan alleen vanuit een concept, of zonder vorige status als de submit het project aanmaakt.
    check(
      "onboarding_audit_events_submitted_from_status_check",
      sql`${table.eventType} <> 'submitted' or ${table.fromStatus} is null or ${table.fromStatus} = 'draft'`,
    ),
    // A change request always moves a submitted onboarding to review_needed, for a known version.
    // The explicit "is not null" matters: a NULL comparison would make the check pass instead of fail.
    check(
      "onboarding_audit_events_review_requested_check",
      sql`${table.eventType} <> 'review_requested' or (${table.fromStatus} is not null and ${table.fromStatus} = 'submitted' and ${table.toStatus} = 'review_needed' and ${table.version} is not null)`,
    ),
    // A resubmission always moves review_needed back to submitted, for a known version. The explicit
    // "is not null" matters: a NULL comparison would make the check pass instead of fail.
    check(
      "onboarding_audit_events_resubmitted_check",
      sql`${table.eventType} <> 'resubmitted' or (${table.fromStatus} is not null and ${table.fromStatus} = 'review_needed' and ${table.toStatus} = 'submitted' and ${table.version} is not null)`,
    ),
    // Blocking only happens on a submitted onboarding; the explicit "is not null" keeps NULL from passing.
    check(
      "onboarding_audit_events_blocked_check",
      sql`${table.eventType} <> 'blocked' or (${table.fromStatus} is not null and ${table.fromStatus} = 'submitted' and ${table.toStatus} = 'blocked' and ${table.version} is not null)`,
    ),
    // Lifting a block always returns the onboarding to review_needed for the Owner to add information.
    check(
      "onboarding_audit_events_unblocked_check",
      sql`${table.eventType} <> 'unblocked' or (${table.fromStatus} is not null and ${table.fromStatus} = 'blocked' and ${table.toStatus} = 'review_needed' and ${table.version} is not null)`,
    ),
    // Approval only happens on the submitted version; the explicit "is not null" keeps NULL from passing.
    check(
      "onboarding_audit_events_approved_check",
      sql`${table.eventType} <> 'approved' or (${table.fromStatus} is not null and ${table.fromStatus} = 'submitted' and ${table.toStatus} = 'approved' and ${table.version} is not null)`,
    ),
    // A controlled reopen always returns an approved onboarding to review_needed; the approval stays in the log.
    check(
      "onboarding_audit_events_reopened_check",
      sql`${table.eventType} <> 'reopened' or (${table.fromStatus} is not null and ${table.fromStatus} = 'approved' and ${table.toStatus} = 'review_needed' and ${table.version} is not null)`,
    ),
  ],
);

export const reviewRequestReasonCodes = ["missing_information", "rights_unclear", "out_of_scope"] as const;

// Upper bound for a reviewer note: room for a clear request, not a document.
export const REVIEW_NOTE_MAX_LENGTH = 2000;

// A reviewer's request to complete or clarify a submitted onboarding. Holds the note for the client;
// the note is kept out of the audit log because free text may contain client content.
export const onboardingReviewRequests = pgTable(
  "onboarding_review_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: uuid("project_id").notNull(),
    reviewerUserId: uuid("reviewer_user_id").notNull(),
    // Project version the reviewer looked at.
    version: integer("version").notNull(),
    reasonCode: text("reason_code", { enum: reviewRequestReasonCodes }).notNull(),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Tenant-safe: the request belongs to a project of the same tenant.
    foreignKey({
      name: "onboarding_review_requests_project_tenant_fk",
      columns: [table.tenantId, table.projectId],
      foreignColumns: [onboardingProjects.tenantId, onboardingProjects.id],
    }),
    // Tenant-safe: the reviewer is assigned to the same tenant.
    foreignKey({
      name: "onboarding_review_requests_reviewer_assignment_fk",
      columns: [table.tenantId, table.reviewerUserId],
      foreignColumns: [onboardingReviewerAssignments.tenantId, onboardingReviewerAssignments.userId],
    }),
    // The reviewed version must exist for this project.
    foreignKey({
      name: "onboarding_review_requests_project_version_fk",
      columns: [table.projectId, table.version],
      foreignColumns: [onboardingVersions.projectId, onboardingVersions.version],
    }),
    index("onboarding_review_requests_tenant_project_idx").on(table.tenantId, table.projectId),
    check("onboarding_review_requests_version_check", sql`${table.version} >= 1`),
    check(
      "onboarding_review_requests_reason_code_check",
      sql`${table.reasonCode} in ('missing_information', 'rights_unclear', 'out_of_scope')`,
    ),
    check("onboarding_review_requests_note_not_blank_check", sql`char_length(btrim(${table.note})) > 0`),
    check("onboarding_review_requests_note_length_check", sql`char_length(${table.note}) <= ${sql.raw(String(REVIEW_NOTE_MAX_LENGTH))}`),
  ],
);

export const reviewActionTypes = ["blocked", "unblocked", "reopened"] as const;
// Why a reviewer blocks a submitted onboarding: a critical basis is missing that the client cannot simply add.
export const blockReasonCodes = ["critical_basis_missing", "rights_not_cleared", "requires_extra_work"] as const;
// Why a reviewer lifts a block again; each mirrors one of the block reasons.
export const unblockReasonCodes = ["basis_provided", "rights_cleared", "extra_work_agreed"] as const;
// Why a reviewer reopens an approved onboarding: a material change needs a new review.
export const reopenReasonCodes = ["material_input_change", "rights_or_asset_change", "scope_or_strategy_change"] as const;

// A reviewer's block, unblock or reopen decision with its reason and note. Kept apart from review requests, which
// are the client-facing change requests; the free-text note stays out of the audit log.
export const onboardingReviewActions = pgTable(
  "onboarding_review_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: uuid("project_id").notNull(),
    reviewerUserId: uuid("reviewer_user_id").notNull(),
    action: text("action", { enum: reviewActionTypes }).notNull(),
    // Project version the decision refers to (these actions create no new version).
    version: integer("version").notNull(),
    reasonCode: text("reason_code").notNull(),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Tenant-safe: the action belongs to a project of the same tenant.
    foreignKey({
      name: "onboarding_review_actions_project_tenant_fk",
      columns: [table.tenantId, table.projectId],
      foreignColumns: [onboardingProjects.tenantId, onboardingProjects.id],
    }),
    // Tenant-safe: the reviewer is assigned to the same tenant.
    foreignKey({
      name: "onboarding_review_actions_reviewer_assignment_fk",
      columns: [table.tenantId, table.reviewerUserId],
      foreignColumns: [onboardingReviewerAssignments.tenantId, onboardingReviewerAssignments.userId],
    }),
    // The version must exist for this project.
    foreignKey({
      name: "onboarding_review_actions_project_version_fk",
      columns: [table.projectId, table.version],
      foreignColumns: [onboardingVersions.projectId, onboardingVersions.version],
    }),
    index("onboarding_review_actions_tenant_project_idx").on(table.tenantId, table.projectId),
    check("onboarding_review_actions_action_check", sql`${table.action} in ('blocked', 'unblocked', 'reopened')`),
    // Each action has its own reason codes, so reasons of different actions cannot be mixed up.
    check(
      "onboarding_review_actions_reason_code_check",
      sql`(${table.action} = 'blocked' and ${table.reasonCode} in ('critical_basis_missing', 'rights_not_cleared', 'requires_extra_work')) or (${table.action} = 'unblocked' and ${table.reasonCode} in ('basis_provided', 'rights_cleared', 'extra_work_agreed')) or (${table.action} = 'reopened' and ${table.reasonCode} in ('material_input_change', 'rights_or_asset_change', 'scope_or_strategy_change'))`,
    ),
    check("onboarding_review_actions_version_check", sql`${table.version} >= 1`),
    check("onboarding_review_actions_note_not_blank_check", sql`char_length(btrim(${table.note})) > 0`),
    check("onboarding_review_actions_note_length_check", sql`char_length(${table.note}) <= ${sql.raw(String(REVIEW_NOTE_MAX_LENGTH))}`),
  ],
);

export const reviewAccessEventPurposes = ["onboarding_review"] as const;
export const reviewAccessEventActions = ["read_onboarding_content"] as const;

// Immutable, content-free access log for reviewer reads. The event is written only after the
// current reviewable version has been read successfully, in the same transaction.
export const onboardingReviewAccessEvents = pgTable(
  "onboarding_review_access_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    reviewerUserId: uuid("reviewer_user_id").notNull(),
    projectId: uuid("project_id").notNull(),
    version: integer("version").notNull(),
    purpose: text("purpose", { enum: reviewAccessEventPurposes }).notNull(),
    action: text("action", { enum: reviewAccessEventActions }).notNull(),
    requestOrCorrelationId: text("request_or_correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The project and reviewer assignment must belong to the event's tenant.
    foreignKey({
      name: "onboarding_review_access_events_project_tenant_fk",
      columns: [table.tenantId, table.projectId],
      foreignColumns: [onboardingProjects.tenantId, onboardingProjects.id],
    }),
    foreignKey({
      name: "onboarding_review_access_events_reviewer_assignment_fk",
      columns: [table.tenantId, table.reviewerUserId],
      foreignColumns: [onboardingReviewerAssignments.tenantId, onboardingReviewerAssignments.userId],
    }),
    // The referenced version must belong to the referenced project. The project FK above supplies
    // the tenant boundary because onboarding_versions keys are project-scoped.
    foreignKey({
      name: "onboarding_review_access_events_project_version_fk",
      columns: [table.projectId, table.version],
      foreignColumns: [onboardingVersions.projectId, onboardingVersions.version],
    }),
    index("onboarding_review_access_events_tenant_project_idx").on(table.tenantId, table.projectId),
    check("onboarding_review_access_events_version_check", sql`${table.version} >= 1`),
    check(
      "onboarding_review_access_events_purpose_check",
      sql`${table.purpose} in ('onboarding_review')`,
    ),
    check(
      "onboarding_review_access_events_action_check",
      sql`${table.action} in ('read_onboarding_content')`,
    ),
    check(
      "onboarding_review_access_events_request_id_check",
      sql`char_length(btrim(${table.requestOrCorrelationId})) > 0 and char_length(${table.requestOrCorrelationId}) <= 255`,
    ),
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
