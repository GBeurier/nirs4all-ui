/** Small form controls shared by the inspector tiles. Local draft state only. */

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "./_cx.js";
import { ChainIcon, type ChainIconName } from "./glyphs.js";
import type { PipelineOperatorParameter } from "./types.js";

/** Returned by a parser to refuse a draft without committing it. */
export const INVALID: unique symbol = Symbol("invalid");

export interface DraftFieldProps {
  /** Committed value, as text. */
  text: string;
  /** Turn the draft into a value, or `INVALID`. */
  parse: (draft: string) => unknown;
  onCommit: (value: unknown) => void;
  label: string;
  placeholder?: string | undefined;
  inputMode?: "text" | "decimal" | "numeric" | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  /** Visible caption before the input; the accessible name is always `label`. */
  caption?: string | undefined;
}

/**
 * Text input holding a local draft, committed on blur or Enter. An invalid
 * draft is kept and flagged so it can be corrected; Escape restores the value.
 */
export function DraftField({ text, parse, onCommit, label, placeholder, inputMode, disabled, className, caption }: DraftFieldProps) {
  const [draft, setDraft] = useState(text);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(text);
    setInvalid(false);
  }, [text]);
  const commit = () => {
    if (draft === text) return setInvalid(false);
    const parsed = parse(draft);
    if (parsed === INVALID) return setInvalid(true);
    setInvalid(false);
    onCommit(parsed);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit();
    else if (event.key === "Escape" && draft !== text) {
      event.stopPropagation();
      setDraft(text);
      setInvalid(false);
    }
  };
  const input = (
    <input
      className={cx("n4rack__input", className)}
      type="text"
      value={draft}
      aria-label={label}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      inputMode={inputMode}
      disabled={disabled}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
  if (!caption) return input;
  return (
    <label className="n4rack__captioned">
      <span aria-hidden="true">{caption}</span>
      {input}
    </label>
  );
}

export interface IconButtonProps {
  icon: ChainIconName;
  label: string;
  onClick: () => void;
  disabled?: boolean | undefined;
  pressed?: boolean | undefined;
  tone?: "danger" | undefined;
  children?: ReactNode;
}

export function IconButton({ icon, label, onClick, disabled, pressed, tone, children }: IconButtonProps) {
  return (
    <button
      type="button"
      className={cx("n4rack__btn", children ? "n4rack__btn--text" : undefined, tone === "danger" ? "n4rack__btn--danger" : undefined)}
      aria-label={children ? undefined : label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <ChainIcon name={icon} />
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

export function valueText(value: unknown): string {
  if (value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function parseJson(draft: string): unknown {
  try {
    return JSON.parse(draft);
  } catch {
    return INVALID;
  }
}

/** JSON when it parses, otherwise the text itself (so `auto` needs no quotes). */
export function parseLoose(draft: string): unknown {
  const trimmed = draft.trim();
  const parsed = parseJson(trimmed);
  return parsed === INVALID ? trimmed : parsed;
}

export function parseNumber(draft: string, integer: boolean): unknown {
  const trimmed = draft.trim();
  if (trimmed === "") return INVALID;
  const value = Number(trimmed);
  return Number.isFinite(value) && (!integer || Number.isInteger(value)) ? value : INVALID;
}

/** Comma-separated values: a JSON list body when possible, loose tokens otherwise. */
export function parseValueList(draft: string): unknown {
  const trimmed = draft.trim();
  if (trimmed === "") return [];
  const asJson = parseJson(`[${trimmed}]`);
  if (asJson !== INVALID) return asJson;
  return trimmed.split(",").map((token) => parseLoose(token));
}

export function valueListText(values: readonly unknown[]): string {
  return values.map((value) => valueText(value)).join(", ");
}

export type ControlKind = "int" | "float" | "bool" | "select" | "string" | "json";

/**
 * Control used for a parameter. The declared type wins while the stored value
 * fits it; any other value (a nested estimator, `null`, a list) is edited as JSON
 * so it is never coerced.
 */
export function controlKind(param: PipelineOperatorParameter, value: unknown): ControlKind {
  const declared: ControlKind = param.type === "int" || param.type === "integer"
    ? "int"
    : param.type === "float" || param.type === "double" || param.type === "number"
    ? "float"
    : param.type === "bool" || param.type === "boolean"
    ? "bool"
    : param.type === "select" || param.type === "enum"
    ? "select"
    : param.type === "string" || param.type === "str"
    ? "string"
    : "json";
  if (value === undefined) return declared === "select" && !param.options?.length ? "string" : declared;
  if ((declared === "int" || declared === "float") && typeof value === "number") return declared;
  if (declared === "bool" && typeof value === "boolean") return "bool";
  if (declared === "string" && typeof value === "string") return "string";
  if (declared === "select" && param.options?.some((option) => option.value === value)) return "select";
  return "json";
}

/** Parameter description synthesized from a stored value (operator not in the catalogue). */
export function inferParameter(name: string, value: unknown): PipelineOperatorParameter {
  const type = typeof value === "number" ? "float" : typeof value === "boolean" ? "bool" : typeof value === "string" ? "string" : "json";
  return { name, type };
}
