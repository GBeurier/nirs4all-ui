import { describe, expect, it } from "vitest";

import { columnCorrelation, matrixExtent, toSpectraMatrix, wavelengthQuantiles, wavelengthStats } from "./matrix.js";

describe("workbench spectra matrix", () => {
  const matrix = toSpectraMatrix([
    [1, 2, 3],
    [3, 4, 5],
    [5, 6, 7],
  ]);

  it("packs rows and computes per-column statistics", () => {
    expect(matrix).toMatchObject({ rows: 3, cols: 3 });
    const stats = wavelengthStats(matrix);
    expect(Array.from(stats.mean)).toEqual([3, 4, 5]);
    expect(stats.std[0]).toBeCloseTo(2);
    expect(Array.from(wavelengthStats(matrix, [0, 1]).max)).toEqual([3, 4, 5]);
    expect(matrixExtent(matrix, [1, 2], 0, 2)).toEqual({ min: 3, max: 6 });
  });

  it("computes quantile envelopes", () => {
    const [q0, q50] = wavelengthQuantiles(matrix, [0, 0.5]);
    expect(Array.from(q0!)).toEqual([1, 2, 3]);
    expect(Array.from(q50!)).toEqual([3, 4, 5]);
  });

  it("correlates columns with a target", () => {
    const r = columnCorrelation(
      toSpectraMatrix([
        [1, 9],
        [2, 7],
        [3, 6],
        [4, 1],
      ]),
      [10, 20, 30, 40],
    );
    expect(r[0]).toBeCloseTo(1);
    expect(r[1]).toBeLessThan(-0.9);
  });
});
