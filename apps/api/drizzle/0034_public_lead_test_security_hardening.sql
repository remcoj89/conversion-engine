-- Public lead test hardening.
-- This migration keeps 0032/0033 immutable and removes a public-policy cycle
-- that becomes recursive under FORCE ROW LEVEL SECURITY.

DROP POLICY IF EXISTS websites_access ON websites;
CREATE POLICY websites_access ON websites
  FOR ALL
  USING (
    ce_rls_tenant_allowed(tenant_id)
    OR (
      ce_rls_scope() = 'public'
      AND status = 'active'
      AND public_key = ce_rls_website_public_key()
      AND (
        coalesce(current_setting('app.rls_tenant_id', true), '') = ''
        OR ce_rls_public_tenant_active(tenant_id)
      )
    )
  )
  WITH CHECK (ce_rls_tenant_allowed(tenant_id));
--> statement-breakpoint

-- The failure helper exists only in conversion_engine_test. The public lead
-- repository uses the same rollback mechanism as the other DB repositories.
DO $$
BEGIN
  IF current_database() = 'conversion_engine_test' THEN
    CREATE OR REPLACE FUNCTION public.ce_test_add_forced_failure(target_table text) RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $function$
    BEGIN
      IF target_table NOT IN (
        'onboarding_audit_events',
        'onboarding_review_requests',
        'onboarding_review_actions',
        'onboarding_projects',
        'leads'
      ) THEN
        RAISE EXCEPTION 'unsupported test failure table: %', target_table
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT test_forced_failure CHECK (false) NOT VALID',
        target_table
      );
    END;
    $function$;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ce_owner') THEN
      ALTER FUNCTION public.ce_test_add_forced_failure(text) OWNER TO ce_owner;
    END IF;

    REVOKE ALL ON FUNCTION public.ce_test_add_forced_failure(text) FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ce_api_runtime') THEN
      GRANT EXECUTE ON FUNCTION public.ce_test_add_forced_failure(text) TO ce_api_runtime;
    END IF;
  ELSE
    DROP FUNCTION IF EXISTS public.ce_test_add_forced_failure(text);
  END IF;
END
$$;
--> statement-breakpoint

-- Only the isolated test database gets a maintenance cleanup path. The
-- maintenance role remains subject to RLS and the production database gets
-- neither these policies nor the corresponding table grants.
DO $$
BEGIN
  DROP POLICY IF EXISTS ce_test_public_lead_idempotency_cleanup ON public_lead_idempotency_keys;
  DROP POLICY IF EXISTS ce_test_public_lead_rate_limit_cleanup ON public_lead_rate_limits;
  DROP POLICY IF EXISTS ce_test_public_lead_outbox_cleanup ON public_lead_outbox;
  DROP POLICY IF EXISTS ce_test_contacts_cleanup ON contacts;

  IF current_database() = 'conversion_engine_test' THEN
    CREATE POLICY ce_test_public_lead_idempotency_cleanup ON public_lead_idempotency_keys
      FOR DELETE
      USING (session_user = 'ce_maintenance' AND ce_rls_test_bypass());
    CREATE POLICY ce_test_public_lead_rate_limit_cleanup ON public_lead_rate_limits
      FOR DELETE
      USING (session_user = 'ce_maintenance' AND ce_rls_test_bypass());
    CREATE POLICY ce_test_public_lead_outbox_cleanup ON public_lead_outbox
      FOR DELETE
      USING (session_user = 'ce_maintenance' AND ce_rls_test_bypass());
    CREATE POLICY ce_test_contacts_cleanup ON contacts
      FOR DELETE
      USING (session_user = 'ce_maintenance' AND ce_rls_test_bypass());
  END IF;
END
$$;
