-- CRM deals foundation: a small tenant-bound opportunity model for the future pipeline UI.
-- Deals use the existing lead lifecycle stages; this migration does not add a second pipeline.
CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  amount_eur numeric(12, 2),
  owner_user_id uuid,
  stage text NOT NULL DEFAULT 'new',
  expected_close_date date,
  loss_reason text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT deals_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT deals_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants (id),
  CONSTRAINT deals_contact_tenant_fk FOREIGN KEY (tenant_id, contact_id)
    REFERENCES public.contacts (tenant_id, id),
  CONSTRAINT deals_owner_membership_fk FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES public.memberships (tenant_id, user_id),
  CONSTRAINT deals_title_not_blank_check CHECK (length(btrim(title)) > 0),
  CONSTRAINT deals_amount_eur_non_negative_check CHECK (amount_eur IS NULL OR amount_eur >= 0),
  CONSTRAINT deals_stage_check CHECK (stage in ('new', 'qualified', 'appointment_scheduled', 'proposal', 'won', 'lost')),
  CONSTRAINT deals_status_check CHECK (status in ('active', 'archived')),
  CONSTRAINT deals_archived_at_check CHECK (
    (status = 'active' AND archived_at IS NULL)
    OR (status = 'archived' AND archived_at IS NOT NULL)
  ),
  CONSTRAINT deals_loss_reason_check CHECK (stage = 'lost' OR loss_reason IS NULL)
);
--> statement-breakpoint

CREATE INDEX deals_tenant_stage_status_idx ON public.deals (tenant_id, stage, status);
--> statement-breakpoint
CREATE INDEX deals_tenant_contact_idx ON public.deals (tenant_id, contact_id);
--> statement-breakpoint
CREATE INDEX deals_tenant_owner_idx ON public.deals (tenant_id, owner_user_id);
--> statement-breakpoint

-- A deal may only be assigned to an active membership at write time. The SECURITY DEFINER
-- lookup avoids recursive RLS evaluation while the composite FK still enforces the tenant key.
CREATE OR REPLACE FUNCTION public.ce_validate_deal_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.owner_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE memberships.tenant_id = NEW.tenant_id
      AND memberships.user_id = NEW.owner_user_id
      AND memberships.status = 'active'
  ) THEN
    RAISE EXCEPTION 'deal owner must be an active tenant membership'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER deals_owner_active_membership
  BEFORE INSERT OR UPDATE OF tenant_id, owner_user_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.ce_validate_deal_owner();
--> statement-breakpoint

CREATE TABLE public.deal_lifecycle_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  deal_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  event_type text NOT NULL,
  from_stage text NOT NULL,
  to_stage text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_lifecycle_audit_events_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id),
  CONSTRAINT deal_lifecycle_audit_events_deal_tenant_fk
    FOREIGN KEY (tenant_id, deal_id) REFERENCES public.deals (tenant_id, id),
  CONSTRAINT deal_lifecycle_audit_events_actor_membership_fk
    FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.memberships (tenant_id, user_id),
  CONSTRAINT deal_lifecycle_audit_events_type_check CHECK (event_type in ('stage_changed')),
  CONSTRAINT deal_lifecycle_audit_events_stage_check CHECK (
    from_stage in ('new', 'qualified', 'appointment_scheduled', 'proposal', 'won', 'lost')
    AND to_stage in ('new', 'qualified', 'appointment_scheduled', 'proposal', 'won', 'lost')
  )
);
--> statement-breakpoint
CREATE INDEX deal_lifecycle_audit_events_tenant_created_idx
  ON public.deal_lifecycle_audit_events (tenant_id, created_at);
--> statement-breakpoint
CREATE INDEX deal_lifecycle_audit_events_tenant_deal_created_idx
  ON public.deal_lifecycle_audit_events (tenant_id, deal_id, created_at);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.ce_reject_deal_lifecycle_audit_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'deal lifecycle audit events are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER deal_lifecycle_audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.deal_lifecycle_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.ce_reject_deal_lifecycle_audit_mutation();
--> statement-breakpoint

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals FORCE ROW LEVEL SECURITY;
CREATE POLICY deals_access ON public.deals
  FOR ALL
  USING (ce_rls_crm_scope_allowed(tenant_id))
  WITH CHECK (ce_rls_crm_scope_allowed(tenant_id));
--> statement-breakpoint

ALTER TABLE public.deal_lifecycle_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_lifecycle_audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY deal_lifecycle_audit_events_read_access
  ON public.deal_lifecycle_audit_events
  FOR SELECT
  USING (ce_rls_crm_scope_allowed(tenant_id));
CREATE POLICY deal_lifecycle_audit_events_insert_access
  ON public.deal_lifecycle_audit_events
  FOR INSERT
  WITH CHECK (
    ce_rls_crm_scope_allowed(tenant_id)
    AND actor_user_id = ce_rls_current_user_id()
  );
