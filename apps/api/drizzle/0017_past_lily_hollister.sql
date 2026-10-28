CREATE TABLE "onboarding_review_access_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"purpose" text NOT NULL,
	"action" text NOT NULL,
	"request_or_correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_review_access_events_version_check" CHECK ("onboarding_review_access_events"."version" >= 1),
	CONSTRAINT "onboarding_review_access_events_purpose_check" CHECK ("onboarding_review_access_events"."purpose" in ('onboarding_review')),
	CONSTRAINT "onboarding_review_access_events_action_check" CHECK ("onboarding_review_access_events"."action" in ('read_onboarding_content')),
	CONSTRAINT "onboarding_review_access_events_request_id_check" CHECK (char_length(btrim("onboarding_review_access_events"."request_or_correlation_id")) > 0 and char_length("onboarding_review_access_events"."request_or_correlation_id") <= 255)
);
--> statement-breakpoint
ALTER TABLE "onboarding_review_access_events" ADD CONSTRAINT "onboarding_review_access_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_review_access_events" ADD CONSTRAINT "onboarding_review_access_events_project_tenant_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."onboarding_projects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_review_access_events" ADD CONSTRAINT "onboarding_review_access_events_reviewer_assignment_fk" FOREIGN KEY ("tenant_id","reviewer_user_id") REFERENCES "public"."onboarding_reviewer_assignments"("tenant_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_review_access_events" ADD CONSTRAINT "onboarding_review_access_events_project_version_fk" FOREIGN KEY ("project_id","version") REFERENCES "public"."onboarding_versions"("project_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_review_access_events_tenant_project_idx" ON "onboarding_review_access_events" USING btree ("tenant_id","project_id");
--> statement-breakpoint
-- Drizzle does not model triggers; access events are append-only by database design.
CREATE FUNCTION "onboarding_review_access_events_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'onboarding_review_access_events is append-only' USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "onboarding_review_access_events_no_update_delete" BEFORE UPDATE OR DELETE ON "onboarding_review_access_events" FOR EACH ROW EXECUTE FUNCTION "onboarding_review_access_events_immutable"();
