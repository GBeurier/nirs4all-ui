import { describe, expect, it } from "vitest";

import { getStudioPipelinePresets } from "../pipelines/index.js";
import { indexCatalog } from "./catalog.js";
import { fromCanonicalPipeline, toCanonicalPipeline } from "./document.js";
import { flattenItems, parsePipeline } from "./model.js";
import { CATALOG, KFOLD, MSC, PLS, SCALER, SNV, branchDocument, searchDocument } from "./__fixtures__/pipelines.js";
import type { ChainItem, ForkNode, FrameNode, StepNode } from "./types.js";

const index = indexCatalog(CATALOG);
const kinds = (items: readonly ChainItem[]) => items.map((item) => item.kind);

describe("parsePipeline", () => {
  it("projects steps, a branch with lanes, a merge and a model", () => {
    const model = parsePipeline(branchDocument(), index);
    expect(kinds(model.root.items)).toEqual(["step", "fork", "merge", "step"]);
    const [split, fork, , head] = model.root.items as [StepNode, ForkNode, ChainItem, StepNode];
    expect(split).toMatchObject({ role: "splitting", label: "K-fold", params: { n_splits: 5 }, keyword: null });
    expect(fork).toMatchObject({ mode: "branch", named: false, stack: false });
    expect(fork.lanes.map((lane) => lane.items.length)).toEqual([2, 1, 0]);
    expect(fork.lanes[0]!.items[1]).toMatchObject({ kind: "step", label: "Savitzky-Golay", params: { window_length: 15 } });
    expect(head).toMatchObject({ role: "model", keyword: "model", customName: "PLS-10", classPath: PLS });
  });

  it("reads alternatives, attached sweeps and finetune search spaces", () => {
    const model = parsePipeline(searchDocument(), index);
    const [choice, , sweep, tuned] = model.root.items as [ForkNode, ChainItem, StepNode, StepNode];
    expect(choice).toMatchObject({ mode: "choice", stack: true, modifiers: { count: 2 } });
    expect(choice.lanes.map((lane) => lane.items.length)).toEqual([0, 1, 1]);
    expect(sweep.sweeps).toEqual([expect.objectContaining({ param: "n_components", kind: "range", location: "step", count: 8 })]);
    expect(tuned.tuning).toMatchObject({ trials: 25, sampler: "tpe", params: [{ name: "n_components", type: "int", low: 1, high: 25 }] });
  });

  it("frames cartesian stages and nested lists", () => {
    const model = parsePipeline({ pipeline: [{ _cartesian_: [{ _or_: [SNV, MSC] }, { _or_: [null, SCALER] }], count: 3 }, [SNV, MSC]] }, index);
    const [cartesian, sequence] = model.root.items as [FrameNode, FrameNode];
    expect(cartesian).toMatchObject({ kind: "frame", mode: "cartesian", modifiers: { count: 3 } });
    expect(kinds(cartesian.items)).toEqual(["fork", "fork"]);
    expect(sequence).toMatchObject({ kind: "frame", mode: "sequence" });
    expect(sequence.items).toHaveLength(2);
  });

  it("uses the step keyword to pick the operator family and keeps named branches", () => {
    const model = parsePipeline({ pipeline: [{ y_processing: SCALER }, SCALER, { branch: { a: [SNV], b: [MSC] } }] }, index);
    const [target, features, fork] = model.root.items as [StepNode, StepNode, ForkNode];
    expect(target).toMatchObject({ role: "y_processing", label: "Target scaler" });
    expect(features).toMatchObject({ role: "preprocessing", label: "Standard scaler" });
    expect(fork.named).toBe(true);
    expect(fork.lanes.map((lane) => lane.label)).toEqual(["a", "b"]);
  });

  it("keeps anything it does not model as a raw node holding the original value", () => {
    const separation = { branch: { by_metadata: "site" } };
    const generatorBranch = { branch: { _or_: [SNV, MSC] } };
    const augmentation = { sample_augmentation: { transformers: [SNV], count: 2 } };
    const configured = { branch: { a: [SNV], b: [MSC], parallel: true, n_jobs: 2 } };
    const model = parsePipeline({ pipeline: [separation, generatorBranch, augmentation, null, "chart_2d", { _comment: "hello" }, { class: "pkg.Unknown", params: { a: 1 } }, configured] }, index);
    const items = model.root.items;
    expect(kinds(items)).toEqual(["raw", "raw", "raw", "raw", "raw", "note", "step", "raw"]);
    expect(items[7]).toMatchObject({ value: configured });
    expect(items[0]).toMatchObject({ value: separation, label: "Branch", detail: "by_metadata site" });
    expect(items[2]).toMatchObject({ value: augmentation, label: "Sample augmentation", detail: "transformers, count 2" });
    expect(items[4]).toMatchObject({ role: "chart" });
    expect(items[6]).toMatchObject({ role: "operator", definition: null, label: "Unknown" });
  });

  it("reads bypass wrappers on steps and lanes without losing the wrapped value", () => {
    const model = parsePipeline({ pipeline: [{ _bypassed_: SNV }, { branch: [[MSC], { _bypassed_: [SNV] }] }] }, index);
    const [step, fork] = model.root.items as [StepNode, ForkNode];
    expect(step).toMatchObject({ bypassed: true, label: "SNV", valuePath: ["pipeline", 0, "_bypassed_"] });
    expect(fork.lanes.map((lane) => lane.bypassed)).toEqual([false, true]);
    expect(fork.lanes[1]!.items[0]).toMatchObject({ label: "SNV", bypassed: false });
  });

  it("gives every node a unique id and a chain position", () => {
    const model = parsePipeline(branchDocument(), index);
    const all = flattenItems(model.root.items);
    expect(new Set(all.map((item) => item.id)).size).toBe(all.length);
    for (const item of all) expect(model.chains.get(item.chain)!.items[item.index]).toBe(item);
  });
});

describe("canonical documents", () => {
  it("accepts the SDK pipeline forms and refuses anything else", () => {
    expect(fromCanonicalPipeline([SNV]).pipeline).toEqual([SNV]);
    expect(fromCanonicalPipeline({ name: "x", pipeline: [SNV] })).toEqual({ name: "x", pipeline: [SNV] });
    expect(fromCanonicalPipeline({ name: "x", steps: [SNV] })).toEqual({ name: "x", pipeline: [SNV] });
    expect(() => fromCanonicalPipeline({ nope: true })).toThrow(TypeError);
  });

  it("leaves bypassed steps, lanes and named lanes out of the canonical pipeline", () => {
    const document = {
      name: "x",
      pipeline: [{ _bypassed_: SNV }, KFOLD, { branch: { a: [MSC, { _bypassed_: SNV }], b: { _bypassed_: [SNV] } } }, { _or_: [SNV, { _bypassed_: MSC }] }],
    };
    expect(toCanonicalPipeline(document)).toEqual({ name: "x", pipeline: [KFOLD, { branch: { a: [MSC] } }, { _or_: [SNV] }] });
  });

  it("round-trips every Studio preset unchanged and parses all of it", () => {
    for (const preset of getStudioPipelinePresets()) {
      for (const variant of Object.values(preset.variants ?? {})) {
        const source = variant!.pipeline;
        const document = fromCanonicalPipeline(source);
        expect(toCanonicalPipeline(document).pipeline).toEqual(source);
        const model = parsePipeline(document, index);
        expect(model.root.items).toHaveLength(source.length);
        // The presets only use constructs the editor models: nothing falls back to a raw node.
        expect(flattenItems(model.root.items).filter((item) => item.kind === "raw" && item.value !== null)).toEqual([]);
      }
    }
  });
});
