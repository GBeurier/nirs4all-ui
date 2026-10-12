import { describe, expect, it } from "vitest";

import { categoriesOf, groupRows, MISSING_COLOR, resolveRowColors, robustRange, type RowColumn } from "./colorBy.js";

describe("workbench color-by", () => {
  it("colors categorical columns with partition defaults and counts", () => {
    const column: RowColumn = { key: "partition", label: "Partition", kind: "categorical", values: ["test", "train", null, "train"] };
    const mapping = resolveRowColors(4, column);
    expect(mapping.legend).toMatchObject({ kind: "categorical", missing: 1 });
    expect(mapping.legend?.kind === "categorical" && mapping.legend.entries.map((e) => [e.value, e.count])).toEqual([
      ["test", 1],
      ["train", 2],
    ]);
    expect(mapping.colors[1]).toBe("#0d9488");
    expect(mapping.colors[2]).toBe(MISSING_COLOR);
    expect(mapping.groups[1]).toBe(mapping.groups[3]);
  });

  it("honors explicit category order", () => {
    expect(categoriesOf({ key: "k", label: "k", kind: "categorical", values: ["b", "a", "c"], order: ["c", "b"] })).toEqual(["c", "b", "a"]);
  });

  it("ramps continuous columns over a robust range", () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    values.push(10_000);
    const range = robustRange(values)!;
    expect(range.max).toBeLessThan(200);
    const mapping = resolveRowColors(values.length, { key: "y", label: "y", kind: "continuous", values });
    expect(mapping.legend?.kind).toBe("continuous");
    expect(mapping.groups[0]).toBe(0);
    expect(mapping.groups[100]).toBe(31);
  });

  it("falls back to a single color and groups rows", () => {
    expect(new Set(resolveRowColors(3, null).colors).size).toBe(1);
    const groups = groupRows({ key: "g", label: "g", kind: "categorical", values: ["a", "b", "a", null] });
    expect(groups.get("a")).toEqual([0, 2]);
    expect(groups.get(null)).toEqual([3]);
  });
});
