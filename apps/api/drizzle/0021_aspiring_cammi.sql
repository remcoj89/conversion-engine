ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_id_unique" UNIQUE("tenant_id","id");--> statement-breakpoint
CREATE TABLE "lead_assignments" (
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "lead_assignments_tenant_id_lead_id_user_id_pk" PRIMARY KEY("tenant_id","lead_id","user_id"),
	CONSTRAINT "lead_assignments_status_check" CHECK ("lead_assignments"."status" in ('active', 'revoked')),
	CONSTRAINT "lead_assignments_revoked_at_check" CHECK (("lead_assignments"."status" = 'active' and "lead_assignments"."revoked_at" is null) or ("lead_assignments"."status" = 'revoked' and "lead_assignments"."revoked_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_lead_tenant_fk" FOREIGN KEY ("tenant_id","lead_id") REFERENCES "public"."leads"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_user_membership_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."memberships"("tenant_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_assigned_by_membership_fk" FOREIGN KEY ("tenant_id","assigned_by") REFERENCES "public"."memberships"("tenant_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_assignments_active_user_idx" ON "lead_assignments" USING btree ("tenant_id","user_id") WHERE "lead_assignments"."status" = 'active';
