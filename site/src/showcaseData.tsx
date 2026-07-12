import type { ReactNode } from "react";

import {
  BiasVarianceBars,
  BoxPlot,
  ConfusionMatrix,
  FeatureImportanceBar,
  FoldStabilityLines,
  Histogram,
  PcaScatter,
  PipelineFlow,
  PredictionScatter,
  ResidualPlot,
  ScoreHeatmap,
  ScoreSummary,
  ShapBeeswarm,
  SpectraPlot,
  WaterfallChart,
  type BeeswarmFeature,
  type PcaPoint,
  type PredictionPoint,
} from "../../src/viz/index.js";
import {
  DatasetPreviewCard,
  DatasetResultCard,
  MetricValueBadge,
  PerClassTable,
  PredictionCard,
  RankingsTable,
  RuntimeDiagnosticList,
  RuntimeEngineBadge,
  RuntimeResultStatusBadge,
  ScoreCardTree,
} from "../../src/components/index.js";
import {
  DecisionBadge,
  DecisionCard,
  HealthFindingRow,
  ModelReportCard,
  SampleStatusBadge,
  StepProgress,
  TrafficLightLegend,
  WorklistTable,
} from "../../src/lab/index.js";
import { buildDatasetPreview } from "../../src/dataset/index.js";
import { normalizeRuntimeDiagnostics } from "../../src/runtime/index.js";
import type { DagEdge, DagGraph, DagNode, DagNodeStatus } from "../../src/dag/index.js";

// ---------------------------------------------------------------------------
// Deterministic fake data (seeded so the static render is stable).
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260711);
const gaussian = (x: number, mu: number, sigma: number, amp: number): number =>
  amp * Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));

// --- Spectra ---------------------------------------------------------------
const WAVELENGTHS = Array.from({ length: 120 }, (_, i) => 1000 + i * 12.5);

function makeSpectrum(shift: number): number[] {
  return WAVELENGTHS.map((wl) => {
    const base = 0.28 + 0.12 * Math.sin((wl - 1000) / 520) + ((wl - 1000) / 1500) * 0.08;
    const peaks =
      gaussian(wl, 1210, 42, 0.14) +
      gaussian(wl, 1450, 60, 0.34 + shift * 0.05) +
      gaussian(wl, 1930, 72, 0.5) +
      gaussian(wl, 2100, 52, 0.22);
    const noise = (rand() - 0.5) * 0.015;
    return Number((base + peaks + noise + shift * 0.028).toFixed(4));
  });
}

const SPECTRA = Array.from({ length: 14 }, (_, i) => ({
  id: `sample-${i}`,
  values: makeSpectrum((i % 3) - 1),
  partition: (i % 4 === 0 ? "test" : "train") as "train" | "test",
}));
const SPECTRA_MEAN = WAVELENGTHS.map(
  (_, j) => SPECTRA.reduce((s, sp) => s + (sp.values[j] ?? 0), 0) / SPECTRA.length,
);
const SPECTRA_LOWER = WAVELENGTHS.map((_, j) => Math.min(...SPECTRA.map((sp) => sp.values[j] ?? 0)));
const SPECTRA_UPPER = WAVELENGTHS.map((_, j) => Math.max(...SPECTRA.map((sp) => sp.values[j] ?? 0)));

// --- Regression predictions ------------------------------------------------
const PREDICTIONS: PredictionPoint[] = Array.from({ length: 72 }, (_, i) => {
  const actual = 6 + rand() * 12;
  const partition: "train" | "test" = i % 4 === 0 ? "test" : "train";
  const spread = partition === "test" ? 1.15 : 0.7;
  const predicted = actual + (rand() - 0.48) * spread;
  return { actual: Number(actual.toFixed(3)), predicted: Number(predicted.toFixed(3)), partition };
});

// --- Distributions ---------------------------------------------------------
const TARGET_VALUES = Array.from({ length: 260 }, () => {
  const g = (rand() + rand() + rand()) / 3;
  return Number((8 + g * 9).toFixed(2));
});
const CLASS_BINS = [
  { label: "healthy", count: 128 },
  { label: "mild", count: 74 },
  { label: "moderate", count: 41 },
  { label: "severe", count: 19 },
];

// --- Classification --------------------------------------------------------
const CONFUSION_LABELS = ["healthy", "mild", "moderate", "severe"];
const CONFUSION_MATRIX = [
  [118, 8, 2, 0],
  [11, 57, 5, 1],
  [1, 7, 29, 4],
  [0, 1, 3, 15],
];

// --- Projection ------------------------------------------------------------
const PCA_POINTS: PcaPoint[] = Array.from({ length: 96 }, (_, i) => {
  const cluster = i % 3;
  const cx = [-2.1, 1.6, 0.2][cluster] ?? 0;
  const cy = [0.9, 1.2, -2.0][cluster] ?? 0;
  return {
    x: Number((cx + (rand() - 0.5) * 2.4).toFixed(3)),
    y: Number((cy + (rand() - 0.5) * 2.2).toFixed(3)),
    group: ["ARINA", "RENAN", "SOISSONS"][cluster] ?? "ARINA",
  };
});

// --- Explainability --------------------------------------------------------
const IMPORTANCE = [
  { label: "1928–1945 nm (O–H)", value: 0.94 },
  { label: "1450–1470 nm (O–H)", value: 0.71 },
  { label: "2100–2140 nm (protein)", value: 0.55 },
  { label: "2300–2350 nm (C–H)", value: 0.42 },
  { label: "1200–1230 nm (C–H)", value: 0.33 },
  { label: "1690–1720 nm (C–H)", value: 0.27 },
  { label: "990–1020 nm", value: 0.18 },
];

const BEESWARM: BeeswarmFeature[] = ["1930 nm", "1450 nm", "2100 nm", "2320 nm", "1210 nm"].map(
  (label, f) => ({
    label,
    points: Array.from({ length: 44 }, () => {
      const fv = rand();
      const shap = (fv - 0.5) * (1.4 - f * 0.2) + (rand() - 0.5) * 0.25;
      return { shap: Number(shap.toFixed(3)), featureValue: Number(fv.toFixed(3)) };
    }),
  }),
);

// --- Inspector heatmap + box plot -----------------------------------------
const HEATMAP_ROWS = ["PLS", "Ridge", "SVR", "RandomForest"];
const HEATMAP_COLS = ["Raw", "SNV", "MSC", "SG1", "Detrend"];
const HEATMAP_VALUES = HEATMAP_ROWS.map((_, r) =>
  HEATMAP_COLS.map((_, c) => Number((0.62 + 0.3 * rand() + (c === 1 ? 0.06 : 0) - r * 0.02).toFixed(3))),
);
const BOX_GROUPS = ["Raw", "SNV", "MSC", "SG1"].map((label, g) => ({
  label,
  values: Array.from({ length: 30 }, () => Number((0.7 + g * 0.03 + (rand() - 0.5) * (0.24 - g * 0.03)).toFixed(3))),
}));

const WATERFALL_CONTRIBUTIONS = [
  { label: "1930 nm (O–H)", value: 1.82 },
  { label: "1450 nm (O–H)", value: -0.94 },
  { label: "2100 nm (protein)", value: 0.71 },
  { label: "2320 nm (C–H)", value: -0.43 },
  { label: "1210 nm (C–H)", value: 0.35 },
  { label: "1690 nm", value: -0.21 },
];

const FOLD_SERIES = ["SNV → PLS", "MSC → PLS", "Raw → Ridge"].map((label, s) => ({
  id: `chain-${s}`,
  label,
  scores: [0, 1, 2, 3, 4].map((f) => Number((0.9 - s * 0.028 + Math.sin(f + s) * 0.02).toFixed(3))),
}));

const BIAS_VARIANCE = [
  { label: "PLS", biasSquared: 0.041, variance: 0.028 },
  { label: "Ridge", biasSquared: 0.062, variance: 0.019 },
  { label: "SVR", biasSquared: 0.033, variance: 0.052 },
  { label: "RF", biasSquared: 0.021, variance: 0.081 },
];

// --- Pipeline + scores -----------------------------------------------------
const PIPELINE_NODES = [
  { id: "ds", label: "Corn NIR", type: "data" as const, detail: "120 samples · 256 λ", status: "done" as const },
  { id: "split", label: "Train / Test split", type: "split" as const, detail: "75 / 25", status: "done" as const },
  { id: "snv", label: "SNV", type: "preprocess" as const, detail: "scatter correction", status: "done" as const },
  { id: "sg", label: "Savitzky–Golay", type: "preprocess" as const, detail: "1st deriv · w=11", status: "done" as const, variants: 3 },
  { id: "pls", label: "PLS regression", type: "model" as const, detail: "n_components sweep", metric: 0.918, status: "done" as const, variants: 8 },
  { id: "refit", label: "Refit + score", type: "merge" as const, detail: "OOF-safe", metric: 0.932, status: "running" as const },
];

const SCORE_STATS = [
  { label: "R²", value: "0.932", delta: "+0.04", tone: "positive" as const },
  { label: "RMSE", value: "0.327", delta: "−0.09", tone: "positive" as const },
  { label: "RPD", value: "3.11", delta: "+0.34", tone: "positive" as const },
  { label: "Bias", value: "−0.018", tone: "neutral" as const },
  { label: "MAE", value: "0.241", delta: "−0.05", tone: "positive" as const },
  { label: "n", value: "120", tone: "neutral" as const },
];

// --- Dataset / runtime -----------------------------------------------------
const DATASET_PREVIEW = buildDatasetPreview({
  id: "corn-calibration-v1",
  title: "Corn NIR calibration",
  description: "Moisture + protein reference spectra assembled for shared Studio/Web previews.",
  taskType: "regression",
  sampleCount: 120,
  wavelengthCount: 256,
  targetCount: 2,
  splitCounts: [
    { id: "calibration", label: "Calibration", count: 90 },
    { id: "validation", label: "Validation", count: 30 },
  ],
  spectralRange: { start: 900, end: 1700 },
  tags: ["NIR", "reference"],
});

const FALLBACK_RUNTIME = {
  engine_actual: "legacy",
  engine_requested: "dag-ml",
  diagnostics: [
    {
      verb: "predict",
      cause: "unsupported_operator",
      message: "The selected pipeline uses a legacy branch operator.",
      mitigation: "Export the operator through the native registry before release.",
      unsupported_capability: "branch_duplication",
      severity: "warning",
    },
  ],
};
const RUNTIME_DIAGNOSTICS = normalizeRuntimeDiagnostics(FALLBACK_RUNTIME);

// ---------------------------------------------------------------------------
// Small presentational glyphs the host supplies to package components.
// ---------------------------------------------------------------------------

export function ToneDot({ tone }: { tone: string }): ReactNode {
  return <span className={`glyph-dot glyph-${tone}`} aria-hidden="true" />;
}

const DECISION_ICONS = {
  check: <ToneDot tone="success" />,
  alert: <ToneDot tone="warning" />,
  ban: <ToneDot tone="danger" />,
  sparkles: <ToneDot tone="indigo" />,
};

// ---------------------------------------------------------------------------
// Showcase catalog.
// ---------------------------------------------------------------------------

export interface ShowcaseEntry {
  id: string;
  name: string;
  category: string;
  entry: string;
  propsInterface: string;
  /** the Studio / Web / Quality surface this presentational component mirrors */
  mirrors: string;
  summary: string;
  hostOwned: readonly string[];
  importLine: string;
  code: string;
  render: () => ReactNode;
}

const PER_CLASS = CONFUSION_LABELS.map((label, i) => {
  const tp = CONFUSION_MATRIX[i]?.[i] ?? 0;
  const actual = (CONFUSION_MATRIX[i] ?? []).reduce((s, v) => s + v, 0);
  const predicted = CONFUSION_MATRIX.reduce((s, row) => s + (row[i] ?? 0), 0);
  const precision = predicted ? tp / predicted : 0;
  const recall = actual ? tp / actual : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    label,
    precision: Number(precision.toFixed(3)),
    recall: Number(recall.toFixed(3)),
    f1: Number(f1.toFixed(3)),
    support: actual,
  };
});

const SCORE_TREE_NODES = [
  {
    id: "refit",
    label: "Refit (full train)",
    kind: "refit",
    metrics: [
      { label: "R²", value: "0.932", tone: "positive" as const },
      { label: "RMSE", value: "0.327", tone: "positive" as const },
    ],
    children: [
      {
        id: "cv",
        label: "5-fold CV",
        kind: "cross-val",
        metrics: [
          { label: "R²", value: "0.911", tone: "neutral" as const },
          { label: "RMSE", value: "0.361", tone: "neutral" as const },
        ],
        children: [1, 2, 3, 4, 5].map((f) => ({
          id: `fold-${f}`,
          label: `Fold ${f}`,
          kind: "fold",
          metrics: [
            { label: "R²", value: (0.9 + f * 0.004).toFixed(3), tone: "neutral" as const },
            { label: "RMSE", value: (0.38 - f * 0.006).toFixed(3), tone: "neutral" as const },
          ],
        })),
      },
    ],
  },
];

const RANKING_ROWS = [
  { rank: 1, name: "SNV → SG1 → PLS", score: "0.932", detail: "8 components", highlight: true },
  { rank: 2, name: "MSC → PLS", score: "0.921", detail: "10 components" },
  { rank: 3, name: "SNV → Ridge", score: "0.908", detail: "α=0.5" },
  { rank: 4, name: "Raw → RandomForest", score: "0.874", detail: "300 trees" },
];

export const SHOWCASE_CATEGORIES = [
  "Spectra & datasets",
  "Model diagnostics",
  "Classification",
  "Explainability",
  "Pipeline & scores",
  "Results & scores",
  "Runtime & status",
  "Quality / Lab",
] as const;

export const SHOWCASE_ENTRIES: readonly ShowcaseEntry[] = [
  {
    id: "spectra-plot",
    name: "SpectraPlot",
    category: "Spectra & datasets",
    entry: "nirs4all-ui/viz",
    propsInterface: "SpectraPlotProps",
    mirrors: "Studio SpectraChart · Web DatasetView spectra explorer",
    summary:
      "The signature absorbance-vs-wavelength chart: per-sample lines colored by partition, an emphasized mean, and a translucent min/max band.",
    hostOwned: ["spectra decimation", "preprocessing", "unit choice", "legend placement"],
    importLine: 'import { SpectraPlot } from "nirs4all-ui/viz";',
    code: `<SpectraPlot
  wavelengths={wavelengths}
  series={samples.map((s) => ({ id: s.id, values: s.absorbance, partition: s.partition }))}
  mean={meanSpectrum}
  band={{ lower: minSpectrum, upper: maxSpectrum }}
  unit="nm"
/>`,
    render: () => (
      <SpectraPlot
        wavelengths={WAVELENGTHS}
        series={SPECTRA}
        mean={SPECTRA_MEAN}
        band={{ lower: SPECTRA_LOWER, upper: SPECTRA_UPPER }}
        width={520}
        height={240}
      />
    ),
  },
  {
    id: "histogram",
    name: "Histogram",
    category: "Spectra & datasets",
    entry: "nirs4all-ui/viz",
    propsInterface: "HistogramProps",
    mirrors: "Studio TargetHistogram · ScoreHistogramPlot",
    summary:
      "Target / score / prediction distribution — auto-binned continuous values for regression or category counts for classification, with an optional mean line.",
    hostOwned: ["bin count", "regression vs classification", "series color"],
    importLine: 'import { Histogram } from "nirs4all-ui/viz";',
    code: `<Histogram values={targetValues} variant="regression" meanLine />
// or, for a categorical target:
<Histogram bins={classCounts} variant="classification" />`,
    render: () => <Histogram values={TARGET_VALUES} variant="regression" meanLine width={420} height={220} />,
  },
  {
    id: "pca-scatter",
    name: "PcaScatter",
    category: "Spectra & datasets",
    entry: "nirs4all-ui/viz",
    propsInterface: "PcaScatterProps",
    mirrors: "Studio DimensionReductionChart · Web PcaPanel",
    summary:
      "2D PCA / UMAP projection colored by group, continuous target, or partition, with explained-variance axis labels and a compact legend.",
    hostOwned: ["PCA / UMAP compute", "color mode", "selection / lasso", "3D toggle"],
    importLine: 'import { PcaScatter } from "nirs4all-ui/viz";',
    code: `<PcaScatter
  points={scores.map((s) => ({ x: s.pc1, y: s.pc2, group: s.cultivar }))}
  explained={[0.62, 0.19]}
  colorMode="group"
/>`,
    render: () => <PcaScatter points={PCA_POINTS} explained={[0.62, 0.19]} width={360} height={300} />,
  },
  {
    id: "dataset-preview-card",
    name: "DatasetPreviewCard",
    category: "Spectra & datasets",
    entry: "nirs4all-ui/components",
    propsInterface: "DatasetPreviewCardProps",
    mirrors: "Studio dataset cards · Web dataset summary",
    summary:
      "A headless dataset summary card built from the shared preview contract: title, task badges, split counts, spectral range, and sample/feature stats.",
    hostOwned: ["data loading", "routing", "icon system", "card placement"],
    importLine: 'import { DatasetPreviewCard } from "nirs4all-ui/components";',
    code: `import { buildDatasetPreview } from "nirs4all-ui/dataset";

<DatasetPreviewCard
  view={buildDatasetPreview(datasetRecord)}
  className="dataset-preview-card"
  badgeClassName={(b) => \`dataset-badge tone-\${b.tone}\`}
/>`,
    render: () => (
      <DatasetPreviewCard
        view={DATASET_PREVIEW}
        className="surface-panel dataset-preview-card"
        headerClassName="dataset-card-header"
        titleClassName="dataset-card-title"
        descriptionClassName="dataset-card-description"
        badgeListClassName="dataset-badge-row"
        badgeClassName={(badge) => `dataset-badge tone-${badge.tone}`}
        statListClassName="dataset-stat-grid"
        statClassName={(stat) => `dataset-stat tone-${stat.tone}`}
        statLabelClassName="dataset-stat-label"
        statValueClassName="dataset-stat-value"
        statDetailClassName="dataset-stat-detail"
      />
    ),
  },
  {
    id: "prediction-scatter",
    name: "PredictionScatter",
    category: "Model diagnostics",
    entry: "nirs4all-ui/viz",
    propsInterface: "PredictionScatterProps",
    mirrors: "Studio PredVsObsChart · Web ParityChart",
    summary:
      "Predicted-vs-observed parity scatter with a dashed y = x identity line, an optional regression fit, and an R² / RMSE badge.",
    hostOwned: ["metric computation", "point selection", "partition filter"],
    importLine: 'import { PredictionScatter } from "nirs4all-ui/viz";',
    code: `<PredictionScatter
  points={rows.map((r) => ({ actual: r.yTrue, predicted: r.yPred, partition: r.partition }))}
  metrics={{ r2: 0.932, rmse: 0.327 }}
  regressionLine
/>`,
    render: () => (
      <PredictionScatter points={PREDICTIONS} metrics={{ r2: 0.932, rmse: 0.327 }} regressionLine width={320} height={300} />
    ),
  },
  {
    id: "residual-plot",
    name: "ResidualPlot",
    category: "Model diagnostics",
    entry: "nirs4all-ui/viz",
    propsInterface: "ResidualPlotProps",
    mirrors: "Studio ResidualsChart",
    summary:
      "Residual-vs-predicted scatter with a solid zero line and dashed ±2σ bands — the second half of the regression diagnostics pair.",
    hostOwned: ["residual computation", "σ band toggle", "partition color"],
    importLine: 'import { ResidualPlot } from "nirs4all-ui/viz";',
    code: `<ResidualPlot
  points={rows.map((r) => ({ predicted: r.yPred, actual: r.yTrue, partition: r.partition }))}
  sigmaBand
/>`,
    render: () => <ResidualPlot points={PREDICTIONS} width={420} height={260} />,
  },
  {
    id: "box-plot",
    name: "BoxPlot",
    category: "Model diagnostics",
    entry: "nirs4all-ui/viz",
    propsInterface: "BoxPlotProps",
    mirrors: "Studio CandlestickSvg",
    summary:
      "Box-and-whisker of a score distribution across categories (min / q1 / median / q3 / max + 1.5·IQR outliers) — the CV-stability comparison view.",
    hostOwned: ["grouping variable", "score choice", "outlier policy"],
    importLine: 'import { BoxPlot } from "nirs4all-ui/viz";',
    code: `<BoxPlot
  groups={preprocessings.map((p) => ({ label: p.name, values: p.foldScores }))}
  yLabel="R²"
/>`,
    render: () => <BoxPlot groups={BOX_GROUPS} yLabel="R²" title="Score by preprocessing" width={420} height={260} />,
  },
  {
    id: "score-heatmap",
    name: "ScoreHeatmap",
    category: "Model diagnostics",
    entry: "nirs4all-ui/viz",
    propsInterface: "ScoreHeatmapProps",
    mirrors: "Studio PerformanceHeatmapSvg",
    summary:
      "Model × preprocessing performance heatmap with a perceptual colormap, on-cell values, and a gradient legend.",
    hostOwned: ["axis variables", "colormap", "score normalization"],
    importLine: 'import { ScoreHeatmap } from "nirs4all-ui/viz";',
    code: `<ScoreHeatmap
  rows={models}
  cols={preprocessings}
  values={scoreGrid}
/>`,
    render: () => (
      <ScoreHeatmap rows={HEATMAP_ROWS} cols={HEATMAP_COLS} values={HEATMAP_VALUES} title="R² by model × preprocessing" width={420} height={220} />
    ),
  },
  {
    id: "confusion-matrix",
    name: "ConfusionMatrix",
    category: "Classification",
    entry: "nirs4all-ui/viz",
    propsInterface: "ConfusionMatrixProps",
    mirrors: "Studio ConfusionMatrixSvg · Web PredictionConfusionChart",
    summary:
      "Confusion matrix as intensity-shaded cells — teal on the diagonal, amber off it — with optional per-row normalization.",
    hostOwned: ["class labels", "normalize toggle", "cell color scale"],
    importLine: 'import { ConfusionMatrix } from "nirs4all-ui/viz";',
    code: `<ConfusionMatrix
  labels={confusion.labels}
  matrix={confusion.matrix}   // matrix[trueClass][predClass]
  normalize={false}
/>`,
    render: () => (
      <ConfusionMatrix labels={CONFUSION_LABELS} matrix={CONFUSION_MATRIX} width={320} height={300} />
    ),
  },
  {
    id: "feature-importance",
    name: "FeatureImportanceBar",
    category: "Explainability",
    entry: "nirs4all-ui/viz",
    propsInterface: "FeatureImportanceBarProps",
    mirrors: "Studio FeatureImportanceBar (SHAP)",
    summary:
      "Ranked horizontal bars of the top wavelength regions by mean |SHAP| — the headline variable-importance view.",
    hostOwned: ["SHAP computation", "binning", "top-N", "value format"],
    importLine: 'import { FeatureImportanceBar } from "nirs4all-ui/viz";',
    code: `<FeatureImportanceBar
  items={bins.map((b) => ({ label: b.region, value: b.meanAbsShap }))}
  topN={10}
/>`,
    render: () => <FeatureImportanceBar items={IMPORTANCE} topN={7} title="Top wavelength regions" width={380} />,
  },
  {
    id: "shap-beeswarm",
    name: "ShapBeeswarm",
    category: "Explainability",
    entry: "nirs4all-ui/viz",
    propsInterface: "ShapBeeswarmProps",
    mirrors: "Studio BeeswarmChart (SHAP)",
    summary:
      "SHAP beeswarm — one row per wavelength region, points placed by SHAP value and colored blue→red by feature value.",
    hostOwned: ["SHAP values", "feature-value normalization", "row ordering"],
    importLine: 'import { ShapBeeswarm } from "nirs4all-ui/viz";',
    code: `<ShapBeeswarm
  features={bins.map((b) => ({
    label: b.region,
    points: b.samples.map((s) => ({ shap: s.shap, featureValue: s.value })),
  }))}
/>`,
    render: () => <ShapBeeswarm features={BEESWARM} title="SHAP by wavelength region" width={420} />,
  },
  {
    id: "pipeline-flow",
    name: "PipelineFlow",
    category: "Pipeline & scores",
    entry: "nirs4all-ui/viz",
    propsInterface: "PipelineFlowProps",
    mirrors: "Studio pipeline editor · Web CanvasFlow · Inspector BranchTopology",
    summary:
      "A read-only pipeline spine: dataset → split → preprocessing → model → refit, each step a card with a status dot, a mean-score chip, and a ×N variant badge.",
    hostOwned: ["pipeline DSL", "editing / dnd", "run control", "branch layout"],
    importLine: 'import { PipelineFlow } from "nirs4all-ui/viz";',
    code: `<PipelineFlow
  nodes={pipeline.steps.map((s) => ({
    id: s.id, label: s.name, type: s.kind,
    metric: s.meanScore, status: s.status, variants: s.variantCount,
  }))}
/>`,
    render: () => <PipelineFlow nodes={PIPELINE_NODES} width={300} />,
  },
  {
    id: "score-summary",
    name: "ScoreSummary",
    category: "Pipeline & scores",
    entry: "nirs4all-ui/viz",
    propsInterface: "ScoreSummaryProps",
    mirrors: "Studio ScoreCardTree · Web ResultsList cards",
    summary:
      "A compact grid of big-number metric tiles with tone-colored deltas — the headline scores for a run.",
    hostOwned: ["metric selection", "value formatting", "comparison baseline"],
    importLine: 'import { ScoreSummary } from "nirs4all-ui/viz";',
    code: `<ScoreSummary
  stats={metrics.map((m) => ({ label: m.name, value: m.display, delta: m.delta, tone: m.tone }))}
  columns={3}
/>`,
    render: () => <ScoreSummary stats={SCORE_STATS} columns={3} title="Run scores" />,
  },
  {
    id: "metric-value-badge",
    name: "MetricValueBadge",
    category: "Pipeline & scores",
    entry: "nirs4all-ui/components",
    propsInterface: "MetricValueBadgeProps",
    mirrors: "Studio / Web score chips",
    summary:
      "A direction-aware metric badge: canonicalizes the metric alias, formats the value, and shows better/worse against a comparison value.",
    hostOwned: ["metric subset", "comparison context", "tooltip policy"],
    importLine: 'import { MetricValueBadge } from "nirs4all-ui/components";',
    code: `<MetricValueBadge metric="rmse" value={0.327} compareTo={0.413}
  className="metric-badge" betterClassName="metric-better" worseClassName="metric-worse" />`,
    render: () => (
      <div className="badge-row">
        {[
          { metric: "rmse", value: 0.327, challenger: 0.413 },
          { metric: "r2_score", value: 0.932, challenger: 0.888 },
          { metric: "rpd", value: 3.11, challenger: 2.77 },
        ].map((row) => (
          <MetricValueBadge
            key={row.metric}
            metric={row.metric}
            value={row.value}
            compareTo={row.challenger}
            className="metric-badge"
            betterClassName="metric-better"
            worseClassName="metric-worse"
            equalClassName="metric-equal"
            metricClassName="metric-label"
            valueClassName="metric-value"
            directionClassName="metric-direction"
          />
        ))}
      </div>
    ),
  },
  {
    id: "runtime-engine-badge",
    name: "RuntimeEngineBadge",
    category: "Runtime & status",
    entry: "nirs4all-ui/components",
    propsInterface: "RuntimeEngineBadgeProps",
    mirrors: "Studio / Web engine lineage badge",
    summary:
      "Renders dag-ml / native / fallback engine lineage from a host runtime envelope, without owning icons, layout, or execution.",
    hostOwned: ["runtime payload", "icon system", "placement"],
    importLine: 'import { RuntimeEngineBadge } from "nirs4all-ui/components";',
    code: `<RuntimeEngineBadge
  source={runResult}
  className={\`engine-badge tone-\${status.tone}\`}
  defaultIcon={<Dot tone={status.tone} />}
/>`,
    render: () => (
      <div className="badge-row">
        <RuntimeEngineBadge
          source={{ engine_actual: "dag-ml", engine_requested: "dag-ml", diagnostics: [] }}
          className="engine-badge tone-success"
          defaultIcon={<ToneDot tone="success" />}
        />
        <RuntimeEngineBadge
          source={FALLBACK_RUNTIME}
          className="engine-badge tone-warning"
          defaultIcon={<ToneDot tone="warning" />}
          fallbackIcon={<ToneDot tone="warning" />}
        />
      </div>
    ),
  },
  {
    id: "runtime-status-badge",
    name: "RuntimeResultStatusBadge",
    category: "Runtime & status",
    entry: "nirs4all-ui/components",
    propsInterface: "RuntimeResultStatusBadgeProps",
    mirrors: "Studio RunProgress · Web run status",
    summary:
      "Compact queued / running / completed / failed / partial status badges using the shared display tokens, with host-supplied icons and progress wording.",
    hostOwned: ["status source", "icon components", "progress copy"],
    importLine: 'import { RuntimeResultStatusBadge } from "nirs4all-ui/components";',
    code: `<RuntimeResultStatusBadge status="running" progress={68}
  className="status-badge status-running" icon={<Spinner />} />`,
    render: () => (
      <div className="badge-row">
        <RuntimeResultStatusBadge
          status="running"
          progress={68}
          className="status-badge status-running"
          icon={<ToneDot tone="indigo" />}
          progressClassName="status-progress"
        />
        <RuntimeResultStatusBadge
          status="completed"
          className="status-badge status-completed"
          icon={<ToneDot tone="success" />}
          showProgress={false}
        />
        <RuntimeResultStatusBadge
          status="failed"
          className="status-badge status-failed"
          icon={<ToneDot tone="danger" />}
          showProgress={false}
        />
      </div>
    ),
  },
  {
    id: "runtime-diagnostic-list",
    name: "RuntimeDiagnosticList",
    category: "Runtime & status",
    entry: "nirs4all-ui/components",
    propsInterface: "RuntimeDiagnosticListProps",
    mirrors: "Studio / Web rt_error.v1 diagnostics",
    summary:
      "Normalizes an rt_error.v1-like payload into a diagnostic list with severity tones — the strict-fallback explanation surface.",
    hostOwned: ["severity styling", "container layout", "empty copy"],
    importLine: 'import { RuntimeDiagnosticList } from "nirs4all-ui/components";',
    code: `<RuntimeDiagnosticList
  source={runResult}
  className="diagnostic-list"
  itemClassName={(d) => \`diagnostic-item tone-\${d.tone}\`}
/>`,
    render: () => (
      <RuntimeDiagnosticList
        diagnostics={RUNTIME_DIAGNOSTICS}
        className="diagnostic-list"
        itemClassName={(item) => `diagnostic-item tone-${item.tone}`}
        metadataClassName="diagnostic-meta"
      />
    ),
  },
  {
    id: "decision-card",
    name: "DecisionCard",
    category: "Quality / Lab",
    entry: "nirs4all-ui/lab",
    propsInterface: "DecisionCardProps",
    mirrors: "quali-nirs4all reliability card (Écran 5)",
    summary:
      "The per-prediction reliability card: status + plain-language reason + authorized action + confidence + a detail affordance — never a bare color.",
    hostOwned: ["applicability signals", "thresholds", "icon nodes", "detail routing"],
    importLine: 'import { DecisionCard } from "nirs4all-ui/lab";',
    code: `<DecisionCard
  sampleId="S-00412" predicted={13.4} interval="± 0.42" unit="%"
  input={{ applicabilityScore: 0.7, localDensity: 0.6, intervalWidth: 0.42 }}
  locale="en"
/>`,
    render: () => (
      <DecisionCard
        sampleId="S-00412"
        predicted={13.4}
        interval="± 0.42"
        unit="%"
        input={{ applicabilityScore: 0.7, localDensity: 0.55, intervalWidth: 0.42 }}
        locale="en"
        icons={DECISION_ICONS}
        className="surface-panel lab-decision-card"
        headerClassName="lab-decision-head"
        valueClassName="lab-decision-value"
        labelClassName="lab-decision-label"
        reasonClassName="lab-decision-reason"
        actionClassName="lab-decision-action"
        confidenceClassName="lab-decision-confidence"
        detailClassName="lab-decision-detail"
      />
    ),
  },
  {
    id: "model-report-card",
    name: "ModelReportCard",
    category: "Quality / Lab",
    entry: "nirs4all-ui/lab",
    propsInterface: "ModelReportCardProps",
    mirrors: "quali-nirs4all model bulletin (Écran 4)",
    summary:
      "The model 'bulletin' — grades RPD/RPIQ into quantification / screening / insufficient and reads each metric in plain language.",
    hostOwned: ["metric source", "grade thresholds", "locale"],
    importLine: 'import { ModelReportCard } from "nirs4all-ui/lab";',
    code: `<ModelReportCard
  metrics={{ rmse: 0.33, r2: 0.93, rpd: 3.1, rpiq: 4.2, bias: -0.02, n: 120 }}
  locale="en"
/>`,
    render: () => (
      <ModelReportCard
        metrics={{ rmse: 0.33, r2: 0.93, rpd: 3.1, rpiq: 4.2, bias: -0.02, n: 120 }}
        locale="en"
        title={<strong className="lab-report-title">Protein · PLS</strong>}
        className="surface-panel lab-report-card"
        headerClassName="lab-report-head"
        gradeLabelClassName="lab-report-grade"
        verdictClassName="lab-report-verdict"
        metricsClassName="lab-report-metrics"
        metricRowClassName="lab-report-metric"
        metricLabelClassName="lab-report-metric-label"
        metricValueClassName="lab-report-metric-value"
        metricReadingClassName="lab-report-metric-reading"
      />
    ),
  },
  {
    id: "worklist-table",
    name: "WorklistTable",
    category: "Quality / Lab",
    entry: "nirs4all-ui/lab",
    propsInterface: "WorklistTableProps",
    mirrors: "quali-nirs4all HPLC / re-measure worklist (Écran 3)",
    summary:
      "The bench worklist — enrichment picks with a derived safety flag so a flagged outlier is never silently marked safe.",
    hostOwned: ["enrichment selection", "safety icons", "barcode rendering", "localization"],
    importLine: 'import { WorklistTable } from "nirs4all-ui/lab";',
    code: `<WorklistTable
  items={picks}
  locale="en"
  headers={{ rank: "#", sampleId: "Sample", reason: "Reason", safety: "Safety" }}
/>`,
    render: () => (
      <WorklistTable
        items={[
          { sampleId: "S-00412", barcode: "8412", reason: "rare_type", rank: 1, strongOutlier: true },
          { sampleId: "S-00318", barcode: "8318", reason: "boundary", rank: 2, decisionColor: "caution" },
          { sampleId: "S-00507", barcode: "8507", reason: "fills_gap", rank: 3 },
        ]}
        locale="en"
        headers={{ rank: "#", sampleId: "Sample", barcode: "Barcode", reason: "Reason", safety: "Safety" }}
        safetyIcons={{ safe: <ToneDot tone="success" />, verify: <ToneDot tone="warning" /> }}
        className="lab-worklist"
        theadClassName="lab-worklist-head"
        rowClassName="lab-worklist-row"
        cellClassName="lab-worklist-cell"
        safetyClassName="lab-worklist-safety"
      />
    ),
  },
  {
    id: "step-progress",
    name: "StepProgress",
    category: "Quality / Lab",
    entry: "nirs4all-ui/lab",
    propsInterface: "StepProgressProps",
    mirrors: "quali-nirs4all workflow rail (Prepare → Calibrate → Use)",
    summary: "Numbered-circle workflow stepper; the host owns which step is active and what selecting a step does.",
    hostOwned: ["active step", "navigation policy", "marker rendering"],
    importLine: 'import { StepProgress } from "nirs4all-ui/lab";',
    code: `<StepProgress
  steps={[{ id: "prep", label: "Prepare" }, { id: "cal", label: "Calibrate" }, { id: "use", label: "Use" }]}
  activeId="cal"
/>`,
    render: () => (
      <StepProgress
        steps={[
          { id: "prep", label: "Prepare", caption: "Import & health" },
          { id: "cal", label: "Calibrate", caption: "Fit & grade" },
          { id: "use", label: "Use", caption: "Predict & decide" },
        ]}
        activeId="cal"
        className="lab-stepper"
        stepClassName="lab-step"
        completedClassName="lab-step-done"
        activeClassName="lab-step-active"
        upcomingClassName="lab-step-upcoming"
        markerClassName="lab-step-marker"
        labelClassName="lab-step-label"
        captionClassName="lab-step-caption"
      />
    ),
  },
  {
    id: "health-finding-row",
    name: "HealthFindingRow",
    category: "Quality / Lab",
    entry: "nirs4all-ui/lab",
    propsInterface: "HealthFindingRowProps",
    mirrors: "quali-nirs4all data-health checklist (Écran 2)",
    summary: "One row of the data-health checklist: severity tone, title, detail, affected count, and an authorized action.",
    hostOwned: ["finding source", "action control", "explanation content"],
    importLine: 'import { HealthFindingRow } from "nirs4all-ui/lab";',
    code: `<HealthFindingRow
  finding={{ id: "sat", title: "Saturated spectra", severity: "warning", affectedCount: 3, action: "remeasure" }}
/>`,
    render: () => (
      <div className="lab-health-list">
        <HealthFindingRow
          finding={{ id: "dup", title: "Duplicate spectra", detail: "Identical scans detected", severity: "ok", affectedCount: 0, action: "auto_handled" }}
          icons={{ check: <ToneDot tone="success" />, alert: <ToneDot tone="warning" />, ban: <ToneDot tone="danger" /> }}
          className="lab-health-row"
          titleClassName="lab-health-title"
          detailClassName="lab-health-detail"
          affectedClassName="lab-health-affected"
        />
        <HealthFindingRow
          finding={{ id: "sat", title: "Saturated spectra", detail: "Detector saturation near 1930 nm", severity: "warning", affectedCount: 3, action: "remeasure" }}
          icons={{ check: <ToneDot tone="success" />, alert: <ToneDot tone="warning" />, ban: <ToneDot tone="danger" /> }}
          className="lab-health-row"
          titleClassName="lab-health-title"
          detailClassName="lab-health-detail"
          affectedClassName="lab-health-affected"
        />
      </div>
    ),
  },
  {
    id: "decision-badge",
    name: "DecisionBadge",
    category: "Quality / Lab",
    entry: "nirs4all-ui/lab",
    propsInterface: "DecisionBadgeProps",
    mirrors: "quali-nirs4all traffic-light badge + legend",
    summary:
      "The compact four-color decision badge and the pedagogical legend (reliable / caution / out-of-domain / informative) that can never drift from the decisions the app makes.",
    hostOwned: ["applicability signals", "icon nodes", "locale"],
    importLine: 'import { DecisionBadge, TrafficLightLegend } from "nirs4all-ui/lab";',
    code: `<DecisionBadge input={{ applicabilityScore: 0.2, localDensity: 0.8 }} locale="en" />
<TrafficLightLegend locale="en" />`,
    render: () => (
      <div className="lab-badge-stack">
        <div className="badge-row">
          <DecisionBadge input={{ applicabilityScore: 0.2, localDensity: 0.8 }} locale="en" icons={DECISION_ICONS} className="decision-badge tone-success" />
          <DecisionBadge input={{ applicabilityScore: 1.3 }} locale="en" icons={DECISION_ICONS} className="decision-badge tone-warning" />
          <DecisionBadge input={{ gateRejected: true }} locale="en" icons={DECISION_ICONS} className="decision-badge tone-danger" />
        </div>
        <div className="badge-row">
          {["received", "nirs_measured", "integrated", "excluded"].map((status) => (
            <SampleStatusBadge
              key={status}
              status={status}
              icons={{ inbox: <ToneDot tone="muted" />, waveform: <ToneDot tone="cyan" />, refresh: <ToneDot tone="warning" />, flask: <ToneDot tone="indigo" />, check: <ToneDot tone="success" />, x: <ToneDot tone="danger" /> }}
              className="sample-status-badge"
            />
          ))}
        </div>
        <TrafficLightLegend
          locale="en"
          icons={DECISION_ICONS}
          className="lab-legend"
          itemClassName="lab-legend-item"
          labelClassName="lab-legend-label"
          actionClassName="lab-legend-action"
        />
      </div>
    ),
  },
  {
    id: "prediction-card",
    name: "PredictionCard",
    category: "Results & scores",
    entry: "nirs4all-ui/components",
    propsInterface: "PredictionCardProps",
    mirrors: "Studio Predictions · prediction-id card",
    summary:
      "A single prediction's identity card: sample id, predicted value + unit, conformal interval, and metadata rows, with a slot for host badges.",
    hostOwned: ["prediction source", "value formatting", "badges / actions", "routing"],
    importLine: 'import { PredictionCard } from "nirs4all-ui/components";',
    code: `<PredictionCard
  sampleId="S-00412" predicted={13.42} unit="%" interval="± 0.42" targetLabel="Protein"
  meta={[{ label: "Model", value: "SNV → PLS" }, { label: "Engine", value: "dag-ml" }]}
/>`,
    render: () => (
      <PredictionCard
        sampleId="S-00412"
        predicted={13.42}
        unit="%"
        interval="± 0.42"
        targetLabel="Protein"
        meta={[
          { label: "Model", value: "SNV → PLS" },
          { label: "Engine", value: "dag-ml" },
          { label: "Fold", value: "refit" },
        ]}
        className="surface-panel pred-card"
        headerClassName="pred-card-head"
        sampleIdClassName="pred-card-id"
        targetClassName="pred-card-target"
        valueClassName="pred-card-value"
        unitClassName="pred-card-unit"
        intervalClassName="pred-card-interval"
        metaListClassName="pred-card-meta"
        metaRowClassName="pred-card-meta-row"
        metaLabelClassName="pred-card-meta-label"
        metaValueClassName="pred-card-meta-value"
      >
        <span className="decision-badge tone-success">
          <ToneDot tone="success" /> Reliable
        </span>
      </PredictionCard>
    ),
  },
  {
    id: "dataset-result-card",
    name: "DatasetResultCard",
    category: "Results & scores",
    entry: "nirs4all-ui/components",
    propsInterface: "DatasetResultCardProps",
    mirrors: "Studio DatasetCard · datasetResultCardData",
    summary:
      "A dataset result-summary tile: task, best score, winning model, sample/feature counts, tags, and status — the card in the datasets grid.",
    hostOwned: ["result loading", "routing", "tag rendering", "status source"],
    importLine: 'import { DatasetResultCard } from "nirs4all-ui/components";',
    code: `<DatasetResultCard
  title="Corn NIR" taskLabel="Regression" model="SNV → PLS"
  bestScore={{ metric: "R²", value: "0.932" }} sampleCount={120} featureCount={256}
  tags={["NIR", "moisture"]} status="scored"
/>`,
    render: () => (
      <DatasetResultCard
        title="Corn NIR calibration"
        description="Moisture + protein reference spectra."
        taskLabel="Regression"
        bestScore={{ metric: "R²", value: "0.932" }}
        model="SNV → SG1 → PLS"
        sampleCount={120}
        featureCount={256}
        tags={["NIR", "moisture", "protein"]}
        status="scored"
        className="surface-panel result-card"
        headerClassName="result-card-head"
        titleClassName="result-card-title"
        descriptionClassName="result-card-desc"
        taskClassName="result-card-task"
        scoreClassName="result-card-score"
        modelClassName="result-card-model"
        statListClassName="result-card-stats"
        statClassName="result-card-stat"
        statLabelClassName="result-card-stat-label"
        statValueClassName="result-card-stat-value"
        tagListClassName="result-card-tags"
        tagClassName="result-card-tag"
        statusClassName="result-card-status"
      />
    ),
  },
  {
    id: "score-card-tree",
    name: "ScoreCardTree",
    category: "Results & scores",
    entry: "nirs4all-ui/components",
    propsInterface: "ScoreCardTreeProps",
    mirrors: "Studio ScoreCardTree (Refit → CV → folds)",
    summary:
      "The expandable model score tree — Refit → cross-validation → per-fold cards, each with tone-colored metric chips. Collapsibility uses native <details>.",
    hostOwned: ["score payload", "metric selection", "expansion policy"],
    importLine: 'import { ScoreCardTree } from "nirs4all-ui/components";',
    code: `<ScoreCardTree nodes={[
  { id: "refit", label: "Refit", metrics: [{ label: "R²", value: "0.932" }],
    children: [{ id: "cv", label: "5-fold CV", metrics: [...], children: folds }] },
]} />`,
    render: () => (
      <ScoreCardTree
        nodes={SCORE_TREE_NODES}
        className="score-tree"
        nodeClassName="score-tree-node"
        summaryClassName="score-tree-summary"
        labelClassName="score-tree-label"
        kindClassName="score-tree-kind"
        metricsClassName="score-tree-metrics"
        metricClassName="score-tree-metric"
        metricLabelClassName="score-tree-metric-label"
        metricValueClassName="score-tree-metric-value"
        childrenClassName="score-tree-children"
      />
    ),
  },
  {
    id: "rankings-table",
    name: "RankingsTable",
    category: "Results & scores",
    entry: "nirs4all-ui/components",
    propsInterface: "RankingsTableProps",
    mirrors: "Studio Inspector RankingsTable",
    summary: "A model/pipeline leaderboard ranked by the primary metric, with the winner highlighted.",
    hostOwned: ["ranking source", "metric choice", "sort", "row selection"],
    importLine: 'import { RankingsTable } from "nirs4all-ui/components";',
    code: `<RankingsTable rows={ranked} metricLabel="R²"
  headers={{ rank: "#", name: "Pipeline", detail: "Config" }} />`,
    render: () => (
      <RankingsTable
        rows={RANKING_ROWS}
        metricLabel="R²"
        headers={{ rank: "#", name: "Pipeline", detail: "Config" }}
        className="rankings"
        theadClassName="rankings-head"
        rowClassName="rankings-row"
        highlightRowClassName="rankings-row-top"
        cellClassName="rankings-cell"
        rankClassName="rankings-rank"
        nameClassName="rankings-name"
        scoreClassName="rankings-score"
      />
    ),
  },
  {
    id: "per-class-table",
    name: "PerClassTable",
    category: "Classification",
    entry: "nirs4all-ui/components",
    propsInterface: "PerClassTableProps",
    mirrors: "Studio / Web per-class metrics table",
    summary: "Per-class precision / recall / F1 / support — the companion table to a confusion matrix.",
    hostOwned: ["metric computation", "class labels", "value formatting"],
    importLine: 'import { PerClassTable } from "nirs4all-ui/components";',
    code: `<PerClassTable rows={perClass}
  headers={{ class: "Class", precision: "Precision", recall: "Recall", f1: "F1", support: "n" }} />`,
    render: () => (
      <PerClassTable
        rows={PER_CLASS}
        headers={{ class: "Class", precision: "Precision", recall: "Recall", f1: "F1", support: "n" }}
        className="perclass"
        theadClassName="perclass-head"
        rowClassName="perclass-row"
        cellClassName="perclass-cell"
        labelCellClassName="perclass-label"
      />
    ),
  },
  {
    id: "waterfall-chart",
    name: "WaterfallChart",
    category: "Explainability",
    entry: "nirs4all-ui/viz",
    propsInterface: "WaterfallChartProps",
    mirrors: "Studio VariableImportance WaterfallChart",
    summary:
      "Per-sample SHAP waterfall — from the base value to the prediction, each wavelength region pushes the estimate up (green) or down (rose).",
    hostOwned: ["SHAP computation", "base/prediction values", "top-N", "sample stepper"],
    importLine: 'import { WaterfallChart } from "nirs4all-ui/viz";',
    code: `<WaterfallChart
  baseValue={12.4}
  contributions={explanation.features.map((f) => ({ label: f.region, value: f.shap }))}
  predicted={13.75}
/>`,
    render: () => (
      <WaterfallChart baseValue={12.4} contributions={WATERFALL_CONTRIBUTIONS} predicted={13.7} width={420} />
    ),
  },
  {
    id: "fold-stability",
    name: "FoldStabilityLines",
    category: "Model diagnostics",
    entry: "nirs4all-ui/viz",
    propsInterface: "FoldStabilityLinesProps",
    mirrors: "Studio Inspector FoldStabilitySvg",
    summary:
      "Per-fold score lines — one faint line per model chain across CV folds, with an emphasized mean line and a min/max stability band.",
    hostOwned: ["fold scores", "chain selection", "mean toggle"],
    importLine: 'import { FoldStabilityLines } from "nirs4all-ui/viz";',
    code: `<FoldStabilityLines
  series={chains.map((c) => ({ id: c.id, label: c.name, scores: c.foldScores }))}
  yLabel="R²"
/>`,
    render: () => <FoldStabilityLines series={FOLD_SERIES} yLabel="R²" width={440} height={250} />,
  },
  {
    id: "bias-variance",
    name: "BiasVarianceBars",
    category: "Model diagnostics",
    entry: "nirs4all-ui/viz",
    propsInterface: "BiasVarianceBarsProps",
    mirrors: "Studio Inspector BiasVarianceBarChart",
    summary: "Stacked bias² / variance decomposition per model — the error-budget comparison view.",
    hostOwned: ["decomposition computation", "model grouping", "colors"],
    importLine: 'import { BiasVarianceBars } from "nirs4all-ui/viz";',
    code: `<BiasVarianceBars
  entries={models.map((m) => ({ label: m.name, biasSquared: m.bias2, variance: m.var }))}
/>`,
    render: () => <BiasVarianceBars entries={BIAS_VARIANCE} width={400} height={240} />,
  },
];

// ---------------------------------------------------------------------------
// Demo compiled DAG for the graph-explorer section (deterministic, ~150 nodes,
// nested family → chain clusters so collapse/expand is visible).
// ---------------------------------------------------------------------------

const DEMO_FAMILIES = ["A", "B", "C", "D", "E"];
const DEMO_BRANCHES_PER_FAMILY = 6;
const DEMO_ALGOS = ["PLS", "Ridge", "RandomForest", "SVR", "XGBoost", "MLP"];

function demoStatus(idx: number): DagNodeStatus {
  if (idx % 17 === 5) return "failed";
  if (idx % 11 === 3) return "running";
  if (idx % 9 === 8) return "idle";
  return "done";
}

function buildDemoDag(): DagGraph {
  const nodes: DagNode[] = [
    { id: "data:x", kind: "adapter", label: "raw spectra", detail: "NirToTabular", status: "done" },
    { id: "split:cv", kind: "split", label: "5-fold CV", detail: "GroupKFold", status: "done" },
    {
      id: "gen:grid",
      kind: "generator",
      label: "variant grid",
      detail: "cartesian",
      status: "done",
      variants: DEMO_FAMILIES.length * DEMO_BRANCHES_PER_FAMILY,
    },
  ];
  const edges: DagEdge[] = [
    { source: "data:x", target: "split:cv", kind: "data" },
    { source: "split:cv", target: "gen:grid", kind: "data" },
  ];

  let idx = 0;
  for (let f = 0; f < DEMO_FAMILIES.length; f += 1) {
    const family = `family ${DEMO_FAMILIES[f]}`;
    for (let b = 0; b < DEMO_BRANCHES_PER_FAMILY; b += 1) {
      const chain = `chain ${idx}`;
      const group = [family, chain];
      const algo = DEMO_ALGOS[idx % DEMO_ALGOS.length] as string;
      const snv = `f${f}.c${idx}.pre:snv`;
      const sg = `f${f}.c${idx}.pre:sg`;
      const model = `f${f}.c${idx}.model:${algo.toLowerCase()}`;
      const status = demoStatus(idx);
      const r2 = Number((0.7 + ((idx * 37) % 25) / 100).toFixed(3));
      nodes.push(
        { id: snv, kind: "transform", label: "SNV", group, status },
        { id: sg, kind: "transform", label: "SG(2,1)", group, status },
        { id: model, kind: "model", label: algo, detail: `${algo} · fold-fit`, group, status, metric: r2 },
      );
      edges.push(
        { source: "gen:grid", target: snv, kind: "data" },
        { source: snv, target: sg, kind: "data" },
        { source: sg, target: model, kind: "data" },
        { source: model, target: "merge:stack", kind: "prediction", oof: true },
      );
      idx += 1;
    }
  }

  nodes.push(
    { id: "merge:stack", kind: "prediction_join", label: "stack (pred + X)", detail: "predictions_plus_original", status: "done" },
    { id: "meta:ridge", kind: "model", label: "meta-learner", detail: "RidgeMetaStacker", status: "done", metric: 0.941 },
    { id: "score:report", kind: "aggregator", label: "score report", detail: "R² / RMSE", status: "done" },
  );
  edges.push(
    { source: "merge:stack", target: "meta:ridge", kind: "prediction" },
    { source: "meta:ridge", target: "score:report", kind: "metric" },
  );

  return { name: "stacking-grid (compiled)", nodes, edges };
}

export const DEMO_DAG_GRAPH: DagGraph = buildDemoDag();
