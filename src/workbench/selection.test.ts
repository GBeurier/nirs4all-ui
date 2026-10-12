import { describe, expect, it } from "vitest";

import { clickSelection, combineSelection, invertSelection, normalizeSelection, selectionMask, selectionModeFromModifiers } from "./selection.js";

describe("workbench selection algebra", () => {
  it("maps modifiers to combine modes", () => {
    expect(selectionModeFromModifiers({})).toBe("replace");
    expect(selectionModeFromModifiers({ shiftKey: true })).toBe("add");
    expect(selectionModeFromModifiers({ altKey: true })).toBe("subtract");
    expect(selectionModeFromModifiers({ ctrlKey: true })).toBe("toggle");
    expect(selectionModeFromModifiers({ metaKey: true })).toBe("toggle");
    expect(selectionModeFromModifiers({ shiftKey: true, altKey: true })).toBe("intersect");
  });

  it("combines hits with the current selection", () => {
    const current = [1, 3, 5];
    expect(combineSelection(current, [5, 2, 2], "replace")).toEqual([2, 5]);
    expect(combineSelection(current, [2], "add")).toEqual([1, 2, 3, 5]);
    expect(combineSelection(current, [3], "subtract")).toEqual([1, 5]);
    expect(combineSelection(current, [3, 4], "toggle")).toEqual([1, 4, 5]);
    expect(combineSelection(current, [3, 5, 9], "intersect")).toEqual([3, 5]);
  });

  it("clears on an empty click only without modifiers", () => {
    expect(clickSelection([1, 2], null, {})).toEqual([]);
    expect(clickSelection([1, 2], null, { shiftKey: true })).toBeNull();
    expect(clickSelection([1, 2], 4, { shiftKey: true })).toEqual([1, 2, 4]);
  });

  it("normalizes, inverts and masks", () => {
    expect(normalizeSelection([3, -1, 2.5, 3, 0])).toEqual([0, 3]);
    expect(invertSelection([0, 2], 4)).toEqual([1, 3]);
    expect(Array.from(selectionMask([1, 3, 9], 4))).toEqual([0, 1, 0, 1]);
  });
});
