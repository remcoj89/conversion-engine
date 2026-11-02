-- CRM lead lifecycle: expand the status contract and record every accepted transition.
-- Status changes remain tenant-local and are written atomically with the lead update.
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_status_check;
--> statement-breakpoint

ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_check
  CHECK (status in ('new', 'qualified', 'appointment_scheduled', 'proposal', 'won', 'lost'));
--> statement-breakpoint

CREATE TABLE public.lead_lifecycle_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  event_type text NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_lifecycle_audit_events_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id),
  CONSTRAINT lead_lifecycle_audit_events_lead_tenant_fk
    FOREIGN KEY (tenant_id, lead_id) REFERENCES public.leads (tenant_id, id),
  CONSTRAINT lead_lifecycle_audit_events_actor_membership_fk
    FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.memberships (tenant_id, user_id),
  CONSTRAINT lead_lifecycle_audit_events_type_check
    CHECK (event_type in ('status_changed')),
  CONSTRAINT lead_lifecycle_audit_events_status_check
    CHECK (from_status in ('new', 'qualified', 'appointment_scheduled', 'proposal', 'won', 'lost')
      AND to_status in ('new', 'qualified', 'appointment_scheduled', 'proposal', 'won', 'lost'))
);
--> statement-breakpoint

CREATE INDEX lead_lifecycle_audit_events_tenant_created_idx
  ON public.lead_lifecycle_audit_events (tenant_id, created_at);
--> statement-breakpoint

CREATE INDEX lead_lifecycle_audit_events_tenant_lead_created_idx
  ON public.lead_lifecycle_audit_events (tenant_id, lead_id, created_at);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.ce_reject_lead_lifecycle_audit_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'lead lifecycle audit events are immutable';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER lead_lifecycle_audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.lead_lifecycle_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.ce_reject_lead_lifecycle_audit_mutation();
--> statement-breakpoint

ALTER TABLE public.lead_lifecycle_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_lifecycle_audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY lead_lifecycle_audit_events_read_access
  ON public.lead_lifecycle_audit_events
  FOR SELECT
  USING (ce_rls_lead_scope_allowed(tenant_id));
--> statement-breakpoint

CREATE POLICY lead_lifecycle_audit_events_insert_access
  ON public.lead_lifecycle_audit_events
  FOR INSERT
  WITH CHECK (
    ce_rls_crm_scope_allowed(tenant_id)
    AND actor_user_id = ce_rls_current_user_id()
  );
