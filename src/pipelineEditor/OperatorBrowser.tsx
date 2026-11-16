/**
 * Operator browser shown in the device strip while an insert point is active.
 * Lists what the host catalogue offers; nothing here is a built-in operator.
 */

import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";

import { cx } from "./_cx.js";
import { catalogStructures, catalogTypes, operatorStep, roleForType, searchOperators, structureStep } from "./catalog.js";
import { CHAIN_ROLE_COLORS, ChainGlyph, ChainIcon } from "./glyphs.js";
import type { PipelineChainLabels } from "./locale.js";
import type { PipelineCatalog } from "./types.js";

export const STEP_DRAG_TYPE = "application/x-n4rack-step";

export interface OperatorBrowserProps {
  catalog: PipelineCatalog;
  labels: PipelineChainLabels;
  /** Where the chosen step will land, e.g. "after SNV". */
  target: string;
  onPick: (step: unknown) => void;
  onClose: () => void;
  onDragStep?: ((step: unknown | null) => void) | undefined;
  /** Focus the search field whenever this changes to a non-zero value. */
  focusToken?: number | undefined;
}

export function OperatorBrowser({ catalog, labels, target, onPick, onClose, onDragStep, focusToken = 0 }: OperatorBrowserProps) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const types = useMemo(() => catalogTypes(catalog), [catalog]);
  const operators = useMemo(() => searchOperators(catalog, query, type), [catalog, query, type]);
  const structures = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return type ? [] : catalogStructures(catalog).filter((structure) => terms.every((term) => structure.label.toLowerCase().includes(term)));
  }, [catalog, query, type]);

  useEffect(() => {
    if (focusToken > 0) searchRef.current?.focus();
  }, [focusToken]);

  const first = operators[0] ? operatorStep(operators[0]) : structures[0] ? structureStep(structures[0]) : undefined;
  const entries = () => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-entry]") ?? []);

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && first !== undefined) {
      event.preventDefault();
      onPick(first);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      entries()[0]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };
  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = entries();
    const index = all.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      all[Math.min(all.length - 1, index + 1)]?.focus();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      if (index <= 0) searchRef.current?.focus();
      else all[index - 1]?.focus();
    }
  };
  const dragProps = (step: () => unknown) => ({
    draggable: true,
    onDragStart: (event: DragEvent<HTMLButtonElement>) => {
      const value = step();
      event.dataTransfer.setData(STEP_DRAG_TYPE, JSON.stringify(value));
      event.dataTransfer.effectAllowed = "copy";
      onDragStep?.(value);
    },
    onDragEnd: () => onDragStep?.(null),
  });

  return (
    <div className="n4rack__browser">
      <div className="n4rack__browser-head">
        <strong className="n4rack__browser-title">{labels.browserTitle} <span>{target}</span></strong>
        <label className="n4rack__search">
          <ChainIcon name="search" />
          <input
            ref={searchRef}
            type="search"
            className="n4rack__search-input"
            aria-label={labels.search}
            placeholder={labels.search}
            value={query}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={onSearchKey}
          />
        </label>
        <div className="n4rack__filters" role="group" aria-label={labels.search}>
          <button type="button" className="n4rack__filter" aria-pressed={type === null} onClick={() => setType(null)}>{labels.all}</button>
          {types.map((entry) => (
            <button key={entry} type="button" className="n4rack__filter" aria-pressed={type === entry} onClick={() => setType(type === entry ? null : entry)}
              style={{ ["--n4rack-accent" as string]: CHAIN_ROLE_COLORS[roleForType(entry)] }}>
              {labels.operatorType[entry] ?? entry}
            </button>
          ))}
        </div>
        <button type="button" className="n4rack__btn" aria-label={labels.close} title={labels.close} onClick={onClose}>
          <ChainIcon name="close" />
        </button>
      </div>
      <div className="n4rack__browser-list" ref={listRef} onKeyDown={onListKey}>
        {operators.map((operator) => {
          const role = roleForType(operator.type);
          return (
            <button
              key={operator.id}
              type="button"
              data-entry=""
              className="n4rack__entry"
              style={{ ["--n4rack-accent" as string]: CHAIN_ROLE_COLORS[role] }}
              title={operator.description ?? operator.classPath ?? operator.name}
              onClick={() => onPick(operatorStep(operator))}
              {...dragProps(() => operatorStep(operator))}
            >
              <span className="n4rack__entry-glyph"><ChainGlyph kind={role} /></span>
              <span className="n4rack__entry-name">{operator.name}</span>
              <span className="n4rack__entry-meta">{operator.category ?? labels.operatorType[operator.type] ?? operator.type}</span>
            </button>
          );
        })}
        {structures.map((structure) => (
          <button
            key={structure.id}
            type="button"
            data-entry=""
            className={cx("n4rack__entry", "n4rack__entry--structure")}
            title={structure.description ?? structure.label}
            onClick={() => onPick(structureStep(structure))}
            {...dragProps(() => structureStep(structure))}
          >
            <span className="n4rack__entry-glyph"><ChainGlyph kind="branch" /></span>
            <span className="n4rack__entry-name">{structure.label}</span>
            <span className="n4rack__entry-meta">{labels.structure}</span>
          </button>
        ))}
        {operators.length === 0 && structures.length === 0 ? (
          <p className="n4rack__tiles-empty">{catalog.operators.length === 0 ? labels.emptyCatalog : labels.noMatch}</p>
        ) : null}
      </div>
    </div>
  );
}
