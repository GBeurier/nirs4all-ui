import { useMemo, useState, type KeyboardEvent } from "react";

import { cx } from "../workbench/_cx.js";
import { resolveIcons, type WorkbenchIcons } from "../workbench/icons.js";
import type { PlaygroundStrings } from "./locale.js";
import { groupOperators, searchOperators } from "./pipeline.js";
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

/**
 * Command-palette style operator chooser: type to filter across names,
 * categories, tags and descriptions; ↑/↓ to move, Enter to insert. Without a
 * query, operators are grouped by kind and category, core tier first.
 */
export function OperatorPicker({
  operators,
  onPick,
  strings,
  icons,
  kindLabels,
}: {
  operators: readonly OperatorDefinition[];
  onPick: (operator: OperatorDefinition) => void;
  strings: PlaygroundStrings;
  icons?: WorkbenchIcons | undefined;
  kindLabels?: Partial<Record<OperatorKind, string>> | undefined;
}) {
  const icon = resolveIcons(icons);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [kindFilter, setKindFilter] = useState<OperatorKind | "all">("all");
  const labels = { ...OPERATOR_KIND_LABELS, ...kindLabels };

  const pool = useMemo(() => (kindFilter === "all" ? operators : operators.filter((op) => op.kind === kindFilter)), [operators, kindFilter]);
  const flat = useMemo(() => (query.trim() ? searchOperators(pool, query) : groupOperators(pool).flatMap((g) => g.categories.flatMap((c) => c.operators))), [pool, query]);
  const groups = useMemo(() => (query.trim() ? null : groupOperators(pool)), [pool, query]);
  const kinds = useMemo(() => [...new Set(operators.map((op) => op.kind))], [operators]);
  const clampedActive = Math.min(active, Math.max(0, flat.length - 1));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const op = flat[clampedActive];
      if (op) onPick(op);
    }
  };

  const item = (op: OperatorDefinition) => {
    const index = flat.indexOf(op);
    return (
      <li key={op.id}>
        <button
          type="button"
          className={cx("n4pg-op", index === clampedActive && "is-active")}
          onMouseEnter={() => setActive(index)}
          onClick={() => onPick(op)}
          title={op.description}
        >
          <span className="n4pg-op-dot" style={{ background: OPERATOR_KIND_COLORS[op.kind] }} aria-hidden="true" />
          <span className="n4pg-op-text">
            <span className="n4pg-op-name">
              {op.name}
              {op.tier === "core" ? <span className="n4pg-op-core">core</span> : null}
            </span>
            {op.description ? <small>{op.description}</small> : null}
          </span>
          {query.trim() && op.category ? <span className="n4pg-op-cat">{op.category}</span> : null}
        </button>
      </li>
    );
  };

  return (
    <div className="n4pg-picker">
      <div className="n4pg-picker-search">
        {icon.search}
        <input
          className="n4wb-input"
          autoFocus
          value={query}
          placeholder={strings.searchOperators}
          aria-label={strings.searchOperators}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {kinds.length > 1 ? (
        <div className="n4pg-picker-kinds" role="tablist">
          <button type="button" role="tab" aria-selected={kindFilter === "all"} className={cx("n4pg-kind-tab", kindFilter === "all" && "is-active")} onClick={() => setKindFilter("all")}>
            All
          </button>
          {kinds.map((kind) => (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={kindFilter === kind}
              className={cx("n4pg-kind-tab", kindFilter === kind && "is-active")}
              onClick={() => {
                setKindFilter(kind);
                setActive(0);
              }}
            >
              <span className="n4pg-op-dot" style={{ background: OPERATOR_KIND_COLORS[kind] }} aria-hidden="true" />
              {labels[kind]}
            </button>
          ))}
        </div>
      ) : null}
      <div className="n4pg-picker-list" role="listbox">
        {flat.length === 0 ? <p className="n4wb-muted n4pg-picker-empty">{strings.noOperatorMatch}</p> : null}
        {groups
          ? groups.map((group) => (
              <section key={group.kind}>
                <h5 className="n4pg-picker-kind">
                  <span className="n4pg-op-dot" style={{ background: OPERATOR_KIND_COLORS[group.kind] }} aria-hidden="true" />
                  {labels[group.kind]}
                </h5>
                {group.categories.map((category) => (
                  <div key={category.name || "_"}>
                    {category.name ? <h6 className="n4pg-picker-cat">{category.name}</h6> : null}
                    <ul className="n4wb-menu">{category.operators.map(item)}</ul>
                  </div>
                ))}
              </section>
            ))
          : <ul className="n4wb-menu">{flat.map(item)}</ul>}
      </div>
    </div>
  );
}
