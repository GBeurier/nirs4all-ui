/**
 * Workbench layout primitives shared by the Playground and Inspector capsules:
 * the shell (header · left panel · view grid · right drawer · status bar), the
 * tiled view grid with layout presets / maximize / drag-reorder, and the
 * uniform view panel chrome.
 */

import { useCallback, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "./_cx.js";
import { IconButton, Popover } from "./controls.js";
import { resolveIcons, type WorkbenchIcons } from "./icons.js";

export type LayoutPreset = "grid" | "focus" | "columns" | "stack";

export const LAYOUT_PRESETS: readonly LayoutPreset[] = ["focus", "grid", "columns", "stack"];

/** Persistable view arrangement (hosts may store it per user / per dataset). */
export interface WorkbenchLayout {
  preset: LayoutPreset;
  /** Visible view ids, in display order. */
  views: readonly string[];
  /** Currently maximized view, if any. */
  maximized?: string | null | undefined;
}

/** One pluggable view a capsule can show in its grid. */
export interface ViewSpec {
  id: string;
  title: string;
  /** Short line under the title (current mode, counts…). */
  subtitle?: ReactNode | undefined;
  icon?: ReactNode | undefined;
  /** When false, the view renders `unavailableReason` instead of its body. */
  available?: boolean | undefined;
  unavailableReason?: ReactNode | undefined;
  /** One-line help shown in the views menu. */
  description?: string | undefined;
  /** Section of the views menu this view is listed under. */
  group?: string | undefined;
  render: () => ReactNode;
  /** View-specific options rendered in the header popover. */
  options?: ReactNode | undefined;
  /** Extra header actions (right side, before maximize). */
  actions?: ReactNode | undefined;
  /** Shown while the host recomputes this view's data. */
  busy?: boolean | undefined;
}

export interface WorkbenchShellProps {
  header: ReactNode;
  left?: ReactNode | undefined;
  right?: ReactNode | undefined;
  status?: ReactNode | undefined;
  children: ReactNode;
  leftOpen?: boolean | undefined;
  rightOpen?: boolean | undefined;
  /** Initial left panel width in px (user-resizable). */
  leftWidth?: number | undefined;
  rightWidth?: number | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  onKeyDown?: ((event: KeyboardEvent<HTMLDivElement>) => void) | undefined;
  ariaLabel: string;
}

/**
 * The capsule frame. It fills its parent (give the host container a height),
 * scopes keyboard shortcuts to itself (focus-within, never `window`), and lets
 * the user resize the left panel.
 */
export function WorkbenchShell({
  header,
  left,
  right,
  status,
  children,
  leftOpen = true,
  rightOpen = true,
  leftWidth = 320,
  rightWidth = 320,
  className,
  style,
  onKeyDown,
  ariaLabel,
}: WorkbenchShellProps) {
  const [width, setWidth] = useState(leftWidth);
  const drag = useRef<{ start: number; width: number } | null>(null);
  const showLeft = Boolean(left) && leftOpen;
  const showRight = Boolean(right) && rightOpen;
  const columns = [showLeft ? `${width}px` : null, "minmax(0, 1fr)", showRight ? `${rightWidth}px` : null].filter(Boolean).join(" ");

  return (
    <div
      className={cx("n4wb", className)}
      style={style}
      onKeyDown={onKeyDown}
      role="application"
      aria-label={ariaLabel}
      aria-roledescription="workbench"
    >
      <div className="n4wb-header">{header}</div>
      <div className="n4wb-body" style={{ gridTemplateColumns: columns }}>
        {showLeft ? (
          <aside className="n4wb-left">
            {left}
            <div
              className="n4wb-resize"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panel"
              tabIndex={0}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = { start: event.clientX, width };
              }}
              onPointerMove={(event) => {
                if (!drag.current) return;
                setWidth(Math.max(240, Math.min(560, drag.current.width + event.clientX - drag.current.start)));
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") setWidth((w) => Math.max(240, w - 16));
                if (event.key === "ArrowRight") setWidth((w) => Math.min(560, w + 16));
              }}
            />
          </aside>
        ) : null}
        <main className="n4wb-main">{children}</main>
        {showRight ? <aside className="n4wb-right">{right}</aside> : null}
      </div>
      {status ? <div className="n4wb-status">{status}</div> : null}
    </div>
  );
}

export interface ViewGridProps {
  views: readonly ViewSpec[];
  layout: WorkbenchLayout;
  onLayoutChange: (layout: WorkbenchLayout) => void;
  icons?: WorkbenchIcons | undefined;
  empty?: ReactNode | undefined;
  labels?: Partial<ViewGridLabels> | undefined;
}

export interface ViewGridLabels {
  maximize: string;
  restore: string;
  hide: string;
  options: string;
  unavailable: string;
  updating: string;
  dragHint: string;
}

const DEFAULT_GRID_LABELS: ViewGridLabels = {
  maximize: "Maximize",
  restore: "Restore",
  hide: "Hide view",
  options: "View options",
  unavailable: "Not available",
  updating: "Updating…",
  dragHint: "Drag to reorder",
};

/**
 * Tiled, reorderable view area. Presets: `focus` (one large view + a side
 * column), `grid` (2 × n), `columns` (3 × n) and `stack` (one per row).
 * Double-click a header (or press the maximize button) to maximize a view.
 */
export function ViewGrid({ views, layout, onLayoutChange, icons, empty, labels }: ViewGridProps) {
  const icon = resolveIcons(icons);
  const text = { ...DEFAULT_GRID_LABELS, ...labels };
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const byId = new Map(views.map((view) => [view.id, view]));
  const visible = layout.views.map((id) => byId.get(id)).filter((view): view is ViewSpec => Boolean(view));
  const maximized = layout.maximized ? byId.get(layout.maximized) : undefined;

  const setMaximized = useCallback(
    (id: string | null) => onLayoutChange({ ...layout, maximized: id }),
    [layout, onLayoutChange],
  );
  const hide = (id: string) =>
    onLayoutChange({ ...layout, views: layout.views.filter((v) => v !== id), maximized: layout.maximized === id ? null : layout.maximized ?? null });
  const move = (from: string, to: string) => {
    if (from === to) return;
    const order = [...layout.views];
    const fromIndex = order.indexOf(from);
    const toIndex = order.indexOf(to);
    if (fromIndex < 0 || toIndex < 0) return;
    order.splice(fromIndex, 1);
    order.splice(toIndex, 0, from);
    onLayoutChange({ ...layout, views: order });
  };

  if (visible.length === 0) return <div className="n4wb-grid-empty">{empty}</div>;

  const shown = maximized ? [maximized] : visible;
  return (
    <div className={cx("n4wb-grid", `n4wb-grid-${maximized ? "max" : layout.preset}`)} data-count={shown.length}>
      {shown.map((view, index) => (
        <section
          key={view.id}
          className={cx(
            "n4wb-view",
            index === 0 && "is-lead",
            dragging === view.id && "is-dragging",
            dropTarget === view.id && dragging !== view.id && "is-drop-target",
          )}
          aria-label={view.title}
          onDragOver={(event) => {
            if (!dragging) return;
            event.preventDefault();
            setDropTarget(view.id);
          }}
          onDragLeave={() => setDropTarget((t) => (t === view.id ? null : t))}
          onDrop={(event) => {
            event.preventDefault();
            if (dragging) move(dragging, view.id);
            setDragging(null);
            setDropTarget(null);
          }}
        >
          <header
            className="n4wb-view-head"
            draggable={!maximized}
            title={maximized ? undefined : text.dragHint}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", view.id);
              setDragging(view.id);
            }}
            onDragEnd={() => {
              setDragging(null);
              setDropTarget(null);
            }}
            onDoubleClick={(event) => {
              if ((event.target as HTMLElement).closest("button, select, input, .n4wb-popover")) return;
              setMaximized(maximized ? null : view.id);
            }}
          >
            {view.icon ? <span className="n4wb-view-icon">{view.icon}</span> : null}
            <span className="n4wb-view-titles">
              <span className="n4wb-view-title">{view.title}</span>
              {view.subtitle ? <span className="n4wb-view-subtitle">{view.subtitle}</span> : null}
            </span>
            {view.busy ? <span className="n4wb-view-busy" role="status" aria-label={text.updating} /> : null}
            <span className="n4wb-view-actions">
              {view.actions}
              {view.options ? (
                <Popover trigger={icon.settings} label={`${view.title} · ${text.options}`} triggerClassName="n4wb-icon-btn">
                  <div className="n4wb-options">{view.options}</div>
                </Popover>
              ) : null}
              <IconButton label={maximized ? text.restore : text.maximize} onClick={() => setMaximized(maximized ? null : view.id)}>
                {maximized ? icon.minimize : icon.maximize}
              </IconButton>
              {!maximized ? (
                <IconButton label={text.hide} onClick={() => hide(view.id)}>
                  {icon.close}
                </IconButton>
              ) : null}
            </span>
          </header>
          <div className="n4wb-view-body">
            {view.available === false ? (
              <div className="n4wb-empty" role="status">
                <strong>{text.unavailable}</strong>
                {view.unavailableReason ? <p>{view.unavailableReason}</p> : null}
              </div>
            ) : (
              view.render()
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Views menu: toggle which views are visible, grouped and described. */
export function ViewsMenu({
  views,
  layout,
  onLayoutChange,
  label,
  icons,
}: {
  views: readonly ViewSpec[];
  layout: WorkbenchLayout;
  onLayoutChange: (layout: WorkbenchLayout) => void;
  label: string;
  icons?: WorkbenchIcons | undefined;
}) {
  const icon = resolveIcons(icons);
  const visible = new Set(layout.views);
  return (
    <Popover
      label={label}
      triggerClassName="n4wb-btn n4wb-btn-outline"
      trigger={
        <>
          {icon.layers}
          <span>{label}</span>
          <span className="n4wb-count">{layout.views.length}</span>
        </>
      }
    >
      <ul className="n4wb-menu" role="list">
        {views.map((view, index) => {
          const on = visible.has(view.id);
          const heading = view.group && view.group !== views[index - 1]?.group ? view.group : null;
          return (
            <li key={view.id}>
              {heading ? <span className="n4wb-menu-group">{heading}</span> : null}
              <button
                type="button"
                className={cx("n4wb-menu-item", on && "is-on")}
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() =>
                  onLayoutChange({
                    ...layout,
                    views: on ? layout.views.filter((id) => id !== view.id) : [...layout.views, view.id],
                    maximized: null,
                  })
                }
              >
                <span className="n4wb-menu-check" aria-hidden="true">
                  {on ? icon.check : null}
                </span>
                {view.icon ? <span className="n4wb-menu-icon">{view.icon}</span> : null}
                <span className="n4wb-menu-text">
                  <span>{view.title}</span>
                  {view.description ? <small>{view.description}</small> : null}
                </span>
                {view.available === false ? <span className="n4wb-menu-note">—</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}

const PRESET_GLYPHS: Record<LayoutPreset, ReactNode> = {
  focus: (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="2" width="8.5" height="12" rx="1.2" fill="currentColor" opacity=".9" />
      <rect x="11.5" y="2" width="3" height="5.5" rx="1" fill="currentColor" opacity=".5" />
      <rect x="11.5" y="8.5" width="3" height="5.5" rx="1" fill="currentColor" opacity=".5" />
    </svg>
  ),
  grid: (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="2" width="6" height="5.5" rx="1" fill="currentColor" opacity=".8" />
      <rect x="8.5" y="2" width="6" height="5.5" rx="1" fill="currentColor" opacity=".8" />
      <rect x="1.5" y="8.5" width="6" height="5.5" rx="1" fill="currentColor" opacity=".8" />
      <rect x="8.5" y="8.5" width="6" height="5.5" rx="1" fill="currentColor" opacity=".8" />
    </svg>
  ),
  columns: (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1" y="2" width="4" height="12" rx="1" fill="currentColor" opacity=".8" />
      <rect x="6" y="2" width="4" height="12" rx="1" fill="currentColor" opacity=".8" />
      <rect x="11" y="2" width="4" height="12" rx="1" fill="currentColor" opacity=".8" />
    </svg>
  ),
  stack: (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="2" width="13" height="5.5" rx="1" fill="currentColor" opacity=".8" />
      <rect x="1.5" y="8.5" width="13" height="5.5" rx="1" fill="currentColor" opacity=".8" />
    </svg>
  ),
};

export function LayoutPresetPicker({
  value,
  onChange,
  labels,
}: {
  value: LayoutPreset;
  onChange: (preset: LayoutPreset) => void;
  labels?: Partial<Record<LayoutPreset, string>> | undefined;
}) {
  const names: Record<LayoutPreset, string> = { focus: "Focus", grid: "Grid", columns: "Columns", stack: "Stack", ...labels };
  return (
    <div className="n4wb-seg n4wb-seg-sm" role="radiogroup" aria-label="Layout">
      {LAYOUT_PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          role="radio"
          aria-checked={value === preset}
          className={cx("n4wb-seg-btn", "n4wb-seg-icon", value === preset && "is-active")}
          title={names[preset]}
          aria-label={names[preset]}
          onClick={() => onChange(preset)}
        >
          {PRESET_GLYPHS[preset]}
        </button>
      ))}
    </div>
  );
}

/** Collapsible section used inside the side panels. */
export function PanelSection({
  title,
  children,
  actions,
  defaultOpen = true,
  count,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode | undefined;
  defaultOpen?: boolean | undefined;
  count?: ReactNode | undefined;
  className?: string | undefined;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cx("n4wb-section", open && "is-open", className)}>
      <header className="n4wb-section-head">
        <button type="button" className="n4wb-section-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <svg className="n4wb-section-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4 2.5L8 6l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{title}</span>
          {count !== undefined ? <span className="n4wb-count">{count}</span> : null}
        </button>
        {actions ? <span className="n4wb-section-actions">{actions}</span> : null}
      </header>
      {open ? <div className="n4wb-section-body">{children}</div> : null}
    </section>
  );
}
