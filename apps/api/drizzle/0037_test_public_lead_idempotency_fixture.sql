-- Allow only the RLS fixture to seed idempotency rows in the isolated test DB.
-- The production public INSERT policy remains unchanged and continues to require
-- the active public website context.
DO $$
BEGIN
  IF current_database() = 'conversion_engine_test' THEN
    DROP POLICY IF EXISTS ce_test_public_lead_idempotency_fixture_insert
      ON public.public_lead_idempotency_keys;

    CREATE POLICY ce_test_public_lead_idempotency_fixture_insert
      ON public.public_lead_idempotency_keys
      FOR INSERT
      WITH CHECK (ce_rls_test_bypass());

    DROP POLICY IF EXISTS ce_test_public_lead_outbox_observer
      ON public.public_lead_outbox;

    CREATE POLICY ce_test_public_lead_outbox_observer
      ON public.public_lead_outbox
      FOR SELECT
      USING (ce_rls_test_bypass());
  END IF;
END
$$;
