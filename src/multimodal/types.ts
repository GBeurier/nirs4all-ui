/**
 * Presentational contract for the multisource / multimodal teaching laboratory.
 *
 * These are controlled view-model types: a host (nirs4all-web
 * `src/multimodal/MultimodalApp.tsx`) owns React state, loading, IO, worker
 * execution and downloads, and passes already-computed values here. The shared
 * package never fetches, parses, schedules, splits, preprocesses, fits or
 * scores. It only arranges supplied values into views and reports user intent
 * through callbacks.
 *
 * The data types are deliberately structural supersets of the frozen C1
 * `LabSource` / `LabDataset` transport (IMPLEMENTATION_CONTRACT.md): a C1
 * object is directly assignable to {@link MultimodalDataset}. The
 * configuration mirrors C2 `LabConfig`; results mirror C5.
 */

import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export type MultimodalCaseId = "spectroscopy" | "genetics" | "images";

export type MultimodalStrategyId =
  | "single"
  | "early"
  | "mbpls"
  | "late"
  | "stacking"
  | "hybrid"
  | "mid"
  | "mid-stacking";

export type MultimodalModality = "spectroscopy" | "genetics" | "image";

export type MultimodalRepresentation = "signal_1d" | "tabular_numeric" | "gray_image" | "rgb_image";

/** Base learners available to stacks (one or both per source). */
export type MultimodalBaseModel = "pls" | "ridge";

export type MultimodalPartition = "train" | "test";

/** Fusion level used to group strategies in explanations. */
export type MultimodalFusionLevel = "none" | "early" | "intermediate" | "late" | "mixed";

// ---------------------------------------------------------------------------
// Data (C1-compatible)
// ---------------------------------------------------------------------------

export interface MultimodalAxis {
  values: readonly number[];
  /** e.g. `"nm"`, `"cm-1"`. Displayed verbatim. */
  unit: string;
  /** e.g. `"wavelength"`, `"raman_shift"`, `"wavenumber"`. */
  kind: string;
}

export interface MultimodalSource {
  id: string;
  label: string;
  modality: MultimodalModality;
  representation: MultimodalRepresentation;
  /** Row identities of `data`, in the source's own row order. */
  sampleIds: readonly string[];
  /** Contiguous row-major values; each row is `product(shape)` long. */
  data: ArrayLike<number>;
  /** Shape per sample, excluding the sample axis. Images are HWC (gray C=1). */
  shape: readonly number[];
  featureNames: readonly string[];
  axis?: MultimodalAxis;
  /** Same layout as `data`; `0` marks a missing / invalid cell. */
  validity?: ArrayLike<number>;
  /**
   * Optional fixed display range for image intensities. When absent the UI
   * uses `provenance.intensityRange` when it is a `[min, max]` pair, otherwise
   * the 8-bit range `[0, 255]`. Never derived from the data.
   */
  displayRange?: readonly [number, number];
  /** Optional y-axis label for 1-D signals, e.g. "Absorbance". Falls back to `provenance.valueLabel`. */
  valueLabel?: string;
  provenance?: Readonly<Record<string, unknown>>;
}

export interface MultimodalAlignmentEntry {
  sourceId: string;
  matched: number;
  missing: number;
  refused: number;
}

export interface MultimodalDataset {
  caseId: MultimodalCaseId;
  name: string;
  fingerprint: string;
  /** Canonical IO identity order. */
  sampleIds: readonly string[];
  /** Order is recipe identity. */
  sources: readonly MultimodalSource[];
  target: { name: string; unit: string; values: ArrayLike<number> };
  groupIds?: readonly string[];
  partitions?: readonly MultimodalPartition[];
  alignment: readonly MultimodalAlignmentEntry[];
  provenance?: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Data loading surface
// ---------------------------------------------------------------------------

export interface MultimodalCaseInfo {
  id: MultimodalCaseId;
  title: string;
  /** Short modality list, e.g. "Raman · NIRS · MIR". */
  modalities: string;
  goal: string;
  /** Questions an instructor can ask while exploring the case. */
  prompts: readonly string[];
}

/** A bundled, offline-generated deterministic teaching dataset (C6). */
export interface MultimodalDataPreset {
  id: string;
  caseId: MultimodalCaseId;
  label: string;
  description: string;
  /** Declared facts shown verbatim (seed, samples, sizes, noise, groups...). */
  facts?: readonly { label: string; value: string }[];
}

export interface MultimodalImportFileRole {
  role: string;
  description: string;
  required: boolean;
}

/** One supported import profile (C6), described by the host / IO lane. */
export interface MultimodalImportProfile {
  id: string;
  caseId: MultimodalCaseId;
  label: string;
  description: string;
  /** `accept` attribute for the file input, e.g. `".csv,.vcf,.png,.json"`. */
  accept: string;
  files: readonly MultimodalImportFileRole[];
  /** Host-provided downloadable matching examples. */
  examples?: readonly { label: string; href: string; fileName?: string }[];
}

export type MultimodalDataOrigin =
  | { kind: "preset"; presetId: string }
  | { kind: "import"; profileId: string; fileNames: readonly string[] };

export type MultimodalDataStatus =
  | { kind: "empty" }
  | { kind: "loading"; label: string }
  | { kind: "ready" }
  | { kind: "error"; name?: string; message: string };

export interface MultimodalRuntimeStatus {
  state: "loading" | "ready" | "unavailable";
  label: string;
  detail?: string;
  versions?: readonly { name: string; version: string }[];
}

// ---------------------------------------------------------------------------
// Configuration (C2-compatible)
// ---------------------------------------------------------------------------

export type MultimodalParamValue = number | string | boolean;

export interface MultimodalStep {
  methodId: string;
  params: Readonly<Record<string, MultimodalParamValue>>;
}

export interface MultimodalSourceChain {
  sourceId: string;
  steps: readonly MultimodalStep[];
}

/** C3 `models.neural.multibranch_regressor` fixed teaching parameters. */
export interface MultimodalCnnParams {
  filters: number;
  kernel_size: number;
  embedding_dim: number;
  head_hidden: number;
  epochs: number;
  batch_size: number;
  learning_rate: number;
  weight_decay: number;
}

export interface MultimodalValidation {
  /** Exact decimal u64 string; never round-tripped through Number. */
  seed: string;
  outerFolds: number;
  innerFolds: number;
  /** Used only when the dataset declares no partitions; otherwise null. */
  holdoutFraction: number | null;
}

export interface MultimodalConfig {
  caseId: MultimodalCaseId;
  /** Selected sources, in recipe order. */
  sourceIds: readonly string[];
  /** Strategy whose recipe is explained / drawn. */
  strategy: MultimodalStrategyId;
  /** Source used by the one-source baseline. */
  singleSourceId: string;
  sourceChains: readonly MultimodalSourceChain[];
  nComponents: number;
  ridgeAlpha: number;
  blockScaling: boolean;
  baseModels: readonly MultimodalBaseModel[];
  cnn: MultimodalCnnParams;
  validation: MultimodalValidation;
}

/**
 * One entry of a comparison batch. The host derives one execution config per
 * candidate: `{ ...config, strategy, singleSourceId: singleSourceId ?? config.singleSourceId }`.
 * Every candidate in a batch shares sources, chains and the validation protocol.
 */
export interface MultimodalCandidate {
  /** Stable key, see `candidateKey()`: `"<strategy>"` or `"single:<sourceId>"`. */
  id: string;
  strategy: MultimodalStrategyId;
  singleSourceId?: string;
}

/** Host-overridable description of an owner preprocessing operation. */
export interface MultimodalStepParamSpec {
  name: string;
  label: string;
  kind: "int" | "float" | "bool" | "enum";
  default: MultimodalParamValue;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
}

export interface MultimodalStepOption {
  methodId: string;
  label: string;
  description: string;
  /** "per-sample" needs no fitted state; "train-fitted" learns statistics inside each training scope. */
  fitScope: "per-sample" | "train-fitted";
  representations: readonly MultimodalRepresentation[];
  params: readonly MultimodalStepParamSpec[];
}

// ---------------------------------------------------------------------------
// Run state and results (C5-compatible)
// ---------------------------------------------------------------------------

export interface MultimodalProgress {
  candidateId?: string;
  strategy?: MultimodalStrategyId;
  /** Native phase, e.g. `"FIT_CV"`, `"REFIT"`, `"PREDICT"`. */
  phase?: string;
  node?: string;
  fold?: string;
  completed?: number;
  total?: number;
  message?: string;
}

export type MultimodalRunState =
  | { kind: "idle" }
  | { kind: "running"; progress: MultimodalProgress | null }
  | { kind: "cancelled"; message?: string }
  | { kind: "error"; name: string; message: string }
  | { kind: "done" };

export interface MultimodalPredictionRow {
  sampleId: string;
  observed: number;
  predicted: number;
  residual: number;
  foldId?: string;
}

export interface MultimodalFoldScore {
  foldId: string;
  n: number;
  rmse: number;
  mae: number;
  r2: number | null;
}

/** One owner-scored scope. `r2` is null when undefined (e.g. constant target). */
export interface MultimodalScopeResult {
  n: number;
  rmse: number;
  mae: number;
  r2: number | null;
  rows: readonly MultimodalPredictionRow[];
  folds?: readonly MultimodalFoldScore[];
}

export interface MultimodalTrainingCurve {
  label: string;
  epochs: readonly number[];
  loss: readonly number[];
}

export interface MultimodalCandidateResult {
  candidateId: string;
  strategy: MultimodalStrategyId;
  singleSourceId?: string;
  sourceIds: readonly string[];
  /** Exact owner algorithm label, displayed verbatim. */
  algorithm: string;
  /** Out-of-fold predictions over the calibration set (outer folds). */
  oof: MultimodalScopeResult;
  /** Retained test after the declared refit; null when no held-out set. */
  holdout: MultimodalScopeResult | null;
  elapsedMs: number;
  recipeFingerprint: string;
  foldsFingerprint: string;
  hyperparameters: "fixed";
  /** Owner-supplied facts, e.g. block widths, epochs run, final loss. */
  diagnostics?: readonly { label: string; value: string }[];
  /** Owner-supplied training-loss trajectory for learned networks. */
  trainingCurve?: MultimodalTrainingCurve;
}

export interface MultimodalRefusal {
  candidateId: string;
  strategy: MultimodalStrategyId;
  name: string;
  message: string;
}

export interface MultimodalRunResult {
  dataFingerprint: string;
  /** Fingerprint of the configuration + candidate list that produced these results. */
  configFingerprint: string;
  foldsFingerprint: string;
  validation: MultimodalValidation;
  candidates: readonly MultimodalCandidateResult[];
  refusals?: readonly MultimodalRefusal[];
  ownerVersions: Readonly<Record<string, string>>;
  elapsedMs: number;
  /** Sample counts per scope as constructed by the native owner. */
  counts?: { calibration: number; holdout: number; groups?: number };
}

// ---------------------------------------------------------------------------
// Workbench props
// ---------------------------------------------------------------------------

export interface MultimodalWorkbenchProps {
  // header
  /** Host brand mark (e.g. `<img src=".../brand/icon.svg">`). */
  brand?: ReactNode;
  backHref: string;
  backLabel?: string;
  runtime: MultimodalRuntimeStatus;

  // case
  caseId: MultimodalCaseId;
  /** Defaults to `MULTIMODAL_CASES`. */
  cases?: readonly MultimodalCaseInfo[];
  onCaseChange: (caseId: MultimodalCaseId) => void;

  // data
  presets: readonly MultimodalDataPreset[];
  importProfiles: readonly MultimodalImportProfile[];
  dataOrigin: MultimodalDataOrigin | null;
  dataStatus: MultimodalDataStatus;
  dataset: MultimodalDataset | null;
  onLoadPreset: (presetId: string) => void;
  onImportFiles: (profileId: string, files: readonly File[]) => void;
  /**
   * Host-built import wizard shown in "Import your files" instead of the
   * manifest-only profile cards (example downloads stay visible).
   */
  datasetBuilder?: ReactNode;

  // linked selection
  selectedSampleId: string | null;
  onSelectSample: (sampleId: string | null) => void;

  // configuration
  config: MultimodalConfig | null;
  /** Host must invalidate previous results when this fires. */
  onConfigChange: (next: MultimodalConfig) => void;
  /** Restore fixed teaching defaults for the loaded data (never replaces data). */
  onRestoreTeachingConfig: () => void;
  candidates: readonly MultimodalCandidate[];
  /** Host must invalidate previous results when this fires. */
  onCandidatesChange: (next: readonly MultimodalCandidate[]) => void;
  /** Defaults to `MULTIMODAL_STEP_CATALOG`. */
  stepCatalog?: readonly MultimodalStepOption[];

  // execution
  run: MultimodalRunState;
  onRun: () => void;
  onCancel: () => void;
  results: MultimodalRunResult | null;

  // export
  onExportConfig: () => void;
  onExportResults: () => void;
}
