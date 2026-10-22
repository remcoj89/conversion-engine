"use client";

import type { ReactNode } from "react";

// Formulierbasis (GE-09): zichtbare labels, verplicht-markering, inline fout gekoppeld via aria-describedby.

type BaseProps = Readonly<{
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
}>;

function describedBy(id: string, error?: string, hint?: string): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

function Label({ id, label, required }: Readonly<{ id: string; label: string; required?: boolean }>) {
  return (
    <label htmlFor={id} className="field__label">
      {label}
      {required ? <span className="field__required"> (verplicht)</span> : <span className="field__optional"> (optioneel)</span>}
    </label>
  );
}

function Messages({ id, error, hint }: Readonly<{ id: string; error?: string; hint?: string }>) {
  return (
    <>
      {hint ? (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      ) : null}
    </>
  );
}

type TextFieldProps = BaseProps &
  Readonly<{
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    type?: "text" | "email" | "tel";
    autoComplete?: string;
    multiline?: boolean;
    maxLength?: number;
  }>;

export function TextField({ id, label, error, hint, required, value, onChange, onBlur, type = "text", autoComplete, multiline, maxLength }: TextFieldProps) {
  const common = {
    id,
    name: id,
    value,
    onBlur,
    maxLength,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy(id, error, hint),
    "aria-required": required || undefined,
    className: "field__input",
  } as const;
  return (
    <div className={error ? "field field--invalid" : "field"}>
      <Label id={id} label={label} required={required} />
      {multiline ? (
        <textarea {...common} rows={4} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input {...common} type={type} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} />
      )}
      <Messages id={id} error={error} hint={hint} />
    </div>
  );
}

type SelectFieldProps = BaseProps &
  Readonly<{ value: string; options: readonly string[]; placeholder: string; onChange: (value: string) => void; onBlur?: () => void }>;

export function SelectField({ id, label, error, hint, required, value, options, placeholder, onChange, onBlur }: SelectFieldProps) {
  return (
    <div className={error ? "field field--invalid" : "field"}>
      <Label id={id} label={label} required={required} />
      <select
        id={id}
        name={id}
        className="field__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        aria-required={required || undefined}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <Messages id={id} error={error} hint={hint} />
    </div>
  );
}

type CheckboxFieldProps = Readonly<{
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  required?: boolean;
  children: ReactNode;
}>;

// Marketing-opt-in gebruikt dit veld zonder `required` en start altijd uitgevinkt (GE-12).
export function CheckboxField({ id, checked, onChange, error, required, children }: CheckboxFieldProps) {
  return (
    <div className={error ? "field field--check field--invalid" : "field field--check"}>
      <input
        id={id}
        name={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-required={required || undefined}
      />
      <label htmlFor={id}>
        {children}
        {required ? <span className="field__required"> (verplicht)</span> : null}
      </label>
      {error ? (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type FormStatus = "idle" | "submitting" | "success" | "unavailable" | "invalid";

// Statusmeldingen (GE-10): geen technische details, wel een bruikbare vervolgstap.
export function FormAlert({ status, messages }: Readonly<{ status: FormStatus; messages: Partial<Record<FormStatus, string>> }>) {
  const message = messages[status];
  if (!message) return null;
  const tone = status === "success" ? "success" : status === "submitting" ? "info" : "error";
  return (
    <p className={`form-alert form-alert--${tone}`} role={tone === "error" ? "alert" : "status"}>
      {message}
    </p>
  );
}
