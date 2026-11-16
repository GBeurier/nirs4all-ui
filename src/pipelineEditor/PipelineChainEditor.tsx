/**
 * PipelineChainEditor — a rack-style editor for nirs4all pipelines.
 *
 * The pipeline reads left to right as a signal chain on a grid of cells:
 * steps are cells on a wire, branches and alternatives are parallel lanes that
 * split and join, and the device strip under the rack edits the selected cell.
 *
 * Controlled and presentational: the host owns the document, the catalogue of
 * operators, history, persistence and execution. This component only turns
 * gestures into new documents.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "./_cx.js";
import { indexCatalog } from "./catalog.js";
import { ChainCanvas, type CanvasDrag } from "./ChainCanvas.js";
import { DraftField, IconButton } from "./controls.js";
import {
  addLane,
  duplicateItem,
  insertStep,
  moveItem,
  moveLane,
  nudgeItem,
  removeItem,
  removeLane,
  setBypassed,
  setDocumentName,
  shiftItemLane,
} from "./edit.js";
import { SelectionInspector, type InspectorContext } from "./Inspector.js";
import { layoutChain } from "./layout.js";
import { resolvePipelineChainLabels, type PipelineChainLabels } from "./locale.js";
import { parsePipeline } from "./model.js";
import { CHAIN_SHORTCUTS, childSelection, commandForKey, focusTargets, moveFocus, parentSelection, selectionKey, type ChainCommand } from "./navigation.js";
import { OperatorBrowser } from "./OperatorBrowser.js";
import { formatCount, pipelineChainStats } from "./summary.js";
import type { ChainModel, ChainSelection, EditResult, PipelineCatalog, PipelineChainDocument } from "./types.js";

export interface PipelineChainEditorProps {
  /** The edited document (canonical nirs4all pipeline; see `PipelineChainDocument`). */
  value: PipelineChainDocument;
  /** Receives the next document after every edit. */
  onChange: (next: PipelineChainDocument) => void;
  /** Operators and structural constructs offered by the host. */
  catalog: PipelineCatalog;
  readOnly?: boolean;
  /** Host-owned history. The toolbar buttons and Ctrl+Z / Ctrl+Shift+Z appear when provided. */
  onUndo?: (() => void) | undefined;
  onRedo?: (() => void) | undefined;
  canUndo?: boolean | undefined;
  canRedo?: boolean | undefined;
  /** Authoritative variant count from the host; replaces the document-derived estimate. */
  variantCount?: number | null | undefined;
  /** Caption of the input terminal, e.g. the dataset name. */
  inputLabel?: string | undefined;
  inputDetail?: string | undefined;
  outputLabel?: string | undefined;
  /** Wrap the chain onto rows (default) or keep a single scrolling row. */
  defaultWrap?: boolean | undefined;
  defaultZoom?: number | undefined;
  /** Width assumed before the rack is measured (server rendering). */
  initialWidth?: number | undefined;
  onSelectionChange?: ((selection: ChainSelection | null) => void) | undefined;
  /** Extra controls rendered at the end of the toolbar. */
  toolbarActions?: ReactNode;
  className?: string | undefined;
  labels?: Partial<PipelineChainLabels> | undefined;
}

const ZOOM_LEVELS = [0.6, 0.75, 0.9, 1, 1.15] as const;

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function selectionExists(model: ChainModel, selection: ChainSelection | null): boolean {
  if (!selection) return false;
  if (selection.kind === "item") return model.items.has(selection.id);
  if (selection.kind === "lane") return model.lanes.has(selection.id);
  if (selection.kind === "newLane") return model.items.get(selection.fork)?.kind === "fork";
  const chain = model.chains.get(selection.chain);
  return chain !== undefined && selection.index >= 0 && selection.index <= chain.items.length;
}

function describeTarget(model: ChainModel, selection: ChainSelection, labels: PipelineChainLabels): string {
  if (selection.kind === "newLane") {
    const fork = model.items.get(selection.fork);
    return fork?.kind === "fork" ? `${labels.into} ${labels.fork[fork.mode]}` : "";
  }
  if (selection.kind !== "slot") return "";
  const chain = model.chains.get(selection.chain);
  const before = chain?.items[selection.index - 1];
  const after = chain?.items[selection.index];
  const name = (item: NonNullable<typeof before>): string =>
    item.kind === "step" ? item.customName ?? item.label : item.kind === "fork" ? labels.fork[item.mode] : item.kind === "frame" ? labels.frame[item.mode] : item.kind === "merge" ? labels.role.merge : item.kind === "note" ? labels.role.note : item.label;
  if (before) return `${labels.after} ${name(before)}`;
  if (after) return `${labels.before} ${name(after)}`;
  return "";
}

export function PipelineChainEditor({
  value,
  onChange,
  catalog,
  readOnly = false,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  variantCount,
  inputLabel,
  inputDetail,
  outputLabel,
  defaultWrap = true,
  defaultZoom = 1,
  initialWidth = 1180,
  onSelectionChange,
  toolbarActions,
  className,
  labels: labelOverrides,
}: PipelineChainEditorProps) {
  const labels = resolvePipelineChainLabels(labelOverrides);
  const catalogIndex = useMemo(() => indexCatalog(catalog), [catalog]);
  const model = useMemo(() => parsePipeline(value, catalogIndex), [value, catalogIndex]);
  const stats = useMemo(() => pipelineChainStats(model), [model]);

  const [rawSelection, setRawSelection] = useState<ChainSelection | null>(null);
  const [wrap, setWrap] = useState(defaultWrap);
  const [zoom, setZoom] = useState(defaultZoom);
  const [bayWidth, setBayWidth] = useState(initialWidth);
  const [drag, setDrag] = useState<CanvasDrag>(null);
  const [browserFocus, setBrowserFocus] = useState(0);
  const bayRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const focusCanvas = useRef(false);
  const browserToken = useRef(0);
  /** Selection to return to when the operator browser closes. */
  const anchor = useRef<ChainSelection | null>(null);

  const selection = selectionExists(model, rawSelection) ? rawSelection : null;
  const layout = useMemo(() => layoutChain(model, { wrapWidth: wrap ? bayWidth / zoom : null }), [model, wrap, bayWidth, zoom]);
  const targets = useMemo(() => focusTargets(layout), [layout]);

  useIsomorphicLayoutEffect(() => {
    const bay = bayRef.current;
    if (!bay) return;
    const measure = () => setBayWidth((width) => (bay.clientWidth > 0 && Math.abs(bay.clientWidth - width) > 1 ? bay.clientWidth : width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(bay);
    return () => observer.disconnect();
  }, []);

  const select = useCallback((next: ChainSelection | null) => {
    setRawSelection(next);
    setBrowserFocus(0);
    onSelectionChange?.(next);
  }, [onSelectionChange]);

  // Move DOM focus to the selected rack element after keyboard-driven changes.
  const key = selectionKey(selection);
  useEffect(() => {
    if (!focusCanvas.current) return;
    focusCanvas.current = false;
    const element = key ? bayRef.current?.querySelector<HTMLElement>(`[data-n4rack-key="${CSS.escape(key)}"]`) : null;
    element?.focus();
    element?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [key, value]);

  const commit = useCallback((result: EditResult, toCanvas = false) => {
    if (result.document !== value) onChange(result.document);
    if (result.select !== undefined) {
      if (toCanvas) focusCanvas.current = true;
      select(result.select);
    }
  }, [onChange, select, value]);

  const openBrowser = (target: ChainSelection) => {
    if (selection?.kind === "item" || selection?.kind === "lane") anchor.current = selection;
    select(target);
    browserToken.current += 1;
    setBrowserFocus(browserToken.current);
  };
  const closeBrowser = () => {
    focusCanvas.current = true;
    select(selectionExists(model, anchor.current) ? anchor.current : null);
  };

  const addTargetFor = (current: ChainSelection | null, where: "before" | "after"): ChainSelection | null => {
    if (!current) return { kind: "slot", chain: model.root.id, index: model.root.items.length };
    if (current.kind === "slot" || current.kind === "newLane") return current;
    if (current.kind === "lane") {
      const lane = model.lanes.get(current.id);
      return lane ? { kind: "slot", chain: lane.chain, index: lane.items.length } : null;
    }
    const item = model.items.get(current.id);
    return item ? { kind: "slot", chain: item.chain, index: item.index + (where === "after" ? 1 : 0) } : null;
  };

  const run = (command: ChainCommand): boolean => {
    switch (command.type) {
      case "focus": {
        const next = moveFocus(targets, key, command.direction);
        if (!next) return true;
        focusCanvas.current = true;
        select(next.selection);
        return true;
      }
      case "level": {
        const next = command.direction === "out" ? parentSelection(model, selection) : childSelection(model, selection);
        if (!next) return true;
        focusCanvas.current = true;
        select(next);
        return true;
      }
      case "focusEdge": {
        const cells = targets.filter((target) => target.selection.kind === "item");
        const next = command.edge === "first" ? cells[0] : cells[cells.length - 1];
        if (next) {
          focusCanvas.current = true;
          select(next.selection);
        }
        return true;
      }
      case "activate":
        if (!selection) return false;
        if (selection.kind === "slot" || selection.kind === "newLane") {
          if (!readOnly) openBrowser(selection);
        } else if (selection.kind === "lane" && model.lanes.get(selection.id)?.items.length === 0) {
          // An empty lane has nothing to edit: Enter fills it.
          if (!readOnly) openBrowser({ kind: "slot", chain: model.lanes.get(selection.id)!.chain, index: 0 });
        } else {
          stripRef.current?.querySelector<HTMLElement>(".n4rack__tiles input, .n4rack__tiles select, .n4rack__tiles textarea, .n4rack__json-text")?.focus();
        }
        return true;
      case "escape":
        if (!selection) return false;
        if (selection.kind === "slot" || selection.kind === "newLane") closeBrowser();
        else select(null);
        return true;
      case "undo":
        if (!onUndo) return false;
        onUndo();
        return true;
      case "redo":
        if (!onRedo) return false;
        onRedo();
        return true;
      default:
        break;
    }
    if (readOnly) return false;
    switch (command.type) {
      case "add": {
        const target = addTargetFor(selection, command.where);
        if (target) openBrowser(target);
        return true;
      }
      case "bypass": {
        if (selection?.kind !== "item" && selection?.kind !== "lane") return false;
        const cell = layout.cells.find((candidate) => candidate.id === selection.id);
        const lane = layout.lanes.find((candidate) => candidate.id === selection.id);
        const node = selection.kind === "item" ? model.items.get(selection.id) : undefined;
        const bypassed = selection.kind === "lane" ? lane?.lane.bypassed ?? false : cell ? cell.dimmed : node?.bypassed ?? false;
        commit(setBypassed(value, selection, !bypassed));
        return true;
      }
      case "remove":
        if (selection?.kind === "item") commit(removeItem(value, selection.id), true);
        else if (selection?.kind === "lane") commit(removeLane(value, selection.id), true);
        else return false;
        return true;
      case "duplicate":
        if (selection?.kind !== "item") return false;
        commit(duplicateItem(value, selection.id), true);
        return true;
      case "nudge":
        if (selection?.kind !== "item") return false;
        commit(nudgeItem(value, selection.id, command.direction), true);
        return true;
      case "lane":
        if (selection?.kind === "item") commit(shiftItemLane(value, selection.id, command.direction), true);
        else if (selection?.kind === "lane") commit(moveLane(value, selection.id, command.direction), true);
        else return false;
        return true;
      default:
        return false;
    }
  };

  const onBayKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const command = commandForKey(event);
    if (command && run(command)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  // History and Escape also work from the device strip, without hijacking text editing keys.
  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const command = commandForKey(event);
    if (!command) return;
    const editing = (event.target as HTMLElement).closest("input, textarea, select") !== null;
    if (command.type === "escape" && selection) {
      if (selection.kind === "slot" || selection.kind === "newLane") closeBrowser();
      // Leave the strip, keep the cell selected.
      else bayRef.current?.querySelector<HTMLElement>(`[data-n4rack-key="${CSS.escape(key)}"]`)?.focus();
      event.preventDefault();
    } else if ((command.type === "undo" || command.type === "redo") && !editing && run(command)) {
      event.preventDefault();
    }
  };

  const pick = (step: unknown) => {
    if (!selection || readOnly) return;
    if (selection.kind === "slot") commit(insertStep(value, selection.chain, selection.index, step), true);
    else if (selection.kind === "newLane") commit(addLane(value, selection.fork, step), true);
  };

  const drop = (target: ChainSelection) => {
    const current = drag;
    setDrag(null);
    if (!current || readOnly) return;
    if (target.kind === "slot") {
      commit(current.kind === "item" ? moveItem(value, current.id, target.chain, target.index) : insertStep(value, target.chain, target.index, current.value), true);
    } else if (target.kind === "newLane") {
      if (current.kind === "step") return commit(addLane(value, target.fork, current.value), true);
      const created = addLane(value, target.fork);
      if (created.select?.kind === "slot") commit(moveItem(created.document, current.id, created.select.chain, 0), true);
    }
  };

  const ctx: InspectorContext = {
    document: value,
    model,
    catalog,
    labels,
    readOnly,
    commit: (result) => commit(result),
    requestAdd: (target) => {
      if (target.kind === "newLane") return openBrowser({ kind: "newLane", fork: target.fork });
      const next = addTargetFor(target.kind === "lane" ? { kind: "lane", id: target.id } : { kind: "item", id: target.id }, "after");
      if (next) openBrowser(next);
    },
  };

  const variants = variantCount !== undefined ? variantCount : stats.variants;
  const zoomIndex = ZOOM_LEVELS.reduce((best, level, index) => (Math.abs(level - zoom) < Math.abs(ZOOM_LEVELS[best]! - zoom) ? index : best), 0);
  const approximate = variantCount === undefined && stats.variants !== 1 ? "≈ " : "";
  const outputDetail = variants === null ? labels.variantsUnknown : `${approximate}${formatCount(variants)} ${variants === 1 ? labels.variant : labels.variants}`;
  const browsing = selection?.kind === "slot" || selection?.kind === "newLane";

  return (
    <div className={cx("n4rack", className)} data-readonly={readOnly || undefined} onKeyDown={onRootKeyDown}>
      <div className="n4rack__toolbar">
        <DraftField
          className="n4rack__name"
          text={typeof value.name === "string" ? value.name : ""}
          parse={(draft) => draft.trim()}
          label={labels.namePlaceholder}
          placeholder={labels.untitled}
          disabled={readOnly}
          onCommit={(next) => commit(setDocumentName(value, next as string))}
        />
        <dl className="n4rack__stats">
          <div><dt>{labels.steps}</dt><dd>{stats.steps}</dd></div>
          <div><dt>{labels.models}</dt><dd>{stats.models}</dd></div>
          <div data-kind="variants" title={variantCount === undefined ? labels.variantsHint : undefined}>
            <dt>{variants === 1 ? labels.variant : labels.variants}</dt>
            <dd>{variants === null ? "?" : `${approximate}${formatCount(variants)}`}</dd>
          </div>
          {stats.bypassed > 0 ? <div data-kind="bypassed"><dt>{labels.bypassedCount}</dt><dd>{stats.bypassed}</dd></div> : null}
        </dl>
        <span className="n4rack__spacer" />
        {onUndo || onRedo ? (
          <span className="n4rack__group">
            <IconButton icon="undo" label={labels.undo} disabled={!onUndo || canUndo === false} onClick={() => onUndo?.()} />
            <IconButton icon="redo" label={labels.redo} disabled={!onRedo || canRedo === false} onClick={() => onRedo?.()} />
          </span>
        ) : null}
        <span className="n4rack__group">
          <IconButton icon="wrap" label={labels.wrapHint} pressed={wrap} onClick={() => setWrap((on) => !on)}>{labels.wrap}</IconButton>
        </span>
        <span className="n4rack__group">
          <IconButton icon="zoomOut" label={labels.zoomOut} disabled={zoomIndex === 0} onClick={() => setZoom(ZOOM_LEVELS[Math.max(0, zoomIndex - 1)]!)} />
          <output className="n4rack__zoom">{Math.round(zoom * 100)}%</output>
          <IconButton icon="zoomIn" label={labels.zoomIn} disabled={zoomIndex === ZOOM_LEVELS.length - 1} onClick={() => setZoom(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, zoomIndex + 1)]!)} />
        </span>
        {toolbarActions}
      </div>

      <div
        className="n4rack__bay"
        ref={bayRef}
        role="group"
        style={{ backgroundSize: `${24 * zoom}px ${24 * zoom}px`, backgroundPosition: `${-12 * zoom}px ${-12 * zoom}px` }}
        aria-label={typeof value.name === "string" && value.name ? value.name : labels.untitled}
        onKeyDown={onBayKeyDown}
        onFocus={(event) => {
          // Tabbing into the rack puts the cursor on the focused element.
          const focused = (event.target as HTMLElement).getAttribute("data-n4rack-key");
          const target = focused && focused !== key ? targets.find((candidate) => candidate.key === focused) : undefined;
          if (target) select(target.selection);
        }}
        onClick={(event) => { if (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains("n4rack__plane")) select(null); }}
      >
        <ChainCanvas
          layout={layout}
          zoom={zoom}
          selection={selection}
          labels={labels}
          readOnly={readOnly}
          drag={drag}
          inputLabel={inputLabel ?? labels.input}
          inputDetail={inputDetail ?? labels.inputDetail}
          outputLabel={outputLabel ?? labels.output}
          outputDetail={outputDetail}
          onSelect={(next, activate) => {
            if (next && (next.kind === "slot" || next.kind === "newLane") && activate) openBrowser(next);
            else select(next);
          }}
          onToggleBypass={(target, bypassed) => commit(setBypassed(value, target, bypassed))}
          onDragItem={(id) => setDrag(id ? { kind: "item", id } : null)}
          onDrop={drop}
        />
      </div>

      <div className="n4rack__strip" ref={stripRef} data-mode={browsing ? "browse" : selection ? "inspect" : "idle"}>
        {browsing && selection ? (
          <OperatorBrowser
            catalog={catalog}
            labels={labels}
            target={describeTarget(model, selection, labels)}
            focusToken={browserFocus}
            onPick={pick}
            onClose={closeBrowser}
            onDragStep={(step) => setDrag(step === null ? null : { kind: "step", value: step })}
          />
        ) : selection && (selection.kind === "item" || selection.kind === "lane") ? (
          <SelectionInspector ctx={ctx} selection={selection} />
        ) : (
          <div className="n4rack__idle">
            <p>{model.root.items.length === 0 ? labels.emptyPipeline : labels.idleHint}</p>
            <dl className="n4rack__shortcuts">
              {CHAIN_SHORTCUTS.map((shortcut) => (
                <div key={shortcut.keys}><dt><kbd>{shortcut.keys}</kbd></dt><dd>{shortcut.label}</dd></div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
