CREATE TABLE "tenant_owner_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "tenant_owner_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "tenant_owner_invitations_status_check" CHECK ("tenant_owner_invitations"."status" in ('pending', 'accepted', 'revoked', 'expired')),
	CONSTRAINT "tenant_owner_invitations_token_hash_check" CHECK ("tenant_owner_invitations"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "tenant_owner_invitations_terminal_fields_check" CHECK ((
        ("tenant_owner_invitations"."status" in ('pending', 'expired') and "tenant_owner_invitations"."accepted_at" is null and "tenant_owner_invitations"."accepted_by" is null and "tenant_owner_invitations"."revoked_at" is null)
        or ("tenant_owner_invitations"."status" = 'accepted' and "tenant_owner_invitations"."accepted_at" is not null and "tenant_owner_invitations"."accepted_by" is not null and "tenant_owner_invitations"."revoked_at" is null)
        or ("tenant_owner_invitations"."status" = 'revoked' and "tenant_owner_invitations"."accepted_at" is null and "tenant_owner_invitations"."accepted_by" is null and "tenant_owner_invitations"."revoked_at" is not null)
      ))
);
--> statement-breakpoint
ALTER TABLE "tenant_owner_invitations" ADD CONSTRAINT "tenant_owner_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_owner_invitations" ADD CONSTRAINT "tenant_owner_invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_owner_invitations" ADD CONSTRAINT "tenant_owner_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_owner_invitations_tenant_status_idx" ON "tenant_owner_invitations" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_owner_invitations_one_pending_per_tenant" ON "tenant_owner_invitations" USING btree ("tenant_id") WHERE "tenant_owner_invitations"."status" = 'pending';