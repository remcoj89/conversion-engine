-- CRM settings are tenant-owned and contain only the validated, non-secret configuration contract.
CREATE TABLE "crm_settings" (
  "tenant_id" uuid PRIMARY KEY NOT NULL,
  "settings" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "crm_settings_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id"),
  CONSTRAINT "crm_settings_json_object_check" CHECK (jsonb_typeof("settings") = 'object')
);
--> statement-breakpoint

CREATE TABLE "crm_settings_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "settings" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "crm_settings_audit_events_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id"),
  CONSTRAINT "crm_settings_audit_events_actor_membership_fk" FOREIGN KEY ("tenant_id", "actor_user_id") REFERENCES "memberships"("tenant_id", "user_id"),
  CONSTRAINT "crm_settings_audit_events_type_check" CHECK ("event_type" in ('updated')),
  CONSTRAINT "crm_settings_audit_events_json_object_check" CHECK (jsonb_typeof("settings") = 'object')
);
--> statement-breakpoint

CREATE INDEX "crm_settings_audit_events_tenant_created_idx"
  ON "crm_settings_audit_events" USING btree ("tenant_id", "created_at");
--> statement-breakpoint

CREATE OR REPLACE FUNCTION ce_reject_crm_settings_audit_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'crm settings audit events are immutable';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER crm_settings_audit_events_immutable
  BEFORE UPDATE OR DELETE ON crm_settings_audit_events
  FOR EACH ROW EXECUTE FUNCTION ce_reject_crm_settings_audit_mutation();
--> statement-breakpoint

ALTER TABLE crm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY crm_settings_access ON crm_settings
  FOR ALL
  USING (ce_rls_crm_scope_allowed(tenant_id))
  WITH CHECK (ce_rls_crm_scope_allowed(tenant_id));
--> statement-breakpoint

ALTER TABLE crm_settings_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_settings_audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY crm_settings_audit_events_read_access ON crm_settings_audit_events
  FOR SELECT
  USING (ce_rls_crm_scope_allowed(tenant_id));
--> statement-breakpoint
CREATE POLICY crm_settings_audit_events_insert_access ON crm_settings_audit_events
  FOR INSERT
  WITH CHECK (
    ce_rls_crm_scope_allowed(tenant_id)
    AND actor_user_id = ce_rls_current_user_id()
  );
