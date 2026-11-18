/**
 * Contracts for the `pipelineEditor` domain.
 *
 * The editor works directly on the canonical nirs4all pipeline JSON (the
 * `pipeline` list of steps accepted by the SDK and stored by the repository).
 * It never converts the document into a private editor format: every view node
 * points back at a JSON path, and edits are applied in place, so constructs the
 * editor does not model are carried through untouched.
 */

/** Path into the document, as successive object keys / array indices. */
export type JsonPath = readonly (string | number)[];

/**
 * Editor-only wrapper marking a bypassed step, lane or group:
 * `{ "_bypassed_": <original value> }`.
 *
 * Canonical nirs4all has no enabled flag, so a bypassed element stays in the
 * edited document under this wrapper and {@link file://./document.ts
 * toCanonicalPipeline} removes it before the pipeline is handed to a runtime.
 */
export const BYPASS_KEY = "_bypassed_" as const;

/**
 * The edited document. Same shape as the SDK / repository pipeline wrapper
 * (`{ name, description, pipeline }`); unknown top-level keys are preserved.
 * A document without bypassed elements is canonical as is.
 */
export interface PipelineChainDocument {
  name?: string;
  description?: string;
  pipeline: readonly unknown[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Host-supplied catalogue
// ---------------------------------------------------------------------------

export interface PipelineOperatorOption {
  value: string | number | boolean;
  label: string;
  description?: string | undefined;
}

/**
 * One operator parameter. Structurally compatible with
 * `nodeRegistry.NodeParameterDefinition` and with Studio's registry entries.
 */
export interface PipelineOperatorParameter {
  name: string;
  label?: string | undefined;
  /** `int`, `float`, `bool`, `string`, `select`; anything else is edited as JSON. */
  type: string;
  required?: boolean | undefined;
  /** Runtime default, shown when the parameter is left unset. */
  default?: unknown;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  options?: readonly PipelineOperatorOption[] | undefined;
  description?: string | undefined;
  unit?: string | undefined;
  isAdvanced?: boolean | undefined;
}

/**
 * One operator the host makes available. Structurally compatible with
 * `nodeRegistry.NodeDefinition`, so `projectN4mManifest()` output can be passed
 * as a catalogue directly.
 */
export interface PipelineOperatorDefinition {
  id: string;
  name: string;
  /**
   * Operator family: `preprocessing`, `model`, `splitting`, `y_processing`,
   * `augmentation`, `filter`, or any host-specific string.
   */
  type: string;
  category?: string | undefined;
  description?: string | undefined;
  /** Serialized as the step `class` (or `function` when `functionPath` is set). */
  classPath?: string | undefined;
  functionPath?: string | undefined;
  /** Other class paths that designate the same operator. */
  aliases?: readonly string[] | undefined;
  tags?: readonly string[] | undefined;
  parameters: readonly PipelineOperatorParameter[];
  /**
   * Step keyword wrapping the operator on insertion. Defaults to `model` for
   * `type: "model"`, `y_processing` for `type: "y_processing"`, none otherwise.
   */
  stepKeyword?: "model" | "y_processing" | "split" | null | undefined;
}

/** A structural construct offered next to the operators (branch, merge, ...). */
export interface PipelineStructureTemplate {
  id: string;
  label: string;
  description?: string | undefined;
  /** Canonical step JSON inserted as is (cloned on every insertion). */
  value: unknown;
}

export interface PipelineCatalog {
  operators: readonly PipelineOperatorDefinition[];
  /** Replaces the default structural constructs when provided. */
  structures?: readonly PipelineStructureTemplate[] | undefined;
  /** Values offered for a string `merge` step; free text when omitted. */
  mergeStrategies?: readonly PipelineOperatorOption[] | undefined;
}

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

/** Visual family of a cell. Drives the accent color and the glyph only. */
export type ChainRole =
  | "preprocessing"
  | "model"
  | "splitting"
  | "y_processing"
  | "augmentation"
  | "filter"
  | "merge"
  | "note"
  | "chart"
  | "operator"
  | "raw";

export type SweepKind = "values" | "range" | "log_range" | "grid" | "zip" | "sample" | "other";

/** A generator attached to one step (parameter-level or step-level). */
export interface SweepView {
  /** Swept parameter, or `null` for a multi-parameter generator. */
  param: string | null;
  kind: SweepKind;
  /** Generator payload as stored (`[2, 30, 4]`, a list of values, ...). */
  spec: unknown;
  /** Where the generator lives in the document. */
  location: "param" | "step" | "sibling";
  /** Number of generated values, when it can be read from the payload. */
  count: number | null;
  text: string;
}

export interface TunedParamView {
  name: string;
  /** `int`, `float`, `log_float`, `categorical`, or `raw` for other payloads. */
  type: string;
  low?: number;
  high?: number;
  choices?: readonly unknown[];
  spec: unknown;
  text: string;
}

export interface TuningView {
  trials: number | null;
  sampler: string | null;
  params: readonly TunedParamView[];
}

interface ChainNodeBase {
  /** Stable for a given document; derived from `path`. */
  id: string;
  /** Position in the document (the bypass wrapper when bypassed). */
  path: JsonPath;
  /** Position of the value itself (inside the bypass wrapper when bypassed). */
  valuePath: JsonPath;
  bypassed: boolean;
  /** Id of the chain holding this node, and its index there. */
  chain: string;
  index: number;
}

/** A single operator step: transform, splitter, model, y-processing, ... */
export interface StepNode extends ChainNodeBase {
  kind: "step";
  role: ChainRole;
  /** Wrapping step keyword (`model`, `y_processing`, `split`, ...), if any. */
  keyword: string | null;
  /** Position of the operator reference (class string or `{class, params}`). */
  operatorPath: JsonPath;
  classPath: string | null;
  label: string;
  /** Step `name` (models), when set. */
  customName: string | null;
  params: Readonly<Record<string, unknown>>;
  definition: PipelineOperatorDefinition | null;
  sweeps: readonly SweepView[];
  tuning: TuningView | null;
}

export interface MergeNode extends ChainNodeBase {
  kind: "merge";
  role: "merge";
  label: string;
  /** `merge_sources`: joins the source blocks of a multisource dataset. */
  sources?: boolean;
  value: unknown;
}

export interface NoteNode extends ChainNodeBase {
  kind: "note";
  role: "note";
  text: string;
}

/** Anything the editor does not model: shown, movable, editable as JSON. */
export interface RawNode extends ChainNodeBase {
  kind: "raw";
  role: "raw" | "chart";
  label: string;
  detail: string;
  value: unknown;
}

/**
 * `source`: one lane per data source (block) of the same samples, from a
 * `source_branch` step or a `branch` with `by_source: true` and named `steps`.
 */
export type ForkMode = "branch" | "source" | "choice" | "concat" | "augment";

export interface LaneNode {
  id: string;
  path: JsonPath;
  valuePath: JsonPath;
  bypassed: boolean;
  /** Array index or branch name. */
  key: string | number;
  label: string;
  /** Id of the chain made of this lane's steps. */
  chain: string;
  items: readonly ChainItem[];
  fork: string;
  index: number;
}

/** Parallel lanes: a branch, a set of alternatives, or parallel transforms. */
export interface ForkNode extends ChainNodeBase {
  kind: "fork";
  mode: ForkMode;
  /** Step keyword holding the lanes (`branch`, `_or_`, ...). */
  keyword: string;
  /** Position of the lane container (array or named map). */
  lanesPath: JsonPath;
  named: boolean;
  lanes: readonly LaneNode[];
  /** Sibling keys of the step (`count`, `pick`, `action`, ...). */
  modifiers: Readonly<Record<string, unknown>>;
  /** Every lane holds at most one plain cell: drawn as a compact selector bank. */
  stack: boolean;
}

export type FrameMode = "cartesian" | "sequence";

/** A framed sub-chain: the stages of a cartesian product, or a nested list. */
export interface FrameNode extends ChainNodeBase {
  kind: "frame";
  mode: FrameMode;
  /** Id of the inner chain. */
  inner: string;
  items: readonly ChainItem[];
  modifiers: Readonly<Record<string, unknown>>;
}

export type ChainLeaf = StepNode | MergeNode | NoteNode | RawNode;
export type ChainItem = ChainLeaf | ForkNode | FrameNode;

/** How a chain is stored, which decides how edits rewrite it. */
export interface ChainRef {
  id: string;
  /** Position of the chain value. */
  path: JsonPath;
  /** `list`: an array of steps; `single`: one bare step; `empty`: `null`. */
  form: "list" | "single" | "empty";
  /** Keep an array even with zero or one step (root, branch lanes, stages). */
  keepList: boolean;
  items: readonly ChainItem[];
  /** Lane or frame owning this chain; `null` for the root chain. */
  owner: string | null;
}

export interface ChainModel {
  root: ChainRef;
  chains: ReadonlyMap<string, ChainRef>;
  items: ReadonlyMap<string, ChainItem>;
  lanes: ReadonlyMap<string, LaneNode>;
}

/** What the user is pointing at. */
export type ChainSelection =
  | { kind: "item"; id: string }
  | { kind: "lane"; id: string }
  | { kind: "slot"; chain: string; index: number }
  | { kind: "newLane"; fork: string };

export interface EditResult {
  document: PipelineChainDocument;
  /** Where the selection should land after the edit. */
  select?: ChainSelection | null;
}
