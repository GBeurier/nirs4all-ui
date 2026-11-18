/**
 * The rack bay: draws a computed layout (wires, cells, groups, insert points)
 * and reports pointer and drag gestures. Presentational; no document logic.
 */

import type { CSSProperties, DragEvent, ReactNode } from "react";

import { cx } from "./_cx.js";
import { CHAIN_GROUP_COLORS, CHAIN_ROLE_COLORS, ChainGlyph, ChainIcon } from "./glyphs.js";
import type { ChainLayout, LayoutCell, LayoutSlot, Rect } from "./layout.js";
import type { PipelineChainLabels } from "./locale.js";
import { selectionKey } from "./navigation.js";
import { chainVariants, formatCount, formatValue, itemVariants } from "./summary.js";
import type { ChainLeaf, ChainSelection, ForkNode, FrameNode, StepNode } from "./types.js";

export interface CellLine {
  name: string;
  text: string;
  kind: "fixed" | "sweep" | "tune" | "operator";
}

/** What a cell shows under its name: generators first, then tuned and fixed parameters. */
export function stepLines(step: StepNode): CellLine[] {
  const lines: CellLine[] = [];
  const swept = new Set<string>();
  for (const sweep of step.sweeps) {
    if (sweep.param) swept.add(sweep.param);
    lines.push({ name: sweep.param ?? sweep.kind, text: sweep.text, kind: "sweep" });
  }
  for (const tuned of step.tuning?.params ?? []) {
    swept.add(tuned.name);
    lines.push({ name: tuned.name, text: tuned.text, kind: "tune" });
  }
  for (const [name, value] of Object.entries(step.params)) {
    if (!swept.has(name)) lines.push({ name, text: formatValue(value, 18), kind: "fixed" });
  }
  return lines;
}

export type CanvasDrag = { kind: "item"; id: string } | { kind: "step"; value: unknown } | null;

export interface ChainCanvasProps {
  layout: ChainLayout;
  zoom: number;
  selection: ChainSelection | null;
  labels: PipelineChainLabels;
  readOnly: boolean;
  drag: CanvasDrag;
  inputLabel: string;
  inputDetail: string;
  outputLabel: string;
  outputDetail: string;
  onSelect: (selection: ChainSelection | null, activate: boolean) => void;
  /** Key of the element holding the rack's single tab stop when nothing is selected. */
  tabStopKey: string;
  onToggleBypass: (target: { kind: "item" | "lane"; id: string }) => void;
  onDragItem: (id: string | null) => void;
  onDrop: (target: ChainSelection) => void;
}

function box(rect: Rect): CSSProperties {
  return { left: rect.x, top: rect.y, width: rect.w, height: rect.h };
}

function leafTitle(item: ChainLeaf, labels: PipelineChainLabels): string {
  if (item.kind === "step") return item.customName ?? item.label;
  if (item.kind === "merge") return item.sources ? labels.mergeSources : labels.role.merge;
  if (item.kind === "note") return labels.role.note;
  return item.label;
}

function leafLines(item: ChainLeaf): CellLine[] {
  if (item.kind === "step") {
    const lines = stepLines(item);
    return item.customName ? [{ name: "", text: item.label, kind: "operator" }, ...lines] : lines;
  }
  if (item.kind === "merge") return [{ name: "", text: item.label, kind: "fixed" }];
  if (item.kind === "note") return [{ name: "", text: item.text, kind: "operator" }];
  return [{ name: "", text: item.detail, kind: "operator" }];
}

function groupCount(item: ForkNode | FrameNode, labels: PipelineChainLabels): ReactNode {
  if (item.kind === "fork") {
    const active = item.lanes.filter((lane) => !lane.bypassed).length;
    const count = typeof item.modifiers.count === "number" ? ` → ${item.modifiers.count}` : "";
    const pick = "pick" in item.modifiers ? `, ${labels.pick} ${formatValue(item.modifiers.pick, 8)}` : "";
    return item.mode === "choice" ? `${active}${count}${pick}` : `${active} ${labels.lanes}`;
  }
  if (item.mode !== "cartesian") return `${item.items.length}`;
  const full = chainVariants(item.items);
  const kept = itemVariants(item);
  if (full === null) return typeof item.modifiers.count === "number" ? `${labels.keeps} ${item.modifiers.count}` : `${item.items.length}`;
  return kept !== null && kept < full ? `${formatCount(full)} → ${labels.keeps} ${formatCount(kept)}` : `${formatCount(full)} ${labels.combinations}`;
}

export function ChainCanvas({
  layout,
  zoom,
  selection,
  labels,
  readOnly,
  drag,
  tabStopKey,
  inputLabel,
  inputDetail,
  outputLabel,
  outputDetail,
  onSelect,
  onToggleBypass,
  onDragItem,
  onDrop,
}: ChainCanvasProps) {
  const selectedKey = selectionKey(selection);
  const tabStop = selectedKey || tabStopKey;
  const focusProps = (target: ChainSelection) => {
    const key = selectionKey(target);
    return { "data-n4rack-key": key, tabIndex: key === tabStop ? 0 : -1, "aria-current": key === selectedKey ? ("true" as const) : undefined };
  };
  const dragSource = (id: string) => readOnly ? {} : {
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.setData("text/plain", id);
      event.dataTransfer.effectAllowed = "move";
      onDragItem(id);
    },
    onDragEnd: () => onDragItem(null),
  };
  const dropTarget = (target: ChainSelection) => readOnly ? {} : {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!drag) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = drag.kind === "item" ? "move" : "copy";
      event.currentTarget.setAttribute("data-over", "");
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => event.currentTarget.removeAttribute("data-over"),
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.currentTarget.removeAttribute("data-over");
      onDrop(target);
    },
  };

  const renderCell = (cell: LayoutCell) => {
    const item = cell.item;
    const target: ChainSelection = { kind: "item", id: cell.id };
    const title = leafTitle(item, labels);
    const lines = leafLines(item);
    const variants = itemVariants(item);
    const tuning = item.kind === "step" ? item.tuning : null;
    const shown = cell.mini ? [] : lines.slice(0, 2);
    const values = lines.filter((line) => line.kind !== "operator");
    // A compact cell has one line: values alone when there are several, the named value otherwise.
    const inline = values.length === 1 ? `${values[0]!.name} ${values[0]!.text}`.trim() : values.map((line) => line.text).join(", ");
    const role = item.role;
    const unknown = item.kind === "step" && !item.definition;
    const badges = !cell.mini && (lines.length > 2 || variants !== 1 || tuning || unknown) ? (
      <span className="n4rack__cell-badges">
        {lines.length > 2 ? <span className="n4rack__badge">+{lines.length - 2}</span> : null}
        {unknown ? <span className="n4rack__badge" title={labels.notInCatalog}>?</span> : null}
        {tuning ? <span className="n4rack__badge" data-kind="tune"><ChainGlyph kind="tune" size={10} />{tuning.trials ?? ""}</span> : null}
        {variants !== null && variants > 1 ? <span className="n4rack__badge" data-kind="sweep">×{formatCount(variants)}</span> : null}
        {variants === null ? <span className="n4rack__badge" data-kind="sweep">×?</span> : null}
      </span>
    ) : null;
    return (
      <div key={cell.id} className="n4rack__cell-wrap" style={{ ...box(cell), ["--n4rack-accent" as string]: CHAIN_ROLE_COLORS[role] }}
        data-role={role} data-mini={cell.mini || undefined} data-bypassed={cell.dimmed || undefined} data-selected={selectionKey(target) === selectedKey || undefined}>
        <button
          type="button"
          className="n4rack__cell"
          aria-label={`${labels.role[role]}: ${title}${cell.dimmed ? `, ${labels.bypassed.toLowerCase()}` : ""}${lines.length ? `. ${lines.map((line) => `${line.name} ${line.text}`.trim()).join(", ")}` : ""}`}
          title={item.kind === "step" ? item.classPath ?? title : title}
          onClick={() => onSelect(target, true)}
          {...focusProps(target)}
          {...dragSource(cell.id)}
        >
          <span className="n4rack__cell-head">
            {cell.mini ? null : <span className="n4rack__cell-glyph"><ChainGlyph kind={role} /></span>}
            <span className="n4rack__cell-name">{title}</span>
            {cell.mini && inline ? <span className="n4rack__cell-inline" data-kind={values.some((line) => line.kind !== "fixed") ? "sweep" : undefined}>{inline}</span> : null}
          </span>
          {shown.length > 0 ? (
            <span className="n4rack__cell-lines">
              {shown.map((line, index) => (
                <span key={index} className="n4rack__cell-line" data-kind={line.kind} data-shared={badges && index === shown.length - 1 ? "" : undefined}>
                  {line.name ? <i>{line.name}</i> : null}
                  <b>{line.text}</b>
                </span>
              ))}
              {badges}
            </span>
          ) : badges}
        </button>
        {readOnly ? null : (
          <button
            type="button"
            className="n4rack__led"
            tabIndex={-1}
            role="switch"
            aria-checked={!cell.dimmed}
            aria-label={`${labels.active}: ${title}`}
            title={cell.dimmed ? labels.enable : labels.bypass}
            onClick={() => onToggleBypass(target)}
          />
        )}
      </div>
    );
  };

  const renderSlot = (slot: LayoutSlot) => {
    const target: ChainSelection = { kind: "slot", chain: slot.chain, index: slot.index };
    const key = selectionKey(target);
    if (readOnly) return null;
    return (
      <button
        key={key}
        type="button"
        className="n4rack__slot"
        style={box(slot.zone)}
        data-persistent={slot.persistent || undefined}
        data-selected={key === selectedKey || undefined}
        aria-label={labels.addStep}
        title={labels.addStep}
        onClick={() => onSelect(target, true)}
        {...(slot.persistent || key === selectedKey ? focusProps(target) : { tabIndex: -1, "data-n4rack-key": key })}
        {...dropTarget(target)}
      >
        <span className="n4rack__plus" style={{ left: slot.x - slot.zone.x, top: slot.y - slot.zone.y }}><ChainIcon name="plus" size={12} /></span>
      </button>
    );
  };

  return (
    <div className="n4rack__canvas" style={{ width: layout.width * zoom, height: layout.height * zoom }} data-dragging={drag ? "" : undefined}>
      <div className="n4rack__plane" style={{ width: layout.width, height: layout.height, transform: zoom === 1 ? undefined : `scale(${zoom})` }}>
        <svg className="n4rack__wires" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true" focusable="false">
          {layout.frames.map((frame) => (
            <rect key={frame.id} className="n4rack__frame-box" data-bypassed={frame.dimmed || undefined} x={frame.x} y={frame.y + 12} width={frame.w} height={frame.h - 12} rx={14}
              style={{ ["--n4rack-accent" as string]: CHAIN_GROUP_COLORS[frame.frame.mode] }} />
          ))}
          {layout.wires.map((wire, index) => (
            <path key={index} className="n4rack__wire" data-kind={wire.kind} data-bypassed={wire.dimmed || undefined} d={wire.d} />
          ))}
          {layout.forks.map((fork) => (
            <g key={fork.id} className="n4rack__junctions" data-bypassed={fork.dimmed || undefined} style={{ ["--n4rack-accent" as string]: CHAIN_GROUP_COLORS[fork.fork.mode] }}>
              <circle cx={fork.x} cy={fork.wireY} r={4} />
              <circle cx={fork.x + fork.w} cy={fork.wireY} r={4} />
            </g>
          ))}
        </svg>

        {layout.terminals.map((terminal) => (
          <div key={terminal.kind} className="n4rack__terminal" data-kind={terminal.kind} style={box(terminal)}>
            <strong>{terminal.kind === "in" ? inputLabel : outputLabel}</strong>
            <span>{terminal.kind === "in" ? inputDetail : outputDetail}</span>
          </div>
        ))}

        {layout.frames.map((frame) => {
          const target: ChainSelection = { kind: "item", id: frame.id };
          return (
            <button key={frame.id} type="button" className="n4rack__tag" style={{ left: frame.header.x + 12, top: frame.header.y, height: frame.header.h, ["--n4rack-accent" as string]: CHAIN_GROUP_COLORS[frame.frame.mode] }}
              data-bypassed={frame.dimmed || undefined} data-selected={selectionKey(target) === selectedKey || undefined}
              onClick={() => onSelect(target, true)} {...focusProps(target)} {...dragSource(frame.id)}>
              <ChainGlyph kind={frame.frame.mode} size={12} />
              <strong>{labels.frame[frame.frame.mode]}</strong>
              <span className="n4rack__tag-count">{groupCount(frame.frame, labels)}</span>
            </button>
          );
        })}

        {layout.forks.map((fork) => {
          const target: ChainSelection = { kind: "item", id: fork.id };
          const lane: ChainSelection = { kind: "newLane", fork: fork.id };
          const choice = fork.fork.mode === "choice";
          return (
            <div key={fork.id} style={{ display: "contents" }}>
              <button type="button" className="n4rack__tag" style={{ left: fork.header.x + (fork.fork.stack ? 12 : 0), top: fork.header.y, height: fork.header.h, ["--n4rack-accent" as string]: CHAIN_GROUP_COLORS[fork.fork.mode] }}
                data-bypassed={fork.dimmed || undefined} data-selected={selectionKey(target) === selectedKey || undefined}
                onClick={() => onSelect(target, true)} {...focusProps(target)} {...dragSource(fork.id)}>
                <ChainGlyph kind={fork.fork.mode} size={12} />
                <strong>{labels.fork[fork.fork.mode]}</strong>
                <span className="n4rack__tag-count">{groupCount(fork.fork, labels)}</span>
              </button>
              {readOnly || fork.fork.mode === "source" ? null : (
                <button type="button" className="n4rack__newlane" style={box(fork.footer)} data-selected={selectionKey(lane) === selectedKey || undefined}
                  onClick={() => onSelect(lane, true)} {...focusProps(lane)} {...dropTarget(lane)}>
                  <ChainIcon name="plus" size={10} />
                  {choice ? labels.addOption : labels.addLane}
                </button>
              )}
            </div>
          );
        })}

        {layout.lanes.map((lane) => {
          const target: ChainSelection = { kind: "lane", id: lane.id };
          const selected = selectionKey(target) === selectedKey;
          const accent = { ["--n4rack-accent" as string]: CHAIN_GROUP_COLORS[lane.fork.mode] };
          return (
            <div key={lane.id} style={{ display: "contents" }}>
              {lane.empty ? (
                <button type="button" className="n4rack__lane-empty" style={{ ...box(lane), ...accent }} data-bypassed={lane.dimmed || undefined} data-selected={selected || undefined}
                  onClick={() => onSelect(target, true)} {...(lane.chip ? { tabIndex: -1 } : focusProps(target))}>
                  <span>{lane.fork.mode === "choice" ? labels.skipOption : labels.emptyLane}</span>
                </button>
              ) : null}
              {lane.chip ? (
                <button type="button" className="n4rack__lane-chip" style={{ left: lane.chip.x, top: lane.chip.y, ...accent }} data-bypassed={lane.dimmed || undefined} data-selected={selected || undefined}
                  aria-label={`${labels.fork[lane.fork.mode]}, ${lane.lane.label}${lane.dimmed ? `, ${labels.bypassed.toLowerCase()}` : ""}`}
                  onClick={() => onSelect(target, true)} {...focusProps(target)}>
                  {lane.lane.label}
                </button>
              ) : null}
            </div>
          );
        })}

        {layout.slots.map(renderSlot)}
        {layout.cells.map(renderCell)}
      </div>
    </div>
  );
}
