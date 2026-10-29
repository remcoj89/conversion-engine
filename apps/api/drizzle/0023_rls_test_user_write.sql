-- The local test harness creates fixture users before it switches RLS test mode off.
-- This policy is deliberately limited to the exact test database and its startup setting.
CREATE POLICY users_privileged_write ON users
  FOR ALL
  USING (ce_rls_test_bypass())
  WITH CHECK (ce_rls_test_bypass());
