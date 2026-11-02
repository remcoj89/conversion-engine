-- Email identity is unique inside a tenant, not across the platform. Existing
-- duplicates must be reviewed before this migration is applied; this migration
-- never deletes or merges customer data automatically.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.contacts
    GROUP BY tenant_id, lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate contact email exists within a tenant; resolve it before migration 0040'
      USING ERRCODE = 'unique_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.leads
    GROUP BY tenant_id, lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate lead email exists within a tenant; resolve it before migration 0040'
      USING ERRCODE = 'unique_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.leads WHERE contact_id IS NULL) THEN
    RAISE EXCEPTION 'lead without contact exists; resolve it before migration 0040'
      USING ERRCODE = 'not_null_violation';
  END IF;
END
$$;
--> statement-breakpoint

ALTER TABLE public.leads
  ALTER COLUMN contact_id SET NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX "contacts_tenant_normalized_email_unique"
  ON public.contacts (tenant_id, lower(btrim(email)))
  WHERE status = 'active';
--> statement-breakpoint

CREATE UNIQUE INDEX "leads_tenant_normalized_email_unique"
  ON public.leads (tenant_id, lower(btrim(email)));
