/**
 * nirs4all-ui `inspector` domain — the Inspector capsule.
 *
 * Answer "which chain wins, can I trust it, and why?" over trained chains.
 * Perspectives (verdict · landscape · steps · predictions · tuning · compare)
 * switch curated view sets: the verdict (best chain, one-standard-error ties,
 * what drives the score, findings), top chains with fold uncertainty, score
 * landscape / pivot / cross-dataset ranks, step effects, flow (orbit / hub)
 * and position × order from the `chains` domain, hyper-parameter response,
 * generalization and score-vs-cost Pareto front, and sample-level views of
 * the explicitly *compared* chains (predicted vs observed, residuals, error
 * agreement, hard samples, folds, confusion, side by side). Selection
 * (highlight, profiled in the drawer) and comparison (whose predictions are
 * shown) are separate, visible sets.
 *
 * Host boundary: the host supplies chains, score references and — on request
 * — per-sample predictions; it never has to compute a view. Styles ship at
 * `nirs4all-ui/assets/workbench.css` plus `nirs4all-ui/assets/chains.css`
 * (step views).
 *
 * Consumed as `nirs4all-ui/inspector`.
 */

export * from "./types.js";
export * from "./analysis.js";
export * from "./insights.js";
export {
  INSPECTOR_STRINGS_EN,
  INSPECTOR_STRINGS_FR,
  resolveInspectorStrings,
  type InspectorLocale,
  type InspectorStrings,
} from "./locale.js";
export { ChainList } from "./ChainList.js";
export { COMPARE_COLORS, StepChips } from "./views.js";
export { Inspector, DEFAULT_INSPECTOR_LAYOUT, perspectiveViews, type InspectorPerspective, type InspectorProps } from "./Inspector.js";
