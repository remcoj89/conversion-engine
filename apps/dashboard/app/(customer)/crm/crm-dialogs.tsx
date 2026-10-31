"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { WorkspaceFetch } from "../../../lib/session/context";
import { fetchContact, fetchOrganization, type ContactRecord, type OrganizationRecord } from "./crm-data";
import {
  archiveContact,
  archiveOrganization,
  contactFormFromRecord,
  emptyContactForm,
  emptyOrganizationForm,
  organizationFormFromRecord,
  saveContact,
  saveOrganization,
  validateContactForm,
  validateOrganizationForm,
  type ContactFormValues,
  type CrmMutationResult,
  type OrganizationFormValues,
} from "./crm-mutations";
import styles from "../customer.module.css";

type CrmDialogProps = Readonly<{
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}>;

type FormState = Readonly<{
  busy: boolean;
  error: string | null;
  success: string | null;
}>;

const initialFormState: FormState = { busy: false, error: null, success: null };

export function CrmDialog({ open, title, description, onClose, children }: CrmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    function handleCancel(event: Event) {
      event.preventDefault();
      onClose();
    }

    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose, open]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.crmDialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className={styles.crmDialogPanel}>
        <div className={styles.crmDialogHeader}>
          <div>
            <p className="eyebrow">CRM</p>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button className="button button-secondary button-small" type="button" onClick={onClose} aria-label="Venster sluiten">
            Sluiten
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function OrganizationFormDialog({
  open,
  record,
  fetcher,
  onClose,
  onSaved,
}: Readonly<{
  open: boolean;
  record: OrganizationRecord | null;
  fetcher: WorkspaceFetch;
  onClose: () => void;
  onSaved: (message: string) => void;
}>) {
  const [form, setForm] = useState<OrganizationFormValues>(() => record ? organizationFormFromRecord(record) : emptyOrganizationForm());
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [loadingDetail, setLoadingDetail] = useState(Boolean(record));
  const [detailError, setDetailError] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!record) return;

    let cancelled = false;
    void fetchOrganization(fetcher, record.id).then((result) => {
      if (cancelled) return;
      setLoadingDetail(false);
      if (result.status !== "ready") {
        setDetailError(true);
        setFormState({ busy: false, error: mutationError(result), success: null });
        return;
      }
      setDetailError(false);
      const detail = result.data.items[0];
      if (detail) setForm(organizationFormFromRecord(detail));
    });
    return () => { cancelled = true; };
  }, [fetcher, open, record]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateOrganizationForm(form);
    setFieldErrors(validation.errors);
    if (Object.keys(validation.errors).length > 0) return;

    setFormState({ busy: true, error: null, success: null });
    const result = await saveOrganization(fetcher, record?.id ?? null, form);
    if (result.status !== "success") {
      setFormState({ busy: false, error: mutationError(result), success: null });
      return;
    }
    setFormState({ busy: false, error: null, success: record ? "Organisatie bijgewerkt." : "Organisatie aangemaakt." });
    onSaved(record ? "Organisatie bijgewerkt." : "Organisatie aangemaakt.");
  }

  const editing = Boolean(record);
  return (
    <CrmDialog open={open} title={editing ? "Organisatie bewerken" : "Organisatie toevoegen"} description="Vul de zakelijke gegevens in. Lege optionele velden blijven leeg." onClose={onClose}>
      {loadingDetail ? <p className={styles.crmDialogStatus} role="status">Organisatiegegevens worden geladen…</p> : null}
      <form className={styles.crmForm} onSubmit={submit} noValidate>
        <div className={styles.crmFormGrid}>
          <TextField label="Naam" name="name" value={form.name} onChange={updateForm(setForm, "name")} error={fieldErrors.name} required disabled={loadingDetail || formState.busy} />
          <TextField label="KvK-nummer" name="kvk_number" value={form.kvk_number} onChange={updateForm(setForm, "kvk_number")} disabled={loadingDetail || formState.busy} />
          <TextField label="Website" name="website" type="url" value={form.website} onChange={updateForm(setForm, "website")} placeholder="https://" disabled={loadingDetail || formState.busy} />
          <TextField label="Algemeen e-mailadres" name="general_email" type="email" value={form.general_email} onChange={updateForm(setForm, "general_email")} error={fieldErrors.general_email} disabled={loadingDetail || formState.busy} />
          <TextField label="Algemeen telefoonnummer" name="general_phone" type="tel" value={form.general_phone} onChange={updateForm(setForm, "general_phone")} disabled={loadingDetail || formState.busy} />
          <TextField label="Branche" name="industry" value={form.industry} onChange={updateForm(setForm, "industry")} disabled={loadingDetail || formState.busy} />
          <TextAreaField label="Adres" name="address" value={form.address} onChange={updateForm(setForm, "address")} disabled={loadingDetail || formState.busy} />
          <TextAreaField label="Notities" name="notes" value={form.notes} onChange={updateForm(setForm, "notes")} disabled={loadingDetail || formState.busy} fullWidth />
        </div>
        <DialogFeedback state={formState} />
        <FormActions busy={formState.busy || loadingDetail} submitDisabled={detailError} onClose={onClose} submitLabel={editing ? "Wijzigingen opslaan" : "Organisatie opslaan"} />
      </form>
    </CrmDialog>
  );
}

export function ContactFormDialog({
  open,
  record,
  organizations,
  fetcher,
  onClose,
  onSaved,
}: Readonly<{
  open: boolean;
  record: ContactRecord | null;
  organizations: readonly OrganizationRecord[];
  fetcher: WorkspaceFetch;
  onClose: () => void;
  onSaved: (message: string) => void;
}>) {
  const [form, setForm] = useState<ContactFormValues>(() => record ? contactFormFromRecord(record) : emptyContactForm());
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [loadingDetail, setLoadingDetail] = useState(Boolean(record));
  const [detailError, setDetailError] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!record) return;

    let cancelled = false;
    void fetchContact(fetcher, record.id).then((result) => {
      if (cancelled) return;
      setLoadingDetail(false);
      if (result.status !== "ready") {
        setDetailError(true);
        setFormState({ busy: false, error: mutationError(result), success: null });
        return;
      }
      setDetailError(false);
      const detail = result.data.items[0];
      if (detail) setForm(contactFormFromRecord(detail));
    });
    return () => { cancelled = true; };
  }, [fetcher, open, record]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateContactForm(form);
    setFieldErrors(validation.errors);
    if (Object.keys(validation.errors).length > 0) return;

    setFormState({ busy: true, error: null, success: null });
    const result = await saveContact(fetcher, record?.id ?? null, form);
    if (result.status !== "success") {
      setFormState({ busy: false, error: mutationError(result), success: null });
      return;
    }
    setFormState({ busy: false, error: null, success: record ? "Contactpersoon bijgewerkt." : "Contactpersoon aangemaakt." });
    onSaved(record ? "Contactpersoon bijgewerkt." : "Contactpersoon aangemaakt.");
  }

  const editing = Boolean(record);
  return (
    <CrmDialog open={open} title={editing ? "Contactpersoon bewerken" : "Contactpersoon toevoegen"} description="Een contactpersoon kan aan een organisatie gekoppeld worden, maar dat hoeft niet." onClose={onClose}>
      {loadingDetail ? <p className={styles.crmDialogStatus} role="status">Contactgegevens worden geladen…</p> : null}
      <form className={styles.crmForm} onSubmit={submit} noValidate>
        <div className={styles.crmFormGrid}>
          <TextField label="Volledige naam" name="full_name" value={form.full_name} onChange={updateForm(setForm, "full_name")} error={fieldErrors.full_name} required disabled={loadingDetail || formState.busy} />
          <TextField label="E-mailadres" name="email" type="email" value={form.email} onChange={updateForm(setForm, "email")} error={fieldErrors.email} required disabled={loadingDetail || formState.busy} />
          <TextField label="Voornaam" name="first_name" value={form.first_name} onChange={updateForm(setForm, "first_name")} disabled={loadingDetail || formState.busy} />
          <TextField label="Achternaam" name="last_name" value={form.last_name} onChange={updateForm(setForm, "last_name")} disabled={loadingDetail || formState.busy} />
          <TextField label="Telefoonnummer" name="phone" type="tel" value={form.phone} onChange={updateForm(setForm, "phone")} disabled={loadingDetail || formState.busy} />
          <TextField label="Functie" name="function" value={form.function} onChange={updateForm(setForm, "function")} disabled={loadingDetail || formState.busy} />
          <SelectField label="Organisatie" name="organization_id" value={form.organization_id} onChange={updateForm(setForm, "organization_id")} disabled={loadingDetail || formState.busy}>
            <option value="">Geen organisatie</option>
            {organizations.filter((organization) => organization.status === "active").map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </SelectField>
          <SelectField label="Voorkeur communicatie" name="communication_preference" value={form.communication_preference} onChange={updateForm(setForm, "communication_preference")} disabled={loadingDetail || formState.busy}>
            <option value="">Niet opgegeven</option>
            <option value="email">E-mail</option>
            <option value="phone">Telefoon</option>
            <option value="whatsapp">WhatsApp</option>
          </SelectField>
          <TextAreaField label="Notities" name="notes" value={form.notes} onChange={updateForm(setForm, "notes")} disabled={loadingDetail || formState.busy} fullWidth />
        </div>
        <DialogFeedback state={formState} />
        <FormActions busy={formState.busy || loadingDetail} submitDisabled={detailError} onClose={onClose} submitLabel={editing ? "Wijzigingen opslaan" : "Contactpersoon opslaan"} />
      </form>
    </CrmDialog>
  );
}

export function ArchiveButton({
  label,
  id,
  fetcher,
  onArchived,
  onError,
  kind,
}: Readonly<{
  label: string;
  id: string;
  fetcher: WorkspaceFetch;
  onArchived: (message: string) => void;
  onError: (message: string) => void;
  kind: "organization" | "contact";
}>) {
  const [busy, setBusy] = useState(false);
  async function archiveRecord() {
    if (!window.confirm(`${label} archiveren? De gegevens blijven bewaard en verdwijnen uit de actieve lijst.`)) return;
    setBusy(true);
    const result = kind === "organization" ? await archiveOrganization(fetcher, id) : await archiveContact(fetcher, id);
    setBusy(false);
    if (result.status !== "success") {
      onError(mutationError(result));
      return;
    }
    onArchived(`${label} gearchiveerd.`);
  }

  return <button className="button button-secondary button-small" type="button" onClick={() => void archiveRecord()} disabled={busy}>{busy ? "Bezig…" : "Archiveren"}</button>;
}

function TextField({ label, name, value, onChange, error, required = false, disabled = false, type = "text", placeholder }: Readonly<{ label: string; name: string; value: string; onChange: (value: string) => void; error?: string; required?: boolean; disabled?: boolean; type?: string; placeholder?: string }>) {
  const errorId = `${name}-error`;
  return <div className={`field ${error ? "field-has-error" : ""}`}><label className="field-label" htmlFor={name}>{label}{required ? <span className="field-required">Verplicht</span> : <span className="field-optional">Optioneel</span>}</label><input className="field-control" id={name} name={name} type={type} value={value} onChange={(event) => onChange(event.currentTarget.value)} disabled={disabled} required={required} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} />{error ? <p className="field-error" id={errorId}>{error}</p> : null}</div>;
}

function TextAreaField({ label, name, value, onChange, disabled = false, fullWidth = false }: Readonly<{ label: string; name: string; value: string; onChange: (value: string) => void; disabled?: boolean; fullWidth?: boolean }>) {
  return <div className={`field ${fullWidth ? styles.crmFormFull : ""}`}><label className="field-label" htmlFor={name}>{label}<span className="field-optional">Optioneel</span></label><textarea className="field-control" id={name} name={name} value={value} onChange={(event) => onChange(event.currentTarget.value)} disabled={disabled} rows={3} /></div>;
}

function SelectField({ label, name, value, onChange, disabled, children }: Readonly<{ label: string; name: string; value: string; onChange: (value: string) => void; disabled: boolean; children: ReactNode }>) {
  return <div className="field"><label className="field-label" htmlFor={name}>{label}<span className="field-optional">Optioneel</span></label><select className="field-control" id={name} name={name} value={value} onChange={(event) => onChange(event.currentTarget.value)} disabled={disabled}>{children}</select></div>;
}

function FormActions({ busy, submitDisabled = false, onClose, submitLabel }: Readonly<{ busy: boolean; submitDisabled?: boolean; onClose: () => void; submitLabel: string }>) {
  return <div className={styles.crmDialogActions}><button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>Annuleren</button><button className="button button-primary" type="submit" disabled={busy || submitDisabled}>{busy ? "Bezig…" : submitLabel}</button></div>;
}

function DialogFeedback({ state }: Readonly<{ state: FormState }>) {
  return <div className={styles.crmDialogFeedback} aria-live="polite" role={state.error ? "alert" : undefined}>{state.error ? <p className={styles.crmDialogError}>{state.error}</p> : null}{state.success ? <p className={styles.crmDialogSuccess}>{state.success}</p> : null}</div>;
}

function updateForm<T extends object>(setForm: (value: T | ((current: T) => T)) => void, key: keyof T) {
  return (value: string) => setForm((current) => ({ ...current, [key]: value }));
}

function mutationError(result: Exclude<CrmMutationResult<unknown>, { status: "success" }>): string {
  if (result.status === "invalid") return "Controleer de invoer en probeer het opnieuw.";
  if (result.status === "unauthenticated") return "Je sessie is verlopen. Meld je opnieuw aan.";
  if (result.status === "forbidden") return "Je account heeft geen toestemming voor deze CRM-actie.";
  if (result.status === "not_found") return "Dit CRM-record bestaat niet meer.";
  return "De CRM-actie is tijdelijk niet beschikbaar. Probeer het opnieuw.";
}
