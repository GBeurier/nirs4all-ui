// Shared test fixtures for the `pipelineEditor` domain (not exported from the barrel).
import type { PipelineCatalog, PipelineChainDocument } from "../types.js";

export const SNV = "nirs4all.operators.transforms.StandardNormalVariate";
export const MSC = "nirs4all.operators.transforms.MultiplicativeScatterCorrection";
export const SAVGOL = "nirs4all.operators.transforms.SavitzkyGolay";
export const KFOLD = "sklearn.model_selection.KFold";
export const PLS = "sklearn.cross_decomposition.PLSRegression";
export const SCALER = "sklearn.preprocessing.StandardScaler";

export const CATALOG: PipelineCatalog = {
  operators: [
    { id: "pp.snv", name: "SNV", type: "preprocessing", classPath: SNV, parameters: [] },
    { id: "pp.msc", name: "MSC", type: "preprocessing", classPath: MSC, parameters: [] },
    {
      id: "pp.savgol", name: "Savitzky-Golay", type: "preprocessing", category: "Derivatives", classPath: SAVGOL,
      aliases: ["nirs4all.operators.transforms.nirs.SavitzkyGolay"],
      parameters: [{ name: "window_length", type: "int", default: 11, min: 3 }, { name: "deriv", type: "select", default: 0, options: [{ value: 0, label: "0" }, { value: 1, label: "1" }] }],
    },
    { id: "pp.scaler", name: "Standard scaler", type: "preprocessing", classPath: SCALER, parameters: [] },
    { id: "y.scaler", name: "Target scaler", type: "y_processing", classPath: SCALER, parameters: [] },
    { id: "split.kfold", name: "K-fold", type: "splitting", classPath: KFOLD, parameters: [{ name: "n_splits", type: "int", default: 5 }] },
    { id: "model.pls", name: "PLS regression", type: "model", category: "PLS", classPath: PLS, parameters: [{ name: "n_components", type: "int", default: 2, min: 1 }] },
  ],
};

export const savgol = (window: number) => ({ class: SAVGOL, params: { window_length: window } });
export const pls = (n: number) => ({ model: { class: PLS, params: { n_components: n } }, name: `PLS-${n}` });

/** KFold, a three-lane branch, a merge and a model. */
export function branchDocument(): PipelineChainDocument {
  return {
    name: "Branches",
    pipeline: [
      { class: KFOLD, params: { n_splits: 5 } },
      { branch: [[SNV, savgol(15)], [MSC], []] },
      { merge: "features" },
      pls(10),
    ],
  };
}

/** Alternatives with a skip option, then a swept and tuned model. */
export function searchDocument(): PipelineChainDocument {
  return {
    pipeline: [
      { _or_: [null, SNV, savgol(21)], count: 2 },
      KFOLD,
      { model: PLS, name: "PLS-Sweep", _range_: [2, 30, 4], param: "n_components" },
      { model: { class: PLS, params: { scale: false } }, name: "PLS-Tuned", finetune_params: { n_trials: 25, sampler: "tpe", model_params: { n_components: ["int", 1, 25] } } },
    ],
  };
}
