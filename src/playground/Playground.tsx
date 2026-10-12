import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cx } from "../workbench/_cx.js";
import { DEFAULT_COLOR_SCHEME, rampStops, type ColorScheme, type RowColumn } from "../workbench/colorBy.js";
import { ColorLegend } from "../workbench/ColorLegend.js";
import { COLOR_SCHEME_PICKER_STRINGS_EN, COLOR_SCHEME_PICKER_STRINGS_FR, ColorSchemePicker } from "../workbench/ColorSchemePicker.js";
import { Button, Chip, EmptyState, IconButton, NumberField, Segmented, SelectField, StatTile, Toggle } from "../workbench/controls.js";
import { formatCount, formatDuration, formatPercent, formatValue } from "../workbench/format.js";
import { useControllable } from "../workbench/hooks.js";
import { resolveIcons, type WorkbenchIcons } from "../workbench/icons.js";
import { LayoutPresetPicker, PanelSection, ViewGrid, ViewsMenu, WorkbenchShell, type ViewSpec, type WorkbenchLayout } from "../workbench/layout.js";
import {
  EMPTY_SELECTION,
  combineSelection,
  invertSelection,
  normalizeSelection,
  selectionModeFromModifiers,
  type SavedSelection,
  type Selection,
} from "../workbench/selection.js";
import { dispatchShortcut, ShortcutsDialog, type ShortcutBinding } from "../workbench/shortcuts.js";
import type { SpectraStatLine } from "../workbench/SpectraView.js";
import { N4_CATEGORICAL } from "../viz/theme.js";
import { resolvePlaygroundStrings, type PlaygroundLocale, type PlaygroundStrings } from "./locale.js";
import {
  buildColumns,
  colorMappingFor,
  colorsForFrame,
  inverseRows,
  numericTargetForFrame,
  outputFrame,
  outputRowsInScope,
  rawFrame,
  sampleLabel,
  scopeRows,
  selectionToOutput,
  TARGET_KEY_PREFIX,
} from "./model.js";
import { OperatorPicker } from "./OperatorPicker.js";
import { DatasetCard, PipelinePanel } from "./PipelinePanel.js";
import { createStep, effectiveSteps, insertStep, moveStep, newStepId, pipelineFingerprint, RAW_CURSOR, removeStep, updateStep } from "./pipeline.js";
import type {
  OperatorDefinition,
  PipelineStep,
  PlaygroundAnalysisNeeds,
  PlaygroundDataset,
  PlaygroundResult,
  PlaygroundRunRequest,
  PlaygroundScope,
  PlaygroundStatus,
  PlaygroundTarget,
  PlaygroundViewId,
  StepOutcome,
} from "./types.js";
import {
  CorrelationBody,
  DEFAULT_GROUP_MEANS_OPTIONS,
  DEFAULT_HEATMAP_OPTIONS,
  DEFAULT_REPETITION_OPTIONS,
  DEFAULT_SCORES_OPTIONS,
  DEFAULT_SPECTRA_OPTIONS,
  DEFAULT_TARGET_OPTIONS,
  DEFAULT_VARIANCE_OPTIONS,
  FoldsBody,
  GroupMeansBody,
  HeatmapBody,
  LoadingsBody,
  NIR_REGIONS,
  OutliersBody,
  REPETITION_METRIC_LABELS,
  REPETITION_REFERENCE_LABELS,
  RepetitionsBody,
  SamplesBody,
  ScoresBody,
  selectionBreakdown,
  SelectionSpectrum,
  SpectraBody,
  TARGET_AXIS,
  TargetBody,
  VARIANCE_METRIC_LABELS,
  VarianceBody,
  type GroupMeansOptions,
  type HeatmapOptions,
  type PlaygroundViewContext,
  type RepetitionOptions,
  type ScoresOptions,
  type SpectraOptions,
  type TargetOptions,
  type VarianceOptions,
} from "./views.js";

export interface PlaygroundProps {
  /** Raw dataset; `null` renders the empty state (with `emptySlot`). */
  dataset: PlaygroundDataset | null;
  /** Operator catalog offered in the picker. */
  operators: readonly OperatorDefinition[];
  /** Controlled pipeline (omit to let the capsule own it). */
  pipeline?: readonly PipelineStep[] | undefined;
  defaultPipeline?: readonly PipelineStep[] | undefined;
  onPipelineChange?: ((steps: readonly PipelineStep[]) => void) | undefined;
  /** Latest result from the host (may lag behind the last request). */
  result: PlaygroundResult | null;
  status?: PlaygroundStatus | undefined;
  error?: string | null | undefined;
  /** Execute this request and answer through `result` (echo `request.id`). */
  onRunRequest: (request: PlaygroundRunRequest) => void;
  /** Debounce before emitting a run request after an edit. */
  runDebounceMs?: number | undefined;
  /** Selection in dataset rows (controlled when provided). */
  selection?: Selection | undefined;
  onSelectionChange?: ((rows: Selection) => void) | undefined;
  savedSelections?: readonly SavedSelection[] | undefined;
  onSavedSelectionsChange?: ((saved: readonly SavedSelection[]) => void) | undefined;
  layout?: WorkbenchLayout | undefined;
  defaultLayout?: WorkbenchLayout | undefined;
  onLayoutChange?: ((layout: WorkbenchLayout) => void) | undefined;
  colorBy?: string | null | undefined;
  onColorByChange?: ((key: string | null) => void) | undefined;
  /** Palettes used by every view (controlled when provided). */
  colorScheme?: ColorScheme | undefined;
  onColorSchemeChange?: ((scheme: ColorScheme) => void) | undefined;
  /** Host dataset chooser rendered in the dataset card. */
  datasetSlot?: ReactNode;
  onChangeDataset?: (() => void) | undefined;
  /** Rendered in the empty state when no dataset is loaded. */
  emptySlot?: ReactNode;
  onOpenInEditor?: ((steps: readonly PipelineStep[]) => void) | undefined;
  onExportPipeline?: ((steps: readonly PipelineStep[]) => void) | undefined;
  /** Export the selected dataset rows (ids resolved from `sampleIds`). */
  onExportSelection?: ((rows: Selection, ids: readonly string[]) => void) | undefined;
  headerActions?: ReactNode;
  title?: string | undefined;
  locale?: PlaygroundLocale | undefined;
  strings?: Partial<PlaygroundStrings> | undefined;
  icons?: WorkbenchIcons | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

export const DEFAULT_PLAYGROUND_LAYOUT: WorkbenchLayout = {
  preset: "focus",
  views: ["spectra", "scores", "target", "outliers", "correlation"],
  maximized: null,
};

interface ViewOptions {
  spectra: SpectraOptions;
  scores: ScoresOptions;
  target: TargetOptions;
  outlierLog: boolean;
  loadings: readonly number[];
  correlationRaw: boolean;
  repetitions: RepetitionOptions;
  variance: VarianceOptions;
  groupMeans: GroupMeansOptions;
  heatmap: HeatmapOptions;
}

const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  spectra: DEFAULT_SPECTRA_OPTIONS,
  scores: DEFAULT_SCORES_OPTIONS,
  target: DEFAULT_TARGET_OPTIONS,
  outlierLog: false,
  loadings: [0, 1, 2],
  correlationRaw: true,
  repetitions: DEFAULT_REPETITION_OPTIONS,
  variance: DEFAULT_VARIANCE_OPTIONS,
  groupMeans: DEFAULT_GROUP_MEANS_OPTIONS,
  heatmap: DEFAULT_HEATMAP_OPTIONS,
};

type SubOptionKey = "spectra" | "scores" | "target" | "repetitions" | "variance" | "groupMeans" | "heatmap";

const SAMPLE_COUNTS = [0, 50, 100, 200, 500, 1000] as const;
const STAT_LINES: readonly SpectraStatLine[] = ["mean", "median", "std", "minMax"];
const QUANTILES = [0.5, 0.75, 0.9, 0.95] as const;

const VIEW_GLYPH: Record<PlaygroundViewId, ReactNode> = {
  spectra: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M3 16c2-1 3-8 5-8s3 9 5 9 3-11 5-11 2 6 3 7" />
    </svg>
  ),
  scores: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="7" cy="15" r="1.8" />
      <circle cx="11" cy="10" r="1.8" />
      <circle cx="15" cy="13" r="1.8" />
      <circle cx="17" cy="7" r="1.8" />
      <circle cx="9" cy="18" r="1.8" />
    </svg>
  ),
  target: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="13" width="3.5" height="7" rx="1" />
      <rect x="8" y="8" width="3.5" height="12" rx="1" />
      <rect x="13" y="5" width="3.5" height="15" rx="1" />
      <rect x="18" y="11" width="3.5" height="9" rx="1" />
    </svg>
  ),
  outliers: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M15 3v18M3 9h18" strokeDasharray="2 2" />
      <circle cx="7" cy="16" r="1.5" fill="currentColor" />
      <circle cx="10" cy="14" r="1.5" fill="currentColor" />
      <circle cx="19" cy="5" r="1.8" fill="currentColor" />
    </svg>
  ),
  loadings: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M3 12h18" opacity=".4" />
      <path d="M3 12c3-6 5-6 7 0s4 6 6 0 3-4 5-2" />
    </svg>
  ),
  correlation: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M3 18c4 0 5-12 9-12s5 8 9 8" />
      <path d="M3 21h18" opacity=".4" />
    </svg>
  ),
  folds: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="4" width="18" height="4" rx="1" opacity=".5" />
      <rect x="3" y="10" width="18" height="4" rx="1" />
      <rect x="3" y="16" width="18" height="4" rx="1" opacity=".5" />
    </svg>
  ),
  repetitions: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="8" r="1.6" />
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="10" r="1.6" />
      <circle cx="12" cy="15" r="1.6" />
      <circle cx="18" cy="5" r="1.6" />
      <circle cx="18" cy="17" r="1.6" />
    </svg>
  ),
  variance: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M3 20h18" opacity=".4" />
      <path d="M3 17c2 0 3-9 5-9s2 6 4 6 3-10 5-10 2 8 4 8" />
    </svg>
  ),
  groupMeans: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M3 15c3-1 4-7 7-7s4 6 7 6 3-3 4-3" />
      <path d="M3 19c3-1 4-5 7-5s4 3 7 3 3-2 4-2" opacity=".5" />
    </svg>
  ),
  heatmap: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="4" width="5" height="5" rx="1" opacity=".35" />
      <rect x="9.5" y="4" width="5" height="5" rx="1" opacity=".7" />
      <rect x="16" y="4" width="5" height="5" rx="1" />
      <rect x="3" y="10.5" width="5" height="5" rx="1" opacity=".7" />
      <rect x="9.5" y="10.5" width="5" height="5" rx="1" />
      <rect x="16" y="10.5" width="5" height="5" rx="1" opacity=".5" />
      <rect x="3" y="17" width="5" height="3.5" rx="1" />
      <rect x="9.5" y="17" width="5" height="3.5" rx="1" opacity=".45" />
      <rect x="16" y="17" width="5" height="3.5" rx="1" opacity=".8" />
    </svg>
  ),
  samples: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M3 14h18M9 4v16" />
    </svg>
  ),
};

let requestCounter = 0;

/**
 * The Playground capsule: explore a spectral dataset and try operator chains
 * live. Left: dataset + pipeline timeline (with a preview cursor). Center:
 * linked views (spectra, scores, target, outlier map, loadings, r(λ), folds,
 * replicates, samples). Right: selection details and saved selections. The
 * host executes {@link PlaygroundRunRequest}s and returns results; everything
 * else — gestures, colors, layout, undo — lives here.
 */
export function Playground(props: PlaygroundProps) {
  const {
    dataset,
    operators,
    result,
    status = "idle",
    error,
    onRunRequest,
    runDebounceMs = 120,
    locale,
    icons,
  } = props;
  const strings = useMemo(() => resolvePlaygroundStrings(locale, props.strings), [locale, props.strings]);
  const icon = resolveIcons(icons);
  const operatorById = useMemo(() => new Map(operators.map((op) => [op.id, op])), [operators]);

  // ---------------------------------------------------------------- pipeline + history
  const [pipeline, setPipelineRaw] = useControllable<readonly PipelineStep[]>(props.pipeline, props.defaultPipeline ?? [], props.onPipelineChange);
  const history = useRef<{ past: Array<readonly PipelineStep[]>; future: Array<readonly PipelineStep[]> }>({ past: [], future: [] });
  const [, bump] = useState(0);
  const setPipeline = useCallback(
    (next: readonly PipelineStep[]) => {
      history.current.past.push(pipeline);
      if (history.current.past.length > 100) history.current.past.shift();
      history.current.future = [];
      setPipelineRaw(next);
      bump((n) => n + 1);
    },
    [pipeline, setPipelineRaw],
  );
  const undo = useCallback(() => {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(pipeline);
    setPipelineRaw(previous);
    bump((n) => n + 1);
  }, [pipeline, setPipelineRaw]);
  const redo = useCallback(() => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(pipeline);
    setPipelineRaw(next);
    bump((n) => n + 1);
  }, [pipeline, setPipelineRaw]);
  const [cursor, setCursor] = useState<string | null>(null);
  useEffect(() => {
    if (cursor && cursor !== RAW_CURSOR && !pipeline.some((s) => s.id === cursor)) setCursor(null);
  }, [cursor, pipeline]);

  // ---------------------------------------------------------------- layout, color, scope, selection
  const [layout, setLayout] = useControllable<WorkbenchLayout>(props.layout, props.defaultLayout ?? DEFAULT_PLAYGROUND_LAYOUT, props.onLayoutChange);
  const [targetName, setTargetName] = useState<string | null>(dataset?.targets?.[0]?.name ?? null);
  const [colorByState, setColorByState] = useControllable<string | null>(props.colorBy, null, props.onColorByChange);
  const [colorScheme, setColorScheme] = useControllable<ColorScheme>(props.colorScheme, DEFAULT_COLOR_SCHEME, props.onColorSchemeChange);
  const [scope, setScope] = useState<PlaygroundScope>("all");
  const [selection, setSelectionState] = useControllable<Selection>(props.selection, EMPTY_SELECTION, props.onSelectionChange);
  const [saved, setSaved] = useControllable<readonly SavedSelection[]>(props.savedSelections, [], props.onSavedSelectionsChange);
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [options, setOptions] = useState<ViewOptions>(DEFAULT_VIEW_OPTIONS);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [leftOpen, setLeftOpen] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recentOps, setRecentOps] = useState<readonly string[]>([]);
  const patchOptions = (patch: Partial<ViewOptions>) => setOptions((o) => ({ ...o, ...patch }));
  const patchView = <K extends SubOptionKey>(key: K, patch: Partial<ViewOptions[K]>) => setOptions((o) => ({ ...o, [key]: { ...o[key], ...patch } }));

  // Reset per-dataset state when the dataset changes.
  const datasetId = dataset?.id ?? null;
  const [seenDataset, setSeenDataset] = useState(datasetId);
  if (seenDataset !== datasetId) {
    setSeenDataset(datasetId);
    setTargetName(dataset?.targets?.[0]?.name ?? null);
    setScope("all");
    setHoverRow(null);
    setCursor(null);
    if (props.selection === undefined) setSelectionState(EMPTY_SELECTION);
  }

  // ---------------------------------------------------------------- run requests
  const effective = useMemo(() => effectiveSteps(pipeline, cursor), [pipeline, cursor]);
  const visible = new Set(layout.maximized ? [layout.maximized] : layout.views);
  const hasSplitter = effective.some((s) => operatorById.get(s.operatorId)?.kind === "splitting");
  const replicateColumn = options.repetitions.groupBy ?? dataset?.groupColumn ?? null;
  const wantsPca = visible.has("outliers") || visible.has("loadings") || (visible.has("heatmap") && options.heatmap.sort === "pc1");
  const needs: PlaygroundAnalysisNeeds = {
    projection: visible.has("scores") ? options.scores.projection : wantsPca ? "pca" : null,
    components: Math.max(3, ...options.scores.axes.map((k) => k + 1), ...options.loadings.map((k) => k + 1)),
    outliers: visible.has("outliers"),
    loadings: visible.has("loadings"),
    folds: hasSplitter,
    repetitions:
      visible.has("repetitions") && replicateColumn
        ? { groupBy: replicateColumn, metric: options.repetitions.metric, reference: options.repetitions.reference }
        : null,
  };
  const needsKey = JSON.stringify(needs);
  const fingerprint = pipelineFingerprint(effective);
  const lastRequest = useRef<string | null>(null);
  const onRunRef = useRef(onRunRequest);
  onRunRef.current = onRunRequest;
  useEffect(() => {
    if (!dataset) return;
    const timer = setTimeout(() => {
      requestCounter += 1;
      const id = `pg-${requestCounter}`;
      lastRequest.current = id;
      const request: PlaygroundRunRequest = {
        id,
        datasetId: dataset.id,
        steps: effective,
        cursorStepId: cursor === RAW_CURSOR ? null : cursor ?? effective[effective.length - 1]?.id ?? null,
        needs: JSON.parse(needsKey) as PlaygroundAnalysisNeeds,
      };
      if (targetName) request.target = targetName;
      onRunRef.current(request);
    }, runDebounceMs);
    return () => clearTimeout(timer);
    // `effective` is captured through its fingerprint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, fingerprint, needsKey, targetName, cursor, runDebounceMs]);
  const stale = Boolean(result?.requestId && lastRequest.current && result.requestId !== lastRequest.current);
  const busy = status === "running" || stale;

  // ---------------------------------------------------------------- derived model
  const raw = useMemo(() => (dataset ? rawFrame(dataset) : null), [dataset]);
  const frame = useMemo(() => (dataset ? (result ? outputFrame(dataset, result) : raw) : null), [dataset, result, raw]);
  const rowCount = raw?.matrix.rows ?? 0;
  const inverse = useMemo(() => (frame ? inverseRows(frame.rows, rowCount) : []), [frame, rowCount]);
  const columns: RowColumn[] = useMemo(() => (dataset && frame ? buildColumns(dataset, result, frame) : []), [dataset, result, frame]);
  const target = dataset?.targets?.find((t) => t.name === targetName) ?? dataset?.targets?.[0];
  const defaultColor = target ? `${TARGET_KEY_PREFIX}${target.name}` : dataset?.partition ? "partition" : null;
  const colorKey = colorByState === null ? defaultColor : colorByState === "" ? null : colorByState;
  const colorColumn = columns.find((c) => c.key === colorKey) ?? null;
  const mapping = useMemo(() => colorMappingFor(columns, colorColumn ? colorColumn.key : null, rowCount, colorScheme), [columns, colorColumn, rowCount, colorScheme]);
  const densityStops = useMemo(() => rampStops(colorScheme.continuous, colorScheme.reverse), [colorScheme]);
  const colorsOut = useMemo(() => (frame ? colorsForFrame(mapping, frame) : { colors: [], groups: new Int32Array(0) }), [mapping, frame]);
  const scopeSet = useMemo(() => scopeRows(scope, rowCount, selection, dataset?.partition), [scope, rowCount, selection, dataset?.partition]);
  const scopeOut = useMemo(() => (frame ? outputRowsInScope(frame, scopeSet) : []), [frame, scopeSet]);
  const selectedOut = useMemo(() => selectionToOutput(selection, inverse), [selection, inverse]);
  const hoverOut = hoverRow !== null ? inverse[hoverRow]?.[0] ?? null : null;
  const targetOut = useMemo(() => (frame ? numericTargetForFrame(target, frame) : new Float64Array(0)), [frame, target]);
  const outcomes = useMemo(() => new Map<string, StepOutcome>((result?.steps ?? []).map((o) => [o.stepId, o])), [result]);

  const setSelection = useCallback((rows: Selection) => setSelectionState(normalizeSelection(rows)), [setSelectionState]);
  const sampleFilterOp = operators.find((op) => op.special === "sampleFilter");
  const cropOp = operators.find((op) => op.special === "crop");

  const addStep = (operator: OperatorDefinition, afterStepId: string | null, params?: Record<string, unknown>) => {
    const step = createStep(operator, params);
    setPipeline(insertStep(pipeline, step, operator, afterStepId));
    if (cursor && cursor !== RAW_CURSOR) setCursor(step.id);
  };
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const step of pipeline) counts.set(step.operatorId, (counts.get(step.operatorId) ?? 0) + 1);
    return counts;
  }, [pipeline]);
  const filterSelection = (mode: "keep" | "remove") => {
    if (!sampleFilterOp || selection.length === 0) return;
    addStep(sampleFilterOp, cursor && cursor !== RAW_CURSOR ? cursor : null, { rows: [...selection], mode });
    if (mode === "remove") setSelection(EMPTY_SELECTION);
  };
  const saveSelection = () => {
    if (selection.length === 0) return;
    const index = saved.length;
    setSaved([...saved, { id: newStepId("selection"), name: `Selection ${index + 1}`, indices: selection, color: N4_CATEGORICAL[index % N4_CATEGORICAL.length]! }]);
  };
  const allRows = useMemo(() => {
    if (!frame) return EMPTY_SELECTION;
    return normalizeSelection(scopeOut.map((o) => frame.rows[o]!));
  }, [frame, scopeOut]);

  // ---------------------------------------------------------------- shortcuts
  const viewOrder = layout.views;
  const bindings: ShortcutBinding[] = [
    { keys: "mod+z", label: strings.undo, group: strings.pipeline, run: undo },
    { keys: "shift+mod+z", label: strings.redo, group: strings.pipeline, run: redo },
    { keys: "mod+y", label: strings.redo, group: strings.pipeline, run: redo, hidden: true },
    { keys: "escape", label: strings.clear, group: strings.selection, run: () => (showShortcuts ? setShowShortcuts(false) : setSelection(EMPTY_SELECTION)) },
    { keys: "mod+a", label: strings.selectAll, group: strings.selection, run: () => setSelection(allRows) },
    { keys: "mod+i", label: strings.invert, group: strings.selection, run: () => setSelection(invertSelection(selection, rowCount)) },
    { keys: "mod+s", label: strings.save, group: strings.selection, run: saveSelection },
    { keys: "a", label: strings.addStep, group: strings.pipeline, run: () => setPickerOpen(true) },
    { keys: "[", label: `${strings.pipeline} ⇄`, group: strings.layout, run: () => setLeftOpen((v) => !v) },
    { keys: "]", label: `${strings.details} ⇄`, group: strings.layout, run: () => setDrawerOpen((v) => !v) },
    ...viewOrder.slice(0, 9).map((id, i) => ({
      keys: String(i + 1),
      label: `Maximize · ${id}`,
      group: strings.layout,
      run: () => setLayout({ ...layout, maximized: layout.maximized === id ? null : id }),
    })),
    { keys: "?", label: strings.shortcuts, group: "General", run: () => setShowShortcuts((v) => !v) },
  ];

  const partitions = useMemoPartitions(dataset?.partition);

  if (!dataset || !raw || !frame) {
    return (
      <WorkbenchShell
        ariaLabel={props.title ?? strings.title}
        className={cx("n4pg", props.className)}
        style={props.style}
        header={<Brand title={props.title ?? strings.title} subtitle={strings.noDataset} />}
      >
        <EmptyState title={strings.noDataset} icon={icon.spark} action={props.emptySlot}>
          {strings.noDatasetHint}
        </EmptyState>
      </WorkbenchShell>
    );
  }

  const ctx: PlaygroundViewContext = {
    dataset,
    result,
    frame,
    raw,
    inverse,
    scopeOut,
    scopeSet,
    colorColumn,
    mapping,
    colorsOut,
    selection,
    selectedOut,
    hoverRow,
    hoverOut,
    setHoverRow,
    setSelection,
    target,
    targetOut,
    strings,
    icons,
    densityStops,
    onCropRange: cropOp ? (range) => addStep(cropOp, cursor && cursor !== RAW_CURSOR ? cursor : null, { min: range[0], max: range[1] }) : undefined,
  };

  const wavelengthRange: readonly [number, number] | null = raw.wavelengths.length
    ? [Math.min(raw.wavelengths[0]!, raw.wavelengths[raw.wavelengths.length - 1]!), Math.max(raw.wavelengths[0]!, raw.wavelengths[raw.wavelengths.length - 1]!)]
    : null;
  const projection = result?.projection;
  const componentCount = projection?.coordinates[0]?.length ?? 0;
  const componentOptions = [
    ...Array.from({ length: Math.max(componentCount, 3) }, (_, k) => ({
      value: String(k),
      label: options.scores.projection === "pca" ? `${strings.component}${k + 1}` : `${options.scores.projection.toUpperCase()} ${k + 1}`,
    })),
    ...(target?.kind === "regression" ? [{ value: String(TARGET_AXIS), label: `${strings.target} · ${target.name}` }] : []),
  ];
  const hasTarget = Boolean(target);
  const so = options.spectra;
  const sc = options.scores;
  const rp = options.repetitions;
  const nmAxis = /nm/i.test(raw.unit);
  const regions = wavelengthRange && nmAxis ? NIR_REGIONS.filter((r) => r.range[0] < wavelengthRange[1] && r.range[1] > wavelengthRange[0]) : [];
  const replicateCandidates = (dataset.metadata ?? []).filter((c) => c.kind === "categorical");
  const curvesShown = so.sampleCount > 0 ? Math.min(so.sampleCount, scopeOut.length) : scopeOut.length;
  const views: ViewSpec[] = [
    {
      id: "spectra",
      title: strings.viewSpectra,
      icon: VIEW_GLYPH.spectra,
      description: strings.descSpectra,
      subtitle: `${so.mode === "lines" && curvesShown < scopeOut.length ? `${formatCount(curvesShown)}/` : ""}${formatCount(scopeOut.length)} · ${frame.wavelengths.length} λ${so.compare !== "off" ? ` · ${strings.compare.toLowerCase()}` : ""}${so.range ? ` · ${formatValue(so.range[0], 0)}–${formatValue(so.range[1], 0)} ${frame.unit}` : ""}`,
      busy,
      actions: (
        <Segmented
          size="xs"
          ariaLabel="Display mode"
          value={so.mode}
          onChange={(mode) => patchView("spectra", { mode })}
          options={[
            { value: "lines", label: strings.modeLines },
            { value: "bands", label: strings.modeBands },
            { value: "density", label: strings.modeDensity },
          ]}
        />
      ),
      options: (
        <>
          <span className="n4wb-options-title">{strings.display}</span>
          <Segmented
            ariaLabel={strings.display}
            value={so.mode}
            onChange={(mode) => patchView("spectra", { mode })}
            options={[
              { value: "lines", label: strings.modeLines },
              { value: "bands", label: strings.modeBands },
              { value: "density", label: strings.modeDensity },
            ]}
          />
          <span className="n4wb-options-title">{strings.compare}</span>
          <Segmented
            ariaLabel={strings.compare}
            value={so.compare}
            onChange={(compare) => patchView("spectra", { compare })}
            options={[
              { value: "off", label: strings.compareOff },
              { value: "split", label: strings.compareSplit },
              { value: "overlay", label: strings.compareOverlay },
              { value: "diff", label: strings.compareDiff },
            ]}
          />
          {so.compare === "diff" ? <Toggle checked={so.absoluteDiff} onChange={(absoluteDiff) => patchView("spectra", { absoluteDiff })} label={strings.absoluteDiff} /> : null}
          {so.compare === "overlay" ? (
            <div className="n4wb-options-row">
              <span className="n4wb-field-label">{strings.ghostStyle}</span>
              <Segmented
                size="xs"
                ariaLabel={strings.ghostStyle}
                value={so.overlayStyle}
                onChange={(overlayStyle) => patchView("spectra", { overlayStyle })}
                options={[
                  { value: "envelope", label: strings.ghostEnvelope },
                  { value: "lines", label: strings.ghostLines },
                ]}
              />
            </div>
          ) : null}

          <span className="n4wb-options-title">{strings.curves}</span>
          <div className="n4wb-options-row">
            <span className="n4wb-field-label">{strings.drawn}</span>
            <Segmented
              size="xs"
              ariaLabel={strings.drawn}
              value={String(so.sampleCount)}
              onChange={(v) => patchView("spectra", { sampleCount: Number(v) })}
              options={SAMPLE_COUNTS.map((n) => ({ value: String(n), label: n === 0 ? strings.all : String(n) }))}
            />
          </div>
          {so.sampleCount > 0 ? (
            <div className="n4wb-options-row">
              <SelectField
                value={so.sampling}
                onChange={(v) => patchView("spectra", { sampling: v as SpectraOptions["sampling"] })}
                options={[
                  { value: "random", label: strings.samplingRandom },
                  { value: "stratified", label: strings.samplingStratified, disabled: target?.kind !== "regression" },
                  { value: "coverage", label: strings.samplingCoverage },
                ]}
              />
              <Button variant="outline" onClick={() => patchView("spectra", { seed: so.seed + 1 })} disabled={so.sampling === "coverage"}>
                {strings.reshuffle}
              </Button>
            </div>
          ) : null}
          <Toggle checked={so.selectedOnly} onChange={(selectedOnly) => patchView("spectra", { selectedOnly })} label={strings.selectedOnly} />
          <div className="n4wb-options-row">
            <SelectField
              label={strings.lineWidth}
              value={so.lineWidth === null ? "" : String(so.lineWidth)}
              onChange={(v) => patchView("spectra", { lineWidth: v === "" ? null : Number(v) })}
              options={[{ value: "", label: strings.auto }, ...[0.5, 1, 1.5, 2, 3].map((w) => ({ value: String(w), label: `${w} px` }))]}
            />
            <SelectField
              label={strings.lineOpacity}
              value={so.lineOpacity === null ? "" : String(so.lineOpacity)}
              onChange={(v) => patchView("spectra", { lineOpacity: v === "" ? null : Number(v) })}
              options={[{ value: "", label: strings.auto }, ...[0.05, 0.1, 0.25, 0.5, 0.8, 1].map((a) => ({ value: String(a), label: `${Math.round(a * 100)} %` }))]}
            />
          </div>

          <span className="n4wb-options-title">{strings.statistics}</span>
          <div className="n4wb-chip-row">
            {STAT_LINES.map((stat) => (
              <Chip
                key={stat}
                active={so.statLines.includes(stat)}
                onClick={() => patchView("spectra", { statLines: so.statLines.includes(stat) ? so.statLines.filter((x) => x !== stat) : [...so.statLines, stat] })}
              >
                {{ mean: strings.statMean, median: strings.statMedian, std: strings.statStd, minMax: strings.statMinMax }[stat]}
              </Chip>
            ))}
          </div>
          <div className="n4wb-options-row">
            <span className="n4wb-field-label">{strings.bandStatistic}</span>
            <Segmented
              size="xs"
              ariaLabel={strings.bandStatistic}
              value={so.bandKind}
              onChange={(bandKind) => patchView("spectra", { bandKind })}
              options={[
                { value: "meanStd", label: "μ ± σ" },
                { value: "quantiles", label: "IQR" },
                { value: "minMax", label: strings.bandMinMax },
              ]}
            />
          </div>

          <span className="n4wb-options-title">{strings.wavelengthWindow}</span>
          <div className="n4wb-chip-row">
            <Chip active={so.range === null} onClick={() => patchView("spectra", { range: null })}>
              {strings.fullRange}
            </Chip>
            {regions.map((region) => (
              <Chip
                key={region.id}
                active={so.range?.[0] === region.range[0] && so.range?.[1] === region.range[1]}
                title={`${region.range[0]}–${region.range[1]} nm`}
                onClick={() => patchView("spectra", { range: region.range })}
              >
                {region.label}
              </Chip>
            ))}
          </div>
          {wavelengthRange ? (
            <div className="n4wb-options-row">
              <NumberField
                label="min"
                value={so.range?.[0] ?? wavelengthRange[0]}
                unit={raw.unit}
                onChange={(v) => patchView("spectra", { range: [v, so.range?.[1] ?? wavelengthRange[1]] })}
              />
              <NumberField
                label="max"
                value={so.range?.[1] ?? wavelengthRange[1]}
                unit={raw.unit}
                onChange={(v) => patchView("spectra", { range: [so.range?.[0] ?? wavelengthRange[0], v] })}
              />
            </div>
          ) : null}
          <Toggle checked={so.invertX ?? /cm/i.test(frame.unit)} onChange={(invertX) => patchView("spectra", { invertX })} label={strings.invertAxis} />
        </>
      ),
      render: () => <SpectraBody ctx={ctx} opts={so} />,
    },
    {
      id: "scores",
      title: strings.viewScores,
      icon: VIEW_GLYPH.scores,
      description: strings.descScores,
      subtitle: projection
        ? `${projection.method.toUpperCase()}${sc.view3d ? " · 3D" : ""} · ${sc.axes
            .slice(0, sc.view3d ? 3 : 2)
            .map((k) => (k === TARGET_AXIS ? strings.target : String(k + 1)))
            .join(" × ")}`
        : undefined,
      busy,
      available: Boolean(projection && projection.coordinates.length === frame.rows.length),
      unavailableReason: busy ? strings.running : strings.needsProjection,
      actions: (
        <>
          <Segmented
            size="xs"
            ariaLabel="Projection"
            value={sc.projection}
            onChange={(p) => patchView("scores", { projection: p })}
            options={[
              { value: "pca", label: "PCA" },
              { value: "umap", label: "UMAP" },
            ]}
          />
          <Segmented
            size="xs"
            ariaLabel="Dimensions"
            value={sc.view3d ? "3d" : "2d"}
            onChange={(v) => patchView("scores", { view3d: v === "3d" })}
            options={[
              { value: "2d", label: "2D" },
              { value: "3d", label: strings.view3d },
            ]}
          />
        </>
      ),
      options: (
        <>
          <div className="n4wb-options-row">
            <Segmented
              ariaLabel="Projection"
              value={sc.projection}
              onChange={(p) => patchView("scores", { projection: p })}
              options={[
                { value: "pca", label: "PCA" },
                { value: "umap", label: "UMAP" },
              ]}
            />
            <Toggle checked={sc.view3d} onChange={(view3d) => patchView("scores", { view3d })} label={strings.view3d} />
          </div>
          <div className="n4wb-options-row">
            {(sc.view3d ? [0, 1, 2] : [0, 1]).map((axis) => (
              <SelectField
                key={axis}
                label={[strings.axisX, strings.axisY, strings.axisZ][axis]}
                value={String(sc.axes[axis])}
                options={componentOptions}
                onChange={(v) => {
                  const axes = [...sc.axes] as [number, number, number];
                  axes[axis] = Number(v);
                  patchView("scores", { axes });
                }}
              />
            ))}
          </div>
          <div className="n4wb-options-row">
            <span className="n4wb-field-label">{strings.pointSize}</span>
            <Segmented
              size="xs"
              ariaLabel={strings.pointSize}
              value={sc.pointSize}
              onChange={(pointSize) => patchView("scores", { pointSize })}
              options={[
                { value: "auto", label: strings.auto },
                { value: "small", label: strings.sizeSmall },
                { value: "medium", label: strings.sizeMedium },
                { value: "large", label: strings.sizeLarge },
              ]}
            />
          </div>
          <Toggle checked={sc.equalScale} onChange={(equalScale) => patchView("scores", { equalScale })} label={strings.equalScale} />
          {!sc.view3d ? <Toggle checked={sc.ellipse} onChange={(ellipse) => patchView("scores", { ellipse })} label={strings.ellipse} /> : null}
        </>
      ),
      render: () => <ScoresBody ctx={ctx} opts={sc} />,
    },
    {
      id: "target",
      title: target ? `${strings.viewTarget} · ${target.name}` : strings.viewTarget,
      icon: VIEW_GLYPH.target,
      description: strings.descTarget,
      available: hasTarget,
      unavailableReason: strings.needsTarget,
      options: (
        <>
          <NumberField label={strings.bins} value={options.target.bins ?? 0} min={0} max={80} step={1} onChange={(v) => patchView("target", { bins: v > 0 ? v : undefined })} />
          <Toggle checked={options.target.showMean} onChange={(showMean) => patchView("target", { showMean })} label={strings.showMean} />
          <Toggle checked={options.target.showMedian} onChange={(showMedian) => patchView("target", { showMedian })} label={strings.showMedian} />
        </>
      ),
      render: () => <TargetBody ctx={ctx} opts={options.target} />,
    },
    {
      id: "outliers",
      title: strings.viewOutliers,
      icon: VIEW_GLYPH.outliers,
      description: strings.descOutliers,
      busy,
      available: Boolean(result?.outliers),
      unavailableReason: busy ? strings.running : strings.needsOutliers,
      options: <Toggle checked={options.outlierLog} onChange={(outlierLog) => patchOptions({ outlierLog })} label={strings.logScale} />,
      render: () => <OutliersBody ctx={ctx} logScale={options.outlierLog} />,
    },
    {
      id: "loadings",
      title: strings.viewLoadings,
      icon: VIEW_GLYPH.loadings,
      description: strings.descLoadings,
      busy,
      available: Boolean(result?.loadings?.components.length),
      unavailableReason: busy ? strings.running : strings.needsLoadings,
      options: (
        <>
          <span className="n4wb-options-title">{strings.component}</span>
          {Array.from({ length: Math.max(3, result?.loadings?.components.length ?? 0) }, (_, k) => (
            <Toggle
              key={k}
              checked={options.loadings.includes(k)}
              onChange={(on) => patchOptions({ loadings: on ? [...options.loadings, k].sort((a, b) => a - b) : options.loadings.filter((x) => x !== k) })}
              label={`${strings.component}${k + 1}`}
            />
          ))}
        </>
      ),
      render: () => <LoadingsBody ctx={ctx} components={options.loadings} />,
    },
    {
      id: "correlation",
      title: strings.viewCorrelation,
      icon: VIEW_GLYPH.correlation,
      description: strings.descCorrelation,
      available: target?.kind === "regression",
      unavailableReason: hasTarget ? strings.needsNumericTarget : strings.needsTarget,
      options: <Toggle checked={options.correlationRaw} onChange={(correlationRaw) => patchOptions({ correlationRaw })} label={`${strings.input} r(λ)`} />,
      render: () => <CorrelationBody ctx={ctx} showRaw={options.correlationRaw} />,
    },
    {
      id: "folds",
      title: strings.viewFolds,
      icon: VIEW_GLYPH.folds,
      description: strings.descFolds,
      busy,
      available: Boolean(result?.folds?.folds.length),
      unavailableReason: strings.needsFolds,
      render: () => <FoldsBody ctx={ctx} />,
    },
    {
      id: "repetitions",
      title: strings.viewRepetitions,
      icon: VIEW_GLYPH.repetitions,
      description: strings.descRepetitions,
      subtitle: result?.repetitions ? `${replicateColumn ?? ""} · vs ${REPETITION_REFERENCE_LABELS[rp.reference].toLowerCase()}` : undefined,
      busy,
      available: Boolean(replicateColumn && result?.repetitions),
      unavailableReason: !replicateColumn ? strings.needsGroupColumn : busy ? strings.running : strings.needsRepetitions,
      actions: (
        <Segmented
          size="xs"
          ariaLabel={strings.display}
          value={rp.display}
          onChange={(display) => patchView("repetitions", { display })}
          options={[
            { value: "strip", label: strings.strip },
            { value: "histogram", label: strings.histogram },
          ]}
        />
      ),
      options: (
        <>
          <Segmented
            ariaLabel={strings.display}
            value={rp.display}
            onChange={(display) => patchView("repetitions", { display })}
            options={[
              { value: "strip", label: strings.strip },
              { value: "histogram", label: strings.histogram },
            ]}
          />
          <SelectField
            label={strings.groupBy}
            value={replicateColumn ?? ""}
            placeholder="—"
            options={replicateCandidates.map((c) => ({ value: c.key, label: c.label }))}
            onChange={(groupBy) => patchView("repetitions", { groupBy })}
          />
          <SelectField
            label={strings.metric}
            value={rp.metric}
            options={Object.entries(REPETITION_METRIC_LABELS).map(([value, label]) => ({ value, label }))}
            onChange={(metric) => patchView("repetitions", { metric: metric as RepetitionOptions["metric"] })}
          />
          <SelectField
            label={strings.reference}
            value={rp.reference}
            options={Object.entries(REPETITION_REFERENCE_LABELS).map(([value, label]) => ({ value, label }))}
            onChange={(reference) => patchView("repetitions", { reference: reference as RepetitionOptions["reference"] })}
          />
          <SelectField
            label={strings.sortBy}
            value={rp.sort}
            options={[
              { value: "worst", label: "Worst spread" },
              { value: "mean", label: "Mean distance" },
              { value: "size", label: "Group size" },
              { value: "name", label: "Name" },
              { value: "order", label: "Dataset order" },
            ]}
            onChange={(sort) => patchView("repetitions", { sort: sort as RepetitionOptions["sort"] })}
          />
          <span className="n4wb-options-title">{strings.threshold}</span>
          <div className="n4wb-options-row">
            <Segmented
              size="xs"
              ariaLabel={strings.threshold}
              value={rp.threshold}
              onChange={(threshold) => patchView("repetitions", { threshold })}
              options={[
                { value: "host", label: strings.thresholdHost },
                { value: "p90", label: "P90" },
                { value: "p95", label: "P95" },
                { value: "p99", label: "P99" },
                { value: "manual", label: strings.thresholdManual },
                { value: "off", label: strings.thresholdOff },
              ]}
            />
          </div>
          {rp.threshold === "manual" ? (
            <NumberField label={strings.threshold} value={rp.manualThreshold} min={0} onChange={(manualThreshold) => patchView("repetitions", { manualThreshold })} />
          ) : null}
          <Toggle checked={rp.flaggedOnly} onChange={(flaggedOnly) => patchView("repetitions", { flaggedOnly })} label={strings.flaggedOnly} />
          <span className="n4wb-options-title">{strings.quantiles}</span>
          <div className="n4wb-chip-row">
            {QUANTILES.map((q) => (
              <Chip
                key={q}
                active={rp.quantiles.includes(q)}
                onClick={() => patchView("repetitions", { quantiles: rp.quantiles.includes(q) ? rp.quantiles.filter((x) => x !== q) : [...rp.quantiles, q].sort() })}
              >
                P{Math.round(q * 100)}
              </Chip>
            ))}
          </div>
          <Toggle checked={rp.log} onChange={(log) => patchView("repetitions", { log })} label={strings.logScale} />
          {rp.display === "strip" ? <Toggle checked={rp.ranges} onChange={(ranges) => patchView("repetitions", { ranges })} label={strings.ranges} /> : null}
        </>
      ),
      render: () => <RepetitionsBody ctx={ctx} opts={rp} />,
    },
    {
      id: "variance",
      title: strings.viewVariance,
      icon: VIEW_GLYPH.variance,
      description: strings.descVariance,
      subtitle: VARIANCE_METRIC_LABELS[options.variance.metric],
      options: (
        <>
          <SelectField
            label={strings.variability}
            value={options.variance.metric}
            options={Object.entries(VARIANCE_METRIC_LABELS).map(([value, label]) => ({ value, label }))}
            onChange={(metric) => patchView("variance", { metric: metric as VarianceOptions["metric"] })}
          />
          <Toggle checked={options.variance.compareInput} onChange={(compareInput) => patchView("variance", { compareInput })} label={strings.compareInput} />
          <Toggle checked={options.variance.selection} onChange={(selection) => patchView("variance", { selection })} label={strings.selectionProfile} />
        </>
      ),
      render: () => <VarianceBody ctx={ctx} opts={options.variance} />,
    },
    {
      id: "groupMeans",
      title: strings.viewGroupMeans,
      icon: VIEW_GLYPH.groupMeans,
      description: strings.descGroupMeans,
      subtitle: colorColumn?.kind === "categorical" ? colorColumn.label : target?.kind === "regression" ? `${target.name} quintiles` : undefined,
      options: (
        <>
          <Toggle checked={options.groupMeans.bands} onChange={(bands) => patchView("groupMeans", { bands })} label={strings.showBands} />
          <Toggle checked={options.groupMeans.centered} onChange={(centered) => patchView("groupMeans", { centered })} label={strings.centered} />
        </>
      ),
      render: () => <GroupMeansBody ctx={ctx} opts={options.groupMeans} />,
    },
    {
      id: "heatmap",
      title: strings.viewHeatmap,
      icon: VIEW_GLYPH.heatmap,
      description: strings.descHeatmap,
      busy: options.heatmap.sort === "pc1" ? busy : undefined,
      options: (
        <>
          <SelectField
            label={strings.sortBy}
            value={options.heatmap.sort}
            options={[
              { value: "target", label: target ? target.name : strings.target, disabled: target?.kind !== "regression" },
              { value: "pc1", label: "PC1" },
              { value: "color", label: colorColumn?.label ?? strings.colorBy },
              { value: "order", label: "Dataset order" },
            ]}
            onChange={(sort) => patchView("heatmap", { sort: sort as HeatmapOptions["sort"] })}
          />
          <Toggle checked={options.heatmap.centered} onChange={(centered) => patchView("heatmap", { centered })} label={strings.centered} />
        </>
      ),
      render: () => <HeatmapBody ctx={ctx} opts={options.heatmap} />,
    },
    {
      id: "samples",
      title: strings.viewSamples,
      icon: VIEW_GLYPH.samples,
      description: strings.descSamples,
      render: () => <SamplesBody ctx={ctx} />,
    },
  ];

  const cursorStep = cursor && cursor !== RAW_CURSOR ? pipeline.find((s) => s.id === cursor) : undefined;
  const cursorLabel = cursor === RAW_CURSOR ? strings.rawData : cursorStep ? cursorStep.label ?? operatorById.get(cursorStep.operatorId)?.name ?? cursorStep.operatorId : null;

  const header = (
    <>
      <Brand title={props.title ?? strings.title} subtitle={`${dataset.name} · ${strings.dimensions(frame.matrix.rows, frame.matrix.cols)}`} />
      <IconButton label={`${strings.pipeline} ⇄`} shortcut="[" active={leftOpen} onClick={() => setLeftOpen((v) => !v)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16" />
        </svg>
      </IconButton>
      <span className="n4wb-header-sep" />
      <div className="n4wb-header-group">
        <Segmented
          ariaLabel={strings.scope}
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: strings.scopeAll },
            ...partitions.map((p) => ({ value: `partition:${p}` as PlaygroundScope, label: p })),
            { value: "selection", label: strings.scopeSelection, disabled: selection.length === 0 },
          ]}
        />
        <SelectField
          label={strings.colorBy}
          value={colorKey ?? ""}
          onChange={(v) => setColorByState(v === "" ? "" : v)}
          options={[
            { value: "", label: strings.none },
            ...columns.map((c) => ({ value: c.key, label: c.label, group: c.key.startsWith(TARGET_KEY_PREFIX) ? strings.target : c.key === "partition" || c.key === "fold" || c.key === "split" ? "Design" : c.key === "flags" || c.key === "rep-distance" ? "Pipeline" : "Metadata" })),
          ]}
        />
        <ColorSchemePicker
          value={colorScheme}
          onChange={setColorScheme}
          activeKind={colorColumn?.kind ?? null}
          strings={locale === "fr" ? COLOR_SCHEME_PICKER_STRINGS_FR : COLOR_SCHEME_PICKER_STRINGS_EN}
          icons={icons}
        />
      </div>
      <span className="n4wb-header-grow" />
      <div className="n4wb-header-group">
        <LayoutPresetPicker value={layout.preset} onChange={(preset) => setLayout({ ...layout, preset, maximized: null })} />
        <ViewsMenu views={views} layout={layout} onLayoutChange={setLayout} label={strings.views} icons={icons} />
        {props.headerActions}
        <IconButton label={strings.shortcuts} shortcut="?" onClick={() => setShowShortcuts(true)}>
          {icon.keyboard}
        </IconButton>
        <IconButton label={`${strings.details} ⇄`} shortcut="]" active={drawerOpen} onClick={() => setDrawerOpen((v) => !v)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M15 4v16" />
          </svg>
        </IconButton>
      </div>
    </>
  );

  const left = (
    <PipelinePanel
      steps={pipeline}
      operators={operators}
      outcomes={outcomes}
      cursor={cursor}
      onCursorChange={setCursor}
      onOpenPicker={() => setPickerOpen(true)}
      onUpdate={(id, patch) => setPipeline(updateStep(pipeline, id, patch))}
      onRemove={(id) => setPipeline(removeStep(pipeline, id))}
      onDuplicate={(id) => {
        const step = pipeline.find((s) => s.id === id);
        if (!step) return;
        setPipeline(insertStep(pipeline, { ...step, id: newStepId(step.operatorId) }, undefined, id));
      }}
      onMove={(id, to) => setPipeline(moveStep(pipeline, id, to))}
      onClear={() => setPipeline([])}
      onUndo={undo}
      onRedo={redo}
      canUndo={history.current.past.length > 0}
      canRedo={history.current.future.length > 0}
      columns={dataset.metadata ?? []}
      rawShape={[raw.matrix.rows, raw.matrix.cols]}
      running={busy}
      strings={strings}
      icons={icons}
      datasetCard={
        <DatasetCard
          name={dataset.name}
          rows={raw.matrix.rows}
          cols={raw.matrix.cols}
          range={wavelengthRange}
          unit={raw.unit}
          targets={(dataset.targets ?? []).map((t) => ({ name: t.name, kind: t.kind }))}
          activeTarget={target?.name ?? null}
          onTargetChange={setTargetName}
          onChange={props.onChangeDataset}
          slot={props.datasetSlot}
          strings={strings}
        />
      }
      footer={
        props.onOpenInEditor || props.onExportPipeline ? (
          <>
            {props.onOpenInEditor ? (
              <Button variant="outline" icon={icon.arrowRight} onClick={() => props.onOpenInEditor?.(pipeline)} disabled={pipeline.length === 0}>
                {strings.openInEditor}
              </Button>
            ) : null}
            {props.onExportPipeline ? (
              <Button variant="ghost" icon={icon.download} onClick={() => props.onExportPipeline?.(pipeline)} disabled={pipeline.length === 0}>
                {strings.exportPipeline}
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    />
  );

  const focusRow = hoverRow ?? (selection.length === 1 ? selection[0]! : null);
  const breakdown = selectionBreakdown(ctx);
  const selectionStats = targetStats(target, selection, allRows);
  const right = (
    <div className="n4pg-drawer">
      <div className="n4wb-panel-head">
        <h3>{strings.details}</h3>
      </div>
      <div className="n4wb-scroll">
        <PanelSection title={strings.selection} count={selection.length || undefined}>
          {selection.length === 0 ? (
            <p className="n4wb-muted n4pg-hint">{strings.noSelectionHint}</p>
          ) : (
            <>
              <p className="n4pg-sel-headline">{strings.selected(selection.length, rowCount)}</p>
              <div className="n4wb-stats">
                <StatTile label="Share" value={formatPercent(selection.length / Math.max(1, rowCount))} />
                {selectionStats ? (
                  <>
                    <StatTile label={`${target!.name} μ`} value={formatValue(selectionStats.selMean)} hint={`all ${formatValue(selectionStats.allMean)}`} tone="accent" />
                    <StatTile label={`${target!.name} σ`} value={formatValue(selectionStats.selSd)} hint={`all ${formatValue(selectionStats.allSd)}`} />
                  </>
                ) : null}
              </div>
              {breakdown.length > 0 ? (
                <ul className="n4pg-breakdown" aria-label={colorColumn?.label}>
                  {breakdown.slice(0, 8).map((b) => (
                    <li key={b.value}>
                      <span className="n4wb-legend-swatch" style={{ background: b.color }} aria-hidden="true" />
                      <span className="n4pg-breakdown-label">{b.value}</span>
                      <span className="n4pg-breakdown-bar">
                        <span style={{ width: `${(b.selected / Math.max(1, b.total)) * 100}%`, background: b.color }} />
                      </span>
                      <span className="n4wb-mono n4wb-muted">
                        {b.selected}/{b.total}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <SelectionSpectrum ctx={ctx} />
            </>
          )}
          <div className="n4pg-actions">
            <Button variant="outline" onClick={() => setSelection(EMPTY_SELECTION)} disabled={selection.length === 0}>
              {strings.clear}
            </Button>
            <Button variant="outline" onClick={() => setSelection(invertSelection(selection, rowCount))}>
              {strings.invert}
            </Button>
            <Button variant="outline" icon={icon.bookmark} onClick={saveSelection} disabled={selection.length === 0}>
              {strings.save}
            </Button>
            {sampleFilterOp ? (
              <>
                <Button variant="outline" icon={icon.filter} onClick={() => filterSelection("keep")} disabled={selection.length === 0} title="Add a sample filter step keeping only the selection">
                  {strings.keepOnly}
                </Button>
                <Button variant="danger" icon={icon.minus} onClick={() => filterSelection("remove")} disabled={selection.length === 0} title="Add a sample filter step removing the selection">
                  {strings.exclude}
                </Button>
              </>
            ) : null}
            {props.onExportSelection ? (
              <Button
                variant="ghost"
                icon={icon.download}
                disabled={selection.length === 0}
                onClick={() => props.onExportSelection?.(selection, selection.map((row) => sampleLabel(dataset, row)))}
              >
                {strings.exportIds}
              </Button>
            ) : null}
          </div>
        </PanelSection>
        {focusRow !== null ? (
          <PanelSection title={strings.sample}>
            <SampleDetails dataset={dataset} row={focusRow} color={mapping.colors[focusRow]} columns={columns} present={(inverse[focusRow]?.length ?? 0) > 0} />
          </PanelSection>
        ) : null}
        <PanelSection title={strings.savedSelections} count={saved.length || undefined} defaultOpen={saved.length > 0}>
          {saved.length === 0 ? (
            <p className="n4wb-muted n4pg-hint">{strings.savedEmpty}</p>
          ) : (
            <ul className="n4pg-saved">
              {saved.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="n4pg-saved-main"
                    title={`${strings.apply} (Shift add · Alt remove)`}
                    onClick={(event) => setSelection(combineSelection(selection, entry.indices, selectionModeFromModifiers(event)))}
                  >
                    <span className="n4wb-legend-swatch" style={{ background: entry.color }} aria-hidden="true" />
                    <span className="n4pg-saved-name">{entry.name}</span>
                    <span className="n4wb-count">{entry.indices.length}</span>
                  </button>
                  <IconButton label={strings.remove} tone="danger" onClick={() => setSaved(saved.filter((s) => s.id !== entry.id))}>
                    {icon.close}
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </PanelSection>
        {result?.warnings?.length ? (
          <PanelSection title={strings.warnings} count={result.warnings.length}>
            <ul className="n4pg-warnings">
              {result.warnings.map((w, i) => (
                <li key={i} className="n4wb-note is-warning">
                  {w}
                </li>
              ))}
            </ul>
          </PanelSection>
        ) : null}
      </div>
    </div>
  );

  const statusText = status === "error" ? strings.failed : busy ? strings.running : strings.ready;
  const statusBar = (
    <>
      <span className="n4wb-status-item">
        <span className={cx("n4wb-dot", status === "error" ? "is-error" : busy ? "is-busy" : undefined)} />
        {statusText}
        {result?.durationMs !== undefined && !busy ? <strong>{formatDuration(result.durationMs)}</strong> : null}
        {error ? <span className="n4pg-text-danger">· {error}</span> : null}
      </span>
      <span className="n4wb-status-item">
        <strong>{formatCount(scopeOut.length)}</strong>/{formatCount(frame.matrix.rows)} {strings.samples}
      </span>
      <span className="n4wb-status-item">
        <strong>{frame.matrix.cols}</strong> λ
      </span>
      {selection.length > 0 ? (
        <span className="n4wb-status-item">
          <strong>{formatCount(selection.length)}</strong> {strings.selection.toLowerCase()}
        </span>
      ) : null}
      {hoverRow !== null ? <span className="n4wb-status-item">↳ {sampleLabel(dataset, hoverRow)}</span> : null}
      <span className="n4wb-status-grow" />
      <span className="n4wb-status-item n4wb-muted">click · drag box · Shift add · Alt remove · ? help</span>
    </>
  );

  return (
    <WorkbenchShell
      ariaLabel={props.title ?? strings.title}
      className={cx("n4pg", props.className)}
      style={props.style}
      header={header}
      left={left}
      right={right}
      leftOpen={leftOpen}
      rightOpen={drawerOpen}
      status={statusBar}
      leftWidth={330}
      rightWidth={316}
      onKeyDown={(event) => dispatchShortcut(event, bindings)}
    >
      <div className="n4pg-main">
        <div className="n4pg-legendbar">
          <ColorLegend
            legend={mapping.legend}
            {...(colorColumn ? { title: colorColumn.label } : {})}
            onPickCategory={(value, event) => {
              if (!colorColumn) return;
              const rows: number[] = [];
              colorColumn.values.forEach((v, row) => {
                if (v !== null && String(v) === value) rows.push(row);
              });
              setSelection(combineSelection(selection, rows, selectionModeFromModifiers(event)));
            }}
          />
          <span className="n4wb-header-grow" />
          {cursorLabel ? (
            <span className="n4pg-cursor-chip" role="status">
              <span className="n4pg-cursor-dot" aria-hidden="true" />
              {strings.previewing(cursorLabel)}
              <button type="button" className="n4pg-link" onClick={() => setCursor(null)}>
                {strings.previewAll}
              </button>
            </span>
          ) : null}
          {stale && status !== "error" ? <span className="n4pg-stale">{strings.stale}</span> : null}
        </div>
        <div className="n4pg-grid-wrap">
          <ViewGrid views={views} layout={layout} onLayoutChange={setLayout} icons={icons} empty={<EmptyState title={strings.views}>{strings.descSpectra}</EmptyState>} />
        </div>
      </div>
      {pickerOpen ? (
        <OperatorPicker
          operators={operators}
          recent={recentOps}
          usage={usage}
          columns={dataset.metadata ?? []}
          insertLabel={cursorStep ? `→ after ${cursorStep.label ?? operatorById.get(cursorStep.operatorId)?.name ?? cursorStep.operatorId}` : "→ end of chain"}
          strings={strings}
          icons={icons}
          onClose={() => setPickerOpen(false)}
          onPick={(op, params, keepOpen) => {
            addStep(op, cursorStep ? cursorStep.id : null, params);
            setRecentOps((list) => [op.id, ...list.filter((id) => id !== op.id)].slice(0, 12));
            if (!keepOpen) setPickerOpen(false);
          }}
        />
      ) : null}
      {showShortcuts ? (
        <ShortcutsDialog
          bindings={bindings}
          onClose={() => setShowShortcuts(false)}
          title={strings.shortcuts}
          gestures={[
            ["Click", "Pick a curve / point (empty space clears)"],
            ["Drag", "Box select (lasso tool for free shapes)"],
            ["Shift / Alt / Ctrl", "Add / remove / toggle"],
            ["Ctrl + wheel", "Zoom · double-click resets"],
            ["Drag a view header", "Reorder views · double-click maximizes"],
          ]}
        />
      ) : null}
    </WorkbenchShell>
  );
}

function useMemoPartitions(partition: ReadonlyArray<string | null> | undefined): string[] {
  return useMemo(() => {
    if (!partition) return [];
    const seen = new Set<string>();
    for (const p of partition) if (p) seen.add(p);
    const order = ["train", "validation", "test"];
    return [...seen].sort((a, b) => (order.indexOf(a) + 10) % 13 - (order.indexOf(b) + 10) % 13 || a.localeCompare(b));
  }, [partition]);
}

function targetStats(target: PlaygroundTarget | undefined, selection: Selection, all: Selection) {
  if (!target || target.kind !== "regression") return null;
  const stats = (rows: Selection) => {
    const values: number[] = [];
    for (const row of rows) {
      const v = target.values[row];
      if (typeof v === "number" && Number.isFinite(v)) values.push(v);
    }
    if (values.length === 0) return { mean: Number.NaN, sd: Number.NaN };
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, values.length - 1));
    return { mean, sd };
  };
  const sel = stats(selection);
  const everyone = stats(all);
  return { selMean: sel.mean, selSd: sel.sd, allMean: everyone.mean, allSd: everyone.sd };
}

function SampleDetails({
  dataset,
  row,
  color,
  columns,
  present,
}: {
  dataset: PlaygroundDataset;
  row: number;
  color: string | undefined;
  columns: readonly RowColumn[];
  present: boolean;
}) {
  return (
    <div className="n4pg-sample">
      <div className="n4pg-sample-head">
        <span className="n4wb-legend-swatch" style={{ background: color }} aria-hidden="true" />
        <strong>{sampleLabel(dataset, row)}</strong>
        {!present ? <span className="n4pg-badge is-danger">removed by pipeline</span> : null}
      </div>
      <dl className="n4wb-kv">
        {columns.slice(0, 14).map((column) => {
          const v = column.values[row];
          return (
            <div key={column.key} style={{ display: "contents" }}>
              <dt>{column.label}</dt>
              <dd>{typeof v === "number" ? formatValue(v) : String(v ?? "—")}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function Brand({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="n4wb-brand">
      <span className="n4wb-brand-mark" aria-hidden="true">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 15c2-1 3-8 5-8s3 10 5 10 3-12 5-12 2 5 3 6" />
        </svg>
      </span>
      <span className="n4wb-brand-title">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </span>
    </div>
  );
}
