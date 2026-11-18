/**
 * Projection of a canonical nirs4all pipeline into the chain view model.
 *
 * Read-only and total: every step becomes a node that keeps its JSON path, and
 * anything outside the modelled constructs becomes a `raw` node holding the
 * original value. Nothing is normalized or dropped here.
 */

import { classLeaf, findOperator, roleForType, type CatalogIndex } from "./catalog.js";
import { isBypassWrapper, isRecord, pathId } from "./json.js";
import { formatValue, generatorKey, readSweep, readTuning } from "./summary.js";
import {
  BYPASS_KEY,
  type ChainItem,
  type ChainModel,
  type ChainRef,
  type ChainRole,
  type ForkMode,
  type ForkNode,
  type JsonPath,
  type LaneNode,
  type PipelineChainDocument,
  type StepNode,
  type SweepView,
} from "./types.js";

export const ROOT_CHAIN_PATH: JsonPath = ["pipeline"];

export const itemIdAt = (path: JsonPath): string => `i:${pathId(path)}`;
export const chainIdAt = (path: JsonPath): string => `c:${pathId(path)}`;
export const laneIdAt = (path: JsonPath): string => `l:${pathId(path)}`;

/** Step keywords wrapping a single operator reference. */
const OPERATOR_KEYWORDS: ReadonlyArray<readonly [string, ChainRole | null]> = [
  ["model", "model"],
  ["y_processing", "y_processing"],
  ["split", "splitting"],
  ["preprocessing", "preprocessing"],
  ["step", null],
];

/** Keys of a step record that are never a parameter-keyed generator sibling. */
const STEP_KEYS = new Set([
  "class", "function", "params", "framework", "model", "y_processing", "split", "preprocessing", "step", "name",
  "finetune_params", "train_params", "refit_params", "param", "count", "action",
]);

interface Builder {
  catalog: CatalogIndex | null;
  chains: Map<string, ChainRef>;
  items: Map<string, ChainItem>;
  lanes: Map<string, LaneNode>;
}

interface Position {
  path: JsonPath;
  chain: string;
  index: number;
}

function unwrap(raw: unknown, path: JsonPath): { value: unknown; valuePath: JsonPath; bypassed: boolean } {
  return isBypassWrapper(raw)
    ? { value: raw[BYPASS_KEY], valuePath: [...path, BYPASS_KEY], bypassed: true }
    : { value: raw, valuePath: path, bypassed: false };
}

function humanize(key: string): string {
  const words = key.replace(/^_+|_+$/g, "").split("_").filter(Boolean);
  const text = words.join(" ");
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : key;
}

/** One-line content of a step the editor does not model: its settings, not its JSON. */
function rawDetail(value: unknown): string {
  if (!isRecord(value)) return formatValue(value, 60);
  const keys = Object.keys(value);
  const inner = keys.length === 1 ? value[keys[0]!] : value;
  if (!isRecord(inner)) return formatValue(inner, 60);
  const text = Object.entries(inner)
    .map(([key, child]) => (child === null || typeof child !== "object" ? `${key} ${formatValue(child, 16)}` : key))
    .join(", ");
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

function isOperatorReference(value: unknown): boolean {
  return typeof value === "string" || (isRecord(value) && (typeof value.class === "string" || typeof value.function === "string"));
}

function stepSweeps(record: Record<string, unknown> | null, params: Readonly<Record<string, unknown>>): SweepView[] {
  const sweeps: SweepView[] = [];
  for (const [name, value] of Object.entries(params)) {
    if (!isRecord(value)) continue;
    const sweep = readSweep(value, name, "param");
    if (sweep) sweeps.push(sweep);
  }
  if (record) {
    const attached = readSweep(record, typeof record.param === "string" ? record.param : null, "step");
    if (attached) sweeps.push(attached);
    for (const [name, value] of Object.entries(record)) {
      if (STEP_KEYS.has(name) || name.startsWith("_") || !isRecord(value) || !generatorKey(value)) continue;
      const sibling = readSweep(value, name, "sibling");
      if (sibling) sweeps.push(sibling);
    }
  }
  return sweeps;
}

function buildStep(
  builder: Builder,
  base: Position & { valuePath: JsonPath; bypassed: boolean },
  record: Record<string, unknown> | null,
  keyword: string | null,
  keywordRole: ChainRole | null,
  reference: unknown,
): StepNode {
  const operatorPath = keyword ? [...base.valuePath, keyword] : base.valuePath;
  const referenceRecord = isRecord(reference) ? reference : null;
  const classPath = typeof reference === "string"
    ? reference
    : typeof referenceRecord?.class === "string"
    ? referenceRecord.class
    : typeof referenceRecord?.function === "string"
    ? referenceRecord.function
    : null;
  const params = referenceRecord && isRecord(referenceRecord.params) ? referenceRecord.params : {};
  const definition = findOperator(builder.catalog, classPath, keywordRole);
  return {
    kind: "step",
    id: itemIdAt(base.path),
    path: base.path,
    valuePath: base.valuePath,
    bypassed: base.bypassed,
    chain: base.chain,
    index: base.index,
    role: keywordRole ?? (definition ? roleForType(definition.type) : "operator"),
    keyword,
    operatorPath,
    classPath,
    label: definition?.name ?? (classPath ? classLeaf(classPath) : "Step"),
    customName: record && typeof record.name === "string" && record.name ? record.name : null,
    params,
    definition,
    sweeps: stepSweeps(record, params),
    tuning: record ? readTuning(record.finetune_params) : null,
  };
}

function buildFork(
  builder: Builder,
  base: Position & { valuePath: JsonPath; bypassed: boolean },
  record: Record<string, unknown>,
  keyword: string,
  mode: ForkMode,
  /** Key of the lane map inside `record[keyword]` (`steps` of a `by_source` branch). */
  inner?: string,
): ForkNode {
  const holder = record[keyword];
  const container = inner !== undefined && isRecord(holder) ? holder[inner] : holder;
  const lanesPath = inner !== undefined ? [...base.valuePath, keyword, inner] : [...base.valuePath, keyword];
  const id = itemIdAt(base.path);
  const named = !Array.isArray(container);
  // Source lanes are the source names; `_merge_after_` and other `_` options stay modifiers.
  const entries: Array<[string | number, unknown]> = Array.isArray(container)
    ? container.map((lane, index) => [index, lane])
    : Object.entries(container as Record<string, unknown>).filter(([key]) => mode !== "source" || !key.startsWith("_"));
  const lanes = entries.map(([key, raw], index): LaneNode => {
    const path = [...lanesPath, key];
    const lane = unwrap(raw, path);
    const laneId = laneIdAt(path);
    const chain = buildChain(builder, lane.value, lane.valuePath, mode === "branch" || mode === "source", laneId);
    const node: LaneNode = {
      id: laneId,
      path,
      valuePath: lane.valuePath,
      bypassed: lane.bypassed,
      key,
      label: typeof key === "string" ? key : String(index + 1),
      chain: chain.id,
      items: chain.items,
      fork: id,
      index,
    };
    builder.lanes.set(laneId, node);
    return node;
  });
  const modifiers: Record<string, unknown> = {};
  if (mode !== "source") for (const [name, value] of Object.entries(record)) if (name !== keyword) modifiers[name] = value;
  if (inner !== undefined && isRecord(holder)) {
    for (const [name, value] of Object.entries(holder)) if (name !== inner) modifiers[name] = value;
  } else if (mode === "source" && isRecord(container)) {
    for (const [name, value] of Object.entries(container)) if (name.startsWith("_")) modifiers[name] = value;
  }
  return {
    kind: "fork",
    id,
    path: base.path,
    valuePath: base.valuePath,
    bypassed: base.bypassed,
    chain: base.chain,
    index: base.index,
    mode,
    keyword,
    lanesPath,
    named,
    lanes,
    modifiers,
    stack: mode !== "branch" && mode !== "source" && lanes.every((lane) => lane.items.length === 0 || (lane.items.length === 1 && lane.items[0]!.kind !== "fork" && lane.items[0]!.kind !== "frame")),
  };
}

function isPlainLaneMap(value: unknown): value is Record<string, unknown> {
  // Named duplication branches only: generator (`_or_`), separation (`by_*`) and configured
  // (`parallel`, `n_jobs`) branches stay raw.
  const reserved = ["steps", "values", "parallel", "n_jobs"];
  return isRecord(value) && Object.keys(value).length > 0 && Object.keys(value).every((key) => !key.startsWith("_") && !key.startsWith("by_") && !reserved.includes(key));
}

function buildItem(builder: Builder, raw: unknown, position: Position): ChainItem {
  const { value, valuePath, bypassed } = unwrap(raw, position.path);
  const base = { ...position, valuePath, bypassed };
  const id = itemIdAt(position.path);
  const rawNode = (label: string, role: "raw" | "chart" = "raw"): ChainItem => ({
    kind: "raw", id, ...base, role, label, detail: rawDetail(value), value,
  });

  if (value === null || value === undefined) return rawNode("No-op");
  if (typeof value === "string") {
    if (value === "chart_2d" || value === "chart_y") return rawNode(value, "chart");
    return buildStep(builder, base, null, null, null, value);
  }
  if (Array.isArray(value)) {
    const inner = buildChain(builder, value, valuePath, true, id);
    return { kind: "frame", id, ...base, mode: "sequence", inner: inner.id, items: inner.items, modifiers: {} };
  }
  if (!isRecord(value)) return rawNode("Value");

  if (typeof value._comment === "string" && Object.keys(value).length === 1) {
    return { kind: "note", id, ...base, role: "note", text: value._comment };
  }
  for (const [keyword, role] of OPERATOR_KEYWORDS) {
    if (keyword in value && isOperatorReference(value[keyword])) return buildStep(builder, base, value, keyword, role, value[keyword]);
  }
  if (isRecord(value.source_branch) && Object.keys(value.source_branch).some((key) => !key.startsWith("_"))) {
    return buildFork(builder, base, value, "source_branch", "source");
  }
  if (isRecord(value.branch) && value.branch.by_source === true && isPlainLaneMap(value.branch.steps)) {
    return buildFork(builder, base, value, "branch", "source", "steps");
  }
  if ("branch" in value && (Array.isArray(value.branch) || isPlainLaneMap(value.branch))) {
    return buildFork(builder, base, value, "branch", "branch");
  }
  if ("merge" in value || "merge_sources" in value) {
    const merge = "merge" in value ? value.merge : value.merge_sources;
    const label = typeof merge === "string" ? merge : isRecord(merge) ? Object.keys(merge).join(" + ") : formatValue(merge);
    return { kind: "merge", id, ...base, role: "merge", label, value: merge, ...("merge" in value ? {} : { sources: true }) };
  }
  if (Array.isArray(value._or_)) return buildFork(builder, base, value, "_or_", "choice");
  if (Array.isArray(value._cartesian_)) {
    const inner = buildChain(builder, value._cartesian_, [...valuePath, "_cartesian_"], true, id);
    const modifiers: Record<string, unknown> = {};
    for (const [name, child] of Object.entries(value)) if (name !== "_cartesian_") modifiers[name] = child;
    return { kind: "frame", id, ...base, mode: "cartesian", inner: inner.id, items: inner.items, modifiers };
  }
  if (Array.isArray(value.concat_transform)) return buildFork(builder, base, value, "concat_transform", "concat");
  if (Array.isArray(value.feature_augmentation)) return buildFork(builder, base, value, "feature_augmentation", "augment");
  if (isOperatorReference(value)) return buildStep(builder, base, value, null, null, value);
  if ("chart_2d" in value || "chart_y" in value) return rawNode("chart_2d" in value ? "chart_2d" : "chart_y", "chart");
  return rawNode(humanize(Object.keys(value)[0] ?? "Step"));
}

function buildChain(builder: Builder, value: unknown, path: JsonPath, keepList: boolean, owner: string | null): ChainRef {
  const id = chainIdAt(path);
  const form: ChainRef["form"] = Array.isArray(value) ? "list" : value === null || value === undefined ? "empty" : "single";
  const items = form === "list"
    ? (value as unknown[]).map((raw, index) => buildItem(builder, raw, { path: [...path, index], chain: id, index }))
    : form === "single"
    ? [buildItem(builder, value, { path, chain: id, index: 0 })]
    : [];
  for (const item of items) builder.items.set(item.id, item);
  const chain: ChainRef = { id, path, form, keepList, items, owner };
  builder.chains.set(id, chain);
  return chain;
}

/** Project a document into chains, forks and cells. */
export function parsePipeline(document: PipelineChainDocument, catalog?: CatalogIndex | null): ChainModel {
  const builder: Builder = { catalog: catalog ?? null, chains: new Map(), items: new Map(), lanes: new Map() };
  const root = buildChain(builder, Array.isArray(document.pipeline) ? document.pipeline : [], ROOT_CHAIN_PATH, true, null);
  return { root, chains: builder.chains, items: builder.items, lanes: builder.lanes };
}

/** The item (fork or frame) or lane that owns `chainId`; `null` for the root chain. */
export function chainOwnerItem(model: ChainModel, chainId: string): ChainItem | null {
  const owner = model.chains.get(chainId)?.owner;
  if (!owner) return null;
  const lane = model.lanes.get(owner);
  return model.items.get(lane ? lane.fork : owner) ?? null;
}

/** Items of the whole pipeline in reading order (depth first, lanes top to bottom). */
export function flattenItems(items: readonly ChainItem[], out: ChainItem[] = []): ChainItem[] {
  for (const item of items) {
    out.push(item);
    if (item.kind === "fork") for (const lane of item.lanes) flattenItems(lane.items, out);
    if (item.kind === "frame") flattenItems(item.items, out);
  }
  return out;
}
