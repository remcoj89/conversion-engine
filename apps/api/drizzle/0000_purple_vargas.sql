-- gen_random_uuid() is ingebouwd vanaf PostgreSQL 13; pgcrypto alleen activeren op oudere servers.
DO $$
BEGIN
	IF current_setting('server_version_num')::int < 130000 THEN
		CREATE EXTENSION IF NOT EXISTS pgcrypto;
	END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
