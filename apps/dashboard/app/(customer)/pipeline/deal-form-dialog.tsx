"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { WorkspaceFetch } from "../../../lib/session/context";
import { fetchContactsWithOptions, type ContactRecord } from "../crm/crm-data";
import { CrmDialog } from "../crm/crm-dialogs";
import { formatLeadStatus } from "../leads/lead-lifecycle";
import {
  archiveDeal,
  dealFormFromRecord,
  emptyDealForm,
  isDealStageTerminal,
  saveDeal,
  validDealStages,
  validateDealForm,
  type DealFormValues,
  type DealMutationOutcome,
} from "./deal-mutations";
import type { DealStage, EditableDealRecord } from "../../../lib/bff/deals";
import styles from "./pipeline.module.css";
import customerStyles from "../customer.module.css";

type FormState = Readonly<{
  busy: boolean;
  error: string | null;
  success: string | null;
}>;

const initialFormState: FormState = { busy: false, error: null, success: null };

export function DealFormDialog({
  open,
  record,
  fetcher,
  onClose,
  onSaved,
  onArchived,
}: Readonly<{
  open: boolean;
  record: EditableDealRecord | null;
  fetcher: WorkspaceFetch;
  onClose: () => void;
  onSaved: (record: EditableDealRecord, message: string) => void;
  onArchived: (message: string) => void;
}>) {
  const editing = record !== null;
  const [form, setForm] = useState<DealFormValues>(() => record ? dealFormFromRecord(record) : emptyDealForm());
  const [contactsState, setContactsState] = useState<"loading" | "ready" | "unauthenticated" | "forbidden" | "unavailable">("loading");
  const [contacts, setContacts] = useState<readonly ContactRecord[]>([]);
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchContactsWithOptions(fetcher, { includeArchived: false }).then((result) => {
      if (cancelled) return;
      if (result.status !== "ready") {
        setContactsState(result.status);
        setContacts([]);
        return;
      }
      setContactsState("ready");
      setContacts(result.data.items.filter((contact) => contact.status === "active"));
    });
    return () => { cancelled = true; };
  }, [fetcher, open, record]);

  const activeContacts = useMemo(() => contacts.filter((contact) => contact.status === "active"), [contacts]);
  const stageOptions = validDealStages(record?.stage ?? null);
  const contactUnavailable = editing && Boolean(form.contact_id) && !activeContacts.some((contact) => contact.id === form.contact_id);
  const canSubmit = contactsState === "ready" && !contactUnavailable;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateDealForm(form, editing);
    setFieldErrors(validation.errors);
    if (Object.keys(validation.errors).length > 0) return;
    setFormState({ busy: true, error: null, success: null });
    const result = await saveDeal(fetcher, record?.id ?? null, form);
    if (result.status !== "success") {
      setFormState({ busy: false, error: mutationError(result), success: null });
      return;
    }
    setFormState({ busy: false, error: null, success: editing ? "Deal bijgewerkt." : "Deal aangemaakt." });
    onSaved(result.data, editing ? "Deal bijgewerkt." : "Deal aangemaakt.");
  }

  async function handleArchive() {
    if (!record || !window.confirm(`Deal ${record.title} archiveren? De deal blijft bewaard maar verdwijnt uit de actieve pipeline.`)) return;
    setFormState({ busy: true, error: null, success: null });
    const result = await archiveDeal(fetcher, record.id);
    if (result.status !== "success") {
      setFormState({ busy: false, error: mutationError(result), success: null });
      return;
    }
    setFormState({ busy: false, error: null, success: "Deal gearchiveerd." });
    onArchived("Deal gearchiveerd.");
  }

  return (
    <CrmDialog
      open={open}
      title={editing ? "Deal bewerken" : "Nieuwe deal"}
      description="Leg een commerciële kans vast met een bestaande actieve contactpersoon."
      onClose={onClose}
    >
      {contactsState === "loading" ? <p className={styles.dealFormStatus} role="status">Actieve contactpersonen worden geladen…</p> : null}
      {contactsState === "unauthenticated" ? <p className={styles.dealFormError} role="alert">Je sessie is verlopen. Meld je opnieuw aan.</p> : null}
      {contactsState === "forbidden" ? <p className={styles.dealFormError} role="alert">Je account heeft geen toegang tot contactpersonen.</p> : null}
      {contactsState === "unavailable" ? <p className={styles.dealFormError} role="alert">Contactpersonen konden niet worden geladen. Probeer het opnieuw.</p> : null}
      {contactsState === "ready" && activeContacts.length === 0 ? <p className={styles.dealFormError} role="alert">Maak eerst een actieve contactpersoon aan voordat je een deal vastlegt.</p> : null}
      {contactUnavailable ? <p className={styles.dealFormError} role="alert">De aan deze deal gekoppelde contactpersoon is niet actief. Activeer de contactpersoon eerst in Contactpersonen.</p> : null}
      <form className={customerStyles.crmForm} onSubmit={submit} noValidate>
        <div className={customerStyles.crmFormGrid}>
          <SelectField label="Contactpersoon" name="deal-contact" value={form.contact_id} onChange={updateForm(setForm, "contact_id")} required error={fieldErrors.contact_id} disabled={editing || !canSubmit || formState.busy}>
            <option value="">Kies een actieve contactpersoon</option>
            {activeContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.email ?? "geen e-mail"}</option>)}
          </SelectField>
          <TextField label="Dealnaam" name="deal-title" value={form.title} onChange={updateForm(setForm, "title")} required error={fieldErrors.title} disabled={!canSubmit || formState.busy} />
          <TextField label="Bedrag in EUR" name="deal-amount" value={form.amount_eur} onChange={updateForm(setForm, "amount_eur")} error={fieldErrors.amount_eur} placeholder="Bijv. 1250.00" inputMode="decimal" disabled={!canSubmit || formState.busy} />
          <TextField label="Verwachte sluitdatum" name="deal-close-date" type="date" value={form.expected_close_date} onChange={updateForm(setForm, "expected_close_date")} error={fieldErrors.expected_close_date} disabled={!canSubmit || formState.busy} />
          <SelectField label="Pipelinefase" name="deal-stage" value={form.stage} onChange={(value) => setForm((current) => ({ ...current, stage: value as DealStage, loss_reason: value === "lost" ? current.loss_reason : "" }))} error={fieldErrors.stage} disabled={!canSubmit || formState.busy || isDealStageTerminal(record?.stage ?? "new")}>
            {stageOptions.map((stage) => <option key={stage} value={stage}>{formatLeadStatus(stage)}</option>)}
          </SelectField>
          {form.stage === "lost" ? <TextAreaField label="Reden verloren" name="deal-loss-reason" value={form.loss_reason} onChange={updateForm(setForm, "loss_reason")} error={fieldErrors.loss_reason} disabled={!canSubmit || formState.busy} /> : null}
          <TextAreaField label="Omschrijving" name="deal-description" value={form.description} onChange={updateForm(setForm, "description")} disabled={!canSubmit || formState.busy} fullWidth />
        </div>
        <div className={customerStyles.crmDialogFeedback} aria-live="polite" role={formState.error ? "alert" : undefined}>
          {formState.error ? <p className={customerStyles.crmDialogError}>{formState.error}</p> : null}
          {formState.success ? <p className={customerStyles.crmDialogSuccess}>{formState.success}</p> : null}
        </div>
        <div className={customerStyles.crmDialogActions}>
          {editing ? <button className="button button-secondary" type="button" onClick={() => void handleArchive()} disabled={formState.busy}>Deal archiveren</button> : null}
          <span className={customerStyles.crmRowActions}>
            <button className="button button-secondary" type="button" onClick={onClose} disabled={formState.busy}>Annuleren</button>
            <button className="button button-primary" type="submit" disabled={formState.busy || !canSubmit}>{formState.busy ? "Bezig…" : editing ? "Wijzigingen opslaan" : "Deal opslaan"}</button>
          </span>
        </div>
      </form>
    </CrmDialog>
  );
}

function TextField({ label, name, value, onChange, error, required = false, disabled, type = "text", placeholder, inputMode }: Readonly<{ label: string; name: string; value: string; onChange: (value: string) => void; error?: string; required?: boolean; disabled: boolean; type?: string; placeholder?: string; inputMode?: "decimal" }>) {
  const errorId = `${name}-error`;
  return <div className={`field ${error ? "field-has-error" : ""}`}><label className="field-label" htmlFor={name}>{label}{required ? <span className="field-required">Verplicht</span> : <span className="field-optional">Optioneel</span>}</label><input className="field-control" id={name} name={name} type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.currentTarget.value)} disabled={disabled} required={required} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} />{error ? <p className="field-error" id={errorId}>{error}</p> : null}</div>;
}

function TextAreaField({ label, name, value, onChange, disabled, fullWidth = false, error }: Readonly<{ label: string; name: string; value: string; onChange: (value: string) => void; disabled: boolean; fullWidth?: boolean; error?: string }>) {
  const errorId = `${name}-error`;
  return <div className={`field ${fullWidth ? customerStyles.crmFormFull : ""} ${error ? "field-has-error" : ""}`}><label className="field-label" htmlFor={name}>{label}<span className="field-optional">Optioneel</span></label><textarea className="field-control" id={name} name={name} value={value} onChange={(event) => onChange(event.currentTarget.value)} disabled={disabled} rows={3} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} />{error ? <p className="field-error" id={errorId}>{error}</p> : null}</div>;
}

function SelectField({ label, name, value, onChange, disabled, children, required = false, error }: Readonly<{ label: string; name: string; value: string; onChange: (value: string) => void; disabled: boolean; children: ReactNode; required?: boolean; error?: string }>) {
  const errorId = `${name}-error`;
  return <div className={`field ${error ? "field-has-error" : ""}`}><label className="field-label" htmlFor={name}>{label}{required ? <span className="field-required">Verplicht</span> : <span className="field-optional">Optioneel</span>}</label><select className="field-control" id={name} name={name} value={value} onChange={(event) => onChange(event.currentTarget.value)} disabled={disabled} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}>{children}</select>{error ? <p className="field-error" id={errorId}>{error}</p> : null}</div>;
}

function updateForm<T extends object>(setForm: (value: T | ((current: T) => T)) => void, key: keyof T) {
  return (value: string) => setForm((current) => ({ ...current, [key]: value }));
}

function mutationError(result: Exclude<DealMutationOutcome, { status: "success" }>): string {
  if (result.status === "invalid") return "Controleer de dealgegevens en probeer het opnieuw.";
  if (result.status === "conflict") return "De deal is intussen gewijzigd, gearchiveerd of kan niet naar deze fase worden verplaatst.";
  if (result.status === "unauthenticated") return "Je sessie is verlopen. Meld je opnieuw aan.";
  if (result.status === "forbidden") return "Je account heeft geen toestemming voor deze dealactie.";
  if (result.status === "not_found") return "Deze deal bestaat niet meer binnen de klantomgeving.";
  return "De dealactie is tijdelijk niet beschikbaar. Probeer het opnieuw.";
}
