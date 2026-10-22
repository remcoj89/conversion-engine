CREATE TABLE "bff_sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"id_token_enc" text,
	"access_expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bff_sessions_id_hash_check" CHECK ("bff_sessions"."id_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "bff_sessions_access_token_enc_check" CHECK ("bff_sessions"."access_token_enc" like 'v1.%'),
	CONSTRAINT "bff_sessions_refresh_token_enc_check" CHECK ("bff_sessions"."refresh_token_enc" like 'v1.%'),
	CONSTRAINT "bff_sessions_id_token_enc_check" CHECK ("bff_sessions"."id_token_enc" is null or "bff_sessions"."id_token_enc" like 'v1.%')
);
