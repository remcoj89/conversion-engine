CREATE TABLE "websites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"public_key" text NOT NULL,
	"status" text DEFAULT 'disabled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "websites_public_key_unique" UNIQUE("public_key"),
	CONSTRAINT "websites_status_check" CHECK ("websites"."status" in ('active', 'disabled')),
	CONSTRAINT "websites_public_key_check" CHECK ("websites"."public_key" ~ '^site_[A-Za-z0-9_-]{32}$')
);
--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "websites_tenant_id_idx" ON "websites" USING btree ("tenant_id");