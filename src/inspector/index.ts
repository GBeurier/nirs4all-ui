/**
 * nirs4all-ui `inspector` domain — the Inspector capsule.
 *
 * Rank and dissect trained chains: a searchable / filterable / groupable
 * leaderboard, chain-level views (score landscape, pivot heatmap,
 * generalization map, hyper-parameter response, step effects through the
 * `chains` explorer, full leaderboard) and sample-level views of the
 * explicitly *compared* chains (predicted vs observed, residuals, fold
 * stability, confusion matrix, hard samples). Selection (highlight) and
 * comparison (whose predictions are shown) are separate, visible sets.
 *
 * Host boundary: the host supplies chains, score references and — on request
 * — per-sample predictions; it never has to compute a view. Styles ship at
 * `nirs4all-ui/assets/workbench.css`.
 *
 * Consumed as `nirs4all-ui/inspector`.
 */

export * from "./types.js";
export * from "./analysis.js";
export {
  INSPECTOR_STRINGS_EN,
  INSPECTOR_STRINGS_FR,
  resolveInspectorStrings,
  type InspectorLocale,
  type InspectorStrings,
} from "./locale.js";
export { ChainList } from "./ChainList.js";
export { COMPARE_COLORS, StepChips } from "./views.js";
export { Inspector, DEFAULT_INSPECTOR_LAYOUT, type InspectorProps } from "./Inspector.js";
