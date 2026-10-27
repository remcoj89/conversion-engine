-- Handwritten (drizzle-kit generate --custom): drizzle-kit would offer drop + create for the actor
-- column, which loses the actor of existing events. Renaming keeps every existing submitted event
-- and its tenant-safe membership FK intact, and never updates audit rows (the immutability trigger
-- stays enabled throughout).
ALTER TABLE "onboarding_audit_events" RENAME COLUMN "actor_user_id" TO "member_user_id";--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" RENAME CONSTRAINT "onboarding_audit_events_actor_user_id_users_id_fk" TO "onboarding_audit_events_member_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" RENAME CONSTRAINT "onboarding_audit_events_actor_membership_fk" TO "onboarding_audit_events_member_membership_fk";--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ALTER COLUMN "member_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ADD COLUMN "reviewer_user_id" uuid;--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ADD COLUMN "version" integer;--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ADD CONSTRAINT "onboarding_audit_events_reviewer_assignment_fk" FOREIGN KEY ("tenant_id","reviewer_user_id") REFERENCES "public"."onboarding_reviewer_assignments"("tenant_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" DROP CONSTRAINT "onboarding_audit_events_event_type_check";--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ADD CONSTRAINT "onboarding_audit_events_event_type_check" CHECK ("onboarding_audit_events"."event_type" in ('submitted', 'review_requested'));--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ADD CONSTRAINT "onboarding_audit_events_version_check" CHECK ("onboarding_audit_events"."version" is null or "onboarding_audit_events"."version" >= 1);--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ADD CONSTRAINT "onboarding_audit_events_one_actor_check" CHECK (num_nonnulls("onboarding_audit_events"."member_user_id", "onboarding_audit_events"."reviewer_user_id") = 1);--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ADD CONSTRAINT "onboarding_audit_events_actor_kind_check" CHECK (("onboarding_audit_events"."event_type" = 'submitted' and "onboarding_audit_events"."member_user_id" is not null) or ("onboarding_audit_events"."event_type" = 'review_requested' and "onboarding_audit_events"."reviewer_user_id" is not null));--> statement-breakpoint
ALTER TABLE "onboarding_audit_events" ADD CONSTRAINT "onboarding_audit_events_review_requested_check" CHECK ("onboarding_audit_events"."event_type" <> 'review_requested' or ("onboarding_audit_events"."from_status" = 'submitted' and "onboarding_audit_events"."to_status" = 'review_needed' and "onboarding_audit_events"."version" is not null));--> statement-breakpoint
CREATE TABLE "onboarding_review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"reason_code" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_review_requests_version_check" CHECK ("onboarding_review_requests"."version" >= 1),
	CONSTRAINT "onboarding_review_requests_reason_code_check" CHECK ("onboarding_review_requests"."reason_code" in ('missing_information', 'rights_unclear', 'out_of_scope')),
	CONSTRAINT "onboarding_review_requests_note_not_blank_check" CHECK (char_length(btrim("onboarding_review_requests"."note")) > 0),
	CONSTRAINT "onboarding_review_requests_note_length_check" CHECK (char_length("onboarding_review_requests"."note") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "onboarding_review_requests" ADD CONSTRAINT "onboarding_review_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_review_requests" ADD CONSTRAINT "onboarding_review_requests_project_tenant_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."onboarding_projects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_review_requests" ADD CONSTRAINT "onboarding_review_requests_reviewer_assignment_fk" FOREIGN KEY ("tenant_id","reviewer_user_id") REFERENCES "public"."onboarding_reviewer_assignments"("tenant_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_review_requests_tenant_project_idx" ON "onboarding_review_requests" USING btree ("tenant_id","project_id");
