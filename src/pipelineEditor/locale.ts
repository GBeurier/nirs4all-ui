/**
 * Chrome strings for the pipeline chain editor. Operator and parameter names
 * come from the host catalogue; hosts localize the chrome with a partial
 * `labels` override. Defaults are concise English.
 */

import type { ChainRole, ForkMode, FrameMode } from "./types.js";

export interface PipelineChainLabels {
  untitled: string;
  namePlaceholder: string;
  steps: string;
  models: string;
  variants: string;
  variant: string;
  variantsUnknown: string;
  variantsHint: string;
  bypassedCount: string;
  undo: string;
  redo: string;
  wrap: string;
  wrapHint: string;
  zoomIn: string;
  zoomOut: string;
  input: string;
  inputDetail: string;
  output: string;
  emptyPipeline: string;
  idleHint: string;
  // cell + group chrome
  bypass: string;
  enable: string;
  active: string;
  bypassed: string;
  addStep: string;
  addLane: string;
  addOption: string;
  emptyLane: string;
  skipOption: string;
  notInCatalog: string;
  rawHint: string;
  lanes: string;
  options: string;
  lane: string;
  option: string;
  keeps: string;
  combinations: string;
  // inspector
  moveLeft: string;
  moveRight: string;
  moveUp: string;
  moveDown: string;
  duplicate: string;
  remove: string;
  wrapBranch: string;
  wrapChoice: string;
  dissolve: string;
  json: string;
  apply: string;
  revert: string;
  invalidJson: string;
  close: string;
  fixed: string;
  sweep: string;
  tune: string;
  values: string;
  range: string;
  logRange: string;
  from: string;
  to: string;
  step: string;
  points: string;
  low: string;
  high: string;
  choices: string;
  defaultValue: string;
  unset: string;
  reset: string;
  stepLabel: string;
  stepLabelHint: string;
  tuning: string;
  trials: string;
  sampler: string;
  addParameter: string;
  parameterName: string;
  parameterValue: string;
  add: string;
  noParameters: string;
  outside: string;
  laneName: string;
  count: string;
  pick: string;
  strategy: string;
  noteText: string;
  // browser
  browserTitle: string;
  after: string;
  before: string;
  into: string;
  search: string;
  all: string;
  structure: string;
  noMatch: string;
  emptyCatalog: string;
  role: Record<ChainRole, string>;
  fork: Record<ForkMode, string>;
  forkHint: Record<ForkMode, string>;
  frame: Record<FrameMode, string>;
  frameHint: Record<FrameMode, string>;
  operatorType: Record<string, string>;
}

export const DEFAULT_PIPELINE_CHAIN_LABELS: PipelineChainLabels = {
  untitled: "Untitled pipeline",
  namePlaceholder: "Pipeline name",
  steps: "steps",
  models: "models",
  variants: "variants",
  variant: "variant",
  variantsUnknown: "variants not sized",
  variantsHint: "Read from the generator sizes in this document. The runtime expansion is authoritative.",
  bypassedCount: "bypassed",
  undo: "Undo",
  redo: "Redo",
  wrap: "Wrap rows",
  wrapHint: "Wrap the chain onto rows, or keep one scrolling row",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  input: "Dataset",
  inputDetail: "features and targets",
  output: "Results",
  emptyPipeline: "Add the first step",
  idleHint: "Select a cell to edit it here. Drag cells onto the wire to reorder them or move them between lanes.",
  bypass: "Bypass",
  enable: "Enable",
  active: "Active",
  bypassed: "Bypassed",
  addStep: "Add a step here",
  addLane: "Add lane",
  addOption: "Add option",
  emptyLane: "empty lane",
  skipOption: "skip",
  notInCatalog: "Not in the catalogue",
  rawHint: "Kept exactly as written. Edit it as JSON.",
  lanes: "lanes",
  options: "options",
  lane: "Lane",
  option: "Option",
  keeps: "keeps",
  combinations: "combinations",
  moveLeft: "Move earlier",
  moveRight: "Move later",
  moveUp: "Move up",
  moveDown: "Move down",
  duplicate: "Duplicate",
  remove: "Remove",
  wrapBranch: "Branch from here",
  wrapChoice: "Add alternatives",
  dissolve: "Keep one lane only",
  json: "JSON",
  apply: "Apply",
  revert: "Revert",
  invalidJson: "This is not valid JSON.",
  close: "Close",
  fixed: "Fixed value",
  sweep: "Sweep (one variant per value)",
  tune: "Tune (search space)",
  values: "Values",
  range: "Range",
  logRange: "Log range",
  from: "from",
  to: "to",
  step: "step",
  points: "points",
  low: "low",
  high: "high",
  choices: "choices",
  defaultValue: "default",
  unset: "runtime default",
  reset: "Use the default",
  stepLabel: "Label",
  stepLabelHint: "Name shown in results",
  tuning: "Tuning",
  trials: "trials",
  sampler: "sampler",
  addParameter: "Parameter",
  parameterName: "name",
  parameterValue: "value (JSON)",
  add: "Add",
  noParameters: "No parameters set. Runtime defaults apply.",
  outside: "outside",
  laneName: "Lane name",
  count: "count",
  pick: "pick",
  strategy: "Strategy",
  noteText: "Note",
  browserTitle: "Add a step",
  after: "after",
  before: "before",
  into: "in",
  search: "Search operators",
  all: "All",
  structure: "Structure",
  noMatch: "No operator matches.",
  emptyCatalog: "The host supplied no operators.",
  role: {
    preprocessing: "Preprocessing",
    model: "Model",
    splitting: "Splitter",
    y_processing: "Target processing",
    augmentation: "Augmentation",
    filter: "Filter",
    merge: "Merge",
    note: "Note",
    chart: "Chart",
    operator: "Operator",
    raw: "Raw step",
  },
  fork: {
    branch: "Branch",
    choice: "One of",
    concat: "Concat",
    augment: "Feature views",
  },
  forkHint: {
    branch: "Every lane runs on the same input. A merge step further down joins them.",
    choice: "One option is used per pipeline variant.",
    concat: "Each lane transforms the same input and the outputs are concatenated.",
    augment: "Each lane adds a processed view of the features.",
  },
  frame: {
    cartesian: "Cartesian",
    sequence: "Sequence",
  },
  frameHint: {
    cartesian: "The options of successive stages are combined into variants.",
    sequence: "A nested list of steps, run in order.",
  },
  operatorType: {
    preprocessing: "Preprocessing",
    model: "Models",
    splitting: "Splitters",
    y_processing: "Target processing",
    augmentation: "Augmentation",
    filter: "Filters",
  },
};

export function resolvePipelineChainLabels(overrides?: Partial<PipelineChainLabels>): PipelineChainLabels {
  return overrides ? { ...DEFAULT_PIPELINE_CHAIN_LABELS, ...overrides } : DEFAULT_PIPELINE_CHAIN_LABELS;
}
