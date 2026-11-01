CREATE TABLE "public_tenant_access" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"is_active" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "public_tenant_access" ADD CONSTRAINT "public_tenant_access_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Public website policies need the tenant's active state, but querying tenants from
-- the website policy would recurse through the public tenant policy. This internal
-- resolver table is maintained by a SECURITY DEFINER trigger and is not granted to
-- any runtime role.
-- The short, transactional RLS pause is required only to backfill existing tenants:
-- the migration role is not allowed to bypass FORCE RLS. No other session can observe
-- the intermediate state because ALTER TABLE holds an AccessExclusive lock.
ALTER TABLE public.tenants DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
INSERT INTO public.public_tenant_access (tenant_id, is_active)
SELECT id, status = 'active'
FROM public.tenants
ON CONFLICT (tenant_id) DO UPDATE
SET is_active = EXCLUDED.is_active,
    updated_at = now();
--> statement-breakpoint
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.ce_sync_public_tenant_access() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.public_tenant_access WHERE tenant_id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.public_tenant_access (tenant_id, is_active, updated_at)
  VALUES (NEW.id, NEW.status = 'active', now())
  ON CONFLICT (tenant_id) DO UPDATE
  SET is_active = EXCLUDED.is_active,
      updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ce_sync_public_tenant_access ON public.tenants;
CREATE TRIGGER ce_sync_public_tenant_access
AFTER INSERT OR UPDATE OF status OR DELETE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.ce_sync_public_tenant_access();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.ce_rls_public_tenant_active(target_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_scope() = 'public'
    AND target_tenant_id::text = coalesce(current_setting('app.rls_tenant_id', true), '')
    AND EXISTS (
      SELECT 1
      FROM public.public_tenant_access
      WHERE public_tenant_access.tenant_id = target_tenant_id
        AND public_tenant_access.is_active
    )
$$;
--> statement-breakpoint

-- Runtime roles never receive direct access to the resolver table. The bootstrap
-- script transfers ownership to ce_owner and keeps this helper in its function allowlist.
