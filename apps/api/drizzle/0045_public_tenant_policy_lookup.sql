-- Public tenant lookup already requires an active tenant row and an active website
-- key. Do not call the tenant-context resolver here: a key-only lookup intentionally
-- has no app.rls_tenant_id yet.
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
    )
  );
