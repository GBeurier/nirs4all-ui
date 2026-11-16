/**
 * Pure helpers for the editable multimodal pipeline document: the default
 * model catalogue, explicit edit operations, structural issue detection and a
 * text outline. Every helper returns a new immutable document and changes only
 * what the named edit asks for. Nothing here repairs, reorders or drops parts
 * of a document on its own: invalid documents are reported through
 * {@link pipelineIssues}, never normalised. Host validation and compilation
 * remain authoritative.
 */

import { MULTIMODAL_STEP_CATALOG, findStepOption, networkBranchKind, NETWORK_BRANCH_LABEL, sourceTag } from "./catalog.js";
import type { RecipeLine } from "./recipeGraph.js";
import type {
  MultimodalModelOption,
  MultimodalParamValue,
  MultimodalPipelineBranch,
  MultimodalPipelineDocument,
  MultimodalPipelineIssue,
  MultimodalPipelineMerge,
  MultimodalPipelineMergeKind,
  MultimodalPipelineTarget,
  MultimodalSource,
  MultimodalSourceChain,
  MultimodalStep,
  MultimodalStepOption,
  MultimodalStepParamSpec,
} from "./types.js";

// ---------------------------------------------------------------------------
// Model catalogue
// ---------------------------------------------------------------------------

export const MULTIMODAL_MODEL_IDS = {
  pls: "models.pls.pls_regression",
  ridge: "models.regularized.ridge",
  mbpls: "models.multiblock.mb_pls",
  neural: "models.neural.multibranch_regressor",
} as const;

/** Default branch and meta-model catalogue. Method IDs are real Methods IDs; only primitive parameters are editable. */
export const MULTIMODAL_MODEL_CATALOG: readonly MultimodalModelOption[] = [
  {
    methodId: MULTIMODAL_MODEL_IDS.pls,
    label: "PLS regression",
    shortLabel: "PLS",
    description: "Partial least squares on the connected sources, concatenated into one matrix.",
    inputMode: "concatenated",
    roles: ["branch", "meta"],
    params: [
      { name: "n_components", label: "Components", kind: "int", default: 3, min: 1, max: 50, step: 1 },
      { name: "center_x", label: "Centre X", kind: "bool", default: true, advanced: true },
      { name: "scale_x", label: "Scale X", kind: "bool", default: false, advanced: true },
      { name: "center_y", label: "Centre y", kind: "bool", default: true, advanced: true },
      { name: "scale_y", label: "Scale y", kind: "bool", default: false, advanced: true },
    ],
  },
  {
    methodId: MULTIMODAL_MODEL_IDS.ridge,
    label: "Ridge regression",
    shortLabel: "Ridge",
    description: "L2-penalised linear regression on the connected sources, concatenated into one matrix.",
    inputMode: "concatenated",
    roles: ["branch", "meta"],
    params: [
      { name: "alpha", label: "Alpha (penalty)", kind: "float", default: 1, min: 0 },
      { name: "center_x", label: "Centre X", kind: "bool", default: true, advanced: true },
      { name: "center_y", label: "Centre y", kind: "bool", default: true, advanced: true },
      { name: "scale_x", label: "Scale X", kind: "bool", default: false, advanced: true },
    ],
  },
  {
    methodId: MULTIMODAL_MODEL_IDS.mbpls,
    label: "Multiblock PLS",
    shortLabel: "MB-PLS",
    description:
      "Multiblock PLS: each connected source stays a separate centred block (equal super weights).",
    inputMode: "blocks",
    roles: ["branch"],
    params: [{ name: "n_components", label: "Components", kind: "int", default: 3, min: 1, max: 50, step: 1 }],
  },
  {
    methodId: MULTIMODAL_MODEL_IDS.neural,
    label: "Multibranch network",
    shortLabel: "Network",
    description:
      "Jointly trained network: one branch per connected source (1-D convolution, dense or 2-D convolution by representation), learned embeddings concatenated into a regression head. Branch types follow the actual source shapes.",
    inputMode: "network",
    roles: ["branch"],
    params: [
      { name: "epochs", label: "Epochs (fixed)", kind: "int", default: 24, min: 1, max: 500, step: 1 },
      { name: "filters", label: "Filters per branch", kind: "int", default: 4, min: 1, max: 64, step: 1 },
      { name: "kernel_size", label: "Kernel size", kind: "int", default: 3, min: 1, max: 31, step: 1 },
      { name: "embedding_dim", label: "Embedding size", kind: "int", default: 6, min: 1, max: 64, step: 1 },
      { name: "head_hidden", label: "Head hidden units", kind: "int", default: 8, min: 1, max: 128, step: 1 },
      { name: "batch_size", label: "Batch size", kind: "int", default: 16, min: 1, max: 256, step: 1, advanced: true },
      { name: "learning_rate", label: "Learning rate", kind: "float", default: 0.003, min: 0, advanced: true },
      { name: "weight_decay", label: "Weight decay", kind: "float", default: 0.0001, min: 0, advanced: true },
    ],
  },
];

export function findModelOption(
  methodId: string,
  catalog: readonly MultimodalModelOption[] = MULTIMODAL_MODEL_CATALOG,
): MultimodalModelOption | undefined {
  return catalog.find((option) => option.methodId === methodId);
}

export const MERGE_KIND_LABEL: Readonly<Record<MultimodalPipelineMergeKind, string>> = {
  none: "No merge",
  mean: "Fixed mean of predictions",
  model: "Learned meta-model",
};

export function defaultStepParams(option: { params: readonly MultimodalStepParamSpec[] }): Record<string, MultimodalParamValue> {
  const params: Record<string, MultimodalParamValue> = {};
  for (const spec of option.params) params[spec.name] = spec.default;
  return params;
}

/**
 * Head for a newly chosen model. Same-named parameters that the new model
 * also declares keep their values (e.g. PLS components → MB-PLS components);
 * every other declared parameter takes its default.
 */
export function headForModel(option: MultimodalModelOption, previous?: MultimodalStep): MultimodalStep {
  const params = defaultStepParams(option);
  if (previous) {
    for (const spec of option.params) {
      const kept = previous.params[spec.name];
      if (kept !== undefined && typeof kept === typeof spec.default) params[spec.name] = kept;
    }
  }
  return { methodId: option.methodId, params };
}

/** Changes one parameter and preserves every other head parameter, including ones the UI does not edit. */
export function withParam(step: MultimodalStep, name: string, value: MultimodalParamValue): MultimodalStep {
  return { ...step, params: { ...step.params, [name]: value } };
}

// ---------------------------------------------------------------------------
// Owners: a model branch or the merge feature inputs
// ---------------------------------------------------------------------------

/** `null` addresses the merge meta-model's raw feature inputs. */
export type PipelineOwner = string | null;

interface ChainOwner {
  sourceIds: readonly string[];
  sourceChains: readonly MultimodalSourceChain[];
}

export function branchIndex(document: MultimodalPipelineDocument, branchId: string): number {
  return document.branches.findIndex((branch) => branch.id === branchId);
}

export function findBranch(document: MultimodalPipelineDocument, branchId: string): MultimodalPipelineBranch | undefined {
  return document.branches.find((branch) => branch.id === branchId);
}

function ownerOf(document: MultimodalPipelineDocument, owner: PipelineOwner): ChainOwner | undefined {
  return owner === null ? document.merge : findBranch(document, owner);
}

function updateOwner(
  document: MultimodalPipelineDocument,
  owner: PipelineOwner,
  update: <T extends ChainOwner>(current: T) => T,
): MultimodalPipelineDocument {
  if (owner === null) return { ...document, merge: update(document.merge) };
  const index = branchIndex(document, owner);
  if (index < 0) return document;
  return { ...document, branches: document.branches.map((branch, i) => (i === index ? update(branch) : branch)) };
}

/** The declared chain of a source within an owner, or `undefined` when none is declared. */
export function chainFor(
  owner: { sourceChains: readonly MultimodalSourceChain[] },
  sourceId: string,
): MultimodalSourceChain | undefined {
  return owner.sourceChains.find((chain) => chain.sourceId === sourceId);
}

export function stepsFor(document: MultimodalPipelineDocument, owner: PipelineOwner, sourceId: string): readonly MultimodalStep[] {
  const found = ownerOf(document, owner);
  return found ? (chainFor(found, sourceId)?.steps ?? []) : [];
}

/**
 * Connects a host source to an owner. Existing inputs keep their order
 * (unknown IDs included); the new one is inserted before the first input that
 * comes later in host order. An empty chain is declared when none exists.
 */
export function connectSource(
  document: MultimodalPipelineDocument,
  owner: PipelineOwner,
  sourceId: string,
  hostOrder: readonly string[],
): MultimodalPipelineDocument {
  return updateOwner(document, owner, (current) => {
    if (current.sourceIds.includes(sourceId)) return current;
    const rank = hostOrder.indexOf(sourceId);
    let at = current.sourceIds.length;
    if (rank >= 0) {
      const later = current.sourceIds.findIndex((id) => {
        const other = hostOrder.indexOf(id);
        return other > rank;
      });
      if (later >= 0) at = later;
    }
    const sourceIds = [...current.sourceIds];
    sourceIds.splice(at, 0, sourceId);
    const sourceChains = chainFor(current, sourceId) ? current.sourceChains : [...current.sourceChains, { sourceId, steps: [] }];
    return { ...current, sourceIds, sourceChains };
  });
}

/** Disconnects a source and deletes its preprocessing chain in that owner (an explicit user deletion). */
export function disconnectSource(
  document: MultimodalPipelineDocument,
  owner: PipelineOwner,
  sourceId: string,
): MultimodalPipelineDocument {
  return updateOwner(document, owner, (current) => ({
    ...current,
    sourceIds: current.sourceIds.filter((id) => id !== sourceId),
    sourceChains: current.sourceChains.filter((chain) => chain.sourceId !== sourceId),
  }));
}

/** Replaces the steps of the first chain declared for a source, declaring one when absent. */
export function setChainSteps(
  document: MultimodalPipelineDocument,
  owner: PipelineOwner,
  sourceId: string,
  steps: readonly MultimodalStep[],
): MultimodalPipelineDocument {
  return updateOwner(document, owner, (current) => {
    const at = current.sourceChains.findIndex((chain) => chain.sourceId === sourceId);
    const sourceChains =
      at < 0
        ? [...current.sourceChains, { sourceId, steps }]
        : current.sourceChains.map((chain, i) => (i === at ? { ...chain, steps } : chain));
    return { ...current, sourceChains };
  });
}

export function insertStep(
  document: MultimodalPipelineDocument,
  owner: PipelineOwner,
  sourceId: string,
  step: MultimodalStep,
  at?: number,
): MultimodalPipelineDocument {
  const steps = [...stepsFor(document, owner, sourceId)];
  steps.splice(at === undefined ? steps.length : Math.max(0, Math.min(at, steps.length)), 0, step);
  return setChainSteps(document, owner, sourceId, steps);
}

export function removeStep(
  document: MultimodalPipelineDocument,
  owner: PipelineOwner,
  sourceId: string,
  index: number,
): MultimodalPipelineDocument {
  return setChainSteps(
    document,
    owner,
    sourceId,
    stepsFor(document, owner, sourceId).filter((_, i) => i !== index),
  );
}

export function moveStep(
  document: MultimodalPipelineDocument,
  owner: PipelineOwner,
  sourceId: string,
  index: number,
  delta: number,
): MultimodalPipelineDocument {
  const steps = [...stepsFor(document, owner, sourceId)];
  const target = index + delta;
  if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) return document;
  const [moved] = steps.splice(index, 1);
  if (moved) steps.splice(target, 0, moved);
  return setChainSteps(document, owner, sourceId, steps);
}

export function updateStep(
  document: MultimodalPipelineDocument,
  owner: PipelineOwner,
  sourceId: string,
  index: number,
  step: MultimodalStep,
): MultimodalPipelineDocument {
  return setChainSteps(
    document,
    owner,
    sourceId,
    stepsFor(document, owner, sourceId).map((candidate, i) => (i === index ? step : candidate)),
  );
}

/** Copies one source chain to the same connected source in every other branch. Returns the number of branches changed. */
export function copyChainToBranches(
  document: MultimodalPipelineDocument,
  owner: PipelineOwner,
  sourceId: string,
): { document: MultimodalPipelineDocument; changed: number } {
  const steps = stepsFor(document, owner, sourceId);
  let changed = 0;
  let next = document;
  for (const branch of document.branches) {
    if (branch.id === owner || !branch.sourceIds.includes(sourceId)) continue;
    next = setChainSteps(next, branch.id, sourceId, steps);
    changed += 1;
  }
  return { document: next, changed };
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;

/** First `<base>-<n>` not used by a branch. */
export function uniqueBranchId(document: MultimodalPipelineDocument, base = "branch"): string {
  const used = new Set(document.branches.map((branch) => branch.id));
  const stem = ID_PATTERN.test(base) ? base : "branch";
  for (let n = document.branches.length + 1; ; n += 1) {
    const candidate = `${stem}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Error message for a proposed branch ID, or null when valid. */
export function branchIdError(document: MultimodalPipelineDocument, branchId: string, draft: string): string | null {
  if (!ID_PATTERN.test(draft)) return "Use letters, digits, '.', '_', ':' or '-', starting with a letter or digit.";
  if (draft !== branchId && document.branches.some((branch) => branch.id === draft)) return "Another branch already uses this ID.";
  return null;
}

export function addBranch(
  document: MultimodalPipelineDocument,
  option: MultimodalModelOption,
  sourceIds: readonly string[],
  label?: string,
): { document: MultimodalPipelineDocument; branchId: string } {
  const branchId = uniqueBranchId(document);
  const branch: MultimodalPipelineBranch = {
    id: branchId,
    label: label ?? `Branch ${document.branches.length + 1} · ${option.shortLabel}`,
    sourceIds: [...sourceIds],
    sourceChains: sourceIds.map((sourceId) => ({ sourceId, steps: [] })),
    head: headForModel(option),
  };
  return { document: { ...document, branches: [...document.branches, branch] }, branchId };
}

export function duplicateBranch(
  document: MultimodalPipelineDocument,
  branchId: string,
): { document: MultimodalPipelineDocument; branchId: string } {
  const index = branchIndex(document, branchId);
  const original = document.branches[index];
  if (!original) return { document, branchId };
  const id = uniqueBranchId(document, original.id.replace(/-\d+$/, "") || "branch");
  const copy: MultimodalPipelineBranch = {
    ...original,
    id,
    label: `${original.label} (copy)`,
    sourceIds: [...original.sourceIds],
    sourceChains: original.sourceChains.map((chain) => ({ ...chain, steps: chain.steps.map((step) => ({ ...step, params: { ...step.params } })) })),
    head: { ...original.head, params: { ...original.head.params } },
  };
  const branches = [...document.branches];
  branches.splice(index + 1, 0, copy);
  return { document: { ...document, branches }, branchId: id };
}

export function removeBranch(document: MultimodalPipelineDocument, branchId: string): MultimodalPipelineDocument {
  const index = branchIndex(document, branchId);
  if (index < 0) return document;
  return { ...document, branches: document.branches.filter((_, i) => i !== index) };
}

export function moveBranch(document: MultimodalPipelineDocument, branchId: string, delta: number): MultimodalPipelineDocument {
  const index = branchIndex(document, branchId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= document.branches.length) return document;
  const branches = [...document.branches];
  const [moved] = branches.splice(index, 1);
  if (moved) branches.splice(target, 0, moved);
  return { ...document, branches };
}

export function updateBranch(
  document: MultimodalPipelineDocument,
  branchId: string,
  patch: Partial<Omit<MultimodalPipelineBranch, "sourceIds" | "sourceChains">>,
): MultimodalPipelineDocument {
  const index = branchIndex(document, branchId);
  if (index < 0) return document;
  return { ...document, branches: document.branches.map((branch, i) => (i === index ? { ...branch, ...patch } : branch)) };
}

export function updateMerge(document: MultimodalPipelineDocument, patch: Partial<MultimodalPipelineMerge>): MultimodalPipelineDocument {
  return { ...document, merge: { ...document.merge, ...patch } };
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export function sameTarget(a: MultimodalPipelineTarget, b: MultimodalPipelineTarget): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "document":
    case "merge":
      return true;
    case "branch":
    case "model":
      return a.branchId === (b as typeof a).branchId;
    case "source":
      return a.branchId === (b as typeof a).branchId && a.sourceId === (b as typeof a).sourceId;
    case "step":
      return (
        a.branchId === (b as typeof a).branchId && a.sourceId === (b as typeof a).sourceId && a.index === (b as typeof a).index
      );
  }
}

/** The target itself when it still exists in the document, otherwise its closest existing parent. */
export function resolveTarget(document: MultimodalPipelineDocument, target: MultimodalPipelineTarget): MultimodalPipelineTarget {
  switch (target.kind) {
    case "document":
    case "merge":
      return target;
    case "branch":
    case "model":
      return findBranch(document, target.branchId) ? target : { kind: "document" };
    case "source": {
      const owner = ownerOf(document, target.branchId);
      if (!owner) return { kind: "document" };
      if (owner.sourceIds.includes(target.sourceId) || chainFor(owner, target.sourceId)) return target;
      return target.branchId === null ? { kind: "merge" } : { kind: "branch", branchId: target.branchId };
    }
    case "step": {
      const steps = stepsFor(document, target.branchId, target.sourceId);
      if (target.index >= 0 && target.index < steps.length) return target;
      return resolveTarget(document, { kind: "source", branchId: target.branchId, sourceId: target.sourceId });
    }
  }
}

// ---------------------------------------------------------------------------
// Structural issues (displayed, never auto-repaired)
// ---------------------------------------------------------------------------

export interface PipelineCatalogs {
  stepCatalog?: readonly MultimodalStepOption[];
  modelCatalog?: readonly MultimodalModelOption[];
}

function paramIssue(spec: MultimodalStepParamSpec, value: MultimodalParamValue | undefined): string | null {
  if (value === undefined) return null;
  if (spec.kind === "bool") return typeof value === "boolean" ? null : `${spec.label} must be true or false.`;
  if (spec.kind === "enum") return spec.options && !spec.options.includes(String(value)) ? `${spec.label} has an unknown option.` : null;
  if (typeof value !== "number" || !Number.isFinite(value)) return `${spec.label} must be a finite number.`;
  if (spec.kind === "int" && !Number.isInteger(value)) return `${spec.label} must be an integer.`;
  if (spec.min !== undefined && value < spec.min) return `${spec.label} must be at least ${spec.min}.`;
  if (spec.max !== undefined && value > spec.max) return `${spec.label} must be at most ${spec.max}.`;
  return null;
}

function ownerName(document: MultimodalPipelineDocument, owner: PipelineOwner): string {
  if (owner === null) return "Meta-model features";
  return findBranch(document, owner)?.label || owner;
}

function chainIssues(
  document: MultimodalPipelineDocument,
  owner: PipelineOwner,
  current: ChainOwner,
  byId: ReadonlyMap<string, MultimodalSource>,
  tagOf: ReadonlyMap<string, string>,
  stepCatalog: readonly MultimodalStepOption[],
  issues: MultimodalPipelineIssue[],
): void {
  const where = ownerName(document, owner);
  const ownerTarget: MultimodalPipelineTarget = owner === null ? { kind: "merge" } : { kind: "branch", branchId: owner };
  const seen = new Set<string>();
  for (const sourceId of current.sourceIds) {
    const target: MultimodalPipelineTarget = { kind: "source", branchId: owner, sourceId };
    if (seen.has(sourceId)) {
      issues.push({ severity: "error", target, message: `${where}: source "${sourceId}" is connected more than once.` });
      continue;
    }
    seen.add(sourceId);
    const source = byId.get(sourceId);
    if (!source) {
      issues.push({
        severity: "error",
        target,
        message: `${where}: source "${sourceId}" is not in the loaded dataset. Disconnect it or load matching data.`,
      });
    }
    const chains = current.sourceChains.filter((chain) => chain.sourceId === sourceId);
    const label = `${tagOf.get(sourceId) ?? sourceId}${source ? ` ${source.label}` : ""}`;
    if (chains.length === 0) {
      issues.push({
        severity: "error",
        target,
        message: `${where}: ${label} has no preprocessing chain declared. Add a step or reconnect the source.`,
      });
    } else if (chains.length > 1) {
      issues.push({ severity: "error", target, message: `${where}: ${label} declares ${chains.length} preprocessing chains; keep one.` });
    }
    (chains[0]?.steps ?? []).forEach((step, index) => {
      const stepTarget: MultimodalPipelineTarget = { kind: "step", branchId: owner, sourceId, index };
      const option = findStepOption(step.methodId, stepCatalog);
      if (!option) {
        issues.push({
          severity: "warning",
          target: stepTarget,
          message: `${where}: ${label} step ${index + 1} "${step.methodId}" is not in this editor's catalogue; it is kept unchanged.`,
        });
        return;
      }
      if (source && !option.representations.includes(source.representation)) {
        issues.push({
          severity: "error",
          target: stepTarget,
          message: `${where}: ${option.label} does not apply to ${label} (${source.representation}). Remove the step.`,
        });
      }
      for (const spec of option.params) {
        const problem = paramIssue(spec, step.params[spec.name]);
        if (problem) issues.push({ severity: "error", target: stepTarget, message: `${where}: ${label} ${option.label}: ${problem}` });
      }
    });
  }
  for (const chain of current.sourceChains) {
    if (!seen.has(chain.sourceId)) {
      issues.push({
        severity: "error",
        target: { kind: "source", branchId: owner, sourceId: chain.sourceId },
        message: `${where}: a preprocessing chain is declared for "${chain.sourceId}", which is not connected. Connect or disconnect it.`,
      });
    }
  }
  if (owner !== null && current.sourceIds.length === 0) {
    issues.push({ severity: "error", target: ownerTarget, message: `${where}: connect at least one source.` });
  }
}

function headIssues(
  where: string,
  head: MultimodalStep,
  target: MultimodalPipelineTarget,
  option: MultimodalModelOption | undefined,
  issues: MultimodalPipelineIssue[],
): void {
  if (!option) return;
  for (const spec of option.params) {
    const problem = paramIssue(spec, head.params[spec.name]);
    if (problem) issues.push({ severity: "error", target, message: `${where}: ${option.shortLabel} ${problem}` });
  }
}

/**
 * Structural problems the editor can see without executing anything. These
 * are displayed next to the elements they concern; the editor never repairs
 * them silently. The host's own validation and compiler remain authoritative.
 */
export function pipelineIssues(
  document: MultimodalPipelineDocument,
  sources: readonly MultimodalSource[],
  { stepCatalog = MULTIMODAL_STEP_CATALOG, modelCatalog = MULTIMODAL_MODEL_CATALOG }: PipelineCatalogs = {},
): MultimodalPipelineIssue[] {
  const issues: MultimodalPipelineIssue[] = [];
  const byId = new Map(sources.map((source) => [source.id, source]));
  const tagOf = new Map(sources.map((source, index) => [source.id, sourceTag(index)]));
  const { branches, merge } = document;

  if (document.label.trim() === "") {
    issues.push({ severity: "warning", target: { kind: "document" }, message: "Give the pipeline a name so results stay identifiable." });
  }
  if (branches.length === 0) {
    issues.push({ severity: "error", target: { kind: "document" }, message: "The pipeline has no model branch. Add a branch." });
  }

  const ids = new Map<string, number>();
  for (const branch of branches) ids.set(branch.id, (ids.get(branch.id) ?? 0) + 1);
  for (const [id, count] of ids) {
    if (count > 1) {
      issues.push({
        severity: "error",
        target: { kind: "branch", branchId: id },
        message: `${count} branches share the ID "${id}". Give each branch a unique ID.`,
      });
    }
  }

  for (const branch of branches) {
    const where = branch.label || branch.id;
    chainIssues(document, branch.id, branch, byId, tagOf, stepCatalog, issues);
    const target: MultimodalPipelineTarget = { kind: "model", branchId: branch.id };
    const option = findModelOption(branch.head.methodId, modelCatalog);
    if (!option || !option.roles.includes("branch")) {
      issues.push({
        severity: "error",
        target,
        message: `${where}: "${branch.head.methodId}" is not a branch model offered here. Choose PLS, Ridge, multiblock PLS or the network.`,
      });
    } else if (option.inputMode === "blocks" && branch.sourceIds.length < 2) {
      issues.push({
        severity: "warning",
        target,
        message: `${where}: one block provides no multisource fusion. Connect another source to model several blocks.`,
      });
    }
    headIssues(where, branch.head, target, option, issues);
  }

  const mergeTarget: MultimodalPipelineTarget = { kind: "merge" };
  if (merge.kind === "none" && branches.length !== 1 && branches.length > 0) {
    issues.push({
      severity: "error",
      target: mergeTarget,
      message: `No merge needs exactly one branch; this pipeline has ${branches.length}. Delete ${branches.length - 1} branch${
        branches.length > 2 ? "es" : ""
      } or choose a fixed mean or a learned meta-model.`,
    });
  }
  if ((merge.kind === "mean" || merge.kind === "model") && branches.length < 2) {
    issues.push({
      severity: "error",
      target: mergeTarget,
      message: `${MERGE_KIND_LABEL[merge.kind]} needs at least two prediction branches; this pipeline has ${branches.length}. Add or duplicate a branch, or choose no merge.`,
    });
  }
  if (merge.kind === "model") {
    const option = findModelOption(merge.head.methodId, modelCatalog);
    if (!option || !option.roles.includes("meta")) {
      issues.push({
        severity: "error",
        target: mergeTarget,
        message: `The meta-model "${merge.head.methodId}" is not supported. Choose PLS or Ridge.`,
      });
    }
    headIssues("Meta-model", merge.head, mergeTarget, option, issues);
  }
  if (merge.kind !== "model" && (merge.sourceIds.length > 0 || merge.sourceChains.length > 0)) {
    issues.push({
      severity: "error",
      target: mergeTarget,
      message: `Raw feature inputs only feed a learned meta-model. Disconnect them or choose a learned meta-model.`,
    });
  }
  if (merge.sourceIds.length > 0 || merge.sourceChains.length > 0) {
    chainIssues(document, null, merge, byId, tagOf, stepCatalog, issues);
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Text descriptions
// ---------------------------------------------------------------------------

function sourceName(sourceId: string, byId: ReadonlyMap<string, MultimodalSource>, tagOf: ReadonlyMap<string, string>): string {
  const source = byId.get(sourceId);
  return source ? `${tagOf.get(sourceId)} ${source.label}` : `unknown source "${sourceId}"`;
}

function paramText(params: Readonly<Record<string, MultimodalParamValue>>, specs?: readonly MultimodalStepParamSpec[]): string {
  const names = specs ? specs.map((spec) => spec.name).filter((name) => params[name] !== undefined) : Object.keys(params);
  return names.map((name) => `${name}=${String(params[name])}`).join(", ");
}

/** The head's key parameter as text, e.g. "3 components", "alpha 1", "24 epochs", or "" when none is set. */
export function modelParamSummary(head: MultimodalStep): string {
  const p = head.params;
  if (p.n_components !== undefined) return `${String(p.n_components)} components`;
  if (p.alpha !== undefined) return `alpha ${String(p.alpha)}`;
  if (p.epochs !== undefined) return `${String(p.epochs)} epochs`;
  return "";
}

/** Compact head summary, e.g. "PLS · 3 components" or "Ridge · alpha 1". */
export function modelSummary(head: MultimodalStep, modelCatalog: readonly MultimodalModelOption[] = MULTIMODAL_MODEL_CATALOG): string {
  const option = findModelOption(head.methodId, modelCatalog);
  if (!option) return head.methodId;
  const detail = modelParamSummary(head);
  return detail ? `${option.shortLabel} · ${detail}` : option.shortLabel;
}

function width(source: MultimodalSource | undefined): number | null {
  return source ? source.shape.reduce((product, size) => product * size, 1) : null;
}

/** Visible sentence: how the sources of a branch are combined inside its native source operator. */
export function combinationText(
  branch: MultimodalPipelineBranch,
  sources: readonly MultimodalSource[],
  modelCatalog: readonly MultimodalModelOption[] = MULTIMODAL_MODEL_CATALOG,
): string {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const tagOf = new Map(sources.map((source, index) => [source.id, sourceTag(index)]));
  const option = findModelOption(branch.head.methodId, modelCatalog);
  const count = branch.sourceIds.length;
  if (count === 0) return "No source connected.";
  const tags = branch.sourceIds.map((id) => tagOf.get(id) ?? id);
  if (!option) return `Inputs ${tags.join(", ")} are passed to an unrecognised model.`;
  if (option.inputMode === "network") {
    const parts = branch.sourceIds.map((id) => {
      const source = byId.get(id);
      return `${tagOf.get(id) ?? id} → ${source ? NETWORK_BRANCH_LABEL[networkBranchKind(source.representation)].toLowerCase() : "unknown branch"}`;
    });
    return `Each source feeds its own trained branch (${parts.join("; ")}); their embeddings are concatenated into a jointly trained head.`;
  }
  if (count === 1) return `Single source (${tags[0]}): nothing is combined.`;
  const widths = branch.sourceIds.map((id) => width(byId.get(id)));
  const known = widths.every((value): value is number => value !== null);
  if (option.inputMode === "blocks") {
    return `The ${count} preprocessed sources stay separate blocks for multiblock PLS.${
      known ? ` Raw input widths before preprocessing: ${widths.join(", ")}.` : ""
    }`;
  }
  return `The ${count} preprocessed sources are concatenated side by side into one matrix.${
    known ? ` Raw input widths before preprocessing: ${widths.join(" + ")} = ${widths.reduce((a, b) => a + b, 0)} variables.` : ""
  }`;
}

/** Visible sentence: the actual inputs of the merge. */
export function mergeInputsText(
  document: MultimodalPipelineDocument,
  sources: readonly MultimodalSource[],
  modelCatalog: readonly MultimodalModelOption[] = MULTIMODAL_MODEL_CATALOG,
): string {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const tagOf = new Map(sources.map((source, index) => [source.id, sourceTag(index)]));
  const { merge, branches } = document;
  const list = branches.map((branch) => `${branch.label || branch.id} (${modelSummary(branch.head, modelCatalog)})`).join("; ");
  if (merge.kind === "none") {
    if (branches.length === 1) return `No merge: the prediction of ${list} is the pipeline output.`;
    return `No merge, but ${branches.length} branches produce predictions: only one may remain.`;
  }
  if (merge.kind === "mean") {
    return `Unweighted mean of the predictions of ${list || "no branch"}. Nothing is fitted at the merge.`;
  }
  const meta = findModelOption(merge.head.methodId, modelCatalog);
  const features = merge.sourceIds.map((id) => sourceName(id, byId, tagOf));
  return `${meta ? meta.shortLabel : merge.head.methodId} meta-model fitted on nested out-of-fold predictions of ${list || "no branch"}${
    features.length > 0 ? `, plus the preprocessed raw features of ${features.join(", ")} (hybrid)` : ""
  }.`;
}

/** The whole document as an ordered text outline (visible alternative to the canvas). */
export function describePipelineDocument(
  document: MultimodalPipelineDocument,
  sources: readonly MultimodalSource[],
  { stepCatalog = MULTIMODAL_STEP_CATALOG, modelCatalog = MULTIMODAL_MODEL_CATALOG }: PipelineCatalogs = {},
): RecipeLine[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const tagOf = new Map(sources.map((source, index) => [source.id, sourceTag(index)]));
  const lines: RecipeLine[] = [];
  const chainLine = (owner: ChainOwner, sourceId: string): string => {
    const steps = chainFor(owner, sourceId)?.steps ?? [];
    const text = steps
      .map((step) => {
        const option = findStepOption(step.methodId, stepCatalog);
        const params = paramText(step.params, option?.params);
        return `${option?.label ?? step.methodId}${params ? ` (${params})` : ""}`;
      })
      .join(" → ");
    return `${sourceName(sourceId, byId, tagOf)}: ${text || "no preprocessing"}`;
  };
  document.branches.forEach((branch, index) => {
    lines.push({ depth: 0, text: `Branch ${index + 1}, ${branch.label || branch.id}` });
    for (const sourceId of branch.sourceIds) lines.push({ depth: 1, text: chainLine(branch, sourceId) });
    lines.push({ depth: 1, text: combinationText(branch, sources, modelCatalog) });
    const option = findModelOption(branch.head.methodId, modelCatalog);
    const params = paramText(branch.head.params, option?.params);
    lines.push({ depth: 1, text: `Model: ${option?.label ?? branch.head.methodId}${params ? ` (${params})` : ""}` });
  });
  if (document.merge.kind === "model" && document.merge.sourceIds.length > 0) {
    lines.push({ depth: 0, text: "Raw features for the meta-model" });
    for (const sourceId of document.merge.sourceIds) lines.push({ depth: 1, text: chainLine(document.merge, sourceId) });
  }
  lines.push({ depth: 0, text: `Merge: ${mergeInputsText(document, sources, modelCatalog)}` });
  return lines;
}
