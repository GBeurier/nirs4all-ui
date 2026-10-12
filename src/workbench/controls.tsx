/**
 * Small, dependency-free form controls shared by the workbench capsules. They
 * render native elements (button, select, input) for accessibility and speed,
 * themed by `nirs4all-ui/assets/workbench.css`.
 */

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cx } from "./_cx.js";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string | undefined;
  disabled?: boolean | undefined;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = "sm",
  className,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "xs" | "sm" | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cx("n4wb-seg", `n4wb-seg-${size}`, className)} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={cx("n4wb-seg-btn", value === option.value && "is-active")}
          title={option.title}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  group?: string | undefined;
  disabled?: boolean | undefined;
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  inline = true,
  className,
  placeholder,
}: {
  label?: string | undefined;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  inline?: boolean | undefined;
  className?: string | undefined;
  placeholder?: string | undefined;
}) {
  const id = useId();
  const groups = new Map<string, SelectOption[]>();
  const loose: SelectOption[] = [];
  for (const option of options) {
    if (option.group) {
      const bucket = groups.get(option.group);
      if (bucket) bucket.push(option);
      else groups.set(option.group, [option]);
    } else loose.push(option);
  }
  const renderOption = (option: SelectOption) => (
    <option key={option.value} value={option.value} disabled={option.disabled}>
      {option.label}
    </option>
  );
  return (
    <label className={cx("n4wb-field", inline && "n4wb-field-inline", className)} htmlFor={id}>
      {label ? <span className="n4wb-field-label">{label}</span> : null}
      <select id={id} className="n4wb-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {placeholder ? (
          <option value="" disabled={value !== ""}>
            {placeholder}
          </option>
        ) : null}
        {loose.map(renderOption)}
        {[...groups.entries()].map(([group, entries]) => (
          <optgroup key={group} label={group}>
            {entries.map(renderOption)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  active,
  disabled,
  tone,
  className,
  shortcut,
}: {
  label: string;
  onClick?: (() => void) | undefined;
  children: ReactNode;
  active?: boolean | undefined;
  disabled?: boolean | undefined;
  tone?: "danger" | undefined;
  className?: string | undefined;
  shortcut?: string | undefined;
}) {
  return (
    <button
      type="button"
      className={cx("n4wb-icon-btn", active && "is-active", tone === "danger" && "is-danger", className)}
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  title,
  className,
  icon,
}: {
  children: ReactNode;
  onClick?: (() => void) | undefined;
  variant?: "primary" | "ghost" | "outline" | "danger" | undefined;
  disabled?: boolean | undefined;
  title?: string | undefined;
  className?: string | undefined;
  icon?: ReactNode | undefined;
}) {
  return (
    <button type="button" className={cx("n4wb-btn", `n4wb-btn-${variant}`, className)} onClick={onClick} disabled={disabled} title={title}>
      {icon}
      {children}
    </button>
  );
}

export function Chip({
  children,
  color,
  active,
  onClick,
  onRemove,
  title,
  className,
}: {
  children: ReactNode;
  color?: string | undefined;
  active?: boolean | undefined;
  onClick?: (() => void) | undefined;
  onRemove?: (() => void) | undefined;
  title?: string | undefined;
  className?: string | undefined;
}) {
  const body = (
    <>
      {color ? <span className="n4wb-chip-dot" style={{ background: color }} aria-hidden="true" /> : null}
      <span className="n4wb-chip-text">{children}</span>
    </>
  );
  return (
    <span className={cx("n4wb-chip", active && "is-active", onClick && "is-clickable", className)} title={title}>
      {onClick ? (
        <button type="button" className="n4wb-chip-main" onClick={onClick} aria-pressed={active}>
          {body}
        </button>
      ) : (
        <span className="n4wb-chip-main">{body}</span>
      )}
      {onRemove ? (
        <button type="button" className="n4wb-chip-x" onClick={onRemove} aria-label="Remove">
          ×
        </button>
      ) : null}
    </span>
  );
}

/**
 * Anchored popover with click-outside and Escape dismissal. Used for view
 * options and menus so panel headers stay one line tall. It is positioned
 * `fixed` against its trigger and portaled to the capsule root (`.n4wb`, else
 * `document.body`): view panels use CSS containment (`container-type`), which
 * Firefox treats as the containing block of fixed descendants, so rendering
 * in place would offset and clip the popover.
 */
export function Popover({
  trigger,
  children,
  align = "end",
  label,
  className,
  triggerClassName,
  popoverClassName,
}: {
  trigger: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end" | undefined;
  label: string;
  className?: string | undefined;
  triggerClassName?: string | undefined;
  /** Class on the floating panel itself (it is portaled, so parent selectors do not reach it). */
  popoverClassName?: string | undefined;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const open = anchor !== null;
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setAnchor(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setAnchor(null);
        triggerRef.current?.focus();
      }
    };
    const onResize = () => setAnchor(null);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);
  const close = () => setAnchor(null);
  let style: CSSProperties | undefined;
  if (anchor && typeof window !== "undefined") {
    const top = anchor.bottom + 6;
    style = {
      top,
      maxHeight: Math.max(160, Math.min(560, window.innerHeight - top - 12)),
      ...(align === "start" ? { left: Math.max(8, anchor.left) } : { right: Math.max(8, window.innerWidth - anchor.right) }),
    };
  }
  return (
    <div className={cx("n4wb-popover-root", className)} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={cx("n4wb-popover-trigger", open && "is-open", triggerClassName)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={(event) => setAnchor(open ? null : event.currentTarget.getBoundingClientRect())}
      >
        {trigger}
      </button>
      {open
        ? createPortal(
            <div ref={popoverRef} className={cx("n4wb-popover", popoverClassName)} style={style} role="dialog" aria-label={label}>
              {typeof children === "function" ? children(close) : children}
            </div>,
            triggerRef.current?.closest(".n4wb") ?? document.body,
          )
        : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: string | undefined;
}) {
  return (
    <label className="n4wb-toggle" title={hint}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="n4wb-toggle-track" aria-hidden="true">
        <span className="n4wb-toggle-thumb" />
      </span>
      <span className="n4wb-toggle-label">{label}</span>
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  unit?: string | undefined;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <label className="n4wb-field n4wb-field-number" htmlFor={id}>
      <span className="n4wb-field-label">{label}</span>
      <span className="n4wb-number">
        <input
          id={id}
          className="n4wb-input"
          inputMode="decimal"
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
        />
        {unit ? <span className="n4wb-number-unit">{unit}</span> : null}
      </span>
    </label>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  icon,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon?: ReactNode | undefined;
  autoFocus?: boolean | undefined;
}) {
  return (
    <span className="n4wb-search">
      {icon}
      <input
        className="n4wb-input"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  );
}

export function KeyHint({ children }: { children: ReactNode }) {
  return <kbd className="n4wb-kbd">{children}</kbd>;
}

export function EmptyState({
  title,
  children,
  icon,
  action,
  tone = "neutral",
}: {
  title: ReactNode;
  children?: ReactNode | undefined;
  icon?: ReactNode | undefined;
  action?: ReactNode | undefined;
  tone?: "neutral" | "warning" | undefined;
}) {
  return (
    <div className={cx("n4wb-empty", tone === "warning" && "is-warning")} role="status">
      {icon ? <span className="n4wb-empty-icon">{icon}</span> : null}
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode | undefined;
  tone?: "good" | "bad" | "accent" | undefined;
}) {
  return (
    <div className={cx("n4wb-stat", tone && `is-${tone}`)}>
      <span className="n4wb-stat-label">{label}</span>
      <strong className="n4wb-stat-value">{value}</strong>
      {hint ? <span className="n4wb-stat-hint">{hint}</span> : null}
    </div>
  );
}
