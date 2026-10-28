CREATE TABLE "platform_admin_assignments" (
	"user_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"granted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "platform_admin_assignments_user_id_permission_pk" PRIMARY KEY("user_id","permission"),
	CONSTRAINT "platform_admin_assignments_permission_check" CHECK ("platform_admin_assignments"."permission" in ('platform_admin')),
	CONSTRAINT "platform_admin_assignments_status_check" CHECK ("platform_admin_assignments"."status" in ('active', 'revoked')),
	CONSTRAINT "platform_admin_assignments_revoked_at_check" CHECK (("platform_admin_assignments"."status" = 'active' and "platform_admin_assignments"."revoked_at" is null) or ("platform_admin_assignments"."status" = 'revoked' and "platform_admin_assignments"."revoked_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_admin_assignments" ADD CONSTRAINT "platform_admin_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admin_assignments" ADD CONSTRAINT "platform_admin_assignments_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_admin_assignments_active_user_idx" ON "platform_admin_assignments" USING btree ("user_id") WHERE "platform_admin_assignments"."status" = 'active';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'disabled'));