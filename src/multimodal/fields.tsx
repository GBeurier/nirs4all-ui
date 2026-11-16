import { useEffect, useId, useState, type KeyboardEvent } from "react";

export interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  integer?: boolean;
  min?: number;
  max?: number;
  step?: number | "any";
  hint?: string;
  disabled?: boolean;
}

/**
 * Number input that keeps a local text draft and commits a finite, in-range
 * value on blur or Enter, so intermediate input such as `0.0` stays editable.
 * Invalid drafts revert to the controlled value.
 */
export function NumberField({ label, value, onCommit, integer, min, max, step, hint, disabled }: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft.trim());
    const valid =
      draft.trim() !== "" &&
      Number.isFinite(parsed) &&
      (!integer || Number.isInteger(parsed)) &&
      (min === undefined || parsed >= min) &&
      (max === undefined || parsed <= max);
    if (!valid) {
      setDraft(String(value));
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") setDraft(String(value));
  };
  return (
    <label className="n4mm-field" htmlFor={id}>
      <span className="n4mm-field__label">{label}</span>
      <input
        id={id}
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        value={draft}
        min={min}
        max={max}
        step={step ?? (integer ? 1 : "any")}
        disabled={disabled}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      {hint ? <span className="n4mm-field__hint">{hint}</span> : null}
    </label>
  );
}

export interface TextFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  /** Returns an error message for an invalid draft, or null. */
  validate?: (draft: string) => string | null;
  hint?: string;
  disabled?: boolean;
  mono?: boolean;
}

/** Text input with draft/commit semantics and a visible validation message. */
export function TextField({ label, value, onCommit, validate, hint, disabled, mono }: TextFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const error = validate ? validate(draft) : null;
  const commit = () => {
    if (error) return;
    if (draft !== value) onCommit(draft);
  };
  return (
    <label className="n4mm-field" htmlFor={id}>
      <span className="n4mm-field__label">{label}</span>
      <input
        id={id}
        type="text"
        className={mono ? "n4mm-mono" : undefined}
        value={draft}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setDraft(value);
        }}
      />
      {error ? (
        <span className="n4mm-field__error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="n4mm-field__hint">{hint}</span>
      ) : null}
    </label>
  );
}
