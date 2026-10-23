"use client";

import { useId, useRef } from "react";
import {
  toggleChoice,
  validateFiles,
  type AnswerValue,
  type FieldDefinition,
  type FileMeta,
  type RepeaterItem,
  type RepeaterItemField,
} from "../../../../packages/onboarding-contract/src/index";

type Props = Readonly<{
  field: FieldDefinition;
  value: AnswerValue | undefined;
  error: string | undefined;
  onChange: (value: AnswerValue) => void;
  onBlur: () => void;
  onError: (error: string) => void;
}>;

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Eén renderer voor alle elf veldtypes uit het schema. Label, hulptekst en foutmelding zijn altijd gekoppeld.
export default function OnboardingField({ field, value, error, onChange, onBlur, onError }: Props) {
  const inputId = `field-${field.id}`;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const help = field.note ?? field.notes;
  const describedBy = [error ? errorId : null, help ? helpId : null].filter(Boolean).join(" ") || undefined;
  const invalid = error ? true : undefined;
  const isGroup = field.type === "single_choice" || field.type === "multi_choice";
  const text = typeof value === "string" ? value : "";

  const requirement = field.required ? (
    <span className="field-required">Verplicht</span>
  ) : (
    <span className="field-optional">Optioneel</span>
  );

  const messages = (
    <>
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
      {(help || field.type === "textarea") && (
        <p id={helpId} className="field-help">
          {help && <span>{help}</span>}
          {field.type === "textarea" && field.max !== undefined && (
            <span className="field-count">
              {text.trim().length} / {field.max} tekens
            </span>
          )}
        </p>
      )}
    </>
  );

  if (isGroup) {
    const multi = field.type === "multi_choice";
    const selected = multi ? (Array.isArray(value) ? (value as readonly string[]) : []) : [];
    const range =
      multi && (field.min_items || field.max_items)
        ? ` Kies ${field.min_items && field.max_items ? `${field.min_items}–${field.max_items}` : field.max_items ? `maximaal ${field.max_items}` : `minimaal ${field.min_items}`}.`
        : "";
    return (
      <fieldset
        id={inputId}
        className={error ? "field field-has-error" : "field"}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        <legend className="field-label">
          {field.question}
          {requirement}
          {range && <span className="field-range">{range}</span>}
        </legend>
        <div className="choice-list">
          {field.choices?.map((choice) => {
            const checked = multi ? selected.includes(choice.value) : value === choice.value;
            return (
              <label key={choice.value} className={checked ? "choice choice-checked" : "choice"}>
                <input
                  type={multi ? "checkbox" : "radio"}
                  name={field.id}
                  value={choice.value}
                  checked={checked}
                  aria-invalid={invalid}
                  onChange={(event) =>
                    onChange(multi ? toggleChoice(field, selected, choice.value, event.target.checked) : choice.value)
                  }
                />
                <span>{choice.label}</span>
              </label>
            );
          })}
        </div>
        {messages}
      </fieldset>
    );
  }

  return (
    <div className={error ? "field field-has-error" : "field"}>
      <label htmlFor={inputId} className="field-label">
        {field.question}
        {requirement}
      </label>
      {field.type === "textarea" ? (
        <textarea
          id={inputId}
          className="field-control"
          rows={3}
          value={text}
          placeholder={field.example ? `Bijv. ${field.example}` : undefined}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      ) : field.type === "repeater" ? (
        <RepeaterInput field={field} items={Array.isArray(value) ? (value as readonly RepeaterItem[]) : []} describedBy={describedBy} onChange={onChange} />
      ) : field.type === "file" ? (
        <FileInput
          field={field}
          inputId={inputId}
          files={Array.isArray(value) ? (value as readonly FileMeta[]) : []}
          describedBy={describedBy}
          invalid={invalid}
          onChange={onChange}
          onError={onError}
        />
      ) : (
        <div className={field.type === "money" ? "field-money" : undefined}>
          {field.type === "money" && (
            <span className="field-prefix" aria-hidden="true">
              €
            </span>
          )}
          <input
            id={inputId}
            className="field-control"
            type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
            inputMode={field.type === "number" ? "numeric" : field.type === "money" ? "decimal" : undefined}
            autoComplete={field.type === "email" ? "email" : "off"}
            value={text}
            placeholder={field.example ? `Bijv. ${field.example}` : undefined}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
          />
        </div>
      )}
      {messages}
    </div>
  );
}

function RepeaterInput({
  field,
  items,
  describedBy,
  onChange,
}: Readonly<{ field: FieldDefinition; items: readonly RepeaterItem[]; describedBy?: string; onChange: (value: AnswerValue) => void }>) {
  const max = field.max_items ?? 1;
  const update = (index: number, key: string, text: string) =>
    onChange(items.map((item, position) => (position === index ? { ...item, [key]: text } : item)));

  return (
    <div className="repeater" id={`field-${field.id}`} tabIndex={-1} aria-describedby={describedBy}>
      {items.map((item, index) => (
        <fieldset key={index} className="repeater-item">
          <legend>Aanvullende dienst {index + 1}</legend>
          {(field.item_fields ?? []).map((itemField) => (
            <RepeaterItemInput
              key={itemField.id}
              itemField={itemField}
              id={`field-${field.id}-${index}-${itemField.id}`}
              value={item[itemField.id] ?? ""}
              onChange={(text) => update(index, itemField.id, text)}
            />
          ))}
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => onChange(items.filter((_, position) => position !== index))}
          >
            Verwijder dienst {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button button-secondary button-small"
        disabled={items.length >= max}
        onClick={() => onChange([...items, {}])}
      >
        + Voeg een dienst toe ({items.length}/{max})
      </button>
    </div>
  );
}

function RepeaterItemInput({
  itemField,
  id,
  value,
  onChange,
}: Readonly<{ itemField: RepeaterItemField; id: string; value: string; onChange: (text: string) => void }>) {
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {itemField.question}
        {itemField.required ? <span className="field-required">Verplicht</span> : null}
      </label>
      {itemField.type === "textarea" ? (
        <textarea id={id} className="field-control" rows={2} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input id={id} className="field-control" type="text" value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  );
}

function FileInput({
  field,
  inputId,
  files,
  describedBy,
  invalid,
  onChange,
  onError,
}: Readonly<{
  field: FieldDefinition;
  inputId: string;
  files: readonly FileMeta[];
  describedBy?: string;
  invalid?: true;
  onChange: (value: AnswerValue) => void;
  onError: (error: string) => void;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const limitsId = useId();
  const maxFiles = field.max_files ?? 1;

  return (
    <div className="file-field">
      <input
        ref={inputRef}
        id={inputId}
        className="file-input"
        type="file"
        multiple={maxFiles > 1}
        accept={(field.accept ?? []).join(",")}
        aria-invalid={invalid}
        aria-describedby={[limitsId, describedBy].filter(Boolean).join(" ")}
        onChange={(event) => {
          // Alleen naam, type en grootte; de bestandsinhoud wordt nooit gelezen of verstuurd.
          const picked = Array.from(event.target.files ?? []).map(({ name, size, type }) => ({ name, size, type }));
          event.target.value = "";
          const next = [...files.filter((file) => !picked.some((item) => item.name === file.name)), ...picked];
          const error = validateFiles(field, next);
          if (error) onError(error);
          else onChange(next);
        }}
      />
      <p id={limitsId} className="field-help">
        {(field.accept ?? []).join(", ")} · maximaal {maxFiles} {maxFiles === 1 ? "bestand" : "bestanden"} van elk {field.max_mb ?? 10} MB. Het
        bestand zelf wordt nog niet geüpload; alleen naam, type en grootte worden bewaard.
      </p>
      {files.length > 0 && (
        <ul className="file-list" aria-label="Gekozen bestanden">
          {files.map((file) => (
            <li key={file.name} className="file-chip">
              <span>
                {file.name} <span className="file-meta">({file.type || "onbekend type"}, {formatSize(file.size)})</span>
              </span>
              <button
                type="button"
                className="file-remove"
                aria-label={`Verwijder ${file.name}`}
                onClick={() => onChange(files.filter((item) => item.name !== file.name))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
