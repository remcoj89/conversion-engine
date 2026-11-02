-- tenants_access read public.websites directly in its public branch. PostgreSQL checks the
-- table privileges of every relation in a policy expression for every role that evaluates the
-- policy, even when that branch can never match. Roles without SELECT on websites (such as
-- ce_maintenance) could therefore not touch tenants at all. The website lookup moves into a
-- SECURITY DEFINER helper that only returns the boolean decision; websites stays ungranted.
-- Existing migrations are immutable, so this is a forward-only replacement.
CREATE OR REPLACE FUNCTION public.ce_rls_public_website_tenant_allowed(target_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_scope() = 'public'
    AND EXISTS (
      SELECT 1
      FROM public.websites
      WHERE websites.tenant_id = target_tenant_id
        AND websites.public_key = ce_rls_website_public_key()
        AND websites.status = 'active'
    )
$$;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ce_owner') THEN
    ALTER FUNCTION public.ce_rls_public_website_tenant_allowed(uuid) OWNER TO ce_owner;
  END IF;

  REVOKE ALL ON FUNCTION public.ce_rls_public_website_tenant_allowed(uuid) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ce_api_runtime') THEN
    GRANT EXECUTE ON FUNCTION public.ce_rls_public_website_tenant_allowed(uuid) TO ce_api_runtime;
  END IF;
END
$$;
--> statement-breakpoint

DROP POLICY tenants_access ON tenants;
--> statement-breakpoint
CREATE POLICY tenants_access ON tenants
  FOR ALL
  USING (
    ce_rls_tenant_allowed(id)
    OR (
      status = 'active'
      AND ce_rls_public_website_tenant_allowed(id)
    )
  )
  WITH CHECK (ce_rls_platform_access());
