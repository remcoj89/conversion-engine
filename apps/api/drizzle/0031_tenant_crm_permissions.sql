-- CRM-2a: persistent tenant roles and per-team-member CRM permissions.
-- A missing permission row is deny-by-default. Provider subjects remain outside this table.
ALTER TABLE memberships DROP CONSTRAINT memberships_role_check;
--> statement-breakpoint
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check
  CHECK (role in ('owner', 'tenant_admin', 'team_member'));
--> statement-breakpoint

CREATE TABLE team_member_crm_permissions (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_member_crm_permissions_pkey PRIMARY KEY (tenant_id, user_id, permission),
  CONSTRAINT team_member_crm_permissions_membership_fk
    FOREIGN KEY (tenant_id, user_id) REFERENCES memberships (tenant_id, user_id),
  CONSTRAINT team_member_crm_permissions_permission_check
    CHECK (permission in ('crm:read', 'crm:create', 'crm:update', 'crm:archive'))
);
--> statement-breakpoint
CREATE INDEX team_member_crm_permissions_tenant_user_idx
  ON team_member_crm_permissions (tenant_id, user_id);
--> statement-breakpoint
CREATE INDEX team_member_crm_permissions_tenant_permission_idx
  ON team_member_crm_permissions (tenant_id, permission);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION ce_rls_team_member_crm_permission_allowed(
  target_tenant_id uuid,
  target_user_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_test_bypass()
    OR (
      ce_rls_scope() = 'maintenance'
      AND session_user = 'ce_maintenance'
    )
    OR (
      ce_rls_scope() = 'identity'
      AND target_user_id = ce_rls_current_user_id()
      AND EXISTS (
        SELECT 1
        FROM public.memberships
        WHERE memberships.tenant_id = target_tenant_id
          AND memberships.user_id = target_user_id
          AND memberships.status = 'active'
      )
    )
    OR (
      ce_rls_scope() = 'customer'
      AND ce_rls_crm_scope_allowed(target_tenant_id)
      AND (
        target_user_id = ce_rls_current_user_id()
        OR EXISTS (
          SELECT 1
          FROM public.memberships actor_membership
          WHERE actor_membership.tenant_id = target_tenant_id
            AND actor_membership.user_id = ce_rls_current_user_id()
            AND actor_membership.role in ('owner', 'tenant_admin')
            AND actor_membership.status = 'active'
        )
      )
    )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION ce_rls_team_member_crm_permission_manage_allowed(
  target_tenant_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_test_bypass()
    OR (
      ce_rls_scope() = 'maintenance'
      AND session_user = 'ce_maintenance'
    )
    OR (
      ce_rls_scope() = 'customer'
      AND ce_rls_crm_scope_allowed(target_tenant_id)
      AND EXISTS (
        SELECT 1
        FROM public.memberships
        WHERE memberships.tenant_id = target_tenant_id
          AND memberships.user_id = ce_rls_current_user_id()
          AND memberships.role in ('owner', 'tenant_admin')
          AND memberships.status = 'active'
      )
    )
$$;
--> statement-breakpoint

ALTER TABLE team_member_crm_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_member_crm_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY team_member_crm_permissions_read_access ON team_member_crm_permissions
  FOR SELECT
  USING (ce_rls_team_member_crm_permission_allowed(tenant_id, user_id));
--> statement-breakpoint
CREATE POLICY team_member_crm_permissions_write_access ON team_member_crm_permissions
  FOR INSERT
  WITH CHECK (ce_rls_team_member_crm_permission_manage_allowed(tenant_id));
--> statement-breakpoint
CREATE POLICY team_member_crm_permissions_update_access ON team_member_crm_permissions
  FOR UPDATE
  USING (ce_rls_team_member_crm_permission_manage_allowed(tenant_id))
  WITH CHECK (ce_rls_team_member_crm_permission_manage_allowed(tenant_id));
--> statement-breakpoint
CREATE POLICY team_member_crm_permissions_delete_access ON team_member_crm_permissions
  FOR DELETE
  USING (ce_rls_team_member_crm_permission_manage_allowed(tenant_id));
