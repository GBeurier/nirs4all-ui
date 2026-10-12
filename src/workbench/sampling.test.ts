import { describe, expect, it } from "vitest";

import { sampleRows } from "./sampling.js";

const rows = Array.from({ length: 100 }, (_, i) => i);

describe("sampleRows", () => {
  it("returns every row when the budget covers them", () => {
    expect(sampleRows(rows.slice(0, 5), 10, "random")).toEqual([0, 1, 2, 3, 4]);
  });

  it("is deterministic per seed and sorted", () => {
    const a = sampleRows(rows, 10, "random", { seed: 3 });
    expect(a).toEqual(sampleRows(rows, 10, "random", { seed: 3 }));
    expect(a).toEqual([...a].sort((x, y) => x - y));
    expect(new Set(a).size).toBe(10);
  });

  it("spreads stratified picks over the value quantiles", () => {
    const values = Float64Array.from(rows, (r) => r);
    const picked = sampleRows(rows, 4, "stratified", { values, seed: 1 });
    expect(picked.map((r) => Math.floor(r / 25))).toEqual([0, 1, 2, 3]);
  });

  it("covers the extremes with maximin sampling", () => {
    const data = new Float32Array(rows.length * 2);
    rows.forEach((r) => data.set([r, r], r * 2));
    const picked = sampleRows(rows, 3, "coverage", { matrix: { rows: rows.length, cols: 2, data } });
    expect(picked).toContain(0);
    expect(picked).toContain(99);
  });
});
