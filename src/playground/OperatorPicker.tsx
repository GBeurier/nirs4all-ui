import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cx } from "../workbench/_cx.js";
import type { RowColumn } from "../workbench/colorBy.js";
import { Button, Segmented } from "../workbench/controls.js";
import { resolveIcons, type WorkbenchIcons } from "../workbench/icons.js";
import type { PlaygroundStrings } from "./locale.js";
import { ParamEditor } from "./ParamEditor.js";
import { defaultParams, groupOperators, OPERATOR_KIND_ORDER, searchOperators } from "./pipeline.js";
import type { OperatorDefinition, OperatorKind } from "./types.js";

export const OPERATOR_KIND_COLORS: Readonly<Record<OperatorKind, string>> = {
  preprocessing: "#0d9488",
  feature: "#7c3aed",
  filter: "#e11d48",
  augmentation: "#10b981",
  splitting: "#4f46e5",
  other: "#64748b",
};

export const OPERATOR_KIND_LABELS: Readonly<Record<OperatorKind, string>> = {
  preprocessing: "Preprocessing",
  feature: "Features",
  filter: "Filters",
  augmentation: "Augmentation",
  splitting: "Splitters",
  other: "Other",
};

type TierFilter = "core" | "standard" | "all";

/** Sidebar scope: everything, recently used, one kind, or one category of a kind. */
type Scope = { kind: "all" } | { kind: "recent" } | { kind: "kind"; value: OperatorKind; category?: string };

const TIER_RANK = { core: 0, standard: 1, advanced: 2 } as const;

function inTier(op: OperatorDefinition, tier: TierFilter): boolean {
  const rank = TIER_RANK[op.tier ?? "standard"];
  return tier === "all" || (tier === "standard" ? rank <= 1 : rank === 0);
}

function formatDefault(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) return value.join("–");
  return String(value);
}

export interface OperatorPickerProps {
  operators: readonly OperatorDefinition[];
  /** Insert `operator` with `params`; `keepOpen` when the user adds several in a row. */
  onPick: (operator: OperatorDefinition, params: Record<string, unknown>, keepOpen: boolean) => void;
  onClose: () => void;
  /** Recently added operator ids, most recent first. */
  recent?: readonly string[] | undefined;
  /** How many steps of each operator the pipeline already has. */
  usage?: ReadonlyMap<string, number> | undefined;
  /** Where the step will be inserted (e.g. "after SNV"). */
  insertLabel?: string | undefined;
  /** Dataset columns offered to `column`-typed parameters. */
  columns?: readonly RowColumn[] | undefined;
  strings: PlaygroundStrings;
  icons?: WorkbenchIcons | undefined;
  kindLabels?: Partial<Record<OperatorKind, string>> | undefined;
}

/**
 * Full-size operator browser: a kind / category sidebar with counts, a
 * searchable grid of operator cards and a detail pane where parameters can be
 * tuned before the step is inserted. Keyboard: type to search, ↑↓←→ to move,
 * Enter adds, Shift+Enter adds and keeps the browser open, Esc closes.
 */
export function OperatorPicker({
  operators,
  onPick,
  onClose,
  recent = [],
  usage,
  insertLabel,
  columns = [],
  strings,
  icons,
  kindLabels,
}: OperatorPickerProps) {
  const icon = resolveIcons(icons);
  const labels = { ...OPERATOR_KIND_LABELS, ...kindLabels };
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<TierFilter>("all");
  const [scope, setScope] = useState<Scope>(recent.length > 0 ? { kind: "recent" } : { kind: "all" });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; params: Record<string, unknown> } | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => searchRef.current?.focus(), []);

  const tiered = useMemo(() => operators.filter((op) => inTier(op, tier)), [operators, tier]);
  const byId = useMemo(() => new Map(operators.map((op) => [op.id, op])), [operators]);
  const recentOps = useMemo(() => recent.map((id) => byId.get(id)).filter((op): op is OperatorDefinition => Boolean(op)), [recent, byId]);
  const tree = useMemo(() => groupOperators(tiered), [tiered]);

  // A query searches every operator of the tier; otherwise the sidebar scope decides.
  const sections = useMemo((): Array<{ title: string; kind?: OperatorKind; operators: OperatorDefinition[] }> => {
    if (query.trim()) return [{ title: `${searchOperators(tiered, query).length} results`, operators: searchOperators(tiered, query) }];
    if (scope.kind === "recent") return [{ title: "Recently used", operators: recentOps.filter((op) => inTier(op, tier)) }];
    const groups = scope.kind === "kind" ? tree.filter((g) => g.kind === scope.value) : tree;
    return groups.flatMap((group) =>
      group.categories
        .filter((c) => scope.kind !== "kind" || scope.category === undefined || c.name === scope.category)
        .map((c) => ({ title: c.name || labels[group.kind], kind: group.kind, operators: c.operators })),
    );
  }, [query, tiered, scope, recentOps, tier, tree, labels]);
  const flat = useMemo(() => sections.flatMap((s) => s.operators), [sections]);
  const active = (activeId ? flat.find((op) => op.id === activeId) : undefined) ?? flat[0];
  const params = active && draft?.id === active.id ? draft.params : active ? defaultParams(active) : {};

  const add = (op: OperatorDefinition, keepOpen: boolean) => {
    onPick(op, draft?.id === op.id ? draft.params : defaultParams(op), keepOpen);
    if (keepOpen) {
      setAdded(op.id);
      setTimeout(() => setAdded((id) => (id === op.id ? null : id)), 1200);
    }
  };

  const columnsPerRow = () => {
    const grid = gridRef.current?.querySelector(".n4pg-opgrid-cards");
    if (!grid || typeof getComputedStyle === "undefined") return 1;
    return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  };
  const move = (delta: number) => {
    if (flat.length === 0) return;
    const index = active ? flat.indexOf(active) : -1;
    const next = flat[Math.max(0, Math.min(flat.length - 1, index + delta))]!;
    setActiveId(next.id);
    gridRef.current?.querySelector(`[data-op="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const inField = (event.target as HTMLElement).closest(".n4pg-opdetail-params");
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (inField) {
      return;
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      move(columnsPerRow());
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-columnsPerRow());
    } else if (event.key === "ArrowRight" && (event.target as HTMLElement).tagName !== "INPUT") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft" && (event.target as HTMLElement).tagName !== "INPUT") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter" && active) {
      event.preventDefault();
      add(active, event.shiftKey);
    }
  };

  const countOf = (kind: OperatorKind, category?: string) =>
    tiered.filter((op) => op.kind === kind && (category === undefined || (op.category ?? "") === category)).length;
  const sideItem = (key: string, selected: boolean, onClick: () => void, label: string, count: number, color?: string, nested = false) => (
    <li key={key}>
      <button type="button" className={cx("n4pg-opside-item", selected && "is-active", nested && "is-nested")} onClick={onClick} aria-pressed={selected}>
        {color ? <span className="n4pg-op-dot" style={{ background: color }} aria-hidden="true" /> : null}
        <span className="n4pg-opside-label">{label}</span>
        <span className="n4wb-count">{count}</span>
      </button>
    </li>
  );

  return (
    <div className="n4wb-dialog-scrim n4pg-opbrowser-scrim" onClick={onClose}>
      <div className="n4wb-dialog n4pg-opbrowser" role="dialog" aria-modal="true" aria-label={strings.addStep} onClick={(event) => event.stopPropagation()} onKeyDown={onKeyDown}>
        <header className="n4pg-opbrowser-head">
          <div className="n4pg-opbrowser-search">
            {icon.search}
            <input
              ref={searchRef}
              className="n4wb-input"
              value={query}
              placeholder={strings.searchOperators}
              aria-label={strings.searchOperators}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveId(null);
              }}
            />
            {query ? (
              <button type="button" className="n4wb-icon-btn" aria-label="Clear search" onClick={() => setQuery("")}>
                {icon.close}
              </button>
            ) : null}
          </div>
          <Segmented
            size="xs"
            ariaLabel="Tier"
            value={tier}
            onChange={setTier}
            options={[
              { value: "core", label: "Core" },
              { value: "standard", label: "Standard" },
              { value: "all", label: "All" },
            ]}
          />
          {insertLabel ? <span className="n4pg-opbrowser-where">{insertLabel}</span> : null}
          <button type="button" className="n4wb-icon-btn" onClick={onClose} aria-label="Close" title="Close (Esc)">
            {icon.close}
          </button>
        </header>

        <div className="n4pg-opbrowser-body">
          <nav className="n4pg-opside" aria-label="Operator categories">
            <ul>
              {sideItem("all", scope.kind === "all" && !query, () => { setScope({ kind: "all" }); setQuery(""); }, "All operators", tiered.length)}
              {recentOps.length > 0 ? sideItem("recent", scope.kind === "recent" && !query, () => { setScope({ kind: "recent" }); setQuery(""); }, "Recently used", recentOps.length) : null}
            </ul>
            {OPERATOR_KIND_ORDER.filter((kind) => countOf(kind) > 0).map((kind) => {
              const open = scope.kind === "kind" && scope.value === kind;
              const categories = [...new Set(tiered.filter((op) => op.kind === kind).map((op) => op.category ?? ""))].filter(Boolean).sort();
              return (
                <ul key={kind}>
                  {sideItem(kind, open && scope.category === undefined && !query, () => { setScope({ kind: "kind", value: kind }); setQuery(""); }, labels[kind], countOf(kind), OPERATOR_KIND_COLORS[kind])}
                  {open && categories.length > 1
                    ? categories.map((category) =>
                        sideItem(
                          `${kind}:${category}`,
                          scope.category === category && !query,
                          () => { setScope({ kind: "kind", value: kind, category }); setQuery(""); },
                          category,
                          countOf(kind, category),
                          undefined,
                          true,
                        ),
                      )
                    : null}
                </ul>
              );
            })}
          </nav>

          <div className="n4pg-opgrid" ref={gridRef} role="listbox" aria-label="Operators">
            {flat.length === 0 ? <p className="n4wb-muted n4pg-picker-empty">{strings.noOperatorMatch}</p> : null}
            {sections.map((section, s) =>
              section.operators.length === 0 ? null : (
                <section key={`${section.title}-${s}`}>
                  <h5 className="n4pg-opgrid-title">
                    {section.kind ? <span className="n4pg-op-dot" style={{ background: OPERATOR_KIND_COLORS[section.kind] }} aria-hidden="true" /> : null}
                    {section.title}
                    <span className="n4wb-muted">{section.operators.length}</span>
                  </h5>
                  <div className="n4pg-opgrid-cards">
                    {section.operators.map((op) => {
                      const used = usage?.get(op.id) ?? 0;
                      const paramsList = op.params ?? [];
                      return (
                        <button
                          key={op.id}
                          type="button"
                          role="option"
                          aria-selected={active?.id === op.id}
                          data-op={op.id}
                          className={cx("n4pg-opcard", active?.id === op.id && "is-active", added === op.id && "is-added")}
                          style={{ ["--op-color" as string]: OPERATOR_KIND_COLORS[op.kind] }}
                          onClick={() => setActiveId(op.id)}
                          onDoubleClick={() => add(op, false)}
                          title="Double-click to add · Shift+Enter adds and keeps this open"
                        >
                          <span className="n4pg-opcard-head">
                            <strong>{op.name}</strong>
                            {op.tier === "core" ? <span className="n4pg-op-core">core</span> : null}
                            {used > 0 ? <span className="n4pg-opcard-used">×{used}</span> : null}
                          </span>
                          <span className="n4pg-opcard-meta">
                            {labels[op.kind]}
                            {op.category ? ` · ${op.category}` : ""}
                          </span>
                          {op.description ? <span className="n4pg-opcard-desc">{op.description}</span> : null}
                          {paramsList.length > 0 ? (
                            <span className="n4pg-opcard-params">
                              {paramsList.slice(0, 3).map((p) => (
                                <span key={p.name} className="n4pg-opcard-param">
                                  {p.label ?? p.name} <em>{formatDefault(p.default)}</em>
                                </span>
                              ))}
                              {paramsList.length > 3 ? <span className="n4pg-opcard-param">+{paramsList.length - 3}</span> : null}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ),
            )}
          </div>

          <aside className="n4pg-opdetail" aria-label="Operator details">
            {active ? (
              <>
                <div className="n4pg-opdetail-head" style={{ ["--op-color" as string]: OPERATOR_KIND_COLORS[active.kind] }}>
                  <span className="n4pg-opdetail-kind">
                    <span className="n4pg-op-dot" style={{ background: OPERATOR_KIND_COLORS[active.kind] }} aria-hidden="true" />
                    {labels[active.kind]}
                    {active.category ? ` · ${active.category}` : ""}
                  </span>
                  <h4>{active.name}</h4>
                  <code className="n4pg-opdetail-id">{active.id}</code>
                </div>
                {active.description ? <p className="n4pg-opdetail-desc">{active.description}</p> : null}
                {active.tags?.length ? (
                  <div className="n4wb-chip-row">
                    {active.tags.map((tag) => (
                      <span key={tag} className="n4pg-opdetail-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {active.singleton && (usage?.get(active.id) ?? 0) > 0 ? <p className="n4wb-note is-warning">Only one step of this operator is allowed — it is already in the pipeline.</p> : null}
                {(active.params ?? []).length > 0 ? (
                  <div className="n4pg-opdetail-params">
                    <span className="n4wb-options-title">Parameters</span>
                    {(active.params ?? []).map((param) => (
                      <div key={param.name} className="n4pg-opdetail-param">
                        <ParamEditor
                          param={param}
                          value={params[param.name]}
                          columns={columns}
                          onChange={(value) => setDraft({ id: active.id, params: { ...params, [param.name]: value } })}
                        />
                        {param.help ? <small className="n4wb-muted">{param.help}</small> : null}
                      </div>
                    ))}
                    {draft?.id === active.id ? (
                      <button type="button" className="n4pg-link" onClick={() => setDraft(null)}>
                        Reset to defaults
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="n4wb-muted">No parameters.</p>
                )}
                <div className="n4pg-opdetail-actions">
                  <Button variant="primary" icon={icon.plus} onClick={() => add(active, false)}>
                    {strings.addStep}
                  </Button>
                  <Button variant="outline" onClick={() => add(active, true)} title="Shift+Enter">
                    {added === active.id ? "✓ Added" : "Add & continue"}
                  </Button>
                </div>
              </>
            ) : (
              <p className="n4wb-muted">{strings.noOperatorMatch}</p>
            )}
          </aside>
        </div>
        <footer className="n4pg-opbrowser-foot">
          <span>
            <kbd className="n4wb-kbd">↑↓←→</kbd> move · <kbd className="n4wb-kbd">Enter</kbd> add · <kbd className="n4wb-kbd">Shift</kbd>+<kbd className="n4wb-kbd">Enter</kbd> add & continue · double-click adds ·{" "}
            <kbd className="n4wb-kbd">Esc</kbd> close
          </span>
          <span className="n4wb-muted">
            {flat.length} / {operators.length} operators
          </span>
        </footer>
      </div>
    </div>
  );
}
