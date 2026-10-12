/**
 * nirs4all-ui `playground` domain — the Playground capsule.
 *
 * Explore a spectral dataset and try operator chains live: a pipeline timeline
 * with a preview cursor, linked views (spectra lines / bands / density with
 * input-output comparison, PCA/UMAP scores, target distribution, T²–Q outlier
 * map, loadings, wavelength–target correlation, folds, replicates, sample
 * table), one selection and one color-by shared by every view.
 *
 * Host boundary: the capsule never executes operators. It emits
 * {@link PlaygroundRunRequest}s (effective pipeline + the analyses the visible
 * views need) and renders the host's {@link PlaygroundResult}. Styles ship at
 * `nirs4all-ui/assets/workbench.css`.
 *
 * Consumed as `nirs4all-ui/playground`.
 */

export * from "./types.js";
export * from "./pipeline.js";
export * from "./model.js";
export {
  PLAYGROUND_STRINGS_EN,
  PLAYGROUND_STRINGS_FR,
  resolvePlaygroundStrings,
  type PlaygroundLocale,
  type PlaygroundStrings,
} from "./locale.js";
export { OperatorPicker, OPERATOR_KIND_COLORS, OPERATOR_KIND_LABELS } from "./OperatorPicker.js";
export { PipelinePanel, DatasetCard, type PipelinePanelProps } from "./PipelinePanel.js";
export { Playground, DEFAULT_PLAYGROUND_LAYOUT, type PlaygroundProps } from "./Playground.js";
