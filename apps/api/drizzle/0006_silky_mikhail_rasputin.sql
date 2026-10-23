CREATE TABLE "onboarding_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_projects_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "onboarding_projects_status_check" CHECK ("onboarding_projects"."status" in ('draft', 'submitted', 'review_needed', 'blocked', 'approved')),
	CONSTRAINT "onboarding_projects_current_version_check" CHECK ("onboarding_projects"."current_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "onboarding_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"schema_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"answers" jsonb NOT NULL,
	"project_brief" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_versions_project_id_version_unique" UNIQUE("project_id","version"),
	CONSTRAINT "onboarding_versions_version_check" CHECK ("onboarding_versions"."version" >= 1),
	CONSTRAINT "onboarding_versions_answers_check" CHECK (jsonb_typeof("onboarding_versions"."answers") = 'object'),
	CONSTRAINT "onboarding_versions_project_brief_check" CHECK (jsonb_typeof("onboarding_versions"."project_brief") = 'object')
);
--> statement-breakpoint
ALTER TABLE "onboarding_projects" ADD CONSTRAINT "onboarding_projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_versions" ADD CONSTRAINT "onboarding_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_versions" ADD CONSTRAINT "onboarding_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_versions" ADD CONSTRAINT "onboarding_versions_project_tenant_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."onboarding_projects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_projects_one_active_per_tenant" ON "onboarding_projects" USING btree ("tenant_id") WHERE "onboarding_projects"."status" <> 'approved';