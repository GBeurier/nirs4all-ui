import { describe, expect, it } from "vitest";

import { DEFAULT_REPETITION_OPTIONS, repetitionModel } from "./views.js";

const reps = {
  metric: "euclidean",
  groups: ["a", "a", "b", "b", "c", null],
  distance: Float64Array.from([0.1, 0.2, 0.9, 0.3, 0.5, 9]),
  threshold: 0.6,
};
const scope = [0, 1, 2, 3, 4, 5];

describe("repetitionModel", () => {
  it("ranks groups by worst spread and flags them with the host threshold", () => {
    const model = repetitionModel(reps, scope, DEFAULT_REPETITION_OPTIONS, () => 0);
    expect(model.entries.map((e) => e.g)).toEqual(["b", "c", "a"]);
    expect(model.threshold).toBe(0.6);
    expect(model.entries.filter((e) => e.flagged).map((e) => e.g)).toEqual(["b"]);
  });

  it("supports name order, manual thresholds and flagged-only filtering", () => {
    const model = repetitionModel(reps, scope, { ...DEFAULT_REPETITION_OPTIONS, sort: "name", threshold: "manual", manualThreshold: 0.4, flaggedOnly: true }, () => 0);
    expect(model.entries.map((e) => e.g)).toEqual(["b", "c"]);
  });

  it("ignores rows outside the scope and computes quantile guides", () => {
    const model = repetitionModel(reps, [0, 1], { ...DEFAULT_REPETITION_OPTIONS, quantiles: [0.5], threshold: "off" }, () => 0);
    expect(model.entries.map((e) => e.g)).toEqual(["a"]);
    expect(model.threshold).toBeUndefined();
    expect(model.quantiles[0]!.value).toBeCloseTo(0.15);
  });
});
