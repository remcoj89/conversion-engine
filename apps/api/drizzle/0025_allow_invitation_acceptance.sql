-- Invitation acceptance is intentionally identity-only. The bearer token remains the sole
-- database capability for the pending invitation and its tenant transition.
DROP POLICY tenants_access ON tenants;
--> statement-breakpoint
CREATE POLICY tenants_access ON tenants
  FOR ALL
  USING (ce_rls_tenant_allowed(id))
  WITH CHECK (ce_rls_platform_access() OR (ce_rls_scope() = 'identity_only' AND ce_rls_tenant_allowed(id)));
--> statement-breakpoint
DROP POLICY tenant_owner_invitations_access ON tenant_owner_invitations;
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
  WITH CHECK (
    ce_rls_platform_access()
    OR (
      ce_rls_scope() = 'identity_only'
      AND token_hash = ce_rls_invitation_token_hash()
    )
  );
