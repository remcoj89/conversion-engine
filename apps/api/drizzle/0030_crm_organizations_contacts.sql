-- CRM-1a: tenant-bound organizations and contacts.
-- CRM content is visible only to an active customer membership in its own tenant.
-- Platform Admin and reviewer contexts remain deliberately excluded.
CREATE TABLE "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "kvk_number" text,
  "website" text,
  "general_email" text,
  "general_phone" text,
  "address" text,
  "industry" text,
  "notes" text,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "organizations_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id"),
  CONSTRAINT "organizations_name_not_blank_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "organizations_status_check" CHECK ("status" in ('active', 'archived')),
  CONSTRAINT "organizations_tenant_id_unique" UNIQUE ("tenant_id", "id")
);
--> statement-breakpoint
CREATE INDEX "organizations_tenant_status_idx" ON "organizations" USING btree ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX "organizations_tenant_name_idx" ON "organizations" USING btree ("tenant_id", "name");
--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_tenant_kvk_unique" ON "organizations" USING btree ("tenant_id", "kvk_number") WHERE "organizations"."kvk_number" is not null;
--> statement-breakpoint

CREATE TABLE "contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "organization_id" uuid,
  "full_name" text NOT NULL,
  "first_name" text,
  "last_name" text,
  "email" text NOT NULL,
  "phone" text,
  "function" text,
  "notes" text,
  "communication_preference" text,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "contacts_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id"),
  CONSTRAINT "contacts_organization_tenant_fk" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id"),
  CONSTRAINT "contacts_full_name_not_blank_check" CHECK (length(btrim("full_name")) > 0),
  CONSTRAINT "contacts_email_not_blank_check" CHECK (length(btrim("email")) > 0),
  CONSTRAINT "contacts_status_check" CHECK ("status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE INDEX "contacts_tenant_status_idx" ON "contacts" USING btree ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX "contacts_tenant_name_idx" ON "contacts" USING btree ("tenant_id", "full_name");
--> statement-breakpoint
CREATE INDEX "contacts_tenant_email_idx" ON "contacts" USING btree ("tenant_id", "email");
--> statement-breakpoint
CREATE INDEX "contacts_organization_idx" ON "contacts" USING btree ("tenant_id", "organization_id");
--> statement-breakpoint

CREATE OR REPLACE FUNCTION ce_rls_crm_scope_allowed(target_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_test_bypass()
    OR (
      ce_rls_scope() = 'maintenance'
      AND session_user = 'ce_maintenance'
    )
    OR (
      ce_rls_scope() = 'customer'
      AND target_tenant_id::text = coalesce(current_setting('app.rls_tenant_id', true), '')
      AND EXISTS (
        SELECT 1
        FROM public.memberships
        WHERE memberships.tenant_id = target_tenant_id
          AND memberships.user_id = ce_rls_current_user_id()
          AND memberships.status = 'active'
      )
    )
$$;
--> statement-breakpoint

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_access ON organizations
  FOR ALL
  USING (ce_rls_crm_scope_allowed(tenant_id))
  WITH CHECK (ce_rls_crm_scope_allowed(tenant_id));
--> statement-breakpoint

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY contacts_access ON contacts
  FOR ALL
  USING (ce_rls_crm_scope_allowed(tenant_id))
  WITH CHECK (ce_rls_crm_scope_allowed(tenant_id));
