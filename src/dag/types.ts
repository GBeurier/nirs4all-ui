/**
 * Package-level view-model contract for the interactive compiled-DAG viewer.
 *
 * This is a small, framework-free contract — deliberately NOT a dependency on
 * `dag-ml`. A host adapts a real compiled `GraphSpec` / `ExecutionPlan` into a
 * {@link DagGraph} (see {@link file://./fromCompiledGraph.ts fromCompiledGraph}),
 * or builds one directly. Everything downstream (hierarchy, collapse, layout,
 * rendering) operates on this contract only.
 */

/** Execution/health state a host may attach to a node. */
export type DagNodeStatus = "idle" | "running" | "done" | "failed" | "skipped";

/** Edge semantics — mirrors dag-ml `EdgeContract.kind` (`PortKind`). */
export type DagEdgeKind = "data" | "prediction" | "target" | "artifact" | "metric" | "control";

/** Orientation of the layered layout. */
export type DagDirection = "LR" | "TB";

/**
 * Coarse visual category a node's raw `kind` maps to. Drives color + legend so
 * a graph mixing ~20 dag-ml `NodeKind`s still reads as a handful of families.
 */
export type DagCategory =
  | "data"
  | "split"
  | "preprocess"
  | "model"
  | "merge"
  | "branch"
  | "search"
  | "aggregate"
  | "subgraph"
  | "chart"
  | "group"
  | "unknown";

/** One node in a compiled graph. `id` must be unique within the graph. */
export interface DagNode {
  id: string;
  /** Raw dag-ml `NodeKind` (or any free tag); resolved to a {@link DagCategory}. */
  kind?: string;
  /** Display name; defaults to the last path segment of `id`. */
  label?: string;
  /** Secondary line (e.g. operator type / a params digest). */
  detail?: string;
  /**
   * Hierarchical group path, outermost → innermost (e.g. `["branch:b0"]` or
   * `["stack", "meta"]`). Nodes sharing a prefix form a collapsible cluster.
   * Omit for a top-level node.
   */
  group?: readonly string[];
  status?: DagNodeStatus;
  /** Fan-out / variant-expansion count shown as a `×N` badge. */
  variants?: number;
  /** Optional scalar surfaced in the node card and inspector. */
  metric?: number;
  /** Free passthrough shown in the inspector panel. */
  meta?: Readonly<Record<string, unknown>>;
}

/** One directed dependency between two nodes (by `id`). */
export interface DagEdge {
  source: string;
  target: string;
  kind?: DagEdgeKind;
  /** Out-of-fold / stacking dependency — rendered emphasized. */
  oof?: boolean;
  label?: string;
}

/** A whole compiled graph in view-model form. */
export interface DagGraph {
  nodes: readonly DagNode[];
  edges: readonly DagEdge[];
  /** Optional display name for the toolbar. */
  name?: string;
}

const KIND_TO_CATEGORY: Readonly<Record<string, DagCategory>> = {
  // data sources / restructuring
  source: "data",
  adapter: "data",
  restructure: "data",
  source_join: "data",
  data: "data",
  // splits / cross-validation
  split: "split",
  // preprocessing / feature ops
  transform: "preprocess",
  y_transform: "preprocess",
  augmentation: "preprocess",
  exclude: "preprocess",
  tag: "preprocess",
  preprocess: "preprocess",
  // estimators
  model: "model",
  predict: "model",
  // merges / joins
  feature_join: "merge",
  prediction_join: "merge",
  mixed_join: "merge",
  merge: "merge",
  join: "merge",
  // fan-out
  fork: "branch",
  map: "branch",
  branch: "branch",
  // variant generation / tuning / selection
  generator: "search",
  tuner: "search",
  select: "search",
  // aggregation
  aggregator: "aggregate",
  aggregate: "aggregate",
  // nested graph / charts
  subgraph: "subgraph",
  chart: "chart",
};

/** Resolve a raw `kind` string to its coarse visual {@link DagCategory}. */
export function dagCategory(kind: string | undefined): DagCategory {
  if (!kind) return "unknown";
  return KIND_TO_CATEGORY[kind] ?? "unknown";
}
