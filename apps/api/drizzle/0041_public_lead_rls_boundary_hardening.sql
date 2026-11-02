-- Public lead intake hardening.
-- The public scope may resolve an active website and create one constrained lead,
-- but it must not mutate tenant/website configuration or internal queue state.
-- Existing migrations remain immutable; this is a forward-only correction.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.public_lead_idempotency_keys keys
    JOIN public.leads leads
      ON leads.tenant_id = keys.tenant_id
     AND leads.id = keys.lead_id
    WHERE leads.website_id IS DISTINCT FROM keys.website_id
  ) THEN
    RAISE EXCEPTION 'public lead idempotency data crosses website boundary'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.public_lead_outbox outbox
    JOIN public.leads leads
      ON leads.tenant_id = outbox.tenant_id
     AND leads.id = outbox.lead_id
    WHERE leads.website_id IS DISTINCT FROM outbox.website_id
  ) THEN
    RAISE EXCEPTION 'public lead outbox data crosses website boundary'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
END
$$;
--> statement-breakpoint

ALTER TABLE public.leads
  ADD CONSTRAINT leads_tenant_website_id_unique UNIQUE (tenant_id, website_id, id);
--> statement-breakpoint

ALTER TABLE public.public_lead_idempotency_keys
  DROP CONSTRAINT public_lead_idempotency_lead_tenant_fk;
--> statement-breakpoint
ALTER TABLE public.public_lead_idempotency_keys
  ADD CONSTRAINT public_lead_idempotency_lead_website_tenant_fk
  FOREIGN KEY (tenant_id, website_id, lead_id)
  REFERENCES public.leads (tenant_id, website_id, id);
--> statement-breakpoint

ALTER TABLE public.public_lead_outbox
  DROP CONSTRAINT public_lead_outbox_lead_tenant_fk;
--> statement-breakpoint
ALTER TABLE public.public_lead_outbox
  ADD CONSTRAINT public_lead_outbox_lead_website_tenant_fk
  FOREIGN KEY (tenant_id, website_id, lead_id)
  REFERENCES public.leads (tenant_id, website_id, id);
--> statement-breakpoint

-- Public website resolution is read-only. Keep the previous customer/platform
-- semantics for non-public scopes while removing public UPDATE/DELETE paths.
DROP POLICY IF EXISTS tenants_access ON public.tenants;
CREATE POLICY tenants_select_access ON public.tenants
  FOR SELECT
  USING (
    ce_rls_tenant_allowed(id)
    OR (
      status = 'active'
      AND ce_rls_public_website_tenant_allowed(id)
    )
  );
CREATE POLICY tenants_insert_access ON public.tenants
  FOR INSERT
  WITH CHECK (ce_rls_platform_access());
CREATE POLICY tenants_update_access ON public.tenants
  FOR UPDATE
  USING (ce_rls_tenant_allowed(id) AND ce_rls_scope() <> 'public')
  WITH CHECK (ce_rls_platform_access());
CREATE POLICY tenants_delete_access ON public.tenants
  FOR DELETE
  USING (ce_rls_tenant_allowed(id) AND ce_rls_scope() <> 'public');
--> statement-breakpoint

DROP POLICY IF EXISTS websites_access ON public.websites;
CREATE POLICY websites_select_access ON public.websites
  FOR SELECT
  USING (
    ce_rls_tenant_allowed(tenant_id)
    OR (
      ce_rls_scope() = 'public'
      AND status = 'active'
      AND public_key = ce_rls_website_public_key()
      AND (
        coalesce(current_setting('app.rls_tenant_id', true), '') = ''
        OR ce_rls_public_tenant_active(tenant_id)
      )
    )
  );
CREATE POLICY websites_insert_access ON public.websites
  FOR INSERT
  WITH CHECK (ce_rls_tenant_allowed(tenant_id));
CREATE POLICY websites_update_access ON public.websites
  FOR UPDATE
  USING (ce_rls_tenant_allowed(tenant_id) AND ce_rls_scope() <> 'public')
  WITH CHECK (ce_rls_tenant_allowed(tenant_id));
CREATE POLICY websites_delete_access ON public.websites
  FOR DELETE
  USING (ce_rls_tenant_allowed(tenant_id) AND ce_rls_scope() <> 'public');
--> statement-breakpoint

DROP POLICY IF EXISTS contacts_insert_access ON public.contacts;
CREATE POLICY contacts_insert_access ON public.contacts
  FOR INSERT
  WITH CHECK (
    ce_rls_crm_scope_allowed(tenant_id)
    OR (
      ce_rls_public_website_allowed(tenant_id)
      AND status = 'active'
      AND organization_id IS NULL
      AND lower(btrim(email)) = ce_rls_public_contact_email()
    )
  );
--> statement-breakpoint

-- The public caller needs to read its own counter for INSERT ... RETURNING and
-- must increment it exactly once per accepted request. It may not reset/delete it.
DROP POLICY IF EXISTS public_lead_rate_limits_access ON public.public_lead_rate_limits;
CREATE POLICY public_lead_rate_limits_select_access ON public.public_lead_rate_limits
  FOR SELECT
  USING (ce_rls_public_website_id_allowed(website_id));
CREATE POLICY public_lead_rate_limits_insert_access ON public.public_lead_rate_limits
  FOR INSERT
  WITH CHECK (
    ce_rls_public_website_id_allowed(website_id)
    AND request_count = 1
  );
CREATE POLICY public_lead_rate_limits_update_access ON public.public_lead_rate_limits
  FOR UPDATE
  USING (ce_rls_public_website_id_allowed(website_id))
  WITH CHECK (ce_rls_public_website_id_allowed(website_id));
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.ce_reject_public_lead_rate_limit_reset() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF session_user = 'ce_maintenance' AND ce_rls_test_bypass() THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'public lead rate limits cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.request_count <> 1 THEN
    RAISE EXCEPTION 'public lead rate limit must start at one';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD.website_id <> NEW.website_id
    OR OLD.bucket_start <> NEW.bucket_start
    OR NEW.request_count <> OLD.request_count + 1
  ) THEN
    RAISE EXCEPTION 'public lead rate limit may only increment by one';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS public_lead_rate_limit_no_reset ON public.public_lead_rate_limits;
CREATE TRIGGER public_lead_rate_limit_no_reset
  BEFORE INSERT OR UPDATE OR DELETE ON public.public_lead_rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.ce_reject_public_lead_rate_limit_reset();
--> statement-breakpoint

DROP POLICY IF EXISTS public_lead_outbox_insert_access ON public.public_lead_outbox;
CREATE POLICY public_lead_outbox_insert_access ON public.public_lead_outbox
  FOR INSERT
  WITH CHECK (
    ce_rls_public_website_allowed(tenant_id)
    AND ce_rls_public_website_id_allowed(website_id)
    AND event_type = 'lead.created'
    AND status = 'pending'
    AND payload->>'event' = 'lead.created'
    AND payload->>'leadId' = lead_id::text
    AND payload->>'websiteId' = website_id::text
    AND payload->>'source' = 'website_contact'
  );
