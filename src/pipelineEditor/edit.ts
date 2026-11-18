/**
 * Edit operations on a pipeline document.
 *
 * Every operation is pure: it returns a new document (the input is never
 * mutated) and, where useful, the selection that should follow the edit. Edits
 * touch only the JSON they target, so keys and constructs the editor does not
 * model survive unchanged.
 */

import { deleteAt, getAt, isBypassWrapper, isRecord, overwriteRecord, replaceKey, setAt } from "./json.js";
import { chainIdAt, chainOwnerItem, itemIdAt, laneIdAt, parsePipeline } from "./model.js";
import { generatorKey } from "./summary.js";
import {
  BYPASS_KEY,
  type ChainItem,
  type ChainModel,
  type ChainRef,
  type ChainSelection,
  type EditResult,
  type JsonPath,
  type LaneNode,
  type PipelineChainDocument,
  type StepNode,
} from "./types.js";

type Draft = PipelineChainDocument;
type After = ChainSelection | null | undefined | ((model: ChainModel) => ChainSelection | null | undefined);

const UNCHANGED = Symbol("unchanged");

/** Clone, mutate, and resolve the follow-up selection against the edited document. */
function apply(document: PipelineChainDocument, mutate: (draft: Draft, model: ChainModel) => After | typeof UNCHANGED): EditResult {
  const draft = structuredClone(document) as Draft;
  if (!Array.isArray(draft.pipeline)) draft.pipeline = [];
  const after = mutate(draft, parsePipeline(draft));
  if (after === UNCHANGED) return { document };
  const select = typeof after === "function" ? after(parsePipeline(draft)) : after;
  return select === undefined ? { document: draft } : { document: draft, select };
}

const selectItem = (path: JsonPath): ChainSelection => ({ kind: "item", id: itemIdAt(path) });

function chainInsert(draft: Draft, chain: ChainRef, index: number, value: unknown): JsonPath {
  if (chain.form === "list") {
    const list = getAt(draft, chain.path) as unknown[];
    const at = Math.max(0, Math.min(index, list.length));
    list.splice(at, 0, value);
    return [...chain.path, at];
  }
  if (chain.form === "single") {
    const existing = getAt(draft, chain.path);
    const at = index <= 0 ? 0 : 1;
    setAt(draft, chain.path, at === 0 ? [value, existing] : [existing, value]);
    return [...chain.path, at];
  }
  if (chain.keepList) {
    setAt(draft, chain.path, [value]);
    return [...chain.path, 0];
  }
  setAt(draft, chain.path, value);
  return chain.path;
}

function chainRemove(draft: Draft, chain: ChainRef, index: number): void {
  if (chain.form !== "list") {
    setAt(draft, chain.path, chain.keepList ? [] : null);
    return;
  }
  const list = getAt(draft, chain.path) as unknown[];
  list.splice(index, 1);
  if (chain.keepList) return;
  // An option holding one step is stored as that step; an empty option is `null`.
  // A bypassed step stays in its list: stored bare it would read as a bypassed option.
  if (list.length === 0) setAt(draft, chain.path, null);
  else if (list.length === 1 && !Array.isArray(list[0]) && !isBypassWrapper(list[0])) setAt(draft, chain.path, list[0]);
}

/** `_weights_` of an `_or_` step, when it is index-aligned with the options. */
function alignedWeights(draft: Draft, fork: Extract<ChainItem, { kind: "fork" }>): unknown[] | null {
  const record = getAt(draft, fork.valuePath);
  const weights = isRecord(record) ? record._weights_ : undefined;
  return fork.keyword === "_or_" && Array.isArray(weights) && weights.length === fork.lanes.length ? weights : null;
}

function nearestInChain(chainId: string, index: number): (model: ChainModel) => ChainSelection {
  return (model) => {
    const items = model.chains.get(chainId)?.items ?? [];
    const item = items[Math.min(index, items.length - 1)];
    return item ? { kind: "item", id: item.id } : { kind: "slot", chain: chainId, index: 0 };
  };
}

function isInside(path: JsonPath, ancestor: JsonPath): boolean {
  return ancestor.length <= path.length && ancestor.every((segment, index) => path[index] === segment);
}

// ---------------------------------------------------------------------------
// Steps in chains
// ---------------------------------------------------------------------------

/** Insert a canonical step value into a chain at `index`. */
export function insertStep(document: PipelineChainDocument, chainId: string, index: number, value: unknown): EditResult {
  return apply(document, (draft, model) => {
    const chain = model.chains.get(chainId);
    if (!chain) return UNCHANGED;
    return selectItem(chainInsert(draft, chain, index, structuredClone(value)));
  });
}

export function removeItem(document: PipelineChainDocument, id: string): EditResult {
  return apply(document, (draft, model) => {
    const item = model.items.get(id);
    const chain = item && model.chains.get(item.chain);
    if (!item || !chain) return UNCHANGED;
    chainRemove(draft, chain, item.index);
    return nearestInChain(chain.id, item.index);
  });
}

export function duplicateItem(document: PipelineChainDocument, id: string): EditResult {
  return apply(document, (draft, model) => {
    const item = model.items.get(id);
    const chain = item && model.chains.get(item.chain);
    if (!item || !chain) return UNCHANGED;
    return selectItem(chainInsert(draft, chain, item.index + 1, structuredClone(getAt(draft, item.path))));
  });
}

const MOVE_SOURCE = "__n4_move_source__";
const MOVE_TARGET = "__n4_move_target__";

function findMarked(model: ChainModel, key: string): ChainItem | undefined {
  for (const item of model.items.values()) {
    if (item.kind === "raw" && isRecord(item.value) && key in item.value) return item;
  }
  return undefined;
}

/** Move an item to `index` of any chain (same lane, another lane, or out of a group). */
export function moveItem(document: PipelineChainDocument, id: string, chainId: string, index: number): EditResult {
  return apply(document, (draft, model) => {
    const item = model.items.get(id);
    const target = model.chains.get(chainId);
    if (!item || !target || isInside(target.path, item.path)) return UNCHANGED;
    if (target.id === item.chain && (index === item.index || index === item.index + 1)) return UNCHANGED;
    // Markers keep every path valid while the two chains are rewritten.
    const source = model.chains.get(item.chain);
    const sourceLane = source?.form === "single" ? model.lanes.get(source.owner ?? "") : undefined;
    const stored = getAt(draft, item.path);
    // The only step of a bypassed option carries its bypass with it.
    const value = sourceLane?.bypassed && !isBypassWrapper(stored) ? { [BYPASS_KEY]: stored } : stored;
    setAt(draft, item.path, { [MOVE_SOURCE]: true });
    chainInsert(draft, target, index, { [MOVE_TARGET]: value });
    const marker = findMarked(parsePipeline(draft), MOVE_SOURCE);
    if (marker) chainRemove(draft, parsePipeline(draft).chains.get(marker.chain)!, marker.index);
    const moved = findMarked(parsePipeline(draft), MOVE_TARGET);
    if (!moved) return null;
    setAt(draft, moved.path, value);
    return selectItem(moved.path);
  });
}

/** Move one position along the chain; at either end, step out of the lane or group. */
export function nudgeItem(document: PipelineChainDocument, id: string, direction: -1 | 1): EditResult {
  const model = parsePipeline(document);
  const item = model.items.get(id);
  const chain = item && model.chains.get(item.chain);
  if (!item || !chain) return { document };
  const next = item.index + direction;
  if (next >= 0 && next < chain.items.length) return moveItem(document, id, chain.id, direction < 0 ? next : next + 1);
  const owner = chainOwnerItem(model, chain.id);
  if (!owner) return { document };
  return moveItem(document, id, owner.chain, direction < 0 ? owner.index : owner.index + 1);
}

/** Move an item to the lane above or below, keeping its position along the lane. */
export function shiftItemLane(document: PipelineChainDocument, id: string, direction: -1 | 1): EditResult {
  const model = parsePipeline(document);
  const item = model.items.get(id);
  const lane = item && model.lanes.get(model.chains.get(item.chain)?.owner ?? "");
  const fork = lane && model.items.get(lane.fork);
  if (!item || !lane || fork?.kind !== "fork") return { document };
  const target = fork.lanes[lane.index + direction];
  if (!target) return { document };
  return moveItem(document, id, target.chain, Math.min(item.index, target.items.length));
}

/** Replace an item with any canonical JSON value (the raw editor). */
export function replaceItemValue(document: PipelineChainDocument, id: string, value: unknown): EditResult {
  return apply(document, (draft, model) => {
    const item = model.items.get(id);
    if (!item) return UNCHANGED;
    setAt(draft, item.valuePath, structuredClone(value));
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Bypass
// ---------------------------------------------------------------------------

type BypassSelection = { kind: "item" | "lane"; id: string };

function bypassTarget(model: ChainModel, selection: BypassSelection): { path: JsonPath; lane?: LaneNode } | undefined {
  if (selection.kind === "lane") return model.lanes.get(selection.id);
  const item = model.items.get(selection.id);
  const chain = item && model.chains.get(item.chain);
  // The only step of an alternative is the alternative: bypass the lane itself.
  const lane = chain && chain.form === "single" ? model.lanes.get(chain.owner ?? "") : undefined;
  return lane ? { path: lane.path, lane } : item;
}

/**
 * The bypassed element that switches the selection off: itself, or the nearest
 * enclosing lane or group. `null` when the selection is active.
 */
export function bypassSource(model: ChainModel, selection: BypassSelection): BypassSelection | null {
  let lane = selection.kind === "lane" ? model.lanes.get(selection.id) : undefined;
  let item = selection.kind === "item" ? model.items.get(selection.id) : undefined;
  while (lane || item) {
    if (lane) {
      if (lane.bypassed) return { kind: "lane", id: lane.id };
      item = model.items.get(lane.fork);
      lane = undefined;
    } else if (item) {
      if (item.bypassed) return { kind: "item", id: item.id };
      const owner: string | null = model.chains.get(item.chain)?.owner ?? null;
      lane = owner ? model.lanes.get(owner) : undefined;
      item = owner && !lane ? model.items.get(owner) : undefined;
    }
  }
  return null;
}

/** Bypass an active element, or re-enable whatever currently switches it off. */
export function toggleBypass(document: PipelineChainDocument, selection: BypassSelection): EditResult {
  const model = parsePipeline(document);
  const source = bypassSource(model, selection);
  if (!source) return setBypassed(document, selection, true);
  const result = setBypassed(document, source, false);
  // Unwrapping a lane renumbers the paths under it: keep pointing at the same step.
  const item = selection.kind === "item" ? model.items.get(selection.id) : undefined;
  const lane = source.kind === "lane" && item ? model.lanes.get(source.id) : undefined;
  if (!item || !lane || lane.chain !== item.chain) return result;
  const moved = parsePipeline(result.document).lanes.get(lane.id)?.items[item.index];
  return moved ? { document: result.document, select: { kind: "item", id: moved.id } } : result;
}

/** Whether an item or lane is currently bypassed (directly or through its lane). */
export function isBypassed(document: PipelineChainDocument, selection: BypassSelection): boolean {
  const target = bypassTarget(parsePipeline(document), selection);
  return target ? isBypassWrapper(getAt(document, target.path)) : false;
}

export function setBypassed(document: PipelineChainDocument, selection: BypassSelection, bypassed: boolean): EditResult {
  return apply(document, (draft, model) => {
    const target = bypassTarget(model, selection);
    if (!target) return UNCHANGED;
    const raw = getAt(draft, target.path);
    if (bypassed === isBypassWrapper(raw)) return UNCHANGED;
    setAt(draft, target.path, bypassed ? { [BYPASS_KEY]: raw } : (raw as Record<string, unknown>)[BYPASS_KEY]);
    // Wrapping an option moves its only step one level down: follow it.
    const laneId = selection.kind === "item" ? target.lane?.id : undefined;
    if (!laneId) return undefined;
    return (next) => {
      const first = next.lanes.get(laneId)?.items[0];
      return first ? { kind: "item", id: first.id } : { kind: "lane", id: laneId };
    };
  });
}

// ---------------------------------------------------------------------------
// Step content
// ---------------------------------------------------------------------------

function stepOf(model: ChainModel, id: string): StepNode | undefined {
  const item = model.items.get(id);
  return item?.kind === "step" ? item : undefined;
}

/** The operator reference as a record, converting a bare class string when needed. */
function operatorRecord(draft: Draft, step: StepNode): Record<string, unknown> {
  const reference = getAt(draft, step.operatorPath);
  if (isRecord(reference)) return reference;
  const record: Record<string, unknown> = { class: reference };
  setAt(draft, step.operatorPath, record);
  return record;
}

/** The record carrying step-level keys (`name`, `finetune_params`, attached generators). */
function stepRecord(draft: Draft, step: StepNode): Record<string, unknown> {
  return step.keyword ? (getAt(draft, step.valuePath) as Record<string, unknown>) : operatorRecord(draft, step);
}

function writeParam(draft: Draft, step: StepNode, name: string, value: unknown): void {
  const reference = getAt(draft, step.operatorPath);
  if (value === undefined && !(isRecord(reference) && isRecord(reference.params))) return;
  const record = operatorRecord(draft, step);
  const params = isRecord(record.params) ? record.params : (record.params = {} as Record<string, unknown>);
  if (value === undefined) delete (params as Record<string, unknown>)[name];
  else (params as Record<string, unknown>)[name] = value;
  if (Object.keys(params as object).length === 0) delete record.params;
}

/** Set a parameter, or unset it (`undefined`) so the runtime default applies. */
export function setParam(document: PipelineChainDocument, id: string, name: string, value: unknown): EditResult {
  return apply(document, (draft, model) => {
    const step = stepOf(model, id);
    if (!step) return UNCHANGED;
    writeParam(draft, step, name, value === undefined ? undefined : structuredClone(value));
    return undefined;
  });
}

export type SweepDraft =
  | { kind: "values"; values: readonly unknown[] }
  | { kind: "range"; from: number; to: number; step: number }
  | { kind: "log_range"; from: number; to: number; num: number };

function sweepEntry(sweep: SweepDraft): [string, unknown] {
  if (sweep.kind === "values") return ["_or_", [...sweep.values]];
  if (sweep.kind === "range") return ["_range_", [sweep.from, sweep.to, sweep.step]];
  return ["_log_range_", [sweep.from, sweep.to, sweep.num]];
}

/**
 * Turn a parameter into a generator, or back into a fixed value (`sweep: null`,
 * with `fixed` as the value to keep; unset when omitted). A generator already
 * attached to the step (`_range_` + `param`) is edited where it is.
 */
export function setSweep(document: PipelineChainDocument, id: string, param: string, sweep: SweepDraft | null, fixed?: unknown): EditResult {
  return apply(document, (draft, model) => {
    const step = stepOf(model, id);
    if (!step) return UNCHANGED;
    const existing = step.sweeps.find((candidate) => candidate.param === param);
    const entry = sweep ? sweepEntry(sweep) : null;
    if (existing?.location === "step") {
      const record = stepRecord(draft, step);
      const key = generatorKey(record);
      if (key) delete record[key];
      if (entry && sweep?.kind !== "values") {
        record[entry[0]] = entry[1];
        record.param = param;
        return undefined;
      }
      delete record.param;
    }
    if (existing?.location === "sibling") {
      const record = stepRecord(draft, step);
      if (entry) record[param] = { [entry[0]]: entry[1] };
      else delete record[param];
      if (entry) return undefined;
    }
    if (!entry) {
      writeParam(draft, step, param, fixed === undefined ? undefined : structuredClone(fixed));
      return undefined;
    }
    // Keep generator modifiers (count, pick, _seed_, ...) while the generator keeps its kind.
    const previous = existing?.location === "param" ? step.params[param] : undefined;
    const extras: Record<string, unknown> = {};
    if (isRecord(previous) && entry[0] in previous) {
      for (const [key, value] of Object.entries(previous)) if (key !== entry[0]) extras[key] = value;
    }
    writeParam(draft, step, param, { ...extras, [entry[0]]: entry[1] });
    return undefined;
  });
}

/** Set (or clear with `null`) the finetune search space of one model parameter. */
export function setTuning(document: PipelineChainDocument, id: string, param: string, spec: unknown): EditResult {
  return apply(document, (draft, model) => {
    const step = stepOf(model, id);
    if (!step || !step.keyword) return UNCHANGED;
    const record = stepRecord(draft, step);
    if (spec === null || spec === undefined) {
      const finetune = record.finetune_params;
      if (!isRecord(finetune) || !isRecord(finetune.model_params)) return UNCHANGED;
      delete finetune.model_params[param];
      if (Object.keys(finetune.model_params).length === 0) delete finetune.model_params;
      if (Object.keys(finetune).length === 0) delete record.finetune_params;
      return undefined;
    }
    const finetune = isRecord(record.finetune_params) ? record.finetune_params : (record.finetune_params = {} as Record<string, unknown>);
    const space = isRecord((finetune as Record<string, unknown>).model_params)
      ? ((finetune as Record<string, unknown>).model_params as Record<string, unknown>)
      : (((finetune as Record<string, unknown>).model_params = {}) as Record<string, unknown>);
    space[param] = structuredClone(spec);
    return undefined;
  });
}

/** Set or remove (`undefined`) a `finetune_params` option such as `n_trials` or `sampler`. */
export function setTuningOption(document: PipelineChainDocument, id: string, key: string, value: unknown): EditResult {
  return apply(document, (draft, model) => {
    const step = stepOf(model, id);
    if (!step || !step.keyword) return UNCHANGED;
    const record = stepRecord(draft, step);
    if (!isRecord(record.finetune_params)) {
      if (value === undefined) return UNCHANGED;
      record.finetune_params = {};
    }
    const finetune = record.finetune_params as Record<string, unknown>;
    if (value === undefined) delete finetune[key];
    else finetune[key] = structuredClone(value);
    return undefined;
  });
}

/** Set or clear the step `name` (the label of a model in results). */
export function setStepName(document: PipelineChainDocument, id: string, name: string): EditResult {
  return apply(document, (draft, model) => {
    const step = stepOf(model, id);
    if (!step) return UNCHANGED;
    if (!name && !step.keyword && !isRecord(getAt(draft, step.operatorPath))) return UNCHANGED;
    const record = stepRecord(draft, step);
    if (name) record.name = name;
    else delete record.name;
    return undefined;
  });
}

/** Set or remove (`undefined`) a sibling key of a group or merge step (`count`, `pick`, ...). */
export function setModifier(document: PipelineChainDocument, id: string, key: string, value: unknown): EditResult {
  return apply(document, (draft, model) => {
    const item = model.items.get(id);
    // Source forks keep their options next to the lanes: inside `source_branch`, or in a `by_source` branch.
    const path = item?.kind === "fork" && item.mode === "source"
      ? (item.keyword === "source_branch" ? item.lanesPath : item.lanesPath.slice(0, -1))
      : item?.valuePath;
    const record = path && getAt(draft, path);
    if (!isRecord(record)) return UNCHANGED;
    if (value === undefined) delete record[key];
    else record[key] = structuredClone(value);
    return undefined;
  });
}

export function setDocumentName(document: PipelineChainDocument, name: string): EditResult {
  const next = structuredClone(document) as Draft;
  if (name) next.name = name;
  else delete next.name;
  return { document: next };
}

// ---------------------------------------------------------------------------
// Lanes and groups
// ---------------------------------------------------------------------------

function laneOf(model: ChainModel, id: string): { lane: LaneNode; fork: Extract<ChainItem, { kind: "fork" }> } | undefined {
  const lane = model.lanes.get(id);
  const fork = lane && model.items.get(lane.fork);
  return lane && fork?.kind === "fork" ? { lane, fork } : undefined;
}

/** Append a lane, empty or holding `step`. */
export function addLane(document: PipelineChainDocument, forkId: string, step?: unknown): EditResult {
  return apply(document, (draft, model) => {
    const fork = model.items.get(forkId);
    if (fork?.kind !== "fork") return UNCHANGED;
    const container = getAt(draft, fork.lanesPath);
    const content = step === undefined ? undefined : structuredClone(step);
    const value = fork.mode === "branch" || fork.mode === "source" ? (content === undefined ? [] : [content]) : (content ?? null);
    let key: string | number;
    if (Array.isArray(container)) {
      key = container.length;
      container.push(value);
    } else if (isRecord(container)) {
      let suffix = Object.keys(container).length + 1;
      while (`branch_${suffix}` in container) suffix += 1;
      key = `branch_${suffix}`;
      container[key] = value;
    } else return UNCHANGED;
    const lanePath = [...fork.lanesPath, key];
    if (content === undefined) return { kind: "slot", chain: chainIdAt(lanePath), index: 0 };
    return selectItem(fork.mode === "branch" || fork.mode === "source" ? [...lanePath, 0] : lanePath);
  });
}

export function removeLane(document: PipelineChainDocument, laneId: string): EditResult {
  return apply(document, (draft, model) => {
    const found = laneOf(model, laneId);
    if (!found) return UNCHANGED;
    alignedWeights(draft, found.fork)?.splice(found.lane.index, 1);
    deleteAt(draft, found.lane.path);
    return { kind: "item", id: found.fork.id };
  });
}

export function moveLane(document: PipelineChainDocument, laneId: string, direction: -1 | 1): EditResult {
  return apply(document, (draft, model) => {
    const found = laneOf(model, laneId);
    const target = found?.fork.lanes[found.lane.index + direction];
    if (!found || !target) return UNCHANGED;
    const container = getAt(draft, found.fork.lanesPath);
    if (Array.isArray(container)) {
      const a = found.lane.index;
      const b = target.index;
      const weights = alignedWeights(draft, found.fork);
      if (weights) [weights[a], weights[b]] = [weights[b], weights[a]];
      [container[a], container[b]] = [container[b], container[a]];
      return { kind: "lane", id: laneIdAt([...found.fork.lanesPath, b]) };
    }
    if (!isRecord(container)) return UNCHANGED;
    const keys = Object.keys(container);
    [keys[found.lane.index], keys[target.index]] = [keys[target.index]!, keys[found.lane.index]!];
    overwriteRecord(container, Object.fromEntries(keys.map((key) => [key, container[key]])));
    return { kind: "lane", id: found.lane.id };
  });
}

/** Names the runtime reads as branch configuration, a generator or a separation rule. */
function isReservedLaneName(name: string): boolean {
  return name.startsWith("_") || name.startsWith("by_") || /^\d+$/.test(name) || ["steps", "values", "parallel", "n_jobs"].includes(name);
}

/** Rename a named branch lane. Empty, duplicate and reserved names are refused. */
export function renameLane(document: PipelineChainDocument, laneId: string, name: string): EditResult {
  return apply(document, (draft, model) => {
    const found = laneOf(model, laneId);
    const container = found && getAt(draft, found.fork.lanesPath);
    const key = found?.lane.key;
    if (!found || !isRecord(container) || typeof key !== "string" || !name || name === key || name in container || isReservedLaneName(name)) return UNCHANGED;
    overwriteRecord(container, replaceKey(container, key, name, container[key]));
    return { kind: "lane", id: laneIdAt([...found.fork.lanesPath, name]) };
  });
}

/** Wrap an item into a new group: a two-lane branch, or alternatives with a skip option. */
export function wrapItem(document: PipelineChainDocument, id: string, mode: "branch" | "choice"): EditResult {
  return apply(document, (draft, model) => {
    const item = model.items.get(id);
    if (!item) return UNCHANGED;
    const value = getAt(draft, item.path);
    setAt(draft, item.path, mode === "branch" ? { branch: [[value], []] } : { _or_: [value, null] });
    return { kind: "item", id: item.id };
  });
}

/** Replace a group by the steps of one of its lanes, in place. */
export function dissolveFork(document: PipelineChainDocument, forkId: string, laneIndex = 0): EditResult {
  return apply(document, (draft, model) => {
    const fork = model.items.get(forkId);
    const chain = fork && model.chains.get(fork.chain);
    const lane = fork?.kind === "fork" ? fork.lanes[laneIndex] : undefined;
    if (!fork || !chain || !lane) return UNCHANGED;
    const kept = getAt(draft, lane.valuePath);
    const steps = Array.isArray(kept) ? kept : kept === null || kept === undefined ? [] : [kept];
    if (chain.form === "list") {
      (getAt(draft, chain.path) as unknown[]).splice(fork.index, 1, ...steps);
    } else {
      const bare = steps.length === 1 && !chain.keepList && !Array.isArray(steps[0]) && !isBypassWrapper(steps[0]);
      setAt(draft, chain.path, bare ? steps[0] : steps.length === 0 && !chain.keepList ? null : steps);
    }
    return nearestInChain(chain.id, fork.index);
  });
}
