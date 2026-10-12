/**
 * Pure selection algebra shared by every workbench view.
 *
 * A selection is an immutable, sorted list of integer indices into the
 * capsule's row universe (samples in the Playground, chains or samples in the
 * Inspector). Views report *hits* (the rows under a click, box, lasso or
 * brush); the modifier keys held during the gesture pick how the hits combine
 * with the current selection. Keeping this pure lets every view (canvas, SVG,
 * table) share one behavior and makes the semantics testable.
 */

export type SelectionMode = "replace" | "add" | "subtract" | "toggle" | "intersect";

/** Sorted, de-duplicated row indices. */
export type Selection = readonly number[];

export const EMPTY_SELECTION: Selection = Object.freeze([]) as Selection;

export interface ModifierState {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/**
 * Map gesture modifiers to a combine mode: Shift adds, Alt subtracts,
 * Ctrl/⌘ toggles, Shift+Alt intersects, no modifier replaces.
 */
export function selectionModeFromModifiers(mods: ModifierState): SelectionMode {
  if (mods.shiftKey && mods.altKey) return "intersect";
  if (mods.altKey) return "subtract";
  if (mods.shiftKey) return "add";
  if (mods.ctrlKey || mods.metaKey) return "toggle";
  return "replace";
}

export function normalizeSelection(indices: Iterable<number>): Selection {
  const unique = new Set<number>();
  for (const index of indices) {
    if (Number.isInteger(index) && index >= 0) unique.add(index);
  }
  return [...unique].sort((a, b) => a - b);
}

/** Combine `hits` into `current` with the given mode. */
export function combineSelection(current: Selection, hits: Iterable<number>, mode: SelectionMode): Selection {
  const hitSet = new Set(normalizeSelection(hits));
  switch (mode) {
    case "replace":
      return [...hitSet].sort((a, b) => a - b);
    case "add":
      return normalizeSelection([...current, ...hitSet]);
    case "subtract":
      return current.filter((index) => !hitSet.has(index));
    case "intersect":
      return current.filter((index) => hitSet.has(index));
    case "toggle": {
      const next = new Set(current);
      for (const index of hitSet) {
        if (next.has(index)) next.delete(index);
        else next.add(index);
      }
      return [...next].sort((a, b) => a - b);
    }
  }
}

/** Every index in `[0, size)` that is not in `selection`. */
export function invertSelection(selection: Selection, size: number): Selection {
  const selected = new Set(selection);
  const out: number[] = [];
  for (let index = 0; index < size; index += 1) if (!selected.has(index)) out.push(index);
  return out;
}

/** Dense membership mask for O(1) lookups inside render loops. */
export function selectionMask(selection: Selection, size: number): Uint8Array {
  const mask = new Uint8Array(Math.max(0, size));
  for (const index of selection) if (index < size) mask[index] = 1;
  return mask;
}

export function sameSelection(a: Selection, b: Selection): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** A named, host-persistable selection. */
export interface SavedSelection {
  id: string;
  name: string;
  indices: Selection;
  color?: string;
  /** Free-form note shown in the selection drawer. */
  note?: string;
}

function hasModifier(mods: ModifierState): boolean {
  return Boolean(mods.shiftKey || mods.altKey || mods.ctrlKey || mods.metaKey);
}

/**
 * Selection after a click: a hit combines with the modifiers; a click on empty
 * space clears the selection unless a modifier is held (then it is a no-op,
 * returned as `null`).
 */
export function clickSelection(current: Selection, row: number | null, mods: ModifierState): Selection | null {
  if (row === null) return hasModifier(mods) ? null : EMPTY_SELECTION;
  return combineSelection(current, [row], selectionModeFromModifiers(mods));
}
