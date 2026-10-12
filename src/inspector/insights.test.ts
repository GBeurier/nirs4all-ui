import { describe, expect, it } from "vitest";

import { rankChains } from "./analysis.js";
import {
  buildInsights,
  crossDatasetTable,
  factorImportance,
  foldStats,
  formatParam,
  oneSeTies,
  paretoFront,
  relativeGain,
  residualAgreement,
  selectionProfile,
  stepShifts,
  trendLine,
} from "./insights.js";
import type { ChainPredictions, InspectorChain, ScoreRef } from "./types.js";

const CV: ScoreRef = { key: "cv", label: "RMSE · CV", metric: "rmse", partition: "validation", lowerIsBetter: true };
const TRAIN: ScoreRef = { key: "train", label: "RMSE · train", metric: "rmse", partition: "train", lowerIsBetter: true };
const TEST: ScoreRef = { key: "test", label: "RMSE · test", metric: "rmse", partition: "test", lowerIsBetter: true };
const ACC: ScoreRef = { key: "acc", label: "Accuracy", metric: "accuracy", partition: "validation", lowerIsBetter: false };

function chain(id: string, model: string, family: string, pp: string[], cv: number, extra: Partial<InspectorChain> = {}): InspectorChain {
  return {
    id,
    model,
    modelFamily: family,
    task: "regression",
    dataset: "wheat",
    steps: [...pp.map((token) => ({ token, label: token.toUpperCase(), role: "preprocess" as const })), { token: model.toLowerCase(), label: model, role: "model" as const }],
    scores: { cv, train: cv * 0.9, test: cv * 1.05 },
    ...extra,
  };
}

// PLS clearly better than RF; SG helps; RF overfits.
const CHAINS: InspectorChain[] = [
  chain("p1", "PLS", "Linear", ["sg"], 0.5, { foldScores: { cv: [0.46, 0.5, 0.54, 0.5] }, fitTimeMs: 400, params: { n: 8 } }),
  chain("p2", "PLS", "Linear", ["sg", "snv"], 0.51, { foldScores: { cv: [0.5, 0.51, 0.52, 0.51] }, fitTimeMs: 200, params: { n: 10 } }),
  chain("p3", "PLS", "Linear", ["snv"], 0.6, { fitTimeMs: 100, params: { n: 4 } }),
  chain("p4", "PLS", "Linear", [], 0.62, { fitTimeMs: 90, params: { n: 2 } }),
  chain("p5", "PLS", "Linear", ["sg"], 0.52, { fitTimeMs: 300, params: { n: 12 } }),
  chain("p6", "PLS", "Linear", ["snv"], 0.61, { fitTimeMs: 300, params: { n: 6 } }),
  chain("r1", "RF", "Trees", ["sg"], 0.7, { scores: { cv: 0.7, train: 0.2, test: 0.8 }, fitTimeMs: 5000 }),
  chain("r2", "RF", "Trees", [], 0.8, { scores: { cv: 0.8, train: 0.25, test: 0.9 }, fitTimeMs: 6000 }),
  chain("r3", "RF", "Trees", ["snv"], 0.78, { scores: { cv: 0.78, train: 0.22, test: 0.85 }, fitTimeMs: 5500 }),
  chain("r4", "RF", "Trees", ["sg"], 0.72, { scores: { cv: 0.72, train: 0.21, test: 0.8 }, fitTimeMs: 5200 }),
];

describe("inspector insights", () => {
  it("summarizes folds and applies the one-standard-error rule", () => {
    const stats = foldStats(CHAINS[0]!, CV)!;
    expect(stats.k).toBe(4);
    expect(stats.mean).toBeCloseTo(0.5);
    expect(stats.min).toBeCloseTo(0.46);
    expect(stats.se).toBeCloseTo(stats.sd / 2);
    expect(foldStats(CHAINS[2]!, CV)).toBeNull();

    const ties = oneSeTies(rankChains(CHAINS, CV), CV)!;
    expect(ties.best.id).toBe("p1");
    expect(ties.tied.map((c) => c.id)).toEqual(["p1", "p2"]);
    expect(ties.simplest?.id).toBe("p2"); // tied and faster
    expect(ties.runnerUp?.chain.id).toBe("p2");
  });

  it("orients relative gains by metric direction", () => {
    expect(relativeGain(1, 0.9, CV)).toBeCloseTo(0.1);
    expect(relativeGain(0.8, 0.88, ACC)).toBeCloseTo(0.1);
    expect(formatParam(12)).toBe("12");
    expect(formatParam(0.12345)).toBe("0.123");
    expect(formatParam(null)).toBe("—");
  });

  it("ranks the factors that explain the score", () => {
    const factors = factorImportance(CHAINS, CV, ["modelFamily", "firstStep"]);
    const family = factors.find((f) => f.key === "modelFamily")!;
    expect(family.bestLevel).toBe("Linear");
    expect(family.omega2).toBeGreaterThan(0.5);
    for (let i = 1; i < factors.length; i += 1) expect(factors[i - 1]!.omega2).toBeGreaterThanOrEqual(factors[i]!.omega2);
    for (const f of factors) expect(f.omega2).toBeGreaterThanOrEqual(0);
    expect(factors.some((f) => f.key === "param:n")).toBe(true);
  });

  it("measures step shifts in score units", () => {
    const shifts = stepShifts(CHAINS, CV, 3);
    const sg = shifts.find((s) => s.token === "sg")!;
    expect(sg.gain).toBeGreaterThan(0);
    expect(shifts[0]!.gain).toBeGreaterThanOrEqual(shifts[shifts.length - 1]!.gain);
  });

  it("finds the score × cost Pareto front", () => {
    const front = paretoFront(CHAINS, CV).map((c) => c.id);
    expect(front[0]).toBe("p4"); // fastest
    expect(front).toContain("p1"); // best
    expect(front).not.toContain("r1");
  });

  it("builds a binned trend line", () => {
    const xs = Float64Array.from({ length: 30 }, (_, i) => i);
    const ys = Float64Array.from(xs, (x) => (x - 15) ** 2);
    const trend = trendLine(xs, ys, 6);
    expect(trend).toHaveLength(6);
    expect(trend[0]![0]).toBeLessThan(trend[5]![0]);
    expect(trendLine([1, 2], [1, 2])).toEqual([]);
  });

  it("profiles what a selection shares", () => {
    const pls = CHAINS.filter((c) => c.model === "PLS");
    const { enriched, absent } = selectionProfile(pls.slice(0, 3), CHAINS);
    expect(enriched.map((i) => i.label)).toContain("PLS");
    expect(absent.map((i) => i.label)).toContain("RF");
  });

  it("ranks facet levels within each dataset", () => {
    const soil = CHAINS.map((c) => ({ ...c, id: `s-${c.id}`, dataset: "soil", scores: { cv: c.model === "RF" ? 0.3 : 0.9 } }));
    const table = crossDatasetTable([...CHAINS, ...soil], "modelFamily", [CV], CV);
    expect(table.datasets.map((d) => d.name)).toEqual(["soil", "wheat"]);
    const linear = table.rows.find((r) => r.value === "Linear")!;
    expect(linear.cells.get("wheat")!.rank).toBe(1);
    expect(linear.cells.get("soil")!.rank).toBe(2);
    expect(linear.meanRank).toBe(1.5);
  });

  it("measures residual agreement and the blend score", () => {
    const keys = ["a", "b", "c", "d"];
    const a: ChainPredictions = { chainId: "A", sampleKeys: keys, yTrue: [1, 2, 3, 4], yPred: [1.5, 1.5, 3.5, 3.5] };
    const b: ChainPredictions = { chainId: "B", sampleKeys: [...keys].reverse(), yTrue: [4, 3, 2, 1], yPred: [4.5, 2.5, 2.5, 0.5] };
    const agreement = residualAgreement(a, b)!;
    expect(agreement.n).toBe(4);
    expect(agreement.r).toBeCloseTo(-1);
    expect(agreement.rmseBlend).toBeCloseTo(0);
    expect(agreement.rmseA).toBeCloseTo(0.5);
  });

  it("derives plain-language findings", () => {
    const ranking = rankChains(CHAINS, CV);
    const ties = oneSeTies(ranking, CV);
    const insights = buildInsights({ chains: CHAINS, ref: CV, refs: [CV, TRAIN, TEST], ties, factors: factorImportance(CHAINS, CV, ["modelFamily"]), shifts: stepShifts(CHAINS, CV, 3) });
    const kinds = insights.map((i) => i.kind);
    expect(kinds).toContain("ties");
    expect(kinds).toContain("driver");
    expect(kinds).toContain("family");
    expect(insights.find((i) => i.kind === "overfit")).toMatchObject({ family: "Trees" });
    expect(kinds).toContain("testDrift");
  });
});
