/**
 * nirs4all-ui `multimodal` domain — controlled presentation for the
 * multisource / multimodal fusion teaching laboratory.
 *
 * Same package boundary as the rest of nirs4all-ui: hosts own state, loading,
 * IO, worker execution and downloads. This domain renders supplied data,
 * configuration, progress and owner-scored results; it never parses files,
 * builds folds, preprocesses, fits or scores. Reuses `viz` charts and the
 * `dag` viewer. A stylesheet ships at `nirs4all-ui/assets/multimodal.css`.
 *
 * Consumed as `nirs4all-ui/multimodal`.
 */

export * from "./types.js";
export * from "./catalog.js";
export {
  axisRangeText,
  axisTitle,
  displaySubset,
  formatDuration,
  formatMetric,
  formatNumber,
  imageDisplayRange,
  invalidCellCount,
  readRow,
  rowWidth,
  sourceRowIndex,
} from "./data.js";
export { describeRecipe, type RecipeDescription, type RecipeLine } from "./recipeGraph.js";
export {
  MERGE_KIND_LABEL,
  MULTIMODAL_MODEL_CATALOG,
  MULTIMODAL_MODEL_IDS,
  addBranch,
  branchIdError,
  chainFor,
  combinationText,
  connectSource,
  copyChainToBranches,
  defaultStepParams,
  describePipelineDocument,
  disconnectSource,
  duplicateBranch,
  findBranch,
  findModelOption,
  headForModel,
  insertStep,
  mergeInputsText,
  modelParamSummary,
  modelSummary,
  moveBranch,
  moveStep,
  pipelineIssues,
  removeBranch,
  removeStep,
  resolveTarget,
  sameTarget,
  setChainSteps,
  stepsFor,
  uniqueBranchId,
  updateBranch,
  updateMerge,
  updateStep,
  withParam,
  type PipelineCatalogs,
  type PipelineOwner,
} from "./pipelineModel.js";
export { MultimodalPipelineEditor } from "./PipelineEditor.js";

export { MultimodalWorkbench } from "./MultimodalWorkbench.js";
export {
  CaseSelector,
  MultimodalHeader,
  Section,
  type CaseSelectorProps,
  type MultimodalHeaderProps,
  type SectionProps,
} from "./Header.js";
export { AlignmentTable, DataPanel, type AlignmentTableProps, type DataPanelProps } from "./DataPanel.js";
export {
  DosageTable,
  ImageGallery,
  ImagePixels,
  N4MM_COLORS,
  SampleNavigator,
  SourceViews,
  SpectrumSourceView,
  type ImagePixelsProps,
  type SampleNavigatorProps,
  type SourceViewProps,
  type SourceViewsProps,
} from "./SourceViews.js";
export {
  ModelSettings,
  ParamField,
  RecipeGraph,
  SourceChainEditor,
  StrategyPanel,
  orderCandidates,
  type ModelSettingsProps,
  type ParamFieldProps,
  type RecipeGraphProps,
  type SourceChainEditorProps,
  type StrategyPanelProps,
} from "./RecipePanel.js";
export {
  RunPanel,
  ValidationPanel,
  candidateLabel,
  runReadiness,
  seedError,
  type RunPanelProps,
  type RunReadiness,
  type ValidationPanelProps,
} from "./RunPanel.js";
export { ExportPanel, ResultsPanel, type ExportPanelProps, type ResultsPanelProps } from "./ResultsPanel.js";
export { InstructorGuide, type InstructorGuideProps } from "./InstructorGuide.js";
export { NumberField, TextField, type NumberFieldProps, type TextFieldProps } from "./fields.js";
