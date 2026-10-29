-- Reviewers and identity-bootstrap requests must never gain CRM access merely because they
-- carry a tenant context. Lead access is limited to the customer scope or Platform Admin.
CREATE OR REPLACE FUNCTION ce_rls_customer_can_read_lead(target_tenant_id uuid, target_lead_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_platform_access()
    OR (
      ce_rls_scope() = 'customer'
      AND (
        EXISTS (
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
      )
    )
$$;
--> statement-breakpoint
DROP POLICY leads_write_access ON leads;
--> statement-breakpoint
CREATE POLICY leads_write_access ON leads
  FOR INSERT
  WITH CHECK (ce_rls_platform_access() OR (ce_rls_scope() = 'customer' AND ce_rls_tenant_allowed(tenant_id)));
--> statement-breakpoint
DROP POLICY leads_update_access ON leads;
--> statement-breakpoint
CREATE POLICY leads_update_access ON leads
  FOR UPDATE
  USING (ce_rls_tenant_allowed(tenant_id) AND ce_rls_customer_can_read_lead(tenant_id, id))
  WITH CHECK (ce_rls_platform_access() OR (ce_rls_scope() = 'customer' AND ce_rls_tenant_allowed(tenant_id)));
--> statement-breakpoint
DROP POLICY leads_delete_access ON leads;
--> statement-breakpoint
CREATE POLICY leads_delete_access ON leads
  FOR DELETE
  USING (ce_rls_tenant_allowed(tenant_id) AND ce_rls_customer_can_read_lead(tenant_id, id));
