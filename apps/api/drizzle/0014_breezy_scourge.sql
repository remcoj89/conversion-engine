CREATE TABLE "onboarding_review_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"version" integer NOT NULL,
	"reason_code" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_review_actions_action_check" CHECK ("onboarding_review_actions"."action" in ('blocked', 'unblocked')),
	CONSTRAINT "onboarding_review_actions_reason_code_check" CHECK (("onboarding_review_actions"."action" = 'blocked' and "onboarding_review_actions"."reason_code" in ('critical_basis_missing', 'rights_not_cleared', 'requires_extra_work')) or ("onboarding_review_actions"."action" = 'unblocked' and "onboarding_review_actions"."reason_code" in ('basis_provided', 'rights_cleared', 'extra_work_agreed'))),
	CONSTRAINT "onboarding_review_actions_version_check" CHECK ("onboarding_review_actions"."version" >= 1),
	CONSTRAINT "onboarding_review_actions_note_not_blank_check" CHECK (char_length(btrim("onboarding_review_actions"."note")) > 0),
	CONSTRAINT "onboarding_review_actions_note_length_check" CHECK (char_length("onboarding_review_actions"."note") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" DROP CONSTRAINT "onboarding_audit_events_event_type_check";--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" DROP CONSTRAINT "onboarding_audit_events_actor_kind_check";--> statement-breakpoint
ALTER TABLE "onboarding_review_actions" ADD CONSTRAINT "onboarding_review_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_review_actions" ADD CONSTRAINT "onboarding_review_actions_project_tenant_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."onboarding_projects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_review_actions" ADD CONSTRAINT "onboarding_review_actions_reviewer_assignment_fk" FOREIGN KEY ("tenant_id","reviewer_user_id") REFERENCES "public"."onboarding_reviewer_assignments"("tenant_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_review_actions" ADD CONSTRAINT "onboarding_review_actions_project_version_fk" FOREIGN KEY ("project_id","version") REFERENCES "public"."onboarding_versions"("project_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_review_actions_tenant_project_idx" ON "onboarding_review_actions" USING btree ("tenant_id","project_id");--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ADD CONSTRAINT "onboarding_audit_events_blocked_check" CHECK ("onboarding_audit_events"."event_type" <> 'blocked' or ("onboarding_audit_events"."from_status" is not null and "onboarding_audit_events"."from_status" = 'submitted' and "onboarding_audit_events"."to_status" = 'blocked' and "onboarding_audit_events"."version" is not null));--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ADD CONSTRAINT "onboarding_audit_events_unblocked_check" CHECK ("onboarding_audit_events"."event_type" <> 'unblocked' or ("onboarding_audit_events"."from_status" is not null and "onboarding_audit_events"."from_status" = 'blocked' and "onboarding_audit_events"."to_status" = 'review_needed' and "onboarding_audit_events"."version" is not null));--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ADD CONSTRAINT "onboarding_audit_events_event_type_check" CHECK ("onboarding_audit_events"."event_type" in ('submitted', 'review_requested', 'resubmitted', 'blocked', 'unblocked'));--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ADD CONSTRAINT "onboarding_audit_events_actor_kind_check" CHECK (("onboarding_audit_events"."event_type" in ('submitted', 'resubmitted') and "onboarding_audit_events"."member_user_id" is not null) or ("onboarding_audit_events"."event_type" in ('review_requested', 'blocked', 'unblocked') and "onboarding_audit_events"."reviewer_user_id" is not null));