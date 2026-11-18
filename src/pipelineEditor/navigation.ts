/**
 * Keyboard model of the rack: which things can hold the cursor, how the arrow
 * keys travel between them on the grid, and which key triggers which command.
 * Pure, so the interaction rules are testable without a DOM.
 */

import type { ChainLayout, Rect } from "./layout.js";
import type { ChainModel, ChainSelection } from "./types.js";

export interface FocusTarget {
  key: string;
  selection: ChainSelection;
  rect: Rect;
  /**
   * On the signal path (cells, insert points, empty lanes). The arrow keys
   * travel over these; group tags and lane chips are reached with Shift+Up.
   */
  primary: boolean;
}

export function selectionKey(selection: ChainSelection | null): string {
  if (!selection) return "";
  if (selection.kind === "slot") return `slot:${selection.chain}:${selection.index}`;
  if (selection.kind === "newLane") return `newLane:${selection.fork}`;
  return `${selection.kind}:${selection.id}`;
}

/** Everything the cursor can rest on, in reading order (rows, then left to right). */
export function focusTargets(layout: ChainLayout): FocusTarget[] {
  const targets: FocusTarget[] = [];
  const push = (selection: ChainSelection, rect: Rect, primary: boolean) => targets.push({ key: selectionKey(selection), selection, rect, primary });
  for (const cell of layout.cells) push({ kind: "item", id: cell.id }, cell, true);
  for (const fork of layout.forks) {
    push({ kind: "item", id: fork.id }, fork.header, false);
    push({ kind: "newLane", fork: fork.id }, fork.footer, true);
  }
  for (const frame of layout.frames) push({ kind: "item", id: frame.id }, frame.header, false);
  for (const lane of layout.lanes) {
    if (lane.chip) push({ kind: "lane", id: lane.id }, { x: lane.chip.x, y: lane.chip.y, w: 40, h: 18 }, false);
    else if (lane.empty) push({ kind: "lane", id: lane.id }, lane, true);
  }
  for (const slot of layout.slots) {
    if (slot.persistent) push({ kind: "slot", chain: slot.chain, index: slot.index }, { x: slot.x - 10, y: slot.y - 10, w: 20, h: 20 }, true);
  }
  return targets.sort((a, b) => centerY(a.rect) - centerY(b.rect) || a.rect.x - b.rect.x);
}

export type FocusDirection = "left" | "right" | "up" | "down";

const centerX = (rect: Rect): number => rect.x + rect.w / 2;
const centerY = (rect: Rect): number => rect.y + rect.h / 2;

/**
 * Nearest target in a direction. Travel along the axis is cheap and drift
 * across it is expensive, so Left/Right follow a lane and Up/Down change lane.
 * At the end of a wrapped row, Left/Right continue onto the neighbouring row.
 */
export function moveFocus(targets: readonly FocusTarget[], currentKey: string, direction: FocusDirection): FocusTarget | null {
  const current = targets.find((target) => target.key === currentKey);
  if (!current) return targets[0] ?? null;
  const horizontal = direction === "left" || direction === "right";
  const sign = direction === "right" || direction === "down" ? 1 : -1;
  let best: FocusTarget | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    if (target === current || !target.primary) continue;
    const along = horizontal ? (centerX(target.rect) - centerX(current.rect)) * sign : (centerY(target.rect) - centerY(current.rect)) * sign;
    const across = horizontal ? Math.abs(centerY(target.rect) - centerY(current.rect)) : Math.abs(centerX(target.rect) - centerX(current.rect));
    if (along <= 1) continue;
    // Stay within a cone: a target further across than along is not "in that direction".
    // Left/Right use a narrower cone so they keep to the lane rather than the nearest thing.
    if (across > along * (horizontal ? 1 : 1.5) + 4) continue;
    const cost = along + across * 4;
    if (cost < bestCost) {
      best = target;
      bestCost = cost;
    }
  }
  if (best || !horizontal) return best;
  const index = targets.indexOf(current);
  for (let cursor = index + sign; cursor >= 0 && cursor < targets.length; cursor += sign) {
    const target = targets[cursor]!;
    if (target.primary && Math.abs(centerY(target.rect) - centerY(current.rect)) > 1) return target;
  }
  return null;
}

/** The lane or group enclosing the selection (Shift+Up), or `null` at the top level. */
export function parentSelection(model: ChainModel, selection: ChainSelection | null): ChainSelection | null {
  if (!selection) return null;
  if (selection.kind === "newLane") return { kind: "item", id: selection.fork };
  if (selection.kind === "lane") {
    const lane = model.lanes.get(selection.id);
    return lane ? { kind: "item", id: lane.fork } : null;
  }
  const chain = model.chains.get(selection.kind === "slot" ? selection.chain : model.items.get(selection.id)?.chain ?? "");
  if (!chain?.owner) return null;
  const lane = model.lanes.get(chain.owner);
  if (!lane) return { kind: "item", id: chain.owner };
  const fork = model.items.get(lane.fork);
  // A selector bank has no lane handles: its options are the cells themselves.
  return fork?.kind === "fork" && fork.stack && lane.items.length > 0 ? { kind: "item", id: fork.id } : { kind: "lane", id: lane.id };
}

/** The first thing inside a lane or group (Shift+Down), or `null` for a plain cell. */
export function childSelection(model: ChainModel, selection: ChainSelection | null): ChainSelection | null {
  if (selection?.kind === "lane") {
    const lane = model.lanes.get(selection.id);
    const first = lane?.items[0];
    return first ? { kind: "item", id: first.id } : lane ? { kind: "slot", chain: lane.chain, index: 0 } : null;
  }
  if (selection?.kind !== "item") return null;
  const item = model.items.get(selection.id);
  if (item?.kind === "frame") return item.items[0] ? { kind: "item", id: item.items[0].id } : { kind: "slot", chain: item.inner, index: 0 };
  if (item?.kind !== "fork") return null;
  const lane = item.lanes[0];
  if (!lane) return { kind: "newLane", fork: item.id };
  return lane.items[0] ? { kind: "item", id: lane.items[0].id } : { kind: "lane", id: lane.id };
}

export type ChainCommand =
  | { type: "focus"; direction: FocusDirection }
  | { type: "focusEdge"; edge: "first" | "last" }
  | { type: "level"; direction: "out" | "in" }
  | { type: "activate" }
  | { type: "add"; where: "before" | "after" }
  | { type: "bypass" }
  | { type: "remove" }
  | { type: "duplicate" }
  | { type: "nudge"; direction: -1 | 1 }
  | { type: "lane"; direction: -1 | 1 }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "escape" };

export interface KeyLike {
  key: string;
  altKey?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

const ARROWS: Readonly<Record<string, FocusDirection>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/** Map a key press on the rack to a command; `null` leaves the key to the browser. */
export function commandForKey(event: KeyLike): ChainCommand | null {
  const mod = event.ctrlKey === true || event.metaKey === true;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (mod) {
    if (key === "z") return { type: event.shiftKey ? "redo" : "undo" };
    if (key === "y") return { type: "redo" };
    if (key === "d") return { type: "duplicate" };
    return null;
  }
  const arrow = ARROWS[key];
  if (arrow) {
    if (event.shiftKey && !event.altKey) return arrow === "up" ? { type: "level", direction: "out" } : arrow === "down" ? { type: "level", direction: "in" } : null;
    if (!event.altKey) return { type: "focus", direction: arrow };
    return arrow === "left" || arrow === "right"
      ? { type: "nudge", direction: arrow === "left" ? -1 : 1 }
      : { type: "lane", direction: arrow === "up" ? -1 : 1 };
  }
  if (event.altKey) return null;
  switch (key) {
    case "Home":
      return { type: "focusEdge", edge: "first" };
    case "End":
      return { type: "focusEdge", edge: "last" };
    case "Enter":
    case " ":
      return { type: "activate" };
    case "a":
    case "+":
      return { type: "add", where: event.shiftKey && key === "a" ? "before" : "after" };
    case "b":
      return { type: "bypass" };
    case "d":
      return { type: "duplicate" };
    case "Delete":
    case "Backspace":
      return { type: "remove" };
    case "Escape":
      return { type: "escape" };
    default:
      return null;
  }
}

export const CHAIN_SHORTCUTS: ReadonlyArray<{ keys: string; label: string }> = [
  { keys: "← → ↑ ↓", label: "Move along the chain and across lanes" },
  { keys: "Shift+↑ ↓", label: "Select the enclosing lane or group / go back in" },
  { keys: "Enter", label: "Open the selected step" },
  { keys: "A / Shift+A", label: "Add a step after / before" },
  { keys: "B", label: "Bypass or re-enable" },
  { keys: "D", label: "Duplicate" },
  { keys: "Alt+← →", label: "Move the step along its chain" },
  { keys: "Alt+↑ ↓", label: "Move to the lane above / below" },
  { keys: "Delete", label: "Remove" },
];
