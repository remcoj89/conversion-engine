-- The RLS fixture creates tenant-owned audit rows before a user subject exists.
-- Keep the production actor binding unchanged and add the fixture bypass only to
-- the isolated test database. ce_rls_test_bypass() itself requires both the
-- conversion_engine_test database and app.rls_test_mode = 'on'.
DO $$
BEGIN
  IF current_database() = 'conversion_engine_test' THEN
    DROP POLICY IF EXISTS crm_settings_audit_events_insert_access
      ON public.crm_settings_audit_events;

    CREATE POLICY crm_settings_audit_events_insert_access
      ON public.crm_settings_audit_events
      FOR INSERT
      WITH CHECK (
        ce_rls_crm_scope_allowed(tenant_id)
        AND (
          actor_user_id = ce_rls_current_user_id()
          OR ce_rls_test_bypass()
        )
      );
  END IF;
END
$$;
