-- Tenant isolation is enforced in the database as a second authorization boundary.
-- The API sets these transaction-local settings for every query. The test-only bypass is
-- restricted to the local conversion_engine_test database and is never enabled elsewhere.
CREATE OR REPLACE FUNCTION ce_rls_scope() RETURNS text
LANGUAGE sql STABLE
AS $$ SELECT coalesce(current_setting('app.rls_scope', true), '') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ce_rls_subject() RETURNS text
LANGUAGE sql STABLE
AS $$ SELECT coalesce(current_setting('app.rls_subject', true), '') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ce_rls_invitation_token_hash() RETURNS text
LANGUAGE sql STABLE
AS $$ SELECT coalesce(current_setting('app.rls_invitation_token_hash', true), '') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ce_rls_test_bypass() RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT current_database() = 'conversion_engine_test'
    AND coalesce(current_setting('app.rls_test_mode', true), '') = 'on'
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ce_rls_current_user_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT users.id
  FROM public.users
  WHERE users.auth_provider_user_id = ce_rls_subject()
    AND users.status = 'active'
  LIMIT 1
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ce_rls_platform_access() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_test_bypass()
    OR (
      ce_rls_scope() = 'maintenance'
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
CREATE OR REPLACE FUNCTION ce_rls_tenant_allowed(target_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_platform_access()
    OR (
      ce_rls_scope() IN ('customer', 'reviewer')
      AND target_tenant_id::text = coalesce(current_setting('app.rls_tenant_id', true), '')
    )
    OR (
      ce_rls_scope() = 'identity'
      AND (
        EXISTS (
          SELECT 1
          FROM public.memberships
          WHERE memberships.tenant_id = target_tenant_id
            AND memberships.user_id = ce_rls_current_user_id()
            AND memberships.status = 'active'
        )
        OR EXISTS (
          SELECT 1
          FROM public.onboarding_reviewer_assignments
          WHERE onboarding_reviewer_assignments.tenant_id = target_tenant_id
            AND onboarding_reviewer_assignments.user_id = ce_rls_current_user_id()
            AND onboarding_reviewer_assignments.status = 'active'
        )
      )
    )
    OR (
      ce_rls_scope() = 'identity_only'
      AND EXISTS (
        SELECT 1
        FROM public.tenant_owner_invitations
        WHERE tenant_owner_invitations.tenant_id = target_tenant_id
          AND tenant_owner_invitations.token_hash = ce_rls_invitation_token_hash()
          AND tenant_owner_invitations.status = 'pending'
      )
    )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ce_rls_customer_can_read_lead(target_tenant_id uuid, target_lead_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_platform_access()
    OR ce_rls_scope() <> 'customer'
    OR EXISTS (
      SELECT 1
      FROM public.memberships
      WHERE memberships.tenant_id = target_tenant_id
        AND memberships.user_id = ce_rls_current_user_id()
        AND memberships.role = 'owner'
        AND memberships.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.lead_assignments
      WHERE lead_assignments.tenant_id = target_tenant_id
        AND lead_assignments.lead_id = target_lead_id
        AND lead_assignments.user_id = ce_rls_current_user_id()
        AND lead_assignments.status = 'active'
    )
$$;
--> statement-breakpoint

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_owner_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_owner_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE websites FORCE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads FORCE ROW LEVEL SECURITY;
ALTER TABLE lead_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_projects FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding_reviewer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_reviewer_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_admin_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admin_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding_review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_review_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding_review_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_review_actions FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding_review_access_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_review_access_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenants_access ON tenants
  FOR ALL
  USING (ce_rls_tenant_allowed(id))
  WITH CHECK (ce_rls_platform_access());
--> statement-breakpoint
CREATE POLICY users_access ON users
  FOR SELECT
  USING (
    ce_rls_test_bypass()
    OR ce_rls_scope() IN ('platform_admin', 'maintenance')
    OR auth_provider_user_id = ce_rls_subject()
  );
--> statement-breakpoint
CREATE POLICY users_identity_only_insert ON users
  FOR INSERT
  WITH CHECK (ce_rls_scope() = 'identity_only' AND auth_provider_user_id = ce_rls_subject());
--> statement-breakpoint
CREATE POLICY users_identity_only_update ON users
  FOR UPDATE
  USING (ce_rls_scope() = 'identity_only' AND id = ce_rls_current_user_id())
  WITH CHECK (ce_rls_scope() = 'identity_only' AND id = ce_rls_current_user_id());
--> statement-breakpoint
CREATE POLICY memberships_access ON memberships
  FOR ALL
  USING (
    ce_rls_platform_access()
    OR (
      ce_rls_scope() = 'identity'
      AND user_id = ce_rls_current_user_id()
    )
    OR (
      ce_rls_scope() IN ('customer', 'reviewer')
      AND ce_rls_tenant_allowed(tenant_id)
    )
    OR (
      ce_rls_scope() = 'identity_only'
      AND ce_rls_tenant_allowed(tenant_id)
      AND user_id = ce_rls_current_user_id()
    )
  )
  WITH CHECK (
    ce_rls_platform_access()
    OR (
      ce_rls_scope() = 'identity_only'
      AND ce_rls_tenant_allowed(tenant_id)
      AND user_id = ce_rls_current_user_id()
    )
    OR (
      ce_rls_scope() IN ('customer', 'reviewer')
      AND ce_rls_tenant_allowed(tenant_id)
    )
  );
--> statement-breakpoint
CREATE POLICY tenant_owner_invitations_access ON tenant_owner_invitations
  FOR ALL
  USING (
    ce_rls_platform_access()
    OR (
      ce_rls_scope() = 'identity_only'
      AND token_hash = ce_rls_invitation_token_hash()
    )
  )
  WITH CHECK (ce_rls_platform_access());
--> statement-breakpoint
CREATE POLICY websites_access ON websites
  FOR ALL
  USING (ce_rls_tenant_allowed(tenant_id))
  WITH CHECK (ce_rls_tenant_allowed(tenant_id));
--> statement-breakpoint
CREATE POLICY leads_read_access ON leads
  FOR SELECT
  USING (ce_rls_tenant_allowed(tenant_id) AND ce_rls_customer_can_read_lead(tenant_id, id));
--> statement-breakpoint
CREATE POLICY leads_write_access ON leads
  FOR INSERT
  WITH CHECK (ce_rls_tenant_allowed(tenant_id));
--> statement-breakpoint
CREATE POLICY leads_update_access ON leads
  FOR UPDATE
  USING (ce_rls_tenant_allowed(tenant_id) AND ce_rls_customer_can_read_lead(tenant_id, id))
  WITH CHECK (ce_rls_tenant_allowed(tenant_id));
--> statement-breakpoint
CREATE POLICY leads_delete_access ON leads
  FOR DELETE
  USING (ce_rls_tenant_allowed(tenant_id) AND ce_rls_customer_can_read_lead(tenant_id, id));
--> statement-breakpoint
CREATE POLICY lead_assignments_access ON lead_assignments
  FOR ALL
  USING (ce_rls_tenant_allowed(tenant_id))
  WITH CHECK (ce_rls_tenant_allowed(tenant_id));
--> statement-breakpoint
CREATE POLICY onboarding_projects_access ON onboarding_projects
  FOR ALL
  USING (ce_rls_tenant_allowed(tenant_id))
  WITH CHECK (ce_rls_tenant_allowed(tenant_id));
--> statement-breakpoint
CREATE POLICY onboarding_versions_access ON onboarding_versions
  FOR ALL
  USING (ce_rls_tenant_allowed(tenant_id))
  WITH CHECK (ce_rls_tenant_allowed(tenant_id));
--> statement-breakpoint
CREATE POLICY onboarding_reviewer_assignments_access ON onboarding_reviewer_assignments
  FOR ALL
  USING (
    ce_rls_platform_access()
    OR (
      ce_rls_scope() = 'identity'
      AND user_id = ce_rls_current_user_id()
      AND status = 'active'
    )
    OR ce_rls_tenant_allowed(tenant_id)
  )
  WITH CHECK (ce_rls_platform_access() OR ce_rls_tenant_allowed(tenant_id));
--> statement-breakpoint
CREATE POLICY platform_admin_assignments_access ON platform_admin_assignments
  FOR ALL
  USING (
    ce_rls_test_bypass()
    OR ce_rls_scope() IN ('platform_admin', 'maintenance')
    OR (
      ce_rls_scope() = 'identity'
      AND user_id = ce_rls_current_user_id()
    )
  )
  WITH CHECK (ce_rls_test_bypass() OR ce_rls_scope() IN ('platform_admin', 'maintenance'));
--> statement-breakpoint
CREATE POLICY onboarding_audit_events_access ON onboarding_audit_events
  FOR ALL
  USING (ce_rls_tenant_allowed(tenant_id))
  WITH CHECK (ce_rls_tenant_allowed(tenant_id));
--> statement-breakpoint
CREATE POLICY onboarding_review_requests_access ON onboarding_review_requests
  FOR ALL
  USING (ce_rls_tenant_allowed(tenant_id))
  WITH CHECK (ce_rls_tenant_allowed(tenant_id));
--> statement-breakpoint
CREATE POLICY onboarding_review_actions_access ON onboarding_review_actions
  FOR ALL
  USING (ce_rls_tenant_allowed(tenant_id))
  WITH CHECK (ce_rls_tenant_allowed(tenant_id));
--> statement-breakpoint
CREATE POLICY onboarding_review_access_events_access ON onboarding_review_access_events
  FOR ALL
  USING (ce_rls_tenant_allowed(tenant_id))
  WITH CHECK (ce_rls_tenant_allowed(tenant_id));
