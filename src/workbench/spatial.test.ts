import { describe, expect, it } from "vitest";

import { buildGridIndex, decimationIndices, nearestAxisIndex, nearestPoint, pointInPolygon, pointsInPolygon, pointsInRect } from "./spatial.js";

describe("workbench hit testing", () => {
  const xs = Float32Array.from([10, 50, 52, 200, Number.NaN]);
  const ys = Float32Array.from([10, 50, 55, 150, 20]);

  it("finds the nearest point within a radius", () => {
    const index = buildGridIndex(xs, ys, 300, 300, 20);
    expect(nearestPoint(index, 51, 53, 10)).toBe(2);
    expect(nearestPoint(index, 120, 120, 10)).toBeNull();
    expect(nearestPoint(index, 51, 53, 10, (row) => row !== 2)).toBe(1);
  });

  it("selects points in rectangles and polygons", () => {
    expect(pointsInRect(xs, ys, { x0: 60, y0: 60, x1: 0, y1: 0 })).toEqual([0, 1, 2]);
    const triangle = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon(10, 10, triangle)).toBe(true);
    expect(pointInPolygon(90, 90, triangle)).toBe(false);
    expect(pointsInPolygon(xs, ys, triangle)).toEqual([0]);
    const wide = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 0, y: 200 },
    ];
    expect(pointsInPolygon(xs, ys, wide)).toEqual([0, 1, 2]);
  });

  it("decimates long axes and keeps both ends", () => {
    const idx = decimationIndices(1000, 101);
    expect(idx.length).toBe(101);
    expect(idx[0]).toBe(0);
    expect(idx[100]).toBe(999);
    expect(decimationIndices(5, 100).length).toBe(5);
  });

  it("finds the nearest index on ascending and descending axes", () => {
    expect(nearestAxisIndex([1000, 1002, 1004], 1003.2)).toBe(2);
    expect(nearestAxisIndex([4000, 3000, 2000], 2900)).toBe(1);
  });
});
