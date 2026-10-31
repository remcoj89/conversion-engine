-- RLS hardening: the fixture write policy is test-only and maintenance access
-- requires the dedicated database principal. Existing migrations are immutable.
DO $$
BEGIN
  IF current_database() = 'conversion_engine_test' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'users'
        AND policyname = 'users_privileged_write'
    ) THEN
      EXECUTE $policy$
        CREATE POLICY users_privileged_write ON users
          FOR ALL
          USING (ce_rls_test_bypass())
          WITH CHECK (ce_rls_test_bypass())
      $policy$;
    END IF;
  ELSE
    DROP POLICY IF EXISTS users_privileged_write ON users;
  END IF;
END
$$;
--> statement-breakpoint

-- SECURITY DEFINER functions evaluate current_user as their owner. session_user
-- is used here because maintenance is expected to connect as ce_maintenance;
-- no runtime role may SET ROLE to that principal.
CREATE OR REPLACE FUNCTION ce_rls_platform_access() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_test_bypass()
    OR (
      ce_rls_scope() = 'maintenance'
      AND session_user = 'ce_maintenance'
    )
    OR (
      ce_rls_scope() = 'platform_admin'
      AND EXISTS (
        SELECT 1
        FROM public.platform_admin_assignments
        WHERE platform_admin_assignments.user_id = ce_rls_current_user_id()
          AND platform_admin_assignments.permission = 'platform_admin'
          AND platform_admin_assignments.status = 'active'
      )
    )
$$;
--> statement-breakpoint

DROP POLICY users_access ON users;
--> statement-breakpoint
CREATE POLICY users_access ON users
  FOR SELECT
  USING (
    ce_rls_test_bypass()
    OR ce_rls_scope() = 'platform_admin'
    OR (ce_rls_scope() = 'maintenance' AND current_user = 'ce_maintenance')
    OR auth_provider_user_id = ce_rls_subject()
  );
--> statement-breakpoint

DROP POLICY platform_admin_assignments_access ON platform_admin_assignments;
--> statement-breakpoint
CREATE POLICY platform_admin_assignments_access ON platform_admin_assignments
  FOR ALL
  USING (
    ce_rls_test_bypass()
    OR ce_rls_scope() = 'platform_admin'
    OR (ce_rls_scope() = 'maintenance' AND current_user = 'ce_maintenance')
    OR (
      ce_rls_scope() = 'identity'
      AND user_id = ce_rls_current_user_id()
    )
  )
  WITH CHECK (
    ce_rls_test_bypass()
    OR ce_rls_scope() = 'platform_admin'
    OR (ce_rls_scope() = 'maintenance' AND current_user = 'ce_maintenance')
  );
