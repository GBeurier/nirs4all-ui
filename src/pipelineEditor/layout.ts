/**
 * Rack layout: places the chain view model on a left-to-right grid.
 *
 * Pure geometry in CSS pixels. The signal flows along a horizontal wire; a
 * group stacks its lanes vertically around that wire, and the top-level chain
 * wraps onto further rows when a wrap width is given. Every dimension is a
 * multiple of half the 24px grid pitch, so cells, lanes and gutters stay
 * aligned with the dotted background.
 */

import type { ChainItem, ChainLeaf, ChainModel, ForkNode, FrameNode, LaneNode } from "./types.js";

export interface ChainMetrics {
  cellW: number;
  cellH: number;
  /** Height of a cell inside a compact selector bank. */
  miniH: number;
  /** Horizontal gap between consecutive cells (holds the insert point). */
  gapX: number;
  laneGap: number;
  stackGap: number;
  /** Width of the fan-out / fan-in area on each side of a group. */
  gutter: number;
  stackGutter: number;
  /** Band above a group for its tag (and, for lanes with chips, the first chip). */
  forkHeader: number;
  laneHeader: number;
  forkFooter: number;
  framePadX: number;
  frameHeader: number;
  framePadBottom: number;
  /** Room after the last cell of a lane or frame for its insert point. */
  tail: number;
  terminalW: number;
  rowGap: number;
  margin: number;
}

export const DEFAULT_CHAIN_METRICS: ChainMetrics = {
  cellW: 168,
  cellH: 72,
  miniH: 36,
  gapX: 48,
  laneGap: 24,
  stackGap: 12,
  gutter: 48,
  stackGutter: 24,
  forkHeader: 36,
  laneHeader: 48,
  forkFooter: 36,
  framePadX: 24,
  frameHeader: 36,
  framePadBottom: 24,
  tail: 36,
  terminalW: 96,
  rowGap: 60,
  margin: 24,
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutCell extends Rect {
  id: string;
  item: ChainLeaf;
  mini: boolean;
  /** Bypassed itself, or inside a bypassed lane or group. */
  dimmed: boolean;
}

export interface LayoutLane extends Rect {
  id: string;
  lane: LaneNode;
  fork: ForkNode;
  empty: boolean;
  /** Anchor of the lane label chip (non-compact groups only). */
  chip: { x: number; y: number } | null;
  dimmed: boolean;
}

export interface LayoutFork extends Rect {
  id: string;
  fork: ForkNode;
  /** Vertical position of the wire entering and leaving the group. */
  wireY: number;
  header: Rect;
  /** The "add lane" slot under the last lane. */
  footer: Rect;
  dimmed: boolean;
}

export interface LayoutFrame extends Rect {
  id: string;
  frame: FrameNode;
  wireY: number;
  header: Rect;
  dimmed: boolean;
}

export interface LayoutSlot {
  chain: string;
  index: number;
  /** Center of the insert point, on the wire. */
  x: number;
  y: number;
  /** Hover / drop area. */
  zone: Rect;
  /** Always drawn (end of a chain, empty lane) rather than on hover only. */
  persistent: boolean;
}

export interface LayoutWire {
  d: string;
  /**
   * `signal`: always carried; `choice`: one alternative per variant; `return`:
   * row wrap; `through`: the wire under a cell, visible when it is bypassed.
   */
  kind: "signal" | "choice" | "return" | "through";
  dimmed: boolean;
}

export interface LayoutTerminal extends Rect {
  kind: "in" | "out";
}

export interface ChainLayout {
  width: number;
  height: number;
  rows: number;
  cells: LayoutCell[];
  lanes: LayoutLane[];
  forks: LayoutFork[];
  frames: LayoutFrame[];
  slots: LayoutSlot[];
  wires: LayoutWire[];
  terminals: LayoutTerminal[];
}

export interface ChainLayoutOptions {
  /** Available width; the top-level chain wraps onto rows to fit. Omit for a single row. */
  wrapWidth?: number | null | undefined;
  metrics?: Partial<ChainMetrics> | undefined;
}

interface Size {
  w: number;
  up: number;
  down: number;
}

const r1 = (value: number): number => Math.round(value * 10) / 10;

function line(x1: number, x2: number, y: number): string {
  return `M${r1(x1)} ${r1(y)}H${r1(x2)}`;
}

/** Smooth S-curve between two horizontal directions (branch fans). */
function fan(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y1 - y2) < 0.5) return line(x1, x2, y1);
  const mid = (x1 + x2) / 2;
  return `M${r1(x1)} ${r1(y1)}C${r1(mid)} ${r1(y1)} ${r1(mid)} ${r1(y2)} ${r1(x2)} ${r1(y2)}`;
}

/** Right-angled bus with rounded corners (selector banks). */
function bus(x1: number, y1: number, x2: number, y2: number): string {
  const dy = y2 - y1;
  if (Math.abs(dy) < 0.5) return line(x1, x2, y1);
  const mid = (x1 + x2) / 2;
  const radius = Math.min(6, Math.abs(dy) / 2, Math.abs(x2 - x1) / 2);
  const sign = dy > 0 ? 1 : -1;
  const dir = x2 > x1 ? 1 : -1;
  return [
    `M${r1(x1)} ${r1(y1)}H${r1(mid - dir * radius)}`,
    `Q${r1(mid)} ${r1(y1)} ${r1(mid)} ${r1(y1 + sign * radius)}`,
    `V${r1(y2 - sign * radius)}`,
    `Q${r1(mid)} ${r1(y2)} ${r1(mid + dir * radius)} ${r1(y2)}H${r1(x2)}`,
  ].join("");
}

/** Lay the pipeline out. Deterministic for a given model and options. */
export function layoutChain(model: ChainModel, options: ChainLayoutOptions = {}): ChainLayout {
  const m: ChainMetrics = { ...DEFAULT_CHAIN_METRICS, ...options.metrics };
  const layout: ChainLayout = { width: 0, height: 0, rows: 0, cells: [], lanes: [], forks: [], frames: [], slots: [], wires: [], terminals: [] };
  const sizes = new Map<string, Size>();

  const leafSize = (mini: boolean): Size => {
    const half = (mini ? m.miniH : m.cellH) / 2;
    return { w: m.cellW, up: half, down: half };
  };

  function laneSize(lane: LaneNode, stack: boolean): Size {
    return lane.items.length === 0 ? leafSize(true) : measureChain(lane.items, stack);
  }

  function measureChain(items: readonly ChainItem[], mini: boolean): Size {
    if (items.length === 0) return leafSize(mini);
    let w = 0;
    let up = 0;
    let down = 0;
    for (const item of items) {
      const size = measure(item, mini);
      w += size.w;
      up = Math.max(up, size.up);
      down = Math.max(down, size.down);
    }
    return { w: w + m.gapX * (items.length - 1), up, down };
  }

  function measure(item: ChainItem, mini: boolean): Size {
    const key = `${item.id}|${mini ? 1 : 0}`;
    const known = sizes.get(key);
    if (known) return known;
    let size: Size;
    if (item.kind === "fork") {
      const lanes = item.lanes.map((lane) => laneSize(lane, item.stack));
      const gutter = item.stack ? m.stackGutter : m.gutter;
      const gap = item.stack ? m.stackGap : m.laneGap;
      const inner = lanes.reduce((width, lane) => Math.max(width, lane.w), m.cellW);
      const height = lanes.length === 0 ? m.miniH : lanes.reduce((sum, lane) => sum + lane.up + lane.down, 0) + gap * (lanes.length - 1);
      size = { w: gutter + inner + (item.stack ? 0 : m.tail) + gutter, up: height / 2 + (item.stack ? m.forkHeader : m.laneHeader), down: height / 2 + m.forkFooter };
    } else if (item.kind === "frame") {
      const inner = measureChain(item.items, false);
      size = { w: m.framePadX + inner.w + m.tail + m.framePadX, up: inner.up + m.frameHeader, down: inner.down + m.framePadBottom };
    } else {
      size = leafSize(mini);
    }
    sizes.set(key, size);
    return size;
  }

  /**
   * Place `items` (a whole chain or one wrapped row of it) with the wire at `y`.
   * `start` is the chain index of the first item; `closing` emits the end slot.
   */
  function placeRun(
    chain: string,
    items: readonly ChainItem[],
    start: number,
    closing: boolean,
    x: number,
    y: number,
    mini: boolean,
    lead: number,
    tail: number,
    dimmed: boolean,
    persistentEnd: boolean,
  ): number {
    const zoneH = mini ? m.miniH : m.cellH;
    const wireKind = "signal" as const;
    if (items.length === 0) {
      if (closing) {
        layout.slots.push({ chain, index: start, x: x + m.cellW / 2, y, zone: { x, y: y - zoneH / 2, w: m.cellW, h: zoneH }, persistent: true });
      }
      layout.wires.push({ d: line(x, x + m.cellW, y), kind: wireKind, dimmed });
      return x + m.cellW;
    }
    let cursor = x;
    items.forEach((item, offset) => {
      const zoneW = offset === 0 ? lead : m.gapX;
      layout.slots.push({
        chain,
        index: start + offset,
        x: cursor - zoneW / 2,
        y,
        zone: { x: cursor - zoneW, y: y - zoneH / 2, w: zoneW, h: zoneH },
        persistent: false,
      });
      if (offset > 0) layout.wires.push({ d: line(cursor - m.gapX, cursor, y), kind: wireKind, dimmed });
      place(item, cursor, y, mini, dimmed);
      cursor += measure(item, mini).w + m.gapX;
    });
    const end = cursor - m.gapX;
    if (closing) {
      layout.slots.push({
        chain,
        index: start + items.length,
        x: end + tail / 2,
        y,
        zone: { x: end, y: y - zoneH / 2, w: tail, h: zoneH },
        persistent: persistentEnd,
      });
    }
    return end;
  }

  function place(item: ChainItem, x: number, y: number, mini: boolean, inherited: boolean): void {
    const dimmed = inherited || item.bypassed;
    if (item.kind === "fork") return placeFork(item, x, y, dimmed);
    if (item.kind === "frame") return placeFrame(item, x, y, dimmed);
    const h = mini ? m.miniH : m.cellH;
    // Drawn under the cell face: it shows through a bypassed (ghosted) cell.
    layout.wires.push({ d: line(x, x + m.cellW, y), kind: "through", dimmed: inherited });
    layout.cells.push({ id: item.id, item, mini, dimmed, x, y: y - h / 2, w: m.cellW, h });
  }

  function placeFork(fork: ForkNode, x: number, y: number, dimmed: boolean): void {
    const size = measure(fork, false);
    const gutter = fork.stack ? m.stackGutter : m.gutter;
    const gap = fork.stack ? m.stackGap : m.laneGap;
    const lanes = fork.lanes.map((lane) => laneSize(lane, fork.stack));
    const header = fork.stack ? m.forkHeader : m.laneHeader;
    const height = size.up - header + (size.down - m.forkFooter);
    const top = y - height / 2;
    const innerX = x + gutter;
    const innerEnd = x + size.w - gutter;
    const kind = fork.mode === "choice" ? "choice" : "signal";
    const curve = fork.stack ? bus : fan;
    layout.forks.push({
      id: fork.id,
      fork,
      wireY: y,
      dimmed,
      x,
      y: top - header,
      w: size.w,
      h: height + header + m.forkFooter,
      header: { x, y: top - header, w: size.w, h: 24 },
      footer: { x: innerX, y: top + height + 8, w: m.cellW, h: m.forkFooter - 16 },
    });
    let cursor = top;
    fork.lanes.forEach((lane, index) => {
      const laneBox = lanes[index]!;
      const laneY = cursor + laneBox.up;
      const laneDimmed = dimmed || lane.bypassed;
      const empty = lane.items.length === 0;
      layout.wires.push({ d: curve(x, y, innerX, laneY), kind, dimmed: laneDimmed });
      let end: number;
      if (empty) {
        layout.slots.push({
          chain: lane.chain,
          index: 0,
          x: innerX + 18,
          y: laneY,
          zone: { x: innerX, y: laneY - m.miniH / 2, w: innerEnd - innerX, h: m.miniH },
          persistent: !fork.stack,
        });
        end = innerX;
      } else {
        end = placeRun(lane.chain, lane.items, 0, true, innerX, laneY, fork.stack, gutter / 2, fork.stack ? gutter / 2 : m.tail, laneDimmed, !fork.stack);
      }
      if (end < innerEnd) layout.wires.push({ d: line(end, innerEnd, laneY), kind, dimmed: laneDimmed });
      layout.wires.push({ d: curve(innerEnd, laneY, x + size.w, y), kind, dimmed: laneDimmed });
      layout.lanes.push({
        id: lane.id,
        lane,
        fork,
        empty,
        dimmed: laneDimmed,
        chip: fork.stack ? null : { x: innerX, y: laneY - laneBox.up - 21 },
        x: innerX,
        y: laneY - laneBox.up,
        w: innerEnd - innerX,
        h: laneBox.up + laneBox.down,
      });
      cursor += laneBox.up + laneBox.down + gap;
    });
    if (fork.lanes.length === 0) layout.wires.push({ d: line(x, x + size.w, y), kind, dimmed });
  }

  function placeFrame(frame: FrameNode, x: number, y: number, dimmed: boolean): void {
    const size = measure(frame, false);
    layout.frames.push({
      id: frame.id,
      frame,
      wireY: y,
      dimmed,
      x,
      y: y - size.up,
      w: size.w,
      h: size.up + size.down,
      header: { x, y: y - size.up, w: size.w, h: 24 },
    });
    const innerX = x + m.framePadX;
    layout.wires.push({ d: line(x, innerX, y), kind: "signal", dimmed });
    const end = placeRun(frame.inner, frame.items, 0, true, innerX, y, false, m.framePadX, m.tail, dimmed, true);
    layout.wires.push({ d: line(end, x + size.w, y), kind: "signal", dimmed });
  }

  // ---- top-level chain, wrapped onto rows ----
  const root = model.root.items;
  const lead = m.margin + m.terminalW + m.gapX;
  const budget = options.wrapWidth ? Math.max(m.cellW, options.wrapWidth - 2 * lead) : Number.POSITIVE_INFINITY;
  const rows: Array<{ start: number; items: ChainItem[] }> = [];
  let current: { start: number; items: ChainItem[] } = { start: 0, items: [] };
  let used = 0;
  root.forEach((item, index) => {
    const width = measure(item, false).w;
    if (current.items.length > 0 && used + m.gapX + width > budget) {
      rows.push(current);
      current = { start: index, items: [] };
      used = 0;
    }
    used += (current.items.length > 0 ? m.gapX : 0) + width;
    current.items.push(item);
  });
  rows.push(current);

  let top = m.margin;
  let width = 0;
  let previous: { end: number; y: number; down: number } | null = null;
  for (const [rowIndex, row] of rows.entries()) {
    const size = measureChain(row.items, false);
    const y = top + Math.max(size.up, m.cellH / 2);
    const last = rowIndex === rows.length - 1;
    if (rowIndex === 0) {
      layout.terminals.push({ kind: "in", x: m.margin, y: y - m.cellH / 2, w: m.terminalW, h: m.cellH });
      layout.wires.push({ d: line(m.margin + m.terminalW, lead, y), kind: "signal", dimmed: false });
    } else if (previous) {
      // Return wire: out of the previous row, back to the left, into this row.
      const radius = 12;
      const right = previous.end + 24;
      const left = m.margin + m.terminalW / 2;
      const mid = previous.y + previous.down + m.rowGap / 2;
      layout.wires.push({
        kind: "return",
        dimmed: false,
        d: [
          `M${r1(previous.end)} ${r1(previous.y)}H${r1(right - radius)}Q${r1(right)} ${r1(previous.y)} ${r1(right)} ${r1(previous.y + radius)}`,
          `V${r1(mid - radius)}Q${r1(right)} ${r1(mid)} ${r1(right - radius)} ${r1(mid)}`,
          `H${r1(left + radius)}Q${r1(left)} ${r1(mid)} ${r1(left)} ${r1(mid + radius)}`,
          `V${r1(y - radius)}Q${r1(left)} ${r1(y)} ${r1(left + radius)} ${r1(y)}H${r1(lead)}`,
        ].join(""),
      });
    }
    const end = placeRun(model.root.id, row.items, row.start, last, lead, y, false, m.gapX, m.gapX, false, true);
    const down = Math.max(size.down, m.cellH / 2);
    if (last) {
      layout.wires.push({ d: line(end, end + m.gapX, y), kind: "signal", dimmed: false });
      layout.terminals.push({ kind: "out", x: end + m.gapX, y: y - m.cellH / 2, w: m.terminalW, h: m.cellH });
    }
    width = Math.max(width, end + m.gapX + m.terminalW + m.margin);
    previous = { end, y, down };
    top = y + down + m.rowGap;
  }

  layout.rows = rows.length;
  layout.width = Math.ceil(width);
  layout.height = Math.ceil(top - m.rowGap + m.margin);
  return layout;
}
