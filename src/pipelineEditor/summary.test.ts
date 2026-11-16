import { describe, expect, it } from "vitest";

import { projectN4mManifest } from "../nodeRegistry/index.js";
import { getStudioPipelinePresets } from "../pipelines/index.js";
import { catalogTypes, findOperator, indexCatalog, operatorStep, searchOperators } from "./catalog.js";
import { fromCanonicalPipeline } from "./document.js";
import { parsePipeline } from "./model.js";
import { formatCount, formatValue, pipelineChainStats, sweepCount, sweepText } from "./summary.js";
import { CATALOG, KFOLD, MSC, PLS, SAVGOL, SCALER, SNV, searchDocument } from "./__fixtures__/pipelines.js";
import type { PipelineChainDocument, PipelineOperatorDefinition } from "./types.js";

const stats = (document: PipelineChainDocument) => pipelineChainStats(parsePipeline(document, indexCatalog(CATALOG)));

describe("generator summaries", () => {
  it("sizes and describes generator payloads", () => {
    expect(sweepCount("range", [2, 30, 4])).toBe(8);
    expect(sweepCount("range", [1, 5])).toBe(5);
    expect(sweepCount("range", { from: 0, to: 1, step: 0.25 })).toBe(5);
    expect(sweepCount("log_range", [0.001, 1, 4])).toBe(4);
    expect(sweepCount("values", ["a", "b", "c"])).toBe(3);
    expect(sweepCount("grid", { a: [1, 2], b: [1, 2, 3] })).toBe(6);
    expect(sweepCount("zip", { a: [1, 2], b: [1, 2, 3] })).toBe(2);
    expect(sweepCount("range", [5, 1, 1])).toBeNull();
    expect(sweepCount("other", {})).toBeNull();
    expect(sweepText("range", [2, 30, 4])).toBe("2 → 30 step 4");
    expect(sweepText("log_range", [0.00001, 10000, 6])).toBe("1e-5 → 10000 log × 6");
    expect(sweepText("values", [15, 21, "auto"])).toBe("15 | 21 | auto");
  });

  it("formats values compactly", () => {
    expect(formatValue(0.00001)).toBe("1e-5");
    expect(formatValue([0.1, 0.9])).toBe("[0.1, 0.9]");
    expect(formatValue({ class: "sklearn.linear_model.Ridge", params: {} })).toBe("Ridge");
    expect(formatValue(null)).toBe("null");
    expect(formatCount(12345)).toBe("12 345");
  });

  it("estimates variants from generator sizes and reports what it cannot size", () => {
    // alternatives capped by count (2) x swept n_components (8)
    expect(stats(searchDocument())).toMatchObject({ steps: 5, models: 2, variants: 16, bypassed: 0 });
    expect(stats({ pipeline: [{ _or_: [SNV, MSC, null] }, { model: PLS }] }).variants).toBe(3);
    expect(stats({ pipeline: [{ _or_: [SNV, { _bypassed_: MSC }] }, { _bypassed_: { model: PLS, _range_: [1, 9, 1], param: "n_components" } }] })).toMatchObject({ variants: 1, bypassed: 2 });
    expect(stats({ pipeline: [{ _or_: [SNV, MSC, SCALER], pick: 2 }] }).variants).toBeNull();
    expect(stats({ pipeline: [{ _or_: [SNV, MSC, SCALER], pick: 2, count: 2 }] }).variants).toBe(2);
    expect(stats({ pipeline: [{ _sample_: { distribution: "uniform", from: 0, to: 1 } }] }).variants).toBeNull();
    expect(stats({ pipeline: [{ class: SAVGOL, params: { window_length: { _or_: [11, 21] }, deriv: { _range_: [0, 2, 1] } } }] }).variants).toBe(6);
  });

  it("reads the Studio presets: 3 alternatives x 8 components, and a capped cartesian product", () => {
    const presets = new Map(getStudioPipelinePresets().map((preset) => [preset.id, fromCanonicalPipeline(preset.variants!.regression!.pipeline)]));
    expect(stats(presets.get("simple_pls")!).variants).toBe(24);
    expect(stats(presets.get("complex_pls")!).variants).toBe(150);
  });
});

describe("catalogue", () => {
  const index = indexCatalog(CATALOG);

  it("resolves exact paths, aliases, unique class names and the family asked for", () => {
    expect(findOperator(index, SAVGOL)?.id).toBe("pp.savgol");
    expect(findOperator(index, "nirs4all.operators.transforms.nirs.SavitzkyGolay")?.id).toBe("pp.savgol");
    expect(findOperator(index, "sklearn.model_selection._split.KFold")?.id).toBe("split.kfold");
    expect(findOperator(index, SCALER)?.id).toBe("pp.scaler");
    expect(findOperator(index, "sklearn.preprocessing._data.StandardScaler", "y_processing")?.id).toBe("y.scaler");
    expect(findOperator(index, "pkg.Nope")).toBeNull();
  });

  it("searches by name, category and path, and lists the families", () => {
    expect(searchOperators(CATALOG, "pls").map((operator) => operator.id)).toEqual(["model.pls"]);
    expect(searchOperators(CATALOG, "deriv").map((operator) => operator.id)).toEqual(["pp.savgol"]);
    expect(searchOperators(CATALOG, "s", "splitting").map((operator) => operator.id)).toEqual(["split.kfold"]);
    expect(searchOperators(CATALOG, "scaler sklearn")).toHaveLength(2);
    expect(searchOperators(CATALOG, "")).toHaveLength(CATALOG.operators.length);
    expect(catalogTypes(CATALOG)).toEqual(["preprocessing", "y_processing", "splitting", "model"]);
  });

  it("builds the canonical step of an operator without inventing parameters", () => {
    const byId = (id: string) => CATALOG.operators.find((operator) => operator.id === id)!;
    expect(operatorStep(byId("pp.snv"))).toBe(SNV);
    expect(operatorStep(byId("split.kfold"))).toBe(KFOLD);
    expect(operatorStep(byId("model.pls"))).toEqual({ model: PLS });
    expect(operatorStep(byId("y.scaler"))).toEqual({ y_processing: SCALER });
    expect(operatorStep({ ...byId("split.kfold"), stepKeyword: "split" })).toEqual({ split: KFOLD });
  });

  it("accepts nodeRegistry definitions as a catalogue", () => {
    const nodes = projectN4mManifest({
      abi: "test",
      methods: [{
        method_id: "preprocessing.scatter.snv", fq_name: "n4m::snv", kind: "estimator", roles: ["transformer"], node_kinds: [], capabilities: [],
        inputs: { y: "none", labels: "none", sample_weight: "none", groups: "none", feature_groups: "none", blocks: "none", axis: "none", target_domain: "none", fold_ids: "none" },
        params: [{ name: "ddof", type: "int", required: false, default: 0, min: 0, max: 1, choices: [] }],
      }],
    });
    const operators: PipelineOperatorDefinition[] = nodes;
    const model = parsePipeline({ pipeline: [operatorStep(operators[0]!)] }, indexCatalog({ operators }));
    expect(model.root.items[0]).toMatchObject({ kind: "step", role: "preprocessing", classPath: "n4m:preprocessing.scatter.snv", label: "SNV" });
  });
});
