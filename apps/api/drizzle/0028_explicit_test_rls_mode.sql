-- Keep the fixture-write policy only when the test migration connection
-- explicitly opts into RLS test mode. The database name alone is not enough.
-- Always remove the previous definition first so rerunning this migration is
-- deterministic and a stale policy can never survive without explicit mode.
DO $$
BEGIN
  DROP POLICY IF EXISTS users_privileged_write ON users;

  IF current_database() = 'conversion_engine_test'
    AND current_setting('app.rls_test_mode', true) = 'on'
  THEN
    EXECUTE $policy$
      CREATE POLICY users_privileged_write ON users
        FOR ALL
        USING (ce_rls_test_bypass())
        WITH CHECK (ce_rls_test_bypass())
    $policy$;
  END IF;
END
$$;
