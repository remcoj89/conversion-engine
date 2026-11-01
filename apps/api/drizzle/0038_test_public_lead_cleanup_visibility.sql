-- Test-only maintenance visibility for public-lead fixture cleanup.
-- The cleanup role needs to see the rows selected by its tenant/website filters;
-- production receives none of these policies.
DO $$
BEGIN
  DROP POLICY IF EXISTS ce_test_tenants_cleanup_select ON public.tenants;
  DROP POLICY IF EXISTS ce_test_websites_cleanup_select ON public.websites;
  DROP POLICY IF EXISTS ce_test_contacts_cleanup_select ON public.contacts;
  DROP POLICY IF EXISTS ce_test_leads_cleanup_select ON public.leads;
  DROP POLICY IF EXISTS ce_test_public_lead_idempotency_cleanup_select
    ON public.public_lead_idempotency_keys;
  DROP POLICY IF EXISTS ce_test_public_lead_rate_limit_cleanup_select
    ON public.public_lead_rate_limits;
  DROP POLICY IF EXISTS ce_test_public_lead_outbox_cleanup_select
    ON public.public_lead_outbox;

  IF current_database() = 'conversion_engine_test' THEN
    CREATE POLICY ce_test_tenants_cleanup_select ON public.tenants
      FOR SELECT
      USING (session_user = 'ce_maintenance' AND ce_rls_test_bypass());
    CREATE POLICY ce_test_websites_cleanup_select ON public.websites
      FOR SELECT
      USING (session_user = 'ce_maintenance' AND ce_rls_test_bypass());
    CREATE POLICY ce_test_contacts_cleanup_select ON public.contacts
      FOR SELECT
      USING (session_user = 'ce_maintenance' AND ce_rls_test_bypass());
    CREATE POLICY ce_test_leads_cleanup_select ON public.leads
      FOR SELECT
      USING (session_user = 'ce_maintenance' AND ce_rls_test_bypass());
    CREATE POLICY ce_test_public_lead_idempotency_cleanup_select
      ON public.public_lead_idempotency_keys
      FOR SELECT
      USING (session_user = 'ce_maintenance' AND ce_rls_test_bypass());
    CREATE POLICY ce_test_public_lead_rate_limit_cleanup_select
      ON public.public_lead_rate_limits
      FOR SELECT
      USING (session_user = 'ce_maintenance' AND ce_rls_test_bypass());
    CREATE POLICY ce_test_public_lead_outbox_cleanup_select
      ON public.public_lead_outbox
      FOR SELECT
      USING (session_user = 'ce_maintenance' AND ce_rls_test_bypass());
  END IF;
END
$$;
