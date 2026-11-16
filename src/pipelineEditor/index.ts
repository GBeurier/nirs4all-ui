/**
 * nirs4all-ui `pipelineEditor` domain — a rack-style editor for nirs4all
 * pipelines.
 *
 * `PipelineChainEditor` lays a pipeline out as a signal chain on a horizontal
 * grid: steps are cells on a wire, branches and alternatives are parallel lanes
 * that split and join, and a device strip edits the selected cell. It works on
 * the canonical pipeline JSON in place, so constructs it does not model are
 * preserved, and the operator catalogue comes from the host.
 *
 * Same package boundary as the rest of nirs4all-ui: hosts own state, history,
 * persistence, validation and execution. The pure view model (`parsePipeline`,
 * `layoutChain`, the edit operations) is exported for hosts and tests. A
 * stylesheet ships at `nirs4all-ui/assets/pipelineEditor.css`.
 *
 * Consumed as `nirs4all-ui/pipelineEditor`.
 */

export * from "./types.js";
export { fromCanonicalPipeline, toCanonicalPipeline } from "./document.js";
export {
  DEFAULT_STRUCTURES,
  EMPTY_CATALOG,
  catalogStructures,
  catalogTypes,
  classLeaf,
  findOperator,
  indexCatalog,
  operatorStep,
  roleForType,
  searchOperators,
  structureStep,
  type CatalogIndex,
} from "./catalog.js";
export { ROOT_CHAIN_PATH, chainIdAt, chainOwnerItem, flattenItems, itemIdAt, laneIdAt, parsePipeline } from "./model.js";
export {
  addLane,
  dissolveFork,
  duplicateItem,
  insertStep,
  isBypassed,
  moveItem,
  moveLane,
  nudgeItem,
  removeItem,
  removeLane,
  renameLane,
  replaceItemValue,
  setBypassed,
  setDocumentName,
  setModifier,
  setParam,
  setStepName,
  setSweep,
  setTuning,
  setTuningOption,
  shiftItemLane,
  wrapItem,
  type SweepDraft,
} from "./edit.js";
export {
  chainVariants,
  formatCount,
  formatNumber,
  formatValue,
  itemVariants,
  pipelineChainStats,
  sweepCount,
  sweepText,
  type PipelineChainStats,
} from "./summary.js";
export {
  DEFAULT_CHAIN_METRICS,
  layoutChain,
  type ChainLayout,
  type ChainLayoutOptions,
  type ChainMetrics,
  type LayoutCell,
  type LayoutFork,
  type LayoutFrame,
  type LayoutLane,
  type LayoutSlot,
  type LayoutTerminal,
  type LayoutWire,
  type Rect,
} from "./layout.js";
export {
  CHAIN_SHORTCUTS,
  childSelection,
  commandForKey,
  focusTargets,
  moveFocus,
  parentSelection,
  selectionKey,
  type ChainCommand,
  type FocusDirection,
  type FocusTarget,
  type KeyLike,
} from "./navigation.js";
export { CHAIN_GROUP_COLORS, CHAIN_ROLE_COLORS } from "./glyphs.js";
export { DEFAULT_PIPELINE_CHAIN_LABELS, resolvePipelineChainLabels, type PipelineChainLabels } from "./locale.js";
export { stepLines, type CellLine } from "./ChainCanvas.js";
export { PipelineChainEditor, type PipelineChainEditorProps } from "./PipelineChainEditor.js";
