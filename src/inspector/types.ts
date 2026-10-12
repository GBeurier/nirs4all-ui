/**
 * Host contract of the Inspector capsule.
 *
 * The host supplies trained *chains* (one scored preprocessing → model
 * variant each, from runs, a workspace, a benchmark export…) and, on demand,
 * the per-sample predictions of the chains the user compares. The capsule
 * ranks, filters, groups and visualizes; it never trains or rescores.
 */

import type { ChainStep } from "../chains/types.js";

export type InspectorTask = "regression" | "classification";

/** One scoring context: metric × partition × protocol, with its direction. */
export interface ScoreRef {
  key: string;
  label: string;
  metric: string;
  /** `"train"`, `"validation"`, `"test"`… */
  partition: string;
  /** `"cv"` (fold aggregate), `"final"` (refit model)… */
  protocol?: string;
  lowerIsBetter: boolean;
}

export interface InspectorChain {
  id: string;
  /** Display label; defaults to `model · step › step`. */
  label?: string;
  runId?: string;
  runLabel?: string;
  pipelineId?: string;
  pipelineLabel?: string;
  dataset?: string;
  task: InspectorTask;
  target?: string;
  /** Model name, e.g. `"PLSRegression"`. */
  model: string;
  /** Coarser model family for grouping, e.g. `"PLS"`, `"Tree ensemble"`. */
  modelFamily?: string;
  /** Ordered steps (preprocessing → model), shared with the `chains` domain. */
  steps: readonly ChainStep[];
  /** Hyper-parameters of the selected / refit model. */
  params?: Readonly<Record<string, number | string | boolean | null>>;
  /** Score per `ScoreRef.key` (`null` = not computed). */
  scores: Readonly<Record<string, number | null>>;
  /** Per-fold scores per `ScoreRef.key`. */
  foldScores?: Readonly<Record<string, readonly number[]>>;
  fitTimeMs?: number;
  status?: "ok" | "partial" | "failed";
  /** Extra per-chain attributes offered for coloring / grouping. */
  attributes?: Readonly<Record<string, string | number | null>>;
}

/** Per-sample predictions of one chain (requested for compared chains). */
export interface ChainPredictions {
  chainId: string;
  /** Stable sample identity, used to link the same sample across chains. */
  sampleKeys: readonly string[];
  yTrue: ReadonlyArray<number | string>;
  yPred: ReadonlyArray<number | string>;
  /** Partition per sample (`"train"`, `"validation"`, `"test"`). */
  partition?: ReadonlyArray<string | null>;
  /** Fold per sample (out-of-fold predictions). */
  fold?: ReadonlyArray<string | number | null>;
  classes?: readonly string[];
}

export type InspectorViewId =
  | "overview"
  | "top"
  | "landscape"
  | "datasets"
  | "pareto"
  | "compare"
  | "flow"
  | "order"
  | "agreement"
  | "heatmap"
  | "generalization"
  | "parity"
  | "residuals"
  | "folds"
  | "hyperparams"
  | "effects"
  | "confusion"
  | "samples"
  | "table";

/** Chain facets offered for filtering, grouping, coloring and pivots. */
export type ChainFacet = "model" | "modelFamily" | "dataset" | "run" | "preprocessing" | "firstStep" | "task" | "status" | `attr:${string}`;
