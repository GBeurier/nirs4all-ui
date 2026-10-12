import { describe, expect, it } from "vitest";

import { createStep, effectiveSteps, groupOperators, insertStep, moveStep, pipelineFingerprint, RAW_CURSOR, removeStep, searchOperators, summarizeParams, updateStep } from "./pipeline.js";
import type { OperatorDefinition } from "./types.js";

const OPS: OperatorDefinition[] = [
  { id: "snv", name: "SNV", kind: "preprocessing", category: "Scatter", tier: "core" },
  { id: "savgol", name: "Savitzky–Golay", kind: "preprocessing", category: "Derivatives", params: [{ name: "window", type: "int", default: 11 }, { name: "deriv", type: "int", default: 1 }, { name: "mode", type: "string", default: "interp", advanced: true }] },
  { id: "kfold", name: "K-Fold", kind: "splitting", singleton: true, params: [{ name: "n_splits", type: "int", default: 5 }] },
];

describe("playground pipeline helpers", () => {
  it("creates steps with defaults and edits them immutably", () => {
    const sg = createStep(OPS[1]!);
    expect(sg.params).toEqual({ window: 11, deriv: 1, mode: "interp" });
    const snv = createStep(OPS[0]!);
    let steps = insertStep([], snv, OPS[0]);
    steps = insertStep(steps, sg, OPS[1]);
    expect(steps.map((s) => s.operatorId)).toEqual(["snv", "savgol"]);
    expect(moveStep(steps, sg.id, 0).map((s) => s.operatorId)).toEqual(["savgol", "snv"]);
    expect(updateStep(steps, snv.id, { enabled: false })[0]!.enabled).toBe(false);
    expect(removeStep(steps, snv.id)).toHaveLength(1);
    expect(summarizeParams(OPS[1], sg.params)).toBe("window 11 · deriv 1");
  });

  it("replaces singleton operators and inserts after a step", () => {
    const a = createStep(OPS[2]!);
    const b = createStep(OPS[2]!, { n_splits: 3 });
    const snv = createStep(OPS[0]!);
    const steps = insertStep(insertStep([snv], a, OPS[2]), b, OPS[2]);
    expect(steps.map((s) => s.id)).toEqual([snv.id, b.id]);
    const sg = createStep(OPS[1]!);
    expect(insertStep(steps, sg, OPS[1], snv.id).map((s) => s.id)).toEqual([snv.id, sg.id, b.id]);
  });

  it("computes the effective preview pipeline and its fingerprint", () => {
    const steps = [createStep(OPS[0]!), { ...createStep(OPS[1]!), enabled: false }, createStep(OPS[2]!)];
    expect(effectiveSteps(steps, null).map((s) => s.operatorId)).toEqual(["snv", "kfold"]);
    expect(effectiveSteps(steps, steps[1]!.id).map((s) => s.operatorId)).toEqual(["snv"]);
    expect(effectiveSteps(steps, RAW_CURSOR)).toEqual([]);
    expect(pipelineFingerprint(steps)).not.toBe(pipelineFingerprint([...steps].reverse()));
  });

  it("searches and groups the catalog", () => {
    expect(searchOperators(OPS, "deriv").map((o) => o.id)).toEqual(["savgol"]);
    expect(searchOperators(OPS, "").length).toBe(3);
    expect(groupOperators(OPS).map((g) => g.kind)).toEqual(["preprocessing", "splitting"]);
  });
});
