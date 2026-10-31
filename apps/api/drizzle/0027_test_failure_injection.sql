-- Test-only failure injection for transaction rollback coverage.
-- This function is intentionally created only in the isolated test database.
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
        'onboarding_projects'
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
