import { describe, expect, it } from "vitest";

import { chainLabel, confusionCounts, facetValue, filterChains, hardSamples, hyperparameterNames, pivotChains, pivotKey, rankChains, regressionSummary, toScoredChains, usefulFacets } from "./analysis.js";
import type { ChainPredictions, InspectorChain, ScoreRef } from "./types.js";

const RMSE: ScoreRef = { key: "rmse", label: "RMSE", metric: "rmse", partition: "validation", lowerIsBetter: true };
const R2: ScoreRef = { key: "r2", label: "R²", metric: "r2", partition: "validation", lowerIsBetter: false };

function chain(id: string, model: string, pp: string[], rmse: number | null, extra: Partial<InspectorChain> = {}): InspectorChain {
  return {
    id,
    model,
    task: "regression",
    dataset: "wheat",
    steps: [...pp.map((token) => ({ token, role: "preprocess" as const })), { token: model.toLowerCase(), role: "model" as const }],
    scores: { rmse, r2: rmse === null ? null : 1 - rmse },
    ...extra,
  };
}

const CHAINS = [
  chain("a", "PLS", ["snv"], 0.5, { params: { n_components: 8 } }),
  chain("b", "PLS", ["msc"], 0.4, { params: { n_components: 12 } }),
  chain("c", "RF", ["snv"], 0.7, { params: { n_estimators: 100 } }),
  chain("d", "RF", [], null),
];

describe("inspector analysis", () => {
  it("labels chains and reads facets", () => {
    expect(chainLabel(CHAINS[0]!)).toBe("PLS · snv");
    expect(chainLabel(CHAINS[3]!)).toBe("RF · raw");
    expect(facetValue(CHAINS[1]!, "firstStep")).toBe("msc");
    expect(usefulFacets(CHAINS)).toContain("model");
    expect(usefulFacets(CHAINS)).not.toContain("dataset");
  });

  it("ranks by direction and keeps unscored chains last", () => {
    expect(rankChains(CHAINS, RMSE).map((r) => [r.chain.id, r.rank])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 3],
      ["d", null],
    ]);
    expect(rankChains(CHAINS, R2)[0]!.chain.id).toBe("b");
  });

  it("filters by search and facets", () => {
    expect(filterChains(CHAINS, { search: "snv", facets: {}, scoredOnly: false }, RMSE).map((c) => c.id)).toEqual(["a", "c"]);
    expect(filterChains(CHAINS, { search: "", facets: { model: new Set(["RF"]) }, scoredOnly: true }, RMSE).map((c) => c.id)).toEqual(["c"]);
  });

  it("pivots two facets with the best aggregate", () => {
    const pivot = pivotChains(CHAINS, "firstStep", "model", RMSE, "best");
    expect(pivot.rows[0]).toBe("msc");
    expect(pivot.cells.get(pivotKey("snv", "PLS"))?.value).toBe(0.5);
    expect(pivot.cells.get(pivotKey("snv", "RF"))?.chainIds).toEqual(["c"]);
  });

  it("lists varying hyper-parameters and bridges to scored chains", () => {
    expect(hyperparameterNames(CHAINS)).toEqual([{ name: "n_components", kind: "numeric", count: 2 }]);
    expect(toScoredChains(CHAINS, RMSE).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("summarizes predictions and finds hard samples", () => {
    const p1: ChainPredictions = { chainId: "a", sampleKeys: ["s1", "s2", "s3"], yTrue: [1, 2, 3], yPred: [1.1, 2, 5] };
    const p2: ChainPredictions = { chainId: "b", sampleKeys: ["s1", "s2", "s3"], yTrue: [1, 2, 3], yPred: [0.9, 2.2, 4] };
    const summary = regressionSummary(p1)!;
    expect(summary.n).toBe(3);
    expect(summary.bias).toBeCloseTo(0.7);
    const hard = hardSamples([p1, p2]);
    expect(hard[0]!.key).toBe("s3");
    expect(hard[0]!.meanAbsResidual).toBeCloseTo(1.5);
    const cm = confusionCounts({ chainId: "x", sampleKeys: ["1", "2", "3"], yTrue: ["a", "b", "b"], yPred: ["a", "a", "b"] });
    expect(cm.matrix).toEqual([
      [1, 0],
      [1, 1],
    ]);
    expect(cm.accuracy).toBeCloseTo(2 / 3);
  });
});
