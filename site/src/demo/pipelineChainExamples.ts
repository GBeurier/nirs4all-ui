/**
 * Trial data for the pipeline chain editor: an illustrative operator catalogue
 * and a few pipelines to open.
 *
 * The catalogue is a mock for trying the component. Its parameter lists are
 * abbreviated and it is not an authoritative registry; a host passes its own
 * (Studio's node registry, or `projectN4mManifest()` output). The pipelines are
 * canonical nirs4all JSON: two come verbatim from the Studio preset snapshot.
 */

import { getStudioPipelinePresets } from "../../../src/pipelines/index.js";
import type { PipelineCatalog, PipelineChainDocument, PipelineOperatorDefinition, PipelineOperatorParameter } from "../../../src/pipelineEditor/index.js";

const int = (name: string, fallback: number | undefined, min?: number, max?: number, extra: Partial<PipelineOperatorParameter> = {}): PipelineOperatorParameter =>
  ({ name, type: "int", ...(fallback !== undefined ? { default: fallback } : {}), ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}), ...extra });
const float = (name: string, fallback: number | undefined, min?: number, max?: number, extra: Partial<PipelineOperatorParameter> = {}): PipelineOperatorParameter =>
  ({ name, type: "float", ...(fallback !== undefined ? { default: fallback } : {}), ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}), ...extra });
const bool = (name: string, fallback: boolean): PipelineOperatorParameter => ({ name, type: "bool", default: fallback });
const choice = (name: string, fallback: string | number, values: ReadonlyArray<string | number>): PipelineOperatorParameter =>
  ({ name, type: "select", default: fallback, options: values.map((value) => ({ value, label: String(value) })) });
const seed = int("random_state", undefined, 0, undefined, { description: "Seed" });

function operator(
  type: string,
  category: string,
  name: string,
  classPath: string,
  description: string,
  parameters: PipelineOperatorParameter[] = [],
  extra: Partial<PipelineOperatorDefinition> = {},
): PipelineOperatorDefinition {
  return { id: `${type}.${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, name, type, category, classPath, description, parameters, ...extra };
}

const T = "nirs4all.operators.transforms";

const OPERATORS: PipelineOperatorDefinition[] = [
  operator("preprocessing", "Scatter correction", "SNV", `${T}.StandardNormalVariate`, "Standard normal variate: centers and scales each spectrum.", [bool("with_mean", true), bool("with_std", true)]),
  operator("preprocessing", "Scatter correction", "MSC", `${T}.MultiplicativeScatterCorrection`, "Multiplicative scatter correction against a reference spectrum."),
  operator("preprocessing", "Scatter correction", "EMSC", `${T}.ExtendedMultiplicativeScatterCorrection`, "Extended MSC with polynomial baseline terms.", [int("degree", 2, 0, 6)]),
  operator("preprocessing", "Derivatives", "Savitzky-Golay", `${T}.SavitzkyGolay`, "Polynomial smoothing and derivation over a moving window.", [
    int("window_length", 11, 3, 101, { step: 2, description: "Odd window size" }),
    int("polyorder", 2, 0, 6),
    choice("deriv", 0, [0, 1, 2]),
  ]),
  operator("preprocessing", "Derivatives", "First derivative", `${T}.FirstDerivative`, "Finite-difference first derivative."),
  operator("preprocessing", "Smoothing", "Gaussian", `${T}.Gaussian`, "Gaussian filter along the wavelength axis.", [float("sigma", 1, 0.1, 20), int("order", 2, 0, 3)]),
  operator("preprocessing", "Baseline", "Detrend", `${T}.Detrend`, "Removes a fitted trend from each spectrum."),
  operator("preprocessing", "Baseline", "ASLS baseline", `${T}.ASLSBaseline`, "Asymmetric least squares baseline correction."),
  operator("preprocessing", "Orthogonalization", "OSC", `${T}.OSC`, "Orthogonal signal correction: removes variation unrelated to the target.", [int("n_components", 1, 1, 10)]),
  operator("preprocessing", "Scaling", "Standard scaler", "sklearn.preprocessing.StandardScaler", "Column-wise centering and scaling.", [bool("with_mean", true), bool("with_std", true)]),
  operator("preprocessing", "Scaling", "Min-max scaler", "sklearn.preprocessing.MinMaxScaler", "Rescales each feature to a range."),
  operator("preprocessing", "Projection", "PCA", "sklearn.decomposition.PCA", "Principal component projection.", [int("n_components", undefined, 1, 200), bool("whiten", false)]),
  operator("y_processing", "Target", "Target standard scaler", "sklearn.preprocessing.StandardScaler", "Scales the target for fitting; predictions are mapped back.", [bool("with_mean", true), bool("with_std", true)], { id: "y_processing.standard_scaler" }),
  operator("y_processing", "Target", "Target min-max scaler", "sklearn.preprocessing.MinMaxScaler", "Rescales the target to a range.", [], { id: "y_processing.minmax_scaler" }),
  operator("splitting", "Cross-validation", "K-fold", "sklearn.model_selection.KFold", "K consecutive folds.", [int("n_splits", 5, 2, 20), bool("shuffle", false), seed]),
  operator("splitting", "Cross-validation", "Shuffle split", "sklearn.model_selection.ShuffleSplit", "Random train/validation permutations.", [int("n_splits", 10, 1, 100), float("test_size", undefined, 0.05, 0.95), seed]),
  operator("splitting", "Cross-validation", "SPXY fold", "nirs4all.operators.splitters.SPXYFold", "Folds built from joint X-Y distances.", [int("n_splits", 5, 2, 20), seed]),
  operator("model", "PLS", "PLS regression", "sklearn.cross_decomposition.PLSRegression", "Partial least squares regression.", [int("n_components", 2, 1, 100), bool("scale", true), int("max_iter", 500, 50, 5000)]),
  operator("model", "PLS", "AOM-PLS", "nirs4all.operators.models.sklearn.aom_pls.AOMPLSRegressor", "PLS with adaptive operator mixing.", [int("max_components", undefined, 1, 60), bool("center_x", true), bool("scale_x", false)]),
  operator("model", "Linear", "Ridge", "sklearn.linear_model.Ridge", "L2-regularized linear regression.", [float("alpha", 1, 0, 1e6), bool("fit_intercept", true), choice("solver", "auto", ["auto", "svd", "cholesky", "lsqr"])]),
  operator("model", "Trees", "Random forest", "sklearn.ensemble.RandomForestRegressor", "Bagged decision trees.", [int("n_estimators", 100, 10, 2000), int("max_depth", undefined, 1, 64), seed]),
  operator("model", "Trees", "LightGBM", "lightgbm.LGBMRegressor", "Gradient-boosted trees (LightGBM).", [int("n_estimators", 100, 10, 5000), int("max_depth", -1, -1, 64), float("learning_rate", 0.1, 0.001, 1), seed, int("verbose", undefined)]),
  operator("model", "Trees", "XGBoost", "xgboost.XGBRegressor", "Gradient-boosted trees (XGBoost).", [int("n_estimators", undefined, 10, 5000), int("max_depth", undefined, 1, 64), float("learning_rate", undefined, 0.001, 1), seed]),
  operator("model", "Foundation", "TabPFN", "tabpfn.TabPFNRegressor", "Tabular foundation model.", [bool("ignore_pretraining_limits", false)]),
  operator("model", "Stacking", "Meta-model", "nirs4all.operators.models.MetaModel", "Trains on the out-of-fold predictions of earlier models."),
];

export const DEMO_CATALOG: PipelineCatalog = {
  operators: OPERATORS,
  mergeStrategies: [
    { value: "features", label: "features", description: "Concatenate the feature outputs of the lanes." },
    { value: "predictions", label: "predictions", description: "Use the lanes' model predictions as features." },
    { value: "all", label: "all", description: "Features and predictions of every lane." },
    { value: "concat", label: "concat" },
    { value: "auto", label: "auto" },
  ],
};

export interface PipelineChainExample {
  id: string;
  label: string;
  hint: string;
  document: PipelineChainDocument;
}

const SNV = `${T}.StandardNormalVariate`;
const MSC = `${T}.MultiplicativeScatterCorrection`;
const savgol = (window: number, deriv: number) => ({ class: `${T}.SavitzkyGolay`, params: { window_length: window, polyorder: 2, deriv } });
const kfold = { class: "sklearn.model_selection.KFold", params: { n_splits: 5, shuffle: true, random_state: 7 } };
const pls = (n: number, name = `PLS-${n}`) => ({ model: { class: "sklearn.cross_decomposition.PLSRegression", params: { n_components: n } }, name });

function preset(id: string): PipelineChainDocument {
  const found = getStudioPipelinePresets().find((candidate) => candidate.id === id);
  const variant = found?.variants?.regression ?? found?.variants?.classification;
  return { name: found?.name ?? id, ...(found?.description ? { description: found.description } : {}), pipeline: variant?.pipeline ?? found?.pipeline ?? [] };
}

export function pipelineChainExamples(): PipelineChainExample[] {
  return [
    {
      id: "linear",
      label: "Linear chain",
      hint: "MSC, target scaling, 5-fold CV and one PLS model.",
      document: {
        name: "MSC + PLS",
        pipeline: [
          { class: MSC },
          { y_processing: { class: "sklearn.preprocessing.StandardScaler" } },
          kfold,
          pls(10),
        ],
      },
    },
    {
      id: "branches",
      label: "Branches and merge",
      hint: "Three preprocessing lanes joined as features before the model.",
      document: {
        name: "Preprocessing branches",
        pipeline: [
          kfold,
          { branch: [[SNV, savgol(15, 1)], [MSC], [`${T}.Detrend`, { class: `${T}.Gaussian`, params: { sigma: 2, order: 0 } }]] },
          { merge: "features" },
          { class: "sklearn.preprocessing.StandardScaler", params: { with_std: false } },
          pls(12),
          { model: { class: "sklearn.linear_model.Ridge", params: { alpha: 0.5 } }, name: "Ridge" },
        ],
      },
    },
    {
      id: "stacking",
      label: "Stacking",
      hint: "Named model branches, merged predictions and a meta-model.",
      document: {
        name: "Stacking with merge",
        pipeline: [
          { class: "sklearn.model_selection.ShuffleSplit", params: { n_splits: 3, test_size: 0.25, random_state: 42 } },
          {
            branch: {
              pls_branch: [SNV, pls(5)],
              rf_branch: [MSC, { model: { class: "sklearn.ensemble.RandomForestRegressor", params: { n_estimators: 50, max_depth: 5, random_state: 42 } }, name: "RF-shallow" }],
              ridge_branch: [`${T}.FirstDerivative`, { class: "sklearn.decomposition.PCA", params: { n_components: 20 } }, { model: { class: "sklearn.linear_model.Ridge", params: { alpha: 0.1 } }, name: "Ridge-PCA" }],
            },
          },
          {
            merge: {
              predictions: [{ branch: 0, select: "best", metric: "rmse" }, { branch: 1, select: { top_k: 2 }, metric: "rmse" }, { branch: 2, select: "all" }],
              features: [0],
              output_as: "features",
              on_missing: "warn",
            },
          },
          { model: { class: "nirs4all.operators.models.MetaModel", params: { model: { class: "sklearn.linear_model.Ridge", params: { alpha: 0.5 } }, source_models: "all" } }, name: "Meta-Ridge" },
        ],
      },
    },
    {
      id: "multisource",
      label: "Multisource",
      hint: "Early fusion: one preprocessing lane per source, then source features concatenated before one PLS.",
      document: {
        name: "NIR + Raman + markers",
        pipeline: [
          kfold,
          { source_branch: { NIR: [SNV, savgol(15, 1)], Raman: [MSC], markers: [{ class: "sklearn.preprocessing.StandardScaler" }] } },
          { merge_sources: "concat" },
          pls(10),
        ],
      },
    },
    {
      id: "late-fusion",
      label: "Late fusion",
      hint: "One model per source, out-of-fold predictions merged and passed to a meta-model.",
      document: {
        name: "Per-source models + stacking",
        pipeline: [
          kfold,
          { branch: { by_source: true, steps: { NIR: [SNV, pls(8)], Raman: [MSC, pls(5)], markers: [{ class: "sklearn.preprocessing.StandardScaler" }, { model: { class: "sklearn.linear_model.Ridge", params: { alpha: 1 } }, name: "Ridge" }] } } },
          { merge: "predictions" },
          { model: { class: "sklearn.linear_model.Ridge", params: { alpha: 0.5 } }, name: "Meta-Ridge" },
        ],
      },
    },
    { id: "sweep", label: "Sweep", hint: "Studio preset: alternatives plus a swept component count.", document: preset("simple_pls") },
    { id: "search", label: "Cartesian search", hint: "Studio preset: four cartesian stages and finetuned models.", document: preset("complex_pls") },
    {
      id: "long",
      label: "Long pipeline",
      hint: "Wraps onto rows; includes steps the editor keeps as raw JSON.",
      document: {
        name: "Field campaign 2026",
        description: "Illustrative long pipeline.",
        pipeline: [
          { _comment: "Outliers are tagged upstream; this recipe is the nightly candidate." },
          { sample_filter: { filters: [{ class: "nirs4all.operators.filters.YOutlierFilter", params: { method: "iqr" } }], mode: "any", report: true } },
          { y_processing: { class: "sklearn.preprocessing.MinMaxScaler" } },
          { _or_: [SNV, MSC, null] },
          savgol(11, 1),
          { _bypassed_: { class: `${T}.OSC`, params: { n_components: 2 } } },
          { feature_augmentation: [SNV, savgol(21, 2), `${T}.Detrend`], action: "extend" },
          { class: "nirs4all.operators.splitters.SPXYFold", params: { n_splits: 3, random_state: 42 } },
          { branch: { by_metadata: "site" } },
          { class: "sklearn.preprocessing.StandardScaler", params: { with_std: false } },
          {
            branch: [
              [{ model: { class: "sklearn.cross_decomposition.PLSRegression", params: { n_components: { _range_: [4, 20, 4] }, scale: false } }, name: "PLS" }],
              [{ class: "sklearn.decomposition.PCA", params: { n_components: 30 } }, { model: { class: "lightgbm.LGBMRegressor", params: { n_estimators: 300, learning_rate: { _log_range_: [0.01, 0.3, 4] }, verbose: -1 } }, name: "LightGBM" }],
              { _bypassed_: [{ model: { class: "tabpfn.TabPFNRegressor", params: { ignore_pretraining_limits: true } }, name: "TabPFN" }] },
            ],
          },
          { merge: "predictions" },
          { model: { class: "sklearn.linear_model.Ridge" }, name: "Ridge-Stack", finetune_params: { n_trials: 30, sampler: "tpe", model_params: { alpha: ["log_float", 0.001, 100] } } },
          "chart_2d",
        ],
      },
    },
    { id: "empty", label: "Empty", hint: "Start from nothing.", document: { name: "", pipeline: [] } },
  ];
}
