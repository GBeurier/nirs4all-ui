import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import { cx } from "../workbench/_cx.js";
import { resolveRowColors } from "../workbench/colorBy.js";
import { ColorLegend } from "../workbench/ColorLegend.js";
import { Button, Chip, EmptyState, IconButton, Segmented, SelectField, StatTile, Toggle } from "../workbench/controls.js";
import { formatDuration, formatValue } from "../workbench/format.js";
import { useControllable } from "../workbench/hooks.js";
import { resolveIcons, type WorkbenchIcons } from "../workbench/icons.js";
import { LayoutPresetPicker, PanelSection, ViewGrid, ViewsMenu, WorkbenchShell, type ViewSpec, type WorkbenchLayout } from "../workbench/layout.js";
import { combineSelection, EMPTY_SELECTION, invertSelection, selectionModeFromModifiers, type Selection } from "../workbench/selection.js";
import { dispatchShortcut, ShortcutsDialog, type ShortcutBinding } from "../workbench/shortcuts.js";
import {
  chainColumns,
  chainLabel,
  EMPTY_CHAIN_FILTER,
  facetLabel,
  filterChains,
  hyperparameterNames,
  isBetter,
  rankChains,
  scoreOf,
  usefulFacets,
  type ChainFilter,
  type PivotAggregate,
} from "./analysis.js";
import { ChainList } from "./ChainList.js";
import { resolveInspectorStrings, type InspectorLocale, type InspectorStrings } from "./locale.js";
import type { ChainFacet, ChainPredictions, InspectorChain, InspectorViewId, ScoreRef } from "./types.js";
import {
  COMPARE_COLORS,
  ConfusionBody,
  EffectsBody,
  FoldsBody,
  GeneralizationBody,
  HardSamplesBody,
  HeatmapBody,
  HyperparamsBody,
  LandscapeBody,
  LeaderboardBody,
  PredictionBody,
  StepChips,
  type InspectorViewContext,
  type PointColoring,
} from "./views.js";

export interface InspectorProps {
  /** Trained chains in scope (the host applies run / dataset source filters). */
  chains: readonly InspectorChain[];
  /** Available score references; the first is active by default. */
  scoreRefs: readonly ScoreRef[];
  scoreRef?: string | undefined;
  onScoreRefChange?: ((key: string) => void) | undefined;
  /** Loaded predictions by chain id. */
  predictions?: Readonly<Record<string, ChainPredictions>> | undefined;
  /** Chain ids whose predictions are being fetched. */
  loadingPredictions?: readonly string[] | undefined;
  /** Called with the compared chain ids that have no predictions yet. */
  onRequestPredictions?: ((chainIds: readonly string[]) => void) | undefined;
  /** Compared chain ids (controlled when provided). Empty = auto (best chain). */
  compare?: readonly string[] | undefined;
  defaultCompare?: readonly string[] | undefined;
  onCompareChange?: ((chainIds: readonly string[]) => void) | undefined;
  maxCompare?: number | undefined;
  /** Selected chain ids (controlled when provided). */
  selection?: readonly string[] | undefined;
  onSelectionChange?: ((chainIds: readonly string[]) => void) | undefined;
  layout?: WorkbenchLayout | undefined;
  defaultLayout?: WorkbenchLayout | undefined;
  onLayoutChange?: ((layout: WorkbenchLayout) => void) | undefined;
  onOpenChain?: ((chain: InspectorChain) => void) | undefined;
  onOpenInPlayground?: ((chain: InspectorChain) => void) | undefined;
  /** Export the given sample keys (e.g. to inspect them in the Playground). */
  onExportSamples?: ((sampleKeys: readonly string[]) => void) | undefined;
  /** Host source pickers (runs, datasets, workspaces) shown above the list. */
  sourceSlot?: ReactNode;
  headerActions?: ReactNode;
  title?: string | undefined;
  locale?: InspectorLocale | undefined;
  strings?: Partial<InspectorStrings> | undefined;
  icons?: WorkbenchIcons | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

export const DEFAULT_INSPECTOR_LAYOUT: WorkbenchLayout = {
  preset: "grid",
  views: ["landscape", "parity", "heatmap", "residuals"],
  maximized: null,
};

const VIEW_GLYPH: Record<InspectorViewId, ReactNode> = {
  landscape: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="6" r="1.7" />
      <circle cx="10" cy="7" r="1.7" />
      <circle cx="13" cy="5" r="1.7" />
      <circle cx="9" cy="12" r="1.7" />
      <circle cx="15" cy="13" r="1.7" />
      <circle cx="17" cy="19" r="1.7" />
      <circle cx="12" cy="18" r="1.7" />
    </svg>
  ),
  heatmap: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="5" height="5" rx="1" />
      <rect x="9.5" y="3" width="5" height="5" rx="1" opacity=".5" />
      <rect x="16" y="3" width="5" height="5" rx="1" opacity=".25" />
      <rect x="3" y="9.5" width="5" height="5" rx="1" opacity=".6" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="16" y="9.5" width="5" height="5" rx="1" opacity=".4" />
      <rect x="3" y="16" width="5" height="5" rx="1" opacity=".3" />
      <rect x="9.5" y="16" width="5" height="5" rx="1" opacity=".7" />
      <rect x="16" y="16" width="5" height="5" rx="1" />
    </svg>
  ),
  generalization: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 20L20 4" strokeDasharray="2 2" />
      <circle cx="9" cy="13" r="1.6" fill="currentColor" />
      <circle cx="14" cy="9" r="1.6" fill="currentColor" />
      <circle cx="8" cy="6" r="1.6" fill="currentColor" />
    </svg>
  ),
  parity: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 20L20 4" />
      <circle cx="8" cy="15" r="1.4" fill="currentColor" />
      <circle cx="12" cy="11" r="1.4" fill="currentColor" />
      <circle cx="16" cy="9" r="1.4" fill="currentColor" />
    </svg>
  ),
  residuals: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 12h18" />
      <circle cx="6" cy="9" r="1.4" fill="currentColor" />
      <circle cx="10" cy="14" r="1.4" fill="currentColor" />
      <circle cx="14" cy="10" r="1.4" fill="currentColor" />
      <circle cx="18" cy="15" r="1.4" fill="currentColor" />
    </svg>
  ),
  folds: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M3 14l4-3 4 2 4-5 6 3" />
      <path d="M3 19l4-1 4 1 4-2 6 1" opacity=".5" />
    </svg>
  ),
  hyperparams: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  ),
  effects: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3v18" opacity=".4" />
      <path d="M6 7h10M9 12h8M5 17h9" />
    </svg>
  ),
  confusion: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" opacity=".3" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" opacity=".3" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  ),
  samples: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5M12 16v.1" />
    </svg>
  ),
  table: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M3 14h18M9 4v16" />
    </svg>
  ),
};

interface InspectorViewOptions {
  heatRows: ChainFacet | null;
  heatCols: ChainFacet | null;
  aggregate: PivotAggregate;
  genX: string | null;
  genY: string | null;
  coloring: PointColoring;
  partition: string;
  param: string | null;
  logParam: boolean;
  normalizeConfusion: boolean;
}

const DEFAULT_OPTIONS: InspectorViewOptions = {
  heatRows: null,
  heatCols: null,
  aggregate: "best",
  genX: null,
  genY: null,
  coloring: "chain",
  partition: "all",
  param: null,
  logParam: false,
  normalizeConfusion: true,
};

/**
 * The Inspector capsule: rank and dissect trained chains. Left: searchable,
 * filterable, groupable leaderboard with ☆ compare toggles. Center: linked
 * views — chain-level (score landscape, pivot heatmap, generalization,
 * hyper-parameters, step effects, leaderboard) and sample-level for the
 * compared chains (predicted vs observed, residuals, fold stability,
 * confusion, hard samples). Right: chain details, step diff, selection.
 * Selection (highlight) and comparison (which predictions to show) are two
 * explicit, separate sets.
 */
export function Inspector(props: InspectorProps) {
  const { chains, scoreRefs, predictions = {}, loadingPredictions = [], locale, icons, maxCompare = 6 } = props;
  const strings = useMemo(() => resolveInspectorStrings(locale, props.strings), [locale, props.strings]);
  const icon = resolveIcons(icons);

  const [refKey, setRefKey] = useControllable<string>(props.scoreRef, scoreRefs[0]?.key ?? "", props.onScoreRefChange);
  const [layout, setLayout] = useControllable<WorkbenchLayout>(props.layout, props.defaultLayout ?? DEFAULT_INSPECTOR_LAYOUT, props.onLayoutChange);
  const [compareState, setCompare] = useControllable<readonly string[]>(props.compare, props.defaultCompare ?? [], props.onCompareChange);
  const [selectedIds, setSelectedIds] = useControllable<readonly string[]>(props.selection, [], props.onSelectionChange);
  const [filter, setFilter] = useState<ChainFilter>(EMPTY_CHAIN_FILTER);
  const [groupBy, setGroupBy] = useState<ChainFacet | null>(null);
  const [colorKey, setColorKey] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [sampleSelection, setSampleSelection] = useState<ReadonlySet<string>>(new Set());
  const [hoverSample, setHoverSample] = useState<string | null>(null);
  const [options, setOptions] = useState<InspectorViewOptions>(DEFAULT_OPTIONS);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [leftOpen, setLeftOpen] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const patch = (p: Partial<InspectorViewOptions>) => setOptions((o) => ({ ...o, ...p }));

  // ---------------------------------------------------------------- derived chains
  // Raw scores are only comparable within one dataset: scope to one by default.
  const datasets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const chain of chains) if (chain.dataset) counts.set(chain.dataset, (counts.get(chain.dataset) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [chains]);
  const [datasetScope, setDatasetScope] = useState<string | null | undefined>(undefined);
  const activeDataset = datasetScope === undefined ? (datasets.length > 1 ? datasets[0]! : null) : datasetScope;
  const scoped = useMemo(() => (activeDataset ? chains.filter((c) => c.dataset === activeDataset) : chains), [chains, activeDataset]);
  // Fall back to the first reference that scores something in scope (e.g. accuracy for classifiers).
  const ref = useMemo(() => {
    const chosen = scoreRefs.find((r) => r.key === refKey) ?? scoreRefs[0];
    const scores = (r: ScoreRef) => scoped.some((c) => Number.isFinite(scoreOf(c, r)));
    return chosen && scores(chosen) ? chosen : scoreRefs.find(scores) ?? chosen;
  }, [scoreRefs, refKey, scoped]);
  const filtered = useMemo(() => filterChains(scoped, filter, ref), [scoped, filter, ref]);
  const ranking = useMemo(() => rankChains(filtered, ref), [filtered, ref]);
  const rowOf = useMemo(() => new Map(filtered.map((c, i) => [c.id, i])), [filtered]);
  const ranked = useMemo(() => ranking.map((r) => ({ ...r, row: rowOf.get(r.chain.id)! })), [ranking, rowOf]);
  const ranks = useMemo(() => new Map(ranking.map((r) => [r.chain.id, r.rank])), [ranking]);
  const facets = useMemo(() => usefulFacets(scoped), [scoped]);
  const columns = useMemo(() => chainColumns(filtered, ref), [filtered, ref]);
  const defaultColorKey = facets.includes("modelFamily") ? "modelFamily" : facets[0] ?? null;
  const activeColorKey = colorKey === null ? defaultColorKey : colorKey === "" ? null : colorKey;
  const colorColumn = columns.find((c) => c.key === activeColorKey) ?? null;
  const mapping = useMemo(() => resolveRowColors(filtered.length, colorColumn, colorColumn?.key === "score" ? { ramp: "viridis" } : {}), [filtered.length, colorColumn]);
  const selected: Selection = useMemo(() => selectedIds.map((id) => rowOf.get(id)).filter((r): r is number => r !== undefined).sort((a, b) => a - b), [selectedIds, rowOf]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const hoverRow = hoverId !== null ? rowOf.get(hoverId) ?? null : null;
  const setSelected = useCallback((rows: Selection) => setSelectedIds(rows.map((r) => filtered[r]!.id)), [filtered, setSelectedIds]);
  const setHoverRow = useCallback((row: number | null) => setHoverId(row === null ? null : filtered[row]?.id ?? null), [filtered]);

  const best = ranking[0]?.rank ? ranking[0].chain : undefined;
  const compareIdsList = compareState.length > 0 ? compareState : best ? [best.id] : [];
  const autoCompare = compareState.length === 0 && compareIdsList.length > 0;
  const chainById = useMemo(() => new Map(chains.map((c) => [c.id, c])), [chains]);
  const compare = useMemo(
    () =>
      compareIdsList
        .map((id) => chainById.get(id))
        .filter((c): c is InspectorChain => Boolean(c))
        .map((chain, i) => ({ chain, color: COMPARE_COLORS[i % COMPARE_COLORS.length]!, predictions: predictions[chain.id] })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compareIdsList.join("|"), chainById, predictions],
  );
  const compareIds = useMemo(() => new Set(compareIdsList), [compareIdsList.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleCompare = useCallback(
    (id: string) => {
      const base = compareState.length > 0 ? compareState : [];
      setCompare(base.includes(id) ? base.filter((x) => x !== id) : [...base, id].slice(-maxCompare));
    },
    [compareState, setCompare, maxCompare],
  );

  // Ask the host for missing predictions of compared chains.
  const onRequestRef = useRef(props.onRequestPredictions);
  onRequestRef.current = props.onRequestPredictions;
  const missingKey = compareIdsList.filter((id) => !predictions[id] && !loadingPredictions.includes(id)).join("|");
  useEffect(() => {
    if (missingKey) onRequestRef.current?.(missingKey.split("|"));
  }, [missingKey]);

  const loading = compareIdsList.some((id) => loadingPredictions.includes(id));
  const hasPredictions = compare.some((c) => c.predictions);
  const regressionCompare = compare.some((c) => c.predictions && c.chain.task === "regression");
  const classificationCompare = compare.some((c) => c.predictions && c.chain.task === "classification");
  const partitions = useMemo(() => {
    const set = new Set<string>();
    for (const c of compare) for (const p of c.predictions?.partition ?? []) if (p) set.add(p);
    return [...set];
  }, [compare]);
  const params = useMemo(() => hyperparameterNames(filtered), [filtered]);
  const activeParam = params.find((p) => p.name === options.param) ?? params[0];
  const heatRows = options.heatRows ?? (facets.includes("firstStep") ? "firstStep" : facets[0] ?? "model");
  const heatCols = options.heatCols ?? (facets.find((f) => f === "modelFamily" || f === "model") ?? facets[1] ?? "dataset");
  const genX = scoreRefs.find((r) => r.key === options.genX) ?? scoreRefs.find((r) => r.partition !== "test" && r.metric === ref?.metric) ?? scoreRefs[0];
  const genY = scoreRefs.find((r) => r.key === options.genY) ?? scoreRefs.find((r) => r.partition === "test" && r.metric === genX?.metric && r.key !== genX?.key) ?? scoreRefs.find((r) => r.key !== genX?.key);
  const landscapeFacet = groupBy ?? (facets.includes("modelFamily") ? "modelFamily" : facets[0] ?? "model");

  // ---------------------------------------------------------------- shortcuts
  const bindings: ShortcutBinding[] = [
    {
      keys: "escape",
      label: strings.clear,
      group: strings.selection,
      run: () => {
        if (showShortcuts) setShowShortcuts(false);
        else if (sampleSelection.size > 0) setSampleSelection(new Set());
        else setSelectedIds([]);
      },
    },
    { keys: "mod+a", label: strings.selectAll, group: strings.selection, run: () => setSelected(filtered.map((_, i) => i)) },
    { keys: "mod+i", label: strings.invert, group: strings.selection, run: () => setSelected(invertSelection(selected, filtered.length)) },
    {
      keys: "c",
      label: strings.compareSelected,
      group: strings.compare,
      run: () => {
        if (selected.length > 0) setCompare(rankChains(selected.map((r) => filtered[r]!), ref).slice(0, maxCompare).map((r) => r.chain.id));
      },
    },
    { keys: "shift+c", label: strings.clearCompare, group: strings.compare, run: () => setCompare([]) },
    { keys: "[", label: `${strings.chains} ⇄`, group: "Layout", run: () => setLeftOpen((v) => !v) },
    { keys: "]", label: `${strings.details} ⇄`, group: "Layout", run: () => setDrawerOpen((v) => !v) },
    ...layout.views.slice(0, 9).map((id, i) => ({
      keys: String(i + 1),
      label: `Maximize · ${id}`,
      group: "Layout",
      run: () => setLayout({ ...layout, maximized: layout.maximized === id ? null : id }),
    })),
    { keys: "?", label: strings.shortcuts, group: "General", run: () => setShowShortcuts((v) => !v) },
  ];

  if (chains.length === 0) {
    return (
      <WorkbenchShell ariaLabel={props.title ?? strings.title} className={cx("n4ins", props.className)} style={props.style} header={<Brand title={props.title ?? strings.title} subtitle={strings.noChains} />}>
        <EmptyState title={strings.noChains} icon={icon.spark} action={props.sourceSlot}>
          {strings.noChainsHint}
        </EmptyState>
      </WorkbenchShell>
    );
  }

  const ctx: InspectorViewContext = {
    chains: filtered,
    ref,
    refs: scoreRefs,
    colorColumn,
    mapping,
    selected,
    setSelected,
    hoverRow,
    setHoverRow,
    compare,
    compareIds,
    loadingPredictions: loading,
    sampleSelection,
    setSampleSelection,
    hoverSample,
    setHoverSample,
    strings,
    icons,
    onToggleCompare: toggleCompare,
  };

  const facetOptions = facets.map((f) => ({ value: f, label: facetLabel(f) }));
  const partitionControl = partitions.length > 1 ? (
    <Segmented
      size="xs"
      ariaLabel={strings.partition}
      value={options.partition}
      onChange={(partition) => patch({ partition })}
      options={[{ value: "all", label: strings.all }, ...partitions.map((p) => ({ value: p, label: p }))]}
    />
  ) : undefined;
  const predictionReason = loading ? strings.loadingPredictions : strings.needsPredictions;
  const views: ViewSpec[] = [
    {
      id: "landscape",
      title: strings.viewLandscape,
      icon: VIEW_GLYPH.landscape,
      description: strings.descLandscape,
      subtitle: `${facetLabel(landscapeFacet)} · ${filtered.length}`,
      render: () => <LandscapeBody ctx={ctx} groupFacet={landscapeFacet} />,
    },
    {
      id: "heatmap",
      title: strings.viewHeatmap,
      icon: VIEW_GLYPH.heatmap,
      description: strings.descHeatmap,
      subtitle: `${facetLabel(heatRows)} × ${facetLabel(heatCols)} · ${options.aggregate}`,
      available: facets.length >= 1,
      options: (
        <>
          <SelectField label={strings.rows} value={heatRows} options={facetOptions} onChange={(v) => patch({ heatRows: v as ChainFacet })} />
          <SelectField label={strings.columns} value={heatCols} options={facetOptions} onChange={(v) => patch({ heatCols: v as ChainFacet })} />
          <Segmented
            ariaLabel={strings.aggregate}
            value={options.aggregate}
            onChange={(aggregate) => patch({ aggregate })}
            options={[
              { value: "best", label: strings.best },
              { value: "median", label: "median" },
              { value: "mean", label: "mean" },
            ]}
          />
        </>
      ),
      render: () => <HeatmapBody ctx={ctx} rowFacet={heatRows} colFacet={heatCols} aggregate={options.aggregate} />,
    },
    {
      id: "generalization",
      title: strings.viewGeneralization,
      icon: VIEW_GLYPH.generalization,
      description: strings.descGeneralization,
      subtitle: genX && genY ? `${genX.label} → ${genY.label}` : undefined,
      available: Boolean(genX && genY),
      unavailableReason: strings.needsTwoRefs,
      options: (
        <>
          <SelectField label="X" value={genX?.key ?? ""} options={scoreRefs.map((r) => ({ value: r.key, label: r.label }))} onChange={(genX) => patch({ genX })} />
          <SelectField label="Y" value={genY?.key ?? ""} options={scoreRefs.map((r) => ({ value: r.key, label: r.label }))} onChange={(genY) => patch({ genY })} />
          <p className="n4wb-muted">{strings.overfitting}</p>
        </>
      ),
      render: () => (genX && genY ? <GeneralizationBody ctx={ctx} xRef={genX} yRef={genY} /> : null),
    },
    {
      id: "parity",
      title: strings.viewParity,
      icon: VIEW_GLYPH.parity,
      description: strings.descParity,
      busy: loading,
      available: regressionCompare,
      unavailableReason: hasPredictions ? strings.needsRegression : predictionReason,
      actions: partitionControl,
      options: (
        <Segmented
          ariaLabel={strings.colorPoints}
          value={options.coloring}
          onChange={(coloring) => patch({ coloring })}
          options={[
            { value: "chain", label: strings.byChain },
            { value: "partition", label: strings.byPartition },
            { value: "fold", label: strings.byFold },
          ]}
        />
      ),
      render: () => <PredictionBody ctx={ctx} mode="parity" coloring={options.coloring} partition={options.partition} />,
    },
    {
      id: "residuals",
      title: strings.viewResiduals,
      icon: VIEW_GLYPH.residuals,
      description: strings.descResiduals,
      busy: loading,
      available: regressionCompare,
      unavailableReason: hasPredictions ? strings.needsRegression : predictionReason,
      actions: partitionControl,
      options: (
        <Segmented
          ariaLabel={strings.colorPoints}
          value={options.coloring}
          onChange={(coloring) => patch({ coloring })}
          options={[
            { value: "chain", label: strings.byChain },
            { value: "partition", label: strings.byPartition },
            { value: "fold", label: strings.byFold },
          ]}
        />
      ),
      render: () => <PredictionBody ctx={ctx} mode="residual" coloring={options.coloring} partition={options.partition} />,
    },
    {
      id: "folds",
      title: strings.viewFolds,
      icon: VIEW_GLYPH.folds,
      description: strings.descFolds,
      available: Boolean(ref && compare.some((c) => (c.chain.foldScores?.[ref.key]?.length ?? 0) > 0)),
      unavailableReason: strings.needsFolds,
      render: () => <FoldsBody ctx={ctx} />,
    },
    {
      id: "hyperparams",
      title: strings.viewHyperparams,
      icon: VIEW_GLYPH.hyperparams,
      description: strings.descHyperparams,
      subtitle: activeParam?.name,
      available: Boolean(activeParam),
      unavailableReason: strings.needsParams,
      options: (
        <>
          <SelectField label={strings.parameter} value={activeParam?.name ?? ""} options={params.map((p) => ({ value: p.name, label: `${p.name} (${p.count})` }))} onChange={(param) => patch({ param })} />
          {activeParam?.kind === "numeric" ? <Toggle checked={options.logParam} onChange={(logParam) => patch({ logParam })} label={strings.logScale} /> : null}
        </>
      ),
      render: () => (activeParam ? <HyperparamsBody ctx={ctx} param={activeParam.name} kind={activeParam.kind} log={options.logParam} /> : null),
    },
    {
      id: "effects",
      title: strings.viewEffects,
      icon: VIEW_GLYPH.effects,
      description: strings.descEffects,
      available: filtered.filter((c) => Number.isFinite(scoreOf(c, ref))).length >= 3,
      unavailableReason: strings.needsSteps,
      render: () => <EffectsBody ctx={ctx} />,
    },
    {
      id: "confusion",
      title: strings.viewConfusion,
      icon: VIEW_GLYPH.confusion,
      description: strings.descConfusion,
      busy: loading,
      available: classificationCompare,
      unavailableReason: hasPredictions ? strings.needsClassification : predictionReason,
      actions: partitionControl,
      options: <Toggle checked={options.normalizeConfusion} onChange={(normalizeConfusion) => patch({ normalizeConfusion })} label={strings.normalize} />,
      render: () => <ConfusionBody ctx={ctx} partition={options.partition} normalize={options.normalizeConfusion} />,
    },
    {
      id: "samples",
      title: strings.viewSamples,
      icon: VIEW_GLYPH.samples,
      description: strings.descSamples,
      busy: loading,
      available: regressionCompare,
      unavailableReason: hasPredictions ? strings.needsRegression : predictionReason,
      actions: partitionControl,
      render: () => <HardSamplesBody ctx={ctx} partition={options.partition} />,
    },
    {
      id: "table",
      title: strings.viewTable,
      icon: VIEW_GLYPH.table,
      description: strings.descTable,
      subtitle: `${filtered.length} / ${chains.length}`,
      render: () => <LeaderboardBody ctx={ctx} ranks={ranks} />,
    },
  ];

  // ---------------------------------------------------------------- chrome
  const header = (
    <>
      <Brand title={props.title ?? strings.title} subtitle={`${chains.length} ${strings.chains.toLowerCase()} · ${new Set(chains.map((c) => c.dataset)).size} datasets`} />
      <IconButton label={`${strings.chains} ⇄`} shortcut="[" active={leftOpen} onClick={() => setLeftOpen((v) => !v)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16" />
        </svg>
      </IconButton>
      <span className="n4wb-header-sep" />
      <div className="n4wb-header-group">
        {datasets.length > 1 ? (
          <SelectField
            label={strings.dataset}
            value={activeDataset ?? ""}
            options={[{ value: "", label: strings.allDatasets }, ...datasets.map((d) => ({ value: d, label: d }))]}
            onChange={(v) => setDatasetScope(v === "" ? null : v)}
          />
        ) : null}
        <SelectField
          label={strings.score}
          value={ref?.key ?? ""}
          options={scoreRefs.map((r) => ({
            value: r.key,
            label: `${r.label} ${r.lowerIsBetter ? "↓" : "↑"}`,
            group: r.partition,
            disabled: !scoped.some((c) => Number.isFinite(scoreOf(c, r))),
          }))}
          onChange={setRefKey}
        />
        <SelectField
          label={strings.colorBy}
          value={activeColorKey ?? ""}
          options={[{ value: "", label: strings.none }, ...columns.map((c) => ({ value: c.key, label: c.label }))]}
          onChange={(v) => setColorKey(v)}
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
    <div className="n4ins-left">
      <div className="n4wb-panel-head">
        <h3>{strings.chains}</h3>
        <span className="n4wb-count">
          {filtered.length}
          {filtered.length !== chains.length ? `/${chains.length}` : ""}
        </span>
      </div>
      {props.sourceSlot ? <div className="n4ins-source">{props.sourceSlot}</div> : null}
      <ChainList
        allChains={scoped}
        ranked={ranked}
        filter={filter}
        onFilterChange={setFilter}
        facets={facets}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        scoreRef={ref}
        colors={mapping.colors}
        selected={selectedSet}
        hoverRow={hoverRow}
        compareIds={compareIds}
        onSelectRow={(row, event: MouseEvent) => setSelected(combineSelection(selected, [row], selectionModeFromModifiers(event)))}
        onHoverRow={setHoverRow}
        onToggleCompare={toggleCompare}
        strings={strings}
        icons={icons}
      />
    </div>
  );

  const focus = (hoverId ? chainById.get(hoverId) : undefined) ?? (selected.length === 1 ? filtered[selected[0]!] : undefined) ?? compare[0]?.chain;
  const other = compare.find((c) => c.chain.id !== focus?.id)?.chain;
  const selectedChains = selected.map((r) => filtered[r]!);
  const selectedScores = selectedChains.map((c) => scoreOf(c, ref)).filter(Number.isFinite);
  const bestSelected = selectedScores.reduce((b, s) => (isBetter(s, b, ref) ? s : b), Number.NaN);

  const right = (
    <div className="n4ins-drawer">
      <div className="n4wb-panel-head">
        <h3>{strings.details}</h3>
      </div>
      <div className="n4wb-scroll">
        {focus ? (
          <PanelSection title={strings.chain}>
            <ChainDetails
              chain={focus}
              refs={scoreRefs}
              activeRef={ref}
              rank={ranks.get(focus.id) ?? null}
              compareColor={compare.find((c) => c.chain.id === focus.id)?.color}
              isCompared={compareIds.has(focus.id) && !autoCompare}
              other={other}
              onToggleCompare={() => toggleCompare(focus.id)}
              onOpen={props.onOpenChain}
              onOpenInPlayground={props.onOpenInPlayground}
              strings={strings}
            />
          </PanelSection>
        ) : null}
        <PanelSection title={strings.selection} count={selected.length || undefined}>
          {selected.length === 0 ? (
            <p className="n4wb-muted n4pg-hint">{strings.noSelectionHint}</p>
          ) : (
            <>
              <p className="n4pg-sel-headline">{strings.selectedChains(selected.length, filtered.length)}</p>
              <div className="n4wb-stats">
                <StatTile label={strings.best} value={formatValue(bestSelected)} tone="accent" />
                <StatTile label="median" value={formatValue([...selectedScores].sort((a, b) => a - b)[Math.floor(selectedScores.length / 2)])} />
              </div>
            </>
          )}
          <div className="n4pg-actions">
            <Button
              variant="primary"
              icon={icon.compare}
              disabled={selected.length === 0}
              onClick={() => setCompare(rankChains(selectedChains, ref).slice(0, maxCompare).map((r) => r.chain.id))}
            >
              {strings.compareSelected}
            </Button>
            <Button variant="outline" disabled={selected.length === 0} onClick={() => setSelectedIds([])}>
              {strings.clear}
            </Button>
            <Button variant="outline" onClick={() => setSelected(invertSelection(selected, filtered.length))}>
              {strings.invert}
            </Button>
          </div>
        </PanelSection>
        {sampleSelection.size > 0 ? (
          <PanelSection title={strings.samples} count={sampleSelection.size}>
            <p className="n4pg-sel-headline">{strings.sampleSelection(sampleSelection.size)}</p>
            <div className="n4ins-sample-keys n4wb-mono">{[...sampleSelection].slice(0, 30).join(" · ")}{sampleSelection.size > 30 ? " …" : ""}</div>
            <div className="n4pg-actions">
              <Button variant="outline" onClick={() => setSampleSelection(new Set())}>
                {strings.clear}
              </Button>
              {props.onExportSamples ? (
                <Button variant="ghost" icon={icon.arrowRight} onClick={() => props.onExportSamples?.([...sampleSelection])}>
                  {strings.openInPlayground}
                </Button>
              ) : null}
            </div>
          </PanelSection>
        ) : null}
      </div>
    </div>
  );

  const bestChain = ranking[0];
  const statusBar = (
    <>
      <span className="n4wb-status-item">
        <span className={cx("n4wb-dot", loading && "is-busy")} />
        <strong>{filtered.length}</strong>/{chains.length} {strings.chains.toLowerCase()}
      </span>
      {ref ? (
        <span className="n4wb-status-item">
          {ref.label} {ref.lowerIsBetter ? "↓" : "↑"}
        </span>
      ) : null}
      {bestChain?.rank ? (
        <span className="n4wb-status-item">
          {strings.best} <strong>{formatValue(bestChain.score)}</strong> · {chainLabel(bestChain.chain)}
        </span>
      ) : null}
      {selected.length > 0 ? (
        <span className="n4wb-status-item">
          <strong>{selected.length}</strong> {strings.selection.toLowerCase()}
        </span>
      ) : null}
      {loading ? <span className="n4wb-status-item">{strings.loadingPredictions}</span> : null}
      <span className="n4wb-status-grow" />
      <span className="n4wb-status-item n4wb-muted">☆ compare · C compare selection · ? help</span>
    </>
  );

  return (
    <WorkbenchShell
      ariaLabel={props.title ?? strings.title}
      className={cx("n4ins", props.className)}
      style={props.style}
      header={header}
      left={left}
      right={right}
      leftOpen={leftOpen}
      rightOpen={drawerOpen}
      status={statusBar}
      leftWidth={340}
      rightWidth={320}
      onKeyDown={(event) => dispatchShortcut(event, bindings)}
    >
      <div className="n4pg-main">
        <div className="n4pg-legendbar n4ins-tray">
          <span className="n4ins-tray-label">{strings.compare}</span>
          {compare.length === 0 ? <span className="n4wb-muted">{strings.compareHint}</span> : null}
          {compare.map(({ chain, color, predictions: pred }) => (
            <Chip
              key={chain.id}
              color={color}
              active={hoverId === chain.id}
              title={`${chainLabel(chain)}${pred ? "" : ` · ${strings.loadingPredictions}`}`}
              onClick={() => setHoverId(chain.id)}
              {...(autoCompare ? {} : { onRemove: () => toggleCompare(chain.id) })}
            >
              {chainLabel(chain)}
              {autoCompare ? <em className="n4ins-auto"> · {strings.compareAuto}</em> : null}
              {!pred && loadingPredictions.includes(chain.id) ? <span className="n4ins-loading" aria-hidden="true" /> : null}
            </Chip>
          ))}
          <span className="n4wb-header-grow" />
          <ColorLegend
            legend={mapping.legend}
            {...(colorColumn ? { title: colorColumn.label } : {})}
            max={8}
            onPickCategory={(value, event) => {
              if (!colorColumn) return;
              const rows: number[] = [];
              colorColumn.values.forEach((v, row) => {
                if (v !== null && String(v) === value) rows.push(row);
              });
              setSelected(combineSelection(selected, rows, selectionModeFromModifiers(event)));
            }}
          />
        </div>
        <div className="n4pg-grid-wrap">
          <ViewGrid views={views} layout={layout} onLayoutChange={setLayout} icons={icons} empty={<EmptyState title={strings.views}>{strings.descLandscape}</EmptyState>} />
        </div>
      </div>
      {showShortcuts ? (
        <ShortcutsDialog
          bindings={bindings}
          onClose={() => setShowShortcuts(false)}
          title={strings.shortcuts}
          gestures={[
            ["Click", "Select a chain / sample (empty space clears)"],
            ["Drag", "Box select (lasso tool for free shapes)"],
            ["Shift / Alt / Ctrl", "Add / remove / toggle"],
            ["☆", "Add a chain to the comparison"],
            ["Drag a view header", "Reorder views · double-click maximizes"],
          ]}
        />
      ) : null}
    </WorkbenchShell>
  );
}

function ChainDetails({
  chain,
  refs,
  activeRef,
  rank,
  compareColor,
  isCompared,
  other,
  onToggleCompare,
  onOpen,
  onOpenInPlayground,
  strings,
}: {
  chain: InspectorChain;
  refs: readonly ScoreRef[];
  activeRef: ScoreRef | undefined;
  rank: number | null;
  compareColor: string | undefined;
  isCompared: boolean;
  other: InspectorChain | undefined;
  onToggleCompare: () => void;
  onOpen: ((chain: InspectorChain) => void) | undefined;
  onOpenInPlayground: ((chain: InspectorChain) => void) | undefined;
  strings: InspectorStrings;
}) {
  const otherTokens = new Set(other?.steps.map((s) => s.token) ?? []);
  const ownTokens = new Set(chain.steps.map((s) => s.token));
  const onlyHere = new Set(chain.steps.filter((s) => other && !otherTokens.has(s.token)).map((s) => s.token));
  const onlyThere = other ? other.steps.filter((s) => !ownTokens.has(s.token)) : [];
  const paramDiff = other
    ? Object.keys({ ...chain.params, ...other.params }).filter((k) => String(chain.params?.[k] ?? "—") !== String(other.params?.[k] ?? "—"))
    : [];
  return (
    <div className="n4ins-details">
      <div className="n4ins-details-head">
        {compareColor ? <span className="n4wb-legend-swatch" style={{ background: compareColor }} aria-hidden="true" /> : null}
        <strong>{chainLabel(chain)}</strong>
      </div>
      <div className="n4wb-stats">
        <StatTile label={activeRef?.label ?? strings.score} value={formatValue(scoreOf(chain, activeRef))} tone="accent" hint={rank ? `${strings.rank}${rank}` : undefined} />
        {chain.fitTimeMs !== undefined ? <StatTile label="Fit" value={formatDuration(chain.fitTimeMs)} /> : null}
      </div>
      <h5 className="n4ins-sub">{strings.steps}</h5>
      <StepChips chain={chain} highlight={onlyHere} />
      {other && (onlyHere.size > 0 || onlyThere.length > 0 || paramDiff.length > 0) ? (
        <div className="n4ins-diff">
          <h5 className="n4ins-sub">{strings.diffWith(chainLabel(other))}</h5>
          {onlyThere.length > 0 ? (
            <p className="n4wb-muted">
              {strings.onlyIn(other.model)}: {onlyThere.map((s) => s.label ?? s.token).join(", ")}
            </p>
          ) : null}
          {paramDiff.slice(0, 6).map((k) => (
            <p key={k} className="n4ins-diff-row n4wb-mono">
              {k}: {String(chain.params?.[k] ?? "—")} → {String(other.params?.[k] ?? "—")}
            </p>
          ))}
        </div>
      ) : null}
      <dl className="n4wb-kv">
        <dt>Model</dt>
        <dd>{chain.model}</dd>
        {chain.dataset ? (
          <>
            <dt>Dataset</dt>
            <dd>{chain.dataset}</dd>
          </>
        ) : null}
        {chain.runLabel ?? chain.runId ? (
          <>
            <dt>Run</dt>
            <dd>{chain.runLabel ?? chain.runId}</dd>
          </>
        ) : null}
        <dt>Task</dt>
        <dd>
          {chain.task}
          {chain.target ? ` · ${chain.target}` : ""}
        </dd>
      </dl>
      {chain.params && Object.keys(chain.params).length > 0 ? (
        <>
          <h5 className="n4ins-sub">{strings.params}</h5>
          <dl className="n4wb-kv">
            {Object.entries(chain.params).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{typeof v === "number" ? formatValue(v) : String(v ?? "—")}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
      <h5 className="n4ins-sub">{strings.allScores}</h5>
      <dl className="n4wb-kv">
        {refs.map((r) => (
          <div key={r.key} style={{ display: "contents" }}>
            <dt className={r.key === activeRef?.key ? "n4ins-active-score" : undefined}>{r.label}</dt>
            <dd>{formatValue(scoreOf(chain, r))}</dd>
          </div>
        ))}
      </dl>
      <div className="n4pg-actions">
        <Button variant={isCompared ? "outline" : "primary"} onClick={onToggleCompare}>
          {isCompared ? `★ ${strings.removeFromCompare}` : `☆ ${strings.addToCompare}`}
        </Button>
        {onOpen ? (
          <Button variant="outline" onClick={() => onOpen(chain)}>
            {strings.open}
          </Button>
        ) : null}
        {onOpenInPlayground ? (
          <Button variant="ghost" onClick={() => onOpenInPlayground(chain)}>
            {strings.openInPlayground}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Brand({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="n4wb-brand">
      <span className="n4wb-brand-mark n4ins-mark" aria-hidden="true">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M20 20l-4.6-4.6M7.5 12l2-2.5 2 1.5 2-3" />
        </svg>
      </span>
      <span className="n4wb-brand-title">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </span>
    </div>
  );
}
