import { describe, expect, it } from "vitest";

import { DEFAULT_CAMERA_3D, niceTicks, normalizeAxes, projectPoint, projectRows } from "./projection3d.js";

describe("projection3d", () => {
  it("normalizes each axis to [-1, 1], or isotropically", () => {
    const axes = [[0, 10], [0, 2], [5, 5]] as const;
    const free = normalizeAxes(axes, [0, 1], false);
    expect(free.center).toEqual([5, 1, 5]);
    expect(free.half).toEqual([5, 1, 1]);
    expect(normalizeAxes(axes, [0, 1], true).half).toEqual([5, 5, 5]);
  });

  it("looks down -Z in the front view", () => {
    const camera = { ...DEFAULT_CAMERA_3D, yaw: 0, pitch: 0 };
    const viewport = { width: 200, height: 200 };
    const center = projectPoint(camera, viewport, 0, 0, 0);
    expect(center.sx).toBeCloseTo(100);
    expect(center.sy).toBeCloseTo(100);
    expect(projectPoint(camera, viewport, 1, 0, 0).sx).toBeGreaterThan(100);
    expect(projectPoint(camera, viewport, 0, 1, 0).sy).toBeLessThan(100);
    expect(projectPoint(camera, viewport, 0, 0, 1).depth).toBeGreaterThan(0);
  });

  it("orders drawn rows back to front and skips non-finite rows", () => {
    const camera = { ...DEFAULT_CAMERA_3D, yaw: 0, pitch: 0 };
    const out = projectRows([[0, 0, 0], [0, Number.NaN, 0], [-1, 0, 1]], [0, 1, 2], { center: [0, 0, 0], half: [1, 1, 1] }, camera, { width: 100, height: 100 });
    // Rows are (x, y, z) = (0, 0, -1), (0, NaN, 0), (0, 0, 1): far row first.
    expect([...out.order]).toEqual([0, 2]);
    expect(Number.isNaN(out.sx[1]!)).toBe(true);
  });

  it("produces round tick values inside the range", () => {
    expect(niceTicks(0, 1, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    for (const t of niceTicks(-3.2, 7.9, 4)) expect(t).toBeGreaterThanOrEqual(-3.2);
  });
});
