-- Public tenant discovery must never use a tenant-bound customer/platform branch.
-- The public caller may resolve only an active tenant through its active website key.
-- Existing migrations remain immutable; this is a forward-only policy correction.
DROP POLICY IF EXISTS tenants_select_access ON public.tenants;
CREATE POLICY tenants_select_access ON public.tenants
  FOR SELECT
  USING (
    (
      ce_rls_scope() <> 'public'
      AND ce_rls_tenant_allowed(id)
    )
    OR (
      ce_rls_scope() = 'public'
      AND status = 'active'
      AND ce_rls_public_website_tenant_allowed(id)
      AND ce_rls_public_tenant_active(id)
    )
  );
