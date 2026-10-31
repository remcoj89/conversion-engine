-- CRM lead privacy is stricter than general platform metadata access.
-- Platform Admin and reviewer contexts must not see or mutate lead content or assignments.
-- Customer access requires an active membership in the tenant carried by the request context.
CREATE OR REPLACE FUNCTION ce_rls_lead_scope_allowed(target_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_test_bypass()
    OR (
      ce_rls_scope() = 'maintenance'
      AND session_user = 'ce_maintenance'
    )
    OR (
      ce_rls_scope() = 'customer'
      AND target_tenant_id::text = coalesce(current_setting('app.rls_tenant_id', true), '')
      AND EXISTS (
        SELECT 1
        FROM public.memberships
        WHERE memberships.tenant_id = target_tenant_id
          AND memberships.user_id = ce_rls_current_user_id()
          AND memberships.status = 'active'
      )
    )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ce_rls_customer_can_read_lead(target_tenant_id uuid, target_lead_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_lead_scope_allowed(target_tenant_id)
$$;
--> statement-breakpoint
DROP POLICY leads_read_access ON leads;
--> statement-breakpoint
CREATE POLICY leads_read_access ON leads
  FOR SELECT
  USING (ce_rls_customer_can_read_lead(tenant_id, id));
--> statement-breakpoint
DROP POLICY leads_write_access ON leads;
--> statement-breakpoint
CREATE POLICY leads_write_access ON leads
  FOR INSERT
  WITH CHECK (ce_rls_lead_scope_allowed(tenant_id));
--> statement-breakpoint
DROP POLICY leads_update_access ON leads;
--> statement-breakpoint
CREATE POLICY leads_update_access ON leads
  FOR UPDATE
  USING (ce_rls_customer_can_read_lead(tenant_id, id))
  WITH CHECK (ce_rls_lead_scope_allowed(tenant_id));
--> statement-breakpoint
DROP POLICY leads_delete_access ON leads;
--> statement-breakpoint
CREATE POLICY leads_delete_access ON leads
  FOR DELETE
  USING (ce_rls_customer_can_read_lead(tenant_id, id));
--> statement-breakpoint
DROP POLICY lead_assignments_access ON lead_assignments;
--> statement-breakpoint
CREATE POLICY lead_assignments_access ON lead_assignments
  FOR ALL
  USING (ce_rls_lead_scope_allowed(tenant_id))
  WITH CHECK (ce_rls_lead_scope_allowed(tenant_id));
