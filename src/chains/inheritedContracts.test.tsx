import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildExportConfig } from "../datasetBuilder/exportConfig.js";
import type { DatasetSource } from "../datasetBuilder/types.js";
import { fromScoredChains } from "./analysis.js";
import { CHAIN_EFFECT_SCHEMA_ID, isChainEffectAnalysisArtifact, parseChainEffectAnalysis } from "./contract.js";
import { NodeEffectForest } from "./NodeEffectForest.js";

function artifact() {
  return {
    schema_id: CHAIN_EFFECT_SCHEMA_ID, schema_version: 1,
    metric: { key: "r2", label: "R²", lower_is_better: false }, lens: "raw",
    points: [{ id: "a", score: 0, goodness: 0, ordered_tokens: [{ token: "a", role: "model" }] }],
  };
}

describe("inherited public contract regressions", () => {
  it.each([0, 6, 8, 256])("exports every assigned X column in order (%i columns)", (count) => {
    const names = Array.from({ length: count }, (_, i) => String(1000 + i));
    const source: DatasetSource = {
      id: "nir", name: "nir.csv", kind: "file", fileType: "csv", signalType: "spectra",
      status: "parsed", parsing: {}, usage: { useAs: "x_train" },
      columns: [
        { id: "id", name: "sample_id", assignedRole: "id", detectedType: "text" },
        ...names.map((name) => ({ id: name, name, assignedRole: "x" as const, detectedType: "float" as const })),
        { id: "y", name: "target", assignedRole: "y", detectedType: "float" },
      ],
    };
    const exported = JSON.parse(JSON.stringify(buildExportConfig("wheat", [source])));
    expect(exported.sources[0].x_columns).toEqual(count ? names : undefined);
    expect(exported.targets[0].column).toBe("target");
  });

  it("sorts finite zero ahead of negative medians and nonfinite values last", () => {
    const analysis = fromScoredChains([
      { id: "a", score: 0, steps: [{ token: "zero", label: "Zero median", role: "model" }] },
      { id: "b", score: -1, steps: [{ token: "negative", label: "Negative median", role: "model" }] },
    ], { metric: { key: "r2", label: "R²", lowerIsBetter: false }, lens: "raw" });
    const missing = { ...analysis.tokens[0]!, token: "missing", label: "Missing median", with: { n: 0, min: NaN, q1: NaN, median: NaN, q3: NaN, max: NaN, mean: NaN } };
    const infinite = { ...missing, token: "infinite", label: "Infinite median", with: { ...missing.with, median: Infinity } };
    const tokens = [missing, ...analysis.tokens, infinite];
    const markup = renderToStaticMarkup(<NodeEffectForest analysis={{ ...analysis, tokens }} sortBy="median" />);
    const labels = [...markup.matchAll(/class="n4chains-row-label"[^>]*>([^<]+)</g)].map((match) => match[1]);
    expect(labels).toEqual(["Zero median", "Negative median", "Missing median", "Infinite median"]);
    expect(tokens[0]).toBe(missing);
  });

  it.each(["constructor", "toString", "__proto__", "bogus"])("rejects lens %s", (lens) => {
    expect(isChainEffectAnalysisArtifact({ ...artifact(), lens })).toBe(false);
    expect(() => parseChainEffectAnalysis({ ...artifact(), lens })).toThrow("Invalid chain-effect");
  });
  it.each([0, 2, 99, NaN, Infinity, "1", null])("rejects unsupported schema version %s", (schema_version) => {
    expect(isChainEffectAnalysisArtifact({ ...artifact(), schema_version })).toBe(false);
  });
  it.each([NaN, Infinity, -Infinity, null, "0"])("rejects nonfinite/non-numeric point values %s", (value) => {
    for (const field of ["score", "goodness"]) {
      expect(isChainEffectAnalysisArtifact({ ...artifact(), points: [{ ...artifact().points[0], [field]: value }] })).toBe(false);
    }
  });
  it.each([NaN, Infinity, -Infinity, "0"])("rejects invalid baseline %s", (baseline) => {
    expect(isChainEffectAnalysisArtifact({ ...artifact(), baseline })).toBe(false);
  });
  it.each(["raw", "rank_by_dataset", "z_by_dataset"])("accepts declared nullable metadata and lens %s", (lens) => {
    const value = { ...artifact(), lens, baseline: null, points: [{ ...artifact().points[0]!, dataset: null, source: null }] };
    expect(isChainEffectAnalysisArtifact(value)).toBe(true);
    const parsed = parseChainEffectAnalysis(value);
    expect(parsed.points[0]?.score).toBe(0);
    expect(parsed.points[0]?.dataset).toBe("∗");
    expect(parsed.points[0]?.source).toBe("∗");
  });
  it("rejects mistyped optional metadata without rejecting omitted fields", () => {
    expect(isChainEffectAnalysisArtifact(artifact())).toBe(true);
    for (const field of ["dataset", "source"]) {
      expect(isChainEffectAnalysisArtifact({ ...artifact(), points: [{ ...artifact().points[0], [field]: 7 }] })).toBe(false);
    }
    expect(isChainEffectAnalysisArtifact({ ...artifact(), points: [{ ...artifact().points[0], ordered_tokens: [{ token: "a", role: "model", label: null }] }] })).toBe(false);
  });
});
