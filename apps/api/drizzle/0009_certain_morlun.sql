CREATE TABLE "onboarding_reviewer_assignments" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"granted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "onboarding_reviewer_assignments_tenant_id_user_id_pk" PRIMARY KEY("tenant_id","user_id"),
	CONSTRAINT "onboarding_reviewer_assignments_status_check" CHECK ("onboarding_reviewer_assignments"."status" in ('active', 'revoked')),
	CONSTRAINT "onboarding_reviewer_assignments_revoked_at_check" CHECK (("onboarding_reviewer_assignments"."status" = 'active' and "onboarding_reviewer_assignments"."revoked_at" is null) or ("onboarding_reviewer_assignments"."status" = 'revoked' and "onboarding_reviewer_assignments"."revoked_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "onboarding_reviewer_assignments" ADD CONSTRAINT "onboarding_reviewer_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_reviewer_assignments" ADD CONSTRAINT "onboarding_reviewer_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_reviewer_assignments" ADD CONSTRAINT "onboarding_reviewer_assignments_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_reviewer_assignments_active_user_idx" ON "onboarding_reviewer_assignments" USING btree ("user_id") WHERE "onboarding_reviewer_assignments"."status" = 'active';