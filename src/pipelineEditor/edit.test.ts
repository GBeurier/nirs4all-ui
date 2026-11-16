import { describe, expect, it } from "vitest";

import { toCanonicalPipeline } from "./document.js";
import {
  addLane,
  bypassSource,
  dissolveFork,
  duplicateItem,
  insertStep,
  isBypassed,
  moveItem,
  moveLane,
  nudgeItem,
  removeItem,
  removeLane,
  renameLane,
  replaceItemValue,
  setBypassed,
  setModifier,
  setParam,
  setStepName,
  setSweep,
  setTuning,
  setTuningOption,
  shiftItemLane,
  toggleBypass,
  wrapItem,
} from "./edit.js";
import { parsePipeline } from "./model.js";
import { KFOLD, MSC, PLS, SAVGOL, SNV, branchDocument, pls, savgol, searchDocument } from "./__fixtures__/pipelines.js";
import type { ChainItem, ChainSelection, ForkNode, PipelineChainDocument } from "./types.js";

const root = (document: PipelineChainDocument) => parsePipeline(document).root;
const itemAt = (document: PipelineChainDocument, index: number): ChainItem => root(document).items[index]!;
const forkAt = (document: PipelineChainDocument, index: number): ForkNode => itemAt(document, index) as ForkNode;
const selectedPath = (document: PipelineChainDocument, select: ChainSelection | null | undefined) => {
  if (select?.kind !== "item") throw new Error("expected an item selection");
  return parsePipeline(document).items.get(select.id)!.path;
};

describe("chain edits", () => {
  it("inserts, duplicates and removes without mutating the input", () => {
    const source = branchDocument();
    const frozen = structuredClone(source);
    const inserted = insertStep(source, root(source).id, 1, MSC);
    expect(inserted.document.pipeline[1]).toBe(MSC);
    expect(inserted.document.pipeline).toHaveLength(5);
    expect(selectedPath(inserted.document, inserted.select)).toEqual(["pipeline", 1]);

    const duplicated = duplicateItem(source, itemAt(source, 3).id);
    expect(duplicated.document.pipeline.slice(3)).toEqual([pls(10), pls(10)]);

    const removed = removeItem(source, itemAt(source, 2).id);
    expect(removed.document.pipeline).toEqual([source.pipeline[0], source.pipeline[1], source.pipeline[3]]);
    expect(selectedPath(removed.document, removed.select)).toEqual(["pipeline", 2]);
    expect(source).toEqual(frozen);
  });

  it("moves a step along its chain, into a lane and back out", () => {
    const source = branchDocument();
    const fork = forkAt(source, 1);
    const toFront = moveItem(source, itemAt(source, 3).id, root(source).id, 0);
    expect(toFront.document.pipeline.map((step) => Object.keys(step as object)[0])).toEqual(["model", "class", "branch", "merge"]);
    expect(selectedPath(toFront.document, toFront.select)).toEqual(["pipeline", 0]);

    const intoLane = moveItem(source, itemAt(source, 0).id, fork.lanes[1]!.chain, 1);
    expect(intoLane.document.pipeline).toEqual([{ branch: [[SNV, savgol(15)], [MSC, source.pipeline[0]], []] }, { merge: "features" }, pls(10)]);
    expect(selectedPath(intoLane.document, intoLane.select)).toEqual(["pipeline", 0, "branch", 1, 1]);

    const lane = forkAt(source, 1).lanes[0]!;
    const out = moveItem(source, lane.items[0]!.id, root(source).id, 4);
    expect(out.document.pipeline[1]).toEqual({ branch: [[savgol(15)], [MSC], []] });
    expect(out.document.pipeline[4]).toBe(SNV);

    // A group cannot be dropped inside itself, and a no-op move returns the same document.
    expect(moveItem(source, fork.id, lane.chain, 0).document).toBe(source);
    expect(moveItem(source, itemAt(source, 0).id, root(source).id, 1).document).toBe(source);
  });

  it("stores a single-step alternative as the step, an empty one as null", () => {
    const source = searchDocument();
    const choice = forkAt(source, 0);
    const filled = insertStep(source, choice.lanes[0]!.chain, 0, MSC);
    expect(filled.document.pipeline[0]).toEqual({ _or_: [MSC, SNV, savgol(21)], count: 2 });

    const chained = insertStep(source, choice.lanes[1]!.chain, 1, MSC);
    expect(chained.document.pipeline[0]).toEqual({ _or_: [null, [SNV, MSC], savgol(21)], count: 2 });
    const unchained = removeItem(chained.document, forkAt(chained.document, 0).lanes[1]!.items[1]!.id);
    expect(unchained.document.pipeline[0]).toEqual(source.pipeline[0]);

    const emptied = removeItem(source, choice.lanes[1]!.items[0]!.id);
    expect(emptied.document.pipeline[0]).toEqual({ _or_: [null, null, savgol(21)], count: 2 });

    const moved = moveItem(source, choice.lanes[2]!.items[0]!.id, choice.lanes[0]!.chain, 0);
    expect(moved.document.pipeline[0]).toEqual({ _or_: [savgol(21), SNV, null], count: 2 });
  });

  it("nudges along the chain and steps out of a lane at its ends", () => {
    const source = branchDocument();
    const later = nudgeItem(source, itemAt(source, 0).id, 1);
    expect(Object.keys(later.document.pipeline[0] as object)).toEqual(["branch"]);
    expect(nudgeItem(source, itemAt(source, 0).id, -1).document).toBe(source);

    const first = forkAt(source, 1).lanes[0]!.items[0]!;
    const out = nudgeItem(source, first.id, -1);
    expect(out.document.pipeline.slice(0, 3)).toEqual([source.pipeline[0], SNV, { branch: [[savgol(15)], [MSC], []] }]);
  });

  it("shifts a step to the neighbouring lane", () => {
    const source = branchDocument();
    const step = forkAt(source, 1).lanes[0]!.items[1]!;
    const down = shiftItemLane(source, step.id, 1);
    expect(down.document.pipeline[1]).toEqual({ branch: [[SNV], [MSC, savgol(15)], []] });
    expect(shiftItemLane(source, step.id, -1).document).toBe(source);
  });
});

describe("bypass", () => {
  it("wraps and unwraps a step in place and strips it from the canonical pipeline", () => {
    const source = branchDocument();
    const target = { kind: "item" as const, id: itemAt(source, 2).id };
    const off = setBypassed(source, target, true);
    expect(off.document.pipeline[2]).toEqual({ _bypassed_: { merge: "features" } });
    expect(isBypassed(off.document, target)).toBe(true);
    expect(toCanonicalPipeline(off.document).pipeline).toHaveLength(3);
    expect(setBypassed(off.document, target, false).document).toEqual(source);
    expect(setBypassed(source, target, false).document).toBe(source);
  });

  it("bypasses the alternative itself when toggling its only step", () => {
    const source = searchDocument();
    const option = forkAt(source, 0).lanes[1]!;
    const off = setBypassed(source, { kind: "item", id: option.items[0]!.id }, true);
    expect(off.document.pipeline[0]).toEqual({ _or_: [null, { _bypassed_: SNV }, savgol(21)], count: 2 });
    expect(forkAt(off.document, 0).lanes[1]!.bypassed).toBe(true);
    expect(toCanonicalPipeline(off.document).pipeline[0]).toEqual({ _or_: [null, savgol(21)], count: 2 });
  });

  it("keeps the selection on an alternative when its bypass wraps it", () => {
    const source = searchDocument();
    const step = forkAt(source, 0).lanes[1]!.items[0]!;
    const off = setBypassed(source, { kind: "item", id: step.id }, true);
    expect(selectedPath(off.document, off.select)).toEqual(["pipeline", 0, "_or_", 1, "_bypassed_"]);
    const on = toggleBypass(off.document, off.select as { kind: "item"; id: string });
    expect(on.document).toEqual(source);
    expect(selectedPath(on.document, on.select)).toEqual(["pipeline", 0, "_or_", 1]);
  });

  it("re-enables the enclosing lane or group when toggling a step it switches off", () => {
    const source: PipelineChainDocument = { pipeline: [{ branch: [{ _bypassed_: [SNV, MSC] }, [SNV]] }] };
    const model = parsePipeline(source);
    const lane = forkAt(source, 0).lanes[0]!;
    const inner = { kind: "item" as const, id: lane.items[1]!.id };
    expect(bypassSource(model, inner)).toEqual({ kind: "lane", id: lane.id });
    expect(bypassSource(model, { kind: "item", id: forkAt(source, 0).lanes[1]!.items[0]!.id })).toBeNull();
    expect(toggleBypass(source, inner).document.pipeline[0]).toEqual({ branch: [[SNV, MSC], [SNV]] });

    const group: PipelineChainDocument = { pipeline: [{ _bypassed_: { _or_: [SNV, MSC] } }] };
    const option = (parsePipeline(group).root.items[0] as ForkNode).lanes[0]!.items[0]!;
    expect(toggleBypass(group, { kind: "item", id: option.id }).document.pipeline[0]).toEqual({ _or_: [SNV, MSC] });
  });

  it("does not let list normalisation or a move change what is bypassed", () => {
    // Removing MSC must leave a list: a bare wrapper would read as a bypassed option.
    const chained: PipelineChainDocument = { pipeline: [{ _or_: [[{ _bypassed_: SNV }, MSC], SNV] }] };
    const removed = removeItem(chained, forkAt(chained, 0).lanes[0]!.items[1]!.id);
    expect(removed.document.pipeline[0]).toEqual({ _or_: [[{ _bypassed_: SNV }], SNV] });
    expect(toCanonicalPipeline(removed.document).pipeline[0]).toEqual({ _or_: [[], SNV] });

    // The only step of a bypassed option stays bypassed when it is moved out.
    const option: PipelineChainDocument = { pipeline: [{ _or_: [{ _bypassed_: SNV }, MSC] }] };
    const moved = moveItem(option, forkAt(option, 0).lanes[0]!.items[0]!.id, root(option).id, 0);
    expect(moved.document.pipeline[0]).toEqual({ _bypassed_: SNV });
    expect(toCanonicalPipeline(moved.document).pipeline).toEqual([{ _or_: [MSC] }]);
  });

  it("bypasses a whole lane", () => {
    const source = branchDocument();
    const off = setBypassed(source, { kind: "lane", id: forkAt(source, 1).lanes[0]!.id }, true);
    expect(off.document.pipeline[1]).toEqual({ branch: [{ _bypassed_: [SNV, savgol(15)] }, [MSC], []] });
    expect(toCanonicalPipeline(off.document).pipeline[1]).toEqual({ branch: [[MSC], []] });
  });
});

describe("step content", () => {
  it("sets and unsets parameters, converting a bare class string only when needed", () => {
    const source: PipelineChainDocument = { pipeline: [SNV, { model: PLS }] };
    expect(setParam(source, itemAt(source, 0).id, "with_std", undefined).document.pipeline[0]).toBe(SNV);
    const set = setParam(source, itemAt(source, 0).id, "with_std", false);
    expect(set.document.pipeline[0]).toEqual({ class: SNV, params: { with_std: false } });
    expect(setParam(set.document, itemAt(set.document, 0).id, "with_std", undefined).document.pipeline[0]).toEqual({ class: SNV });
    expect(setParam(source, itemAt(source, 1).id, "n_components", 8).document.pipeline[1]).toEqual({ model: { class: PLS, params: { n_components: 8 } } });
  });

  it("writes parameter sweeps under params and turns them back into a value", () => {
    const source: PipelineChainDocument = { pipeline: [savgol(11)] };
    const id = itemAt(source, 0).id;
    const swept = setSweep(source, id, "window_length", { kind: "range", from: 11, to: 31, step: 10 });
    expect(swept.document.pipeline[0]).toMatchObject({ params: { window_length: { _range_: [11, 31, 10] } } });
    const values = setSweep(swept.document, id, "window_length", { kind: "values", values: [11, 21] });
    expect(values.document.pipeline[0]).toMatchObject({ params: { window_length: { _or_: [11, 21] } } });
    // Modifiers stay while the generator keeps its kind, and go when it changes kind.
    const picked: PipelineChainDocument = { pipeline: [{ class: SAVGOL, params: { window_length: { _or_: [11, 21], pick: 1, _seed_: 3 } } }] };
    expect(setSweep(picked, id, "window_length", { kind: "values", values: [11, 31] }).document.pipeline[0]).toEqual({ class: SAVGOL, params: { window_length: { pick: 1, _seed_: 3, _or_: [11, 31] } } });
    expect(setSweep(picked, id, "window_length", { kind: "range", from: 11, to: 31, step: 10 }).document.pipeline[0]).toEqual({ class: SAVGOL, params: { window_length: { _range_: [11, 31, 10] } } });
    expect(setSweep(values.document, id, "window_length", null, 11).document).toEqual(source);
  });

  it("edits a generator attached to a model step where it is", () => {
    const source = searchDocument();
    const id = itemAt(source, 2).id;
    const wider = setSweep(source, id, "n_components", { kind: "range", from: 2, to: 40, step: 2 });
    expect(wider.document.pipeline[2]).toEqual({ model: PLS, name: "PLS-Sweep", _range_: [2, 40, 2], param: "n_components" });
    const log = setSweep(source, id, "n_components", { kind: "log_range", from: 1, to: 100, num: 5 });
    expect(log.document.pipeline[2]).toEqual({ model: PLS, name: "PLS-Sweep", param: "n_components", _log_range_: [1, 100, 5] });
    const fixed = setSweep(source, id, "n_components", null, 10);
    expect(fixed.document.pipeline[2]).toEqual({ model: { class: PLS, params: { n_components: 10 } }, name: "PLS-Sweep" });
  });

  it("edits the finetune search space and keeps other finetune options", () => {
    const source = searchDocument();
    const id = itemAt(source, 3).id;
    const tuned = setTuning(source, id, "max_iter", ["int", 100, 500]);
    expect(tuned.document.pipeline[3]).toMatchObject({ finetune_params: { n_trials: 25, sampler: "tpe", model_params: { n_components: ["int", 1, 25], max_iter: ["int", 100, 500] } } });
    const cleared = setTuning(source, id, "n_components", null);
    expect(cleared.document.pipeline[3]).toMatchObject({ finetune_params: { n_trials: 25, sampler: "tpe" } });
    expect((cleared.document.pipeline[3] as { finetune_params: object }).finetune_params).not.toHaveProperty("model_params");
    expect(setTuningOption(source, id, "n_trials", 40).document.pipeline[3]).toMatchObject({ finetune_params: { n_trials: 40, sampler: "tpe" } });

    const plain: PipelineChainDocument = { pipeline: [{ model: PLS }] };
    const created = setTuning(plain, itemAt(plain, 0).id, "n_components", ["int", 1, 20]);
    expect(created.document.pipeline[0]).toEqual({ model: PLS, finetune_params: { model_params: { n_components: ["int", 1, 20] } } });
    expect(setTuning(created.document, itemAt(plain, 0).id, "n_components", null).document).toEqual(plain);
  });

  it("renames a step and edits group modifiers and raw values", () => {
    const source = searchDocument();
    expect(setStepName(source, itemAt(source, 2).id, "Sweep").document.pipeline[2]).toMatchObject({ name: "Sweep" });
    expect(setStepName(source, itemAt(source, 2).id, "").document.pipeline[2]).not.toHaveProperty("name");
    expect(setModifier(source, itemAt(source, 0).id, "count", undefined).document.pipeline[0]).toEqual({ _or_: [null, SNV, savgol(21)] });
    expect(setModifier(source, itemAt(source, 0).id, "pick", 2).document.pipeline[0]).toMatchObject({ pick: 2, count: 2 });
    expect(replaceItemValue(source, itemAt(source, 1).id, { class: KFOLD, params: { n_splits: 3 } }).document.pipeline[1]).toEqual({ class: KFOLD, params: { n_splits: 3 } });
  });

  it("preserves keys it does not model through unrelated edits", () => {
    const exotic = { model: { class: PLS, params: { n_components: 5 }, framework: "sklearn" }, name: "M", train_params: { verbose: 2 }, refit_params: { x: 1 }, _seed_: 3 };
    const source: PipelineChainDocument = { name: "n", description: "d", custom: { keep: true }, pipeline: [{ source_branch: { NIR: [SNV] } }, exotic] };
    const edited = setParam(source, itemAt(source, 1).id, "n_components", 9).document;
    expect(edited).toEqual({ ...source, pipeline: [source.pipeline[0], { ...exotic, model: { ...exotic.model, params: { n_components: 9 } } }] });
    const moved = moveItem(edited, itemAt(edited, 0).id, root(edited).id, 2).document;
    expect(moved.pipeline[1]).toEqual({ source_branch: { NIR: [SNV] } });
    expect(Object.keys(moved.pipeline[0] as object)).toEqual(Object.keys(exotic));
  });
});

describe("lanes and groups", () => {
  it("adds, reorders and removes lanes", () => {
    const source = branchDocument();
    const fork = forkAt(source, 1);
    const added = addLane(source, fork.id);
    expect(added.document.pipeline[1]).toEqual({ branch: [[SNV, savgol(15)], [MSC], [], []] });
    expect(added.select).toMatchObject({ kind: "slot", index: 0 });
    expect(addLane(source, fork.id, MSC).document.pipeline[1]).toEqual({ branch: [[SNV, savgol(15)], [MSC], [], [MSC]] });

    const moved = moveLane(source, fork.lanes[0]!.id, 1);
    expect(moved.document.pipeline[1]).toEqual({ branch: [[MSC], [SNV, savgol(15)], []] });
    expect(moved.select).toEqual({ kind: "lane", id: forkAt(moved.document, 1).lanes[1]!.id });
    expect(removeLane(source, fork.lanes[2]!.id).document.pipeline[1]).toEqual({ branch: [[SNV, savgol(15)], [MSC]] });

    const choice = searchDocument();
    expect(addLane(choice, forkAt(choice, 0).id, MSC).document.pipeline[0]).toEqual({ _or_: [null, SNV, savgol(21), MSC], count: 2 });
  });

  it("keeps _weights_ aligned with the alternatives", () => {
    const source: PipelineChainDocument = { pipeline: [{ _or_: [SNV, MSC, KFOLD], count: 2, _weights_: [0.5, 0.3, 0.2] }] };
    const fork = forkAt(source, 0);
    expect(moveLane(source, fork.lanes[0]!.id, 1).document.pipeline[0]).toEqual({ _or_: [MSC, SNV, KFOLD], count: 2, _weights_: [0.3, 0.5, 0.2] });
    expect(removeLane(source, fork.lanes[1]!.id).document.pipeline[0]).toEqual({ _or_: [SNV, KFOLD], count: 2, _weights_: [0.5, 0.2] });
    const off = setBypassed(source, { kind: "lane", id: fork.lanes[2]!.id }, true);
    expect(toCanonicalPipeline(off.document).pipeline[0]).toEqual({ _or_: [SNV, MSC], count: 2, _weights_: [0.5, 0.3] });
  });

  it("renames and reorders named lanes, keeping key order", () => {
    const source: PipelineChainDocument = { pipeline: [{ branch: { a: [SNV], b: [MSC], c: [] } }] };
    const fork = forkAt(source, 0);
    const renamed = renameLane(source, fork.lanes[1]!.id, "msc");
    expect(Object.keys((renamed.document.pipeline[0] as { branch: object }).branch)).toEqual(["a", "msc", "c"]);
    expect(renameLane(source, fork.lanes[1]!.id, "a").document).toBe(source);
    // Names the runtime reads as configuration, generators or separation rules are refused.
    for (const reserved of ["_or_", "by_metadata", "steps", "parallel", "n_jobs", "1", ""]) {
      expect(renameLane(source, fork.lanes[1]!.id, reserved).document).toBe(source);
    }
    const moved = moveLane(source, fork.lanes[2]!.id, -1);
    expect(Object.keys((moved.document.pipeline[0] as { branch: object }).branch)).toEqual(["a", "c", "b"]);
    const added = addLane(source, fork.id);
    expect(Object.keys((added.document.pipeline[0] as { branch: object }).branch)).toEqual(["a", "b", "c", "branch_4"]);
  });

  it("wraps a step into a group and dissolves a group into one lane", () => {
    const source = branchDocument();
    const branched = wrapItem(source, itemAt(source, 3).id, "branch");
    expect(branched.document.pipeline[3]).toEqual({ branch: [[pls(10)], []] });
    const alternatives = wrapItem(source, itemAt(source, 0).id, "choice");
    expect(alternatives.document.pipeline[0]).toEqual({ _or_: [source.pipeline[0], null] });

    const dissolved = dissolveFork(source, forkAt(source, 1).id, 0);
    expect(dissolved.document.pipeline).toEqual([source.pipeline[0], SNV, savgol(15), { merge: "features" }, pls(10)]);
    expect(dissolveFork(alternatives.document, forkAt(alternatives.document, 0).id, 1).document.pipeline).toEqual(source.pipeline.slice(1));
  });
});
