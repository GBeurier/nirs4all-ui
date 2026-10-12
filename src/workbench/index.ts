/**
 * nirs4all-ui `workbench` domain — the shared interactive-analysis kit behind
 * the Playground and Inspector capsules.
 *
 * One selection algebra, one color-by resolver, one gesture vocabulary and one
 * panel chrome for every exploration surface, so Studio, Web and custom hosts
 * get identical behavior: click picks, drag box-selects, lasso, Shift adds,
 * Alt subtracts, Ctrl/⌘ toggles, wheel/box zoom, double-click resets.
 *
 * Heavy data goes to layered Canvas2D (all rows, batched by color, decimated to
 * the pixel width, density rasters for very large sets); axes, guides and
 * gestures stay crisp SVG themed by CSS tokens. Components are presentational:
 * hosts own data loading, persistence and scientific computation. Default
 * styles ship at `nirs4all-ui/assets/workbench.css`.
 *
 * Consumed as `nirs4all-ui/workbench`.
 */

// --- pure helpers ---
export * from "./selection.js";
export * from "./colorBy.js";
export * from "./spatial.js";
export * from "./matrix.js";
export * from "./format.js";
export * from "./sampling.js";
export * from "./projection3d.js";

// --- React primitives ---
export * from "./hooks.js";
export * from "./icons.js";
export * from "./controls.js";
export * from "./layout.js";
export * from "./shortcuts.js";
export * from "./ColorLegend.js";
export * from "./ColorSchemePicker.js";
export * from "./VirtualTable.js";

// --- interactive views ---
export * from "./CanvasPlot.js";
export * from "./SpectraView.js";
export * from "./ScatterView.js";
export * from "./Scatter3DView.js";
export * from "./DistributionView.js";
export * from "./ProfileView.js";
