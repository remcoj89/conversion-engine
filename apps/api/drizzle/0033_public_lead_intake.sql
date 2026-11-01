-- Public lead intake: the opaque website key is the only public routing input.
-- This migration deliberately keeps the public scope narrower than customer CRM access.
ALTER TABLE leads ADD COLUMN website_id uuid;
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN contact_id uuid;
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN organization_name text;
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN privacy_consent boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN marketing_consent boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE websites ADD CONSTRAINT websites_tenant_id_unique UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE contacts ADD CONSTRAINT contacts_tenant_id_unique UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE leads ADD CONSTRAINT leads_website_tenant_fk
  FOREIGN KEY (tenant_id, website_id) REFERENCES websites (tenant_id, id);
--> statement-breakpoint
ALTER TABLE leads ADD CONSTRAINT leads_contact_tenant_fk
  FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts (tenant_id, id);
--> statement-breakpoint

CREATE TABLE public_lead_idempotency_keys (
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  website_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  lead_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_lead_idempotency_keys_pkey PRIMARY KEY (website_id, idempotency_key),
  CONSTRAINT public_lead_idempotency_website_tenant_fk
    FOREIGN KEY (tenant_id, website_id) REFERENCES websites (tenant_id, id),
  CONSTRAINT public_lead_idempotency_lead_tenant_fk
    FOREIGN KEY (tenant_id, lead_id) REFERENCES leads (tenant_id, id),
  CONSTRAINT public_lead_idempotency_key_check
    CHECK (idempotency_key ~ '^[A-Za-z0-9._~-]{1,128}$'),
  CONSTRAINT public_lead_idempotency_hash_check
    CHECK (request_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE public_lead_rate_limits (
  website_id uuid NOT NULL REFERENCES websites (id),
  bucket_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_lead_rate_limits_pkey PRIMARY KEY (website_id, bucket_start),
  CONSTRAINT public_lead_rate_limits_count_check CHECK (request_count >= 0)
);
--> statement-breakpoint
CREATE TABLE public_lead_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  website_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_lead_outbox_website_tenant_fk
    FOREIGN KEY (tenant_id, website_id) REFERENCES websites (tenant_id, id),
  CONSTRAINT public_lead_outbox_lead_tenant_fk
    FOREIGN KEY (tenant_id, lead_id) REFERENCES leads (tenant_id, id),
  CONSTRAINT public_lead_outbox_lead_event_unique UNIQUE (tenant_id, lead_id, event_type),
  CONSTRAINT public_lead_outbox_event_type_check CHECK (event_type in ('lead.created')),
  CONSTRAINT public_lead_outbox_status_check CHECK (status in ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT public_lead_outbox_payload_check CHECK (jsonb_typeof(payload) = 'object')
);
--> statement-breakpoint
CREATE INDEX public_lead_outbox_pending_idx ON public_lead_outbox (status, created_at);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION ce_rls_website_public_key() RETURNS text
LANGUAGE sql STABLE
AS $$ SELECT coalesce(current_setting('app.rls_website_public_key', true), '') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ce_rls_public_contact_email() RETURNS text
LANGUAGE sql STABLE
AS $$ SELECT coalesce(current_setting('app.rls_public_contact_email', true), '') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ce_rls_public_website_allowed(target_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_scope() = 'public'
    AND target_tenant_id::text = coalesce(current_setting('app.rls_tenant_id', true), '')
    AND EXISTS (
      SELECT 1
      FROM public.tenants
      WHERE tenants.id = target_tenant_id
        AND tenants.status = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM public.websites
      WHERE websites.tenant_id = target_tenant_id
        AND websites.public_key = ce_rls_website_public_key()
        AND websites.status = 'active'
    )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ce_rls_public_website_id_allowed(target_website_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_scope() = 'public'
    AND EXISTS (
      SELECT 1
      FROM public.websites
      JOIN public.tenants ON tenants.id = websites.tenant_id
      WHERE websites.id = target_website_id
        AND websites.tenant_id::text = coalesce(current_setting('app.rls_tenant_id', true), '')
        AND websites.public_key = ce_rls_website_public_key()
        AND websites.status = 'active'
        AND tenants.status = 'active'
    )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ce_rls_public_tenant_active(target_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_scope() = 'public'
    AND target_tenant_id::text = coalesce(current_setting('app.rls_tenant_id', true), '')
    AND EXISTS (
      SELECT 1
      FROM public.tenants
      WHERE tenants.id = target_tenant_id
        AND tenants.status = 'active'
    )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ce_rls_public_lead_allowed(target_tenant_id uuid, target_lead_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT ce_rls_public_website_allowed(target_tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.public_lead_idempotency_keys
      JOIN public.websites ON websites.id = public_lead_idempotency_keys.website_id
      WHERE public_lead_idempotency_keys.tenant_id = target_tenant_id
        AND public_lead_idempotency_keys.lead_id = target_lead_id
        AND websites.public_key = ce_rls_website_public_key()
    )
$$;
--> statement-breakpoint

DROP POLICY tenants_access ON tenants;
CREATE POLICY tenants_access ON tenants
  FOR ALL
  USING (
    ce_rls_tenant_allowed(id)
    OR (
      ce_rls_scope() = 'public'
      AND status = 'active'
      AND EXISTS (
        SELECT 1
        FROM public.websites
        WHERE websites.tenant_id = tenants.id
          AND websites.public_key = ce_rls_website_public_key()
          AND websites.status = 'active'
      )
    )
  )
  WITH CHECK (ce_rls_platform_access());
--> statement-breakpoint
DROP POLICY websites_access ON websites;
CREATE POLICY websites_access ON websites
  FOR ALL
  USING (
    ce_rls_tenant_allowed(tenant_id)
    OR (
      ce_rls_public_tenant_active(tenant_id)
      AND status = 'active'
      AND public_key = ce_rls_website_public_key()
    )
  )
  WITH CHECK (ce_rls_tenant_allowed(tenant_id));
--> statement-breakpoint

DROP POLICY contacts_access ON contacts;
CREATE POLICY contacts_select_access ON contacts
  FOR SELECT
  USING (
    ce_rls_crm_scope_allowed(tenant_id)
    OR (
      ce_rls_public_website_allowed(tenant_id)
      AND status = 'active'
      AND lower(btrim(email)) = ce_rls_public_contact_email()
    )
  );
CREATE POLICY contacts_insert_access ON contacts
  FOR INSERT
  WITH CHECK (
    ce_rls_crm_scope_allowed(tenant_id)
    OR (
      ce_rls_public_website_allowed(tenant_id)
      AND status = 'active'
      AND lower(btrim(email)) = ce_rls_public_contact_email()
    )
  );
CREATE POLICY contacts_update_access ON contacts
  FOR UPDATE
  USING (ce_rls_crm_scope_allowed(tenant_id))
  WITH CHECK (ce_rls_crm_scope_allowed(tenant_id));
CREATE POLICY contacts_delete_access ON contacts
  FOR DELETE
  USING (ce_rls_crm_scope_allowed(tenant_id));
--> statement-breakpoint

DROP POLICY leads_read_access ON leads;
CREATE POLICY leads_read_access ON leads
  FOR SELECT
  USING (ce_rls_customer_can_read_lead(tenant_id, id) OR ce_rls_public_lead_allowed(tenant_id, id));
--> statement-breakpoint
DROP POLICY leads_write_access ON leads;
CREATE POLICY leads_write_access ON leads
  FOR INSERT
  WITH CHECK (
    ce_rls_lead_scope_allowed(tenant_id)
    OR (
      ce_rls_public_website_allowed(tenant_id)
      AND ce_rls_public_website_id_allowed(website_id)
      AND lower(btrim(email)) = ce_rls_public_contact_email()
      AND source = 'website_contact'
      AND privacy_consent = true
      AND contact_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.contacts
        WHERE contacts.id = leads.contact_id
          AND contacts.tenant_id = leads.tenant_id
          AND contacts.status = 'active'
          AND lower(btrim(contacts.email)) = ce_rls_public_contact_email()
      )
    )
  );
--> statement-breakpoint

ALTER TABLE public_lead_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_lead_idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY public_lead_idempotency_select_access ON public_lead_idempotency_keys
  FOR SELECT USING (ce_rls_public_website_id_allowed(website_id));
CREATE POLICY public_lead_idempotency_insert_access ON public_lead_idempotency_keys
  FOR INSERT WITH CHECK (
    ce_rls_public_website_allowed(tenant_id)
    AND ce_rls_public_website_id_allowed(website_id)
  );
--> statement-breakpoint
ALTER TABLE public_lead_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_lead_rate_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY public_lead_rate_limits_access ON public_lead_rate_limits
  FOR ALL
  USING (ce_rls_public_website_id_allowed(website_id))
  WITH CHECK (ce_rls_public_website_id_allowed(website_id));
--> statement-breakpoint
ALTER TABLE public_lead_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_lead_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY public_lead_outbox_insert_access ON public_lead_outbox
  FOR INSERT
  WITH CHECK (
    ce_rls_public_website_allowed(tenant_id)
    AND ce_rls_public_website_id_allowed(website_id)
  );
--> statement-breakpoint

CREATE OR REPLACE FUNCTION ce_reject_public_lead_outbox_core_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.tenant_id <> NEW.tenant_id
    OR OLD.website_id <> NEW.website_id
    OR OLD.lead_id <> NEW.lead_id
    OR OLD.event_type <> NEW.event_type
    OR OLD.payload <> NEW.payload THEN
    RAISE EXCEPTION 'public lead outbox core fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER public_lead_outbox_core_immutable
  BEFORE UPDATE ON public_lead_outbox
  FOR EACH ROW EXECUTE FUNCTION ce_reject_public_lead_outbox_core_mutation();
