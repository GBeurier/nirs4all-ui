/**
 * Host contract of the Playground capsule.
 *
 * The capsule never executes operators. It edits a pipeline, decides which
 * analyses the visible views need, and emits a {@link PlaygroundRunRequest};
 * the host (Studio sidecar, Web/WASM runtime, a notebook bridge…) executes it
 * and passes back a {@link PlaygroundResult}. Every per-sample array the host
 * returns is aligned to *output rows*; `rows` maps output rows back to stable
 * dataset rows so selection survives filters, augmentation and reordering.
 */

import type { RowColumn } from "../workbench/colorBy.js";
import type { SpectraInput } from "../workbench/matrix.js";

export type PlaygroundTaskKind = "regression" | "classification";

export interface PlaygroundTarget {
  name: string;
  kind: PlaygroundTaskKind;
  /** One value per dataset row (`null` = missing). */
  values: ReadonlyArray<number | string | null>;
  unit?: string;
  /** Class order for classification targets. */
  classes?: readonly string[];
}

/** The raw dataset the pipeline starts from. */
export interface PlaygroundDataset {
  id: string;
  name: string;
  /** `n × p` raw spectra (rows = samples). */
  spectra: SpectraInput;
  wavelengths: readonly number[];
  /** Axis unit, e.g. `"nm"` or `"cm⁻¹"`. */
  unit?: string;
  /** Signal name for the y axis, e.g. `"Absorbance"`. */
  signal?: string;
  sampleIds?: readonly string[];
  /** Candidate targets; the first is active by default. */
  targets?: readonly PlaygroundTarget[];
  /** Per-row partition label (`"train"`, `"test"`, …). */
  partition?: ReadonlyArray<string | null>;
  /** Extra per-row columns (metadata) for coloring, grouping and tables. */
  metadata?: readonly RowColumn[];
  /** Default metadata key identifying biological replicates (repetitions view). */
  groupColumn?: string;
  /** Free text (origin, instrument, DOI…). */
  description?: string;
}

export type OperatorKind = "preprocessing" | "feature" | "augmentation" | "splitting" | "filter" | "other";

export type OperatorParamType = "int" | "float" | "bool" | "select" | "string" | "column" | "range";

export interface OperatorParamOption {
  value: string | number | boolean;
  label?: string;
}

export interface OperatorParam {
  name: string;
  label?: string;
  type: OperatorParamType;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: readonly OperatorParamOption[];
  help?: string;
  /** Hide behind "advanced" in the step card. */
  advanced?: boolean;
}

/** Built-in roles the capsule can wire selection / range actions to. */
export type OperatorSpecialRole = "sampleFilter" | "crop";

export interface OperatorDefinition {
  /** Stable id the host resolves (`"snv"`, `"n4m:savgol"`, a class path…). */
  id: string;
  name: string;
  kind: OperatorKind;
  /** Palette grouping (e.g. "Scatter correction", "Derivatives"). */
  category?: string;
  description?: string;
  params?: readonly OperatorParam[];
  tags?: readonly string[];
  /** `core` operators are listed first and shown in the compact palette. */
  tier?: "core" | "standard" | "advanced";
  /** At most one step of this operator (e.g. a splitter). */
  singleton?: boolean;
  /**
   * `sampleFilter`: params `{ rows: number[]; mode: "keep" | "remove" }` (dataset rows).
   * `crop`: params `{ min: number; max: number }` (axis units).
   */
  special?: OperatorSpecialRole;
}

export interface PipelineStep {
  id: string;
  operatorId: string;
  params: Record<string, unknown>;
  enabled: boolean;
  /** Optional user label shown instead of the operator name. */
  label?: string;
}

/** Distance between a replicate and its group reference. */
export type RepetitionMetric = "euclidean" | "manhattan" | "cosine" | "spectralAngle" | "correlation" | "mahalanobis" | "pca";

/** What each replicate is compared to. */
export type RepetitionReference = "mean" | "median" | "leaveOneOut" | "first";

export interface PlaygroundRepetitionNeeds {
  /** Metadata key identifying biological replicates. */
  groupBy: string;
  metric: RepetitionMetric;
  reference: RepetitionReference;
}

/** Which analyses the currently visible views need from the host. */
export interface PlaygroundAnalysisNeeds {
  /** Score projection for the scores view (and outlier map when PCA). */
  projection: "pca" | "umap" | null;
  /**
   * Number of components requested for the projection (UMAP `n_components`)
   * and the loadings; at least 3 so the scores view can switch to 3D.
   */
  components: number;
  /** Hotelling T² and Q residuals (SPE) with their confidence limits. */
  outliers: boolean;
  /** PCA loadings per component (k × p) for the loadings view. */
  loadings: boolean;
  /** Split / fold assignment when the pipeline contains a splitter. */
  folds: boolean;
  /** Replicate distances, computed by the host with these settings. */
  repetitions: PlaygroundRepetitionNeeds | null;
}

export interface PlaygroundRunRequest {
  /** Monotonic id; echo it in `PlaygroundResult.requestId`. */
  id: string;
  datasetId: string;
  /** Enabled steps up to the preview cursor, in order. */
  steps: readonly PipelineStep[];
  /** Id of the last applied step, `null` for raw data. */
  cursorStepId: string | null;
  needs: PlaygroundAnalysisNeeds;
  /** Active target name, when the dataset has targets. */
  target?: string;
}

export interface StepOutcome {
  stepId: string;
  status: "ok" | "error" | "skipped";
  durationMs?: number;
  /** Output shape `[rows, columns]` after the step. */
  shape?: readonly [number, number];
  message?: string;
  /** Dataset rows removed by a filter step. */
  removedRows?: readonly number[];
  /** Dataset rows flagged (not removed) by a filter step. */
  taggedRows?: readonly number[];
}

export interface PlaygroundProjection {
  method: string;
  /** One coordinate vector per output row (`n × k`). */
  coordinates: ReadonlyArray<ArrayLike<number>>;
  /** Explained-variance fraction per component (PCA). */
  explained?: readonly number[];
}

export interface PlaygroundOutliers {
  /** Hotelling T² per output row. */
  t2: ArrayLike<number>;
  /** Q residual (SPE) per output row. */
  q: ArrayLike<number>;
  t2Limit?: number;
  qLimit?: number;
  /** Confidence level of the limits (e.g. 0.95). */
  confidence?: number;
  components?: number;
}

export interface PlaygroundLoadings {
  /** One loading vector per component, aligned to the output wavelengths. */
  components: ReadonlyArray<ArrayLike<number>>;
  explained?: readonly number[];
}

export interface PlaygroundFold {
  label: string;
  /** Output rows used for fitting / held out in this fold. */
  train: readonly number[];
  test: readonly number[];
}

export interface PlaygroundFolds {
  splitter?: string;
  kind: "cv" | "holdout";
  folds: readonly PlaygroundFold[];
}

export interface PlaygroundRepetitions {
  /** Metric actually used (hosts may fall back when one is unsupported). */
  metric: string;
  /** Replicate group per output row. */
  groups: ReadonlyArray<string | null>;
  /** Distance of each output row to its group reference. */
  distance: ArrayLike<number>;
  /** Distance above which a replicate is flagged. */
  threshold?: number;
}

export interface PlaygroundResult {
  /** Echo of the request this result answers (stale results stay visible). */
  requestId?: string;
  /** Output spectra after the last applied step. */
  spectra: SpectraInput;
  wavelengths: readonly number[];
  unit?: string;
  signal?: string;
  /** Dataset row of each output row (identity when omitted). */
  rows?: readonly number[];
  steps?: readonly StepOutcome[];
  projection?: PlaygroundProjection | null;
  outliers?: PlaygroundOutliers | null;
  loadings?: PlaygroundLoadings | null;
  folds?: PlaygroundFolds | null;
  repetitions?: PlaygroundRepetitions | null;
  durationMs?: number;
  warnings?: readonly string[];
}

export type PlaygroundStatus = "idle" | "running" | "error";

export type PlaygroundViewId =
  | "spectra"
  | "scores"
  | "target"
  | "outliers"
  | "loadings"
  | "correlation"
  | "folds"
  | "repetitions"
  | "variance"
  | "groupMeans"
  | "heatmap"
  | "samples";

export type PlaygroundScope = "all" | "selection" | `partition:${string}`;
