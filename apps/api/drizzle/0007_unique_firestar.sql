CREATE TABLE "onboarding_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_audit_events_event_type_check" CHECK ("onboarding_audit_events"."event_type" in ('submitted')),
	CONSTRAINT "onboarding_audit_events_from_status_check" CHECK ("onboarding_audit_events"."from_status" is null or "onboarding_audit_events"."from_status" in ('draft', 'submitted', 'review_needed', 'blocked', 'approved')),
	CONSTRAINT "onboarding_audit_events_to_status_check" CHECK ("onboarding_audit_events"."to_status" in ('draft', 'submitted', 'review_needed', 'blocked', 'approved')),
	CONSTRAINT "onboarding_audit_events_submitted_check" CHECK ("onboarding_audit_events"."event_type" <> 'submitted' or "onboarding_audit_events"."to_status" = 'submitted')
);
--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ADD CONSTRAINT "onboarding_audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ADD CONSTRAINT "onboarding_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ADD CONSTRAINT "onboarding_audit_events_project_tenant_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."onboarding_projects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_audit_events_tenant_project_idx" ON "onboarding_audit_events" USING btree ("tenant_id","project_id");--> statement-breakpoint
-- Handmatig toegevoegd (Drizzle modelleert geen triggers): auditevents zijn onveranderlijk.
CREATE FUNCTION "onboarding_audit_events_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'onboarding_audit_events is append-only' USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "onboarding_audit_events_no_update_delete" BEFORE UPDATE OR DELETE ON "onboarding_audit_events" FOR EACH ROW EXECUTE FUNCTION "onboarding_audit_events_immutable"();
