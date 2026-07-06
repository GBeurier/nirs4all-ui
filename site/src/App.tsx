import type { ReactNode } from "react";

import {
  DatasetPreviewCard,
  MetricValueBadge,
  RuntimeDiagnosticList,
  RuntimeEngineBadge,
  RuntimeResultStatusBadge,
} from "../../src/components/index.js";
import {
  buildDatasetPreview,
  formatDatasetCount,
  formatDatasetSpectralRange,
  formatDatasetTaskLabel,
  normalizeDatasetSplitCounts,
  parseDatasetCount,
  resolveDatasetTaskKind,
} from "../../src/dataset/index.js";
import {
  NIRS4ALL_BRANDS,
  generateNirs4allBrandSvg,
  getNirs4allBrandAssetPath,
} from "../../src/brand/index.js";
import {
  RUNTIME_RESULT_STATUSES,
  RUNTIME_RESULT_STATUS_DISPLAY,
  buildRuntimeEngineStatus,
  buildRuntimeNativeResultsAffordance,
  buildRuntimeResultStatusView,
  formatRuntimeEngineTitle,
  formatRuntimeRefusalText,
  formatRuntimeTokenLabel,
  getRuntimeResultEmptyMessage,
  getRuntimeResultStatusDisplay,
  getRuntimeResultStatusProgress,
  isBusyRuntimeResultStatus,
  isRuntimeResultStatus,
  normalizeRuntimeDiagnostics,
  resolveRuntimeResultStatus,
  runtimeEngineLabel,
} from "../../src/runtime/index.js";
import {
  ALL_CLASSIFICATION_METRICS,
  ALL_GENERAL_METRICS,
  ALL_REGRESSION_METRICS,
  ALL_SCORE_METRICS,
  CLASSIFICATION_METRICS,
  CLASSIFICATION_PRESETS,
  DEFAULT_DATASET_ITEM_CLASSIFICATION_METRICS,
  DEFAULT_DATASET_ITEM_REGRESSION_METRICS,
  LEGACY_DATASET_ITEM_CLASSIFICATION_METRICS,
  LEGACY_DATASET_ITEM_REGRESSION_METRICS,
  REGRESSION_METRICS,
  REGRESSION_PRESETS,
  canonicalMetricKey,
  filterMetricsForTaskType,
  formatMetricDisplayName,
  formatMetricName,
  formatMetricValue,
  formatScore,
  getAvailableMetricKeysForTaskTypes,
  getAvailableMetrics,
  getDefaultSelectedMetrics,
  getDefaultSelectedMetricsForTaskTypes,
  getDefaultSelectionUpgradeCandidatesForTaskTypes,
  getLegacySelectedMetricsForTaskTypes,
  getMetricDefinition,
  getMetricDefinitions,
  getMetricsForTaskType,
  getPresetsForTaskType,
  getPresetsForTaskTypes,
  groupMetricDefinitions,
  isBetterScore,
  isClassificationTaskType,
  isKnownMetricKey,
  isLowerBetter,
  metricKeyCandidates,
  normalizeMetricLookupKey,
  orderMetricKeys,
  parseJsonRecord,
  parseScoreNumber,
} from "../../src/score/index.js";
import {
  NIRS4ALL_CSS_TOKENS,
  NIRS4ALL_DEFAULT_THEME,
  NIRS4ALL_STYLE_ASSETS,
  getNirs4allCssVariable,
} from "../../src/styles/index.js";
import packageJson from "../../package.json" with { type: "json" };
import { CANONICAL_SITE_URL, PUBLICATION_ASSETS } from "./showcaseMetadata.js";

const packageVersion = packageJson.version;

const engineFixture = {
  engine_actual: "dag-ml",
  engine_requested: "dag-ml",
  diagnostics: [],
};

const fallbackFixture = {
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

const nestedRuntimeFixture = {
  execution_metadata: {
    rt_result: {
      manifest: { engine: "wasm-local" },
      diagnostics: [{ message: "Native artifact bundle attached.", severity: "info" }],
    },
  },
};

const runtimeSources = [
  { id: "dagml", label: "DAG-ML execution", source: engineFixture },
  { id: "fallback", label: "Strict fallback diagnostic", source: fallbackFixture },
  { id: "nested", label: "Nested runtime envelope", source: nestedRuntimeFixture },
  {
    id: "lineage",
    label: "Legacy lineage prop",
    lineage: { executed: true },
    source: null,
  },
];

const scoreRows = [
  { metric: "rmse", value: 0.32742, challenger: 0.41291 },
  { metric: "r2_score", value: 0.91881, challenger: 0.88763 },
  { metric: "rpd", value: 3.11492, challenger: 2.7731 },
  { metric: "balanced accuracy", value: 0.84218, challenger: 0.8294 },
  { metric: "bias", value: -0.01831, challenger: 0.0412 },
];

const datasetFixture = {
  id: "corn-calibration-v1",
  title: "Corn NIR calibration",
  description: "Moisture and protein spectra prepared for shared Studio/Web dataset previews.",
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
};

const mixedTaskTypes = ["regression", "classification"];
const defaultMetricKeys = getDefaultSelectedMetricsForTaskTypes(mixedTaskTypes);
const legacyMetricKeys = getLegacySelectedMetricsForTaskTypes(mixedTaskTypes);
const availableMixedMetrics = getAvailableMetricKeysForTaskTypes(mixedTaskTypes);
const upgradeCandidates = getDefaultSelectionUpgradeCandidatesForTaskTypes(mixedTaskTypes);
const groupedMetrics = groupMetricDefinitions(defaultMetricKeys);
const nativeAffordance = buildRuntimeNativeResultsAffordance({
  artifactCount: 4,
  hasRefit: true,
});
const disabledNativeAffordance = buildRuntimeNativeResultsAffordance();
const fallbackStatus = buildRuntimeEngineStatus(fallbackFixture);
const diagnostics = normalizeRuntimeDiagnostics(fallbackFixture);
const datasetPreview = buildDatasetPreview(datasetFixture);
const datasetSplits = normalizeDatasetSplitCounts(datasetFixture.splitCounts, datasetFixture.sampleCount);
const datasetSpectralRange = formatDatasetSpectralRange(datasetFixture.spectralRange);
const queuedEmptyMessage = getRuntimeResultEmptyMessage("queued", {
  queued: "Queued until a host runtime starts.",
  running: "Runtime is producing a result.",
  fallback: "No result payload is available.",
});
const invalidStatusFallback = resolveRuntimeResultStatus("archived", "partial");
const parsedScoreRecord = parseJsonRecord('{"rmse":"0.32742","r2_score":0.91881}');

const exportGroups = [
  {
    entry: "nirs4all-ui",
    title: "Root barrel",
    items: ["score namespace", "runtime namespace", "dataset namespace", "components namespace"],
    note: "Convenience import for package-wide consumers.",
  },
  {
    entry: "nirs4all-ui/components",
    title: "React components",
    items: [
      "DatasetPreviewCard",
      "MetricValueBadge",
      "RuntimeDiagnosticList",
      "RuntimeEngineBadge",
      "RuntimeResultStatusBadge",
    ],
    note: "Presentational only; hosts provide classes and icon nodes.",
  },
  {
    entry: "nirs4all-ui/dataset",
    title: "Dataset view models",
    items: [
      "dataset preview contract",
      "count and split labels",
      "spectral range formatting",
      "badges and stats",
    ],
    note: "Pure TypeScript helpers for shared dataset summary cards.",
  },
  {
    entry: "nirs4all-ui/runtime",
    title: "Runtime view models",
    items: [
      "status display tokens",
      "engine status summaries",
      "rt_error.v1 diagnostics",
      "native result affordances",
    ],
    note: "Pure TypeScript helpers; no runtime execution.",
  },
  {
    entry: "nirs4all-ui/score",
    title: "Score view models",
    items: [
      "metric key normalization",
      "metric catalog and presets",
      "direction-aware parsing",
      "comparison and formatting",
    ],
    note: "Catalog mirrors the shared NIRS4ALL metric vocabulary.",
  },
  {
    entry: "nirs4all-ui/brand",
    title: "Brand system",
    items: ["ecosystem marks", "asset paths", "SVG generator", "brand palettes"],
    note: "Reusable graphical identity for docs, apps, registries, and custom hosts.",
  },
  {
    entry: "nirs4all-ui/styles",
    title: "Default styles",
    items: ["CSS tokens", "host utility classes", "motion assets", "theme manifest"],
    note: "Framework-agnostic assets exported without importing CSS from JavaScript.",
  },
  {
    entry: "nirs4all-ui/assets/*",
    title: "Brand assets",
    items: ["package logo kit", "ecosystem SVG marks", "default CSS", "spectra animation"],
    note: "Packaged static assets for downstream apps, docs, registries, and Pages.",
  },
];

const hostIntegrationSteps = [
  {
    title: "nirs4all-core",
    code: "portable data",
    items: ["dataset records", "score payloads", "runtime envelopes"],
  },
  {
    title: "nirs4all-ui",
    code: "view contracts",
    items: ["pure helpers", "stateless components", "packaged brand assets"],
  },
  {
    title: "custom app host",
    code: "ownership boundary",
    items: ["routing and state", "icons and classes", "execution and I/O policy"],
  },
];

const hostBoundaryRows = [
  {
    area: "Dataset previews",
    ui: "buildDatasetPreview + DatasetPreviewCard",
    host: "adapt local catalog records and decide placement",
  },
  {
    area: "Runtime feedback",
    ui: "buildRuntimeEngineStatus + RuntimeDiagnosticList",
    host: "supply runtime envelopes, icons, and status layout",
  },
  {
    area: "Score displays",
    ui: "formatMetricValue + MetricValueBadge",
    host: "choose metric subsets and comparison context",
  },
  {
    area: "Brand delivery",
    ui: "nirs4all-ui/assets/* + Pages URLs",
    host: "reuse the package kit or layer host-specific marks",
  },
];

const hostImportSample = [
  'import { buildDatasetPreview } from "nirs4all-ui/dataset";',
  'import { RuntimeEngineBadge } from "nirs4all-ui/components";',
  'import iconUrl from "nirs4all-ui/assets/brand/icon.svg";',
].join("\n");

const publicApiGroups = [
  {
    entry: "nirs4all-ui",
    title: "Root namespace exports",
    symbols: ["score", "runtime", "dataset", "components", "brand", "styles"],
  },
  {
    entry: "nirs4all-ui/components",
    title: "Component exports",
    symbols: [
      "DatasetPreviewCard",
      "DatasetPreviewCardProps",
      "MetricValueBadge",
      "MetricValueBadgeProps",
      "RuntimeDiagnosticList",
      "RuntimeDiagnosticListProps",
      "RuntimeEngineBadge",
      "RuntimeEngineBadgeProps",
      "RuntimeResultStatusBadge",
      "RuntimeResultStatusBadgeProps",
    ],
  },
  {
    entry: "nirs4all-ui/dataset",
    title: "Dataset exports",
    symbols: [
      "DatasetPreviewTaskKind",
      "DatasetPreviewTone",
      "DatasetPreviewCount",
      "DatasetSplitCountInput",
      "DatasetSplitCountsInput",
      "DatasetSpectralRangeInput",
      "DatasetPreviewInput",
      "DatasetSplitCountView",
      "DatasetPreviewBadge",
      "DatasetPreviewStat",
      "DatasetPreviewView",
      "parseDatasetCount",
      "formatDatasetCount",
      "resolveDatasetTaskKind",
      "formatDatasetTaskLabel",
      "formatDatasetTokenLabel",
      "normalizeDatasetSplitCounts",
      "formatDatasetSpectralRange",
      "buildDatasetPreview",
    ],
  },
  {
    entry: "nirs4all-ui/runtime",
    title: "Runtime exports",
    symbols: [
      "RUNTIME_RESULT_STATUSES",
      "RuntimeResultStatus",
      "RuntimeResultStatusIcon",
      "RuntimeResultBadgeVariant",
      "RuntimeResultStatusDisplay",
      "RuntimeResultStatusView",
      "RuntimeResultEmptyMessages",
      "RUNTIME_RESULT_STATUS_DISPLAY",
      "isRuntimeResultStatus",
      "resolveRuntimeResultStatus",
      "getRuntimeResultStatusDisplay",
      "isBusyRuntimeResultStatus",
      "getRuntimeResultStatusProgress",
      "buildRuntimeResultStatusView",
      "getRuntimeResultEmptyMessage",
      "RuntimeDiagnosticTone",
      "RuntimeDiagnosticItem",
      "RuntimeEngineTone",
      "RuntimeEngineStatusView",
      "RuntimeNativeResultsAffordanceInput",
      "RuntimeNativeResultsAffordanceView",
      "normalizeRuntimeDiagnostics",
      "formatRuntimeTokenLabel",
      "formatRuntimeRefusalText",
      "buildRuntimeEngineStatus",
      "formatRuntimeEngineTitle",
      "buildRuntimeNativeResultsAffordance",
      "RuntimeEngineLineage",
      "runtimeEngineLabel",
    ],
  },
  {
    entry: "nirs4all-ui/score",
    title: "Score exports",
    symbols: [
      "normalizeMetricLookupKey",
      "canonicalMetricKey",
      "metricKeyCandidates",
      "parseScoreNumber",
      "parseJsonRecord",
      "isLowerBetter",
      "isBetterScore",
      "formatScore",
      "formatMetricValue",
      "formatMetricName",
      "formatMetricDisplayName",
      "REGRESSION_METRICS",
      "CLASSIFICATION_METRICS",
      "DEFAULT_DATASET_ITEM_REGRESSION_METRICS",
      "LEGACY_DATASET_ITEM_REGRESSION_METRICS",
      "DEFAULT_DATASET_ITEM_CLASSIFICATION_METRICS",
      "LEGACY_DATASET_ITEM_CLASSIFICATION_METRICS",
      "MetricDefinition",
      "MetricGroup",
      "ALL_GENERAL_METRICS",
      "ALL_REGRESSION_METRICS",
      "ALL_CLASSIFICATION_METRICS",
      "ALL_SCORE_METRICS",
      "isClassificationTaskType",
      "getMetricsForTaskType",
      "getMetricDefinition",
      "isKnownMetricKey",
      "orderMetricKeys",
      "getMetricDefinitions",
      "groupMetricDefinitions",
      "getDefaultSelectedMetricsForTaskTypes",
      "getLegacySelectedMetricsForTaskTypes",
      "getDefaultSelectionUpgradeCandidatesForTaskTypes",
      "getAvailableMetricKeysForTaskTypes",
      "filterMetricsForTaskType",
      "getAvailableMetrics",
      "MetricPreset",
      "REGRESSION_PRESETS",
      "CLASSIFICATION_PRESETS",
      "getPresetsForTaskType",
      "getPresetsForTaskTypes",
      "getDefaultSelectedMetrics",
    ],
  },
  {
    entry: "nirs4all-ui/assets/*",
    title: "Asset exports",
    symbols: [
      "assets/brand/icon.svg",
      "assets/brand/icon-32.png",
      "assets/brand/icon-180.png",
      "assets/brand/icon-256.png",
      "assets/brand/icon-512.png",
      "assets/brand/favicon.ico",
      "assets/brand/horizontal.svg",
      "assets/brand/horizontal-dark.svg",
      "assets/brand/horizontal.png",
      "assets/brand/stacked.svg",
      "assets/brand/stacked-dark.svg",
      "assets/brand/stacked.png",
      "assets/brand/og.png",
      "assets/brands/nirs4all/icon.svg",
      "assets/brands/nirs4all-core/horizontal.svg",
      "assets/brands/nirs4all-ui/stacked.svg",
      "assets/brands/nirs4all-providers/icon.svg",
      "assets/styles/nirs4all-default.css",
      "assets/motion/nirs-spectra.svg",
    ],
  },
  {
    entry: "nirs4all-ui/brand",
    title: "Brand exports",
    symbols: [
      "NIRS4ALL_BRANDS",
      "Nirs4allBrandId",
      "Nirs4allBrandVariant",
      "Nirs4allBrandDefinition",
      "listNirs4allBrands",
      "isNirs4allBrandId",
      "getNirs4allBrandDefinition",
      "getNirs4allBrandAssetPath",
      "generateNirs4allBrandSvg",
    ],
  },
  {
    entry: "nirs4all-ui/styles",
    title: "Style exports",
    symbols: [
      "NIRS4ALL_STYLE_ASSETS",
      "NIRS4ALL_CSS_TOKENS",
      "NIRS4ALL_DEFAULT_THEME",
      "Nirs4allStyleAsset",
      "Nirs4allCssToken",
      "getNirs4allStyleAsset",
      "getNirs4allCssVariable",
    ],
  },
];

const publicApiSymbolCount = publicApiGroups.reduce(
  (total, group) => total + group.symbols.length,
  0,
);

const reusableComponentCards = [
  {
    name: "DatasetPreviewCard",
    entry: "nirs4all-ui/components",
    propsInterface: "DatasetPreviewCardProps",
    status: "exported",
    summary:
      "A stateless dataset summary card backed by the shared preview contract. Hosts adapt dataset records and keep ownership of layout density, tags, and visual tone.",
    props: ["dataset or view", "badges and stats", "renderBadge", "renderStat", "class resolvers"],
    hostOwned: ["data loading", "dataset routing", "icon system", "card placement"],
    importLine: 'import { DatasetPreviewCard } from "nirs4all-ui/components";',
  },
  {
    name: "RuntimeEngineBadge",
    entry: "nirs4all-ui/components",
    propsInterface: "RuntimeEngineBadgeProps",
    status: "exported",
    summary:
      "A stateless badge for host-provided runtime metadata. It renders dag-ml/native/fallback lineage without owning layout, icons, state, or execution.",
    props: ["source or status", "lineage", "label and title", "icon nodes", "className"],
    hostOwned: ["placement", "density", "icon system", "runtime payload adaptation"],
    importLine: 'import { RuntimeEngineBadge } from "nirs4all-ui/components";',
  },
  {
    name: "RuntimeResultStatusBadge",
    entry: "nirs4all-ui/components",
    propsInterface: "RuntimeResultStatusBadgeProps",
    status: "exported",
    summary:
      "A compact status badge for queued/running/completed/failed/partial runtime states. It uses shared display tokens while leaving iconography and classes to the host.",
    props: ["status or view", "progress", "icon map", "formatProgress", "className"],
    hostOwned: ["status placement", "visual tone", "icon components", "progress wording"],
    importLine: 'import { RuntimeResultStatusBadge } from "nirs4all-ui/components";',
  },
  {
    name: "RuntimeDiagnosticList",
    entry: "nirs4all-ui/components",
    propsInterface: "RuntimeDiagnosticListProps",
    status: "exported",
    summary:
      "A normalized runtime diagnostic list for rt_error.v1-like payloads. Hosts can render the default content or supply a custom item renderer.",
    props: ["source or diagnostics", "empty content", "item class resolver", "renderItem"],
    hostOwned: ["severity styling", "container layout", "empty state copy", "custom rendering"],
    importLine: 'import { RuntimeDiagnosticList } from "nirs4all-ui/components";',
  },
  {
    name: "MetricValueBadge",
    entry: "nirs4all-ui/components",
    propsInterface: "MetricValueBadgeProps",
    status: "exported",
    summary:
      "A direction-aware metric badge for score cards and compact tables. It canonicalizes metric aliases and can show better/worse/equal comparison state.",
    props: ["metric", "value", "compareTo", "label", "comparison classes"],
    hostOwned: ["density", "comparison colors", "surrounding table/grid", "tooltip policy"],
    importLine: 'import { MetricValueBadge } from "nirs4all-ui/components";',
  },
];

const scoreHelperGroups = [
  {
    title: "Metric keys",
    items: ["normalizeMetricLookupKey", "canonicalMetricKey", "metricKeyCandidates"],
  },
  {
    title: "Value helpers",
    items: ["parseScoreNumber", "parseJsonRecord", "formatScore", "formatMetricValue", "isBetterScore"],
  },
  {
    title: "Catalog selectors",
    items: [
      "getMetricDefinition",
      "getMetricDefinitions",
      "getDefaultSelectedMetricsForTaskTypes",
      "getAvailableMetricKeysForTaskTypes",
      "getPresetsForTaskTypes",
    ],
  },
];

const runtimeHelperGroups = [
  {
    title: "Result status",
    items: [
      "isRuntimeResultStatus",
      "resolveRuntimeResultStatus",
      "getRuntimeResultStatusDisplay",
      "buildRuntimeResultStatusView",
      "isBusyRuntimeResultStatus",
      "getRuntimeResultEmptyMessage",
    ],
  },
  {
    title: "Engine metadata",
    items: [
      "buildRuntimeEngineStatus",
      "formatRuntimeEngineTitle",
      "normalizeRuntimeDiagnostics",
      "formatRuntimeRefusalText",
      "runtimeEngineLabel",
    ],
  },
  {
    title: "Native results",
    items: ["buildRuntimeNativeResultsAffordance", "RuntimeNativeResultsAffordanceView"],
  },
];

const datasetHelperGroups = [
  {
    title: "Preview builder",
    items: ["buildDatasetPreview", "DatasetPreviewInput", "DatasetPreviewView"],
  },
  {
    title: "Count and split helpers",
    items: ["parseDatasetCount", "formatDatasetCount", "normalizeDatasetSplitCounts"],
  },
  {
    title: "Task and range labels",
    items: ["resolveDatasetTaskKind", "formatDatasetTaskLabel", "formatDatasetSpectralRange"],
  },
];

const visualSystemStats = [
  { label: "brands", value: NIRS4ALL_BRANDS.length },
  { label: "style assets", value: NIRS4ALL_STYLE_ASSETS.length },
  { label: "CSS tokens", value: NIRS4ALL_CSS_TOKENS.length },
  { label: "theme colors", value: Object.keys(NIRS4ALL_DEFAULT_THEME.colors).length },
];

const brandCards = NIRS4ALL_BRANDS.map((brand) => ({
  brand,
  iconSvg: generateNirs4allBrandSvg(brand, {
    variant: "icon",
    animated: brand.id === "nirs4all-ui",
  }),
  horizontalPath: getNirs4allBrandAssetPath(brand, "horizontal"),
  stackedPath: getNirs4allBrandAssetPath(brand, "stacked"),
}));

function StatusIcon({ icon }: { icon: string }) {
  return <span className={`status-icon status-icon-${icon}`} aria-hidden="true" />;
}

function BadgeIcon({ tone }: { tone: string }) {
  return <span className={`badge-dot tone-${tone}`} aria-hidden="true" />;
}

function Section({
  id,
  title,
  kicker,
  children,
}: {
  id: string;
  title: string;
  kicker: string;
  children: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section className="section" id={id} aria-labelledby={headingId}>
      <div className="section-heading">
        <span className="kicker">{kicker}</span>
        <h2 id={headingId}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function App() {
  const knownMetricDefinition = getMetricDefinition("r2_score");
  const filteredClassificationMetrics = filterMetricsForTaskType(
    ["rmse", "accuracy", "balanced_accuracy", "rpd"],
    "classification",
  );
  const regressionPreset = getPresetsForTaskType("regression").find((preset) => preset.id === "nirs");
  const mixedPresets = getPresetsForTaskTypes(mixedTaskTypes);

  return (
    <main>
      <header className="topbar">
        <a href="#" aria-label="nirs4all-ui home">
          <img src="./logo.svg" alt="nirs4all-ui" className="brand" />
        </a>
        <nav aria-label="Package exports">
          <a href="#exports">Exports</a>
          <a href="#hosts">Hosts</a>
          <a href="#components">Components</a>
          <a href="#dataset">Dataset</a>
          <a href="#runtime">Runtime</a>
          <a href="#score">Score</a>
          <a href="#visual-system">Visual</a>
          <a href="#assets">Assets</a>
        </nav>
      </header>

      <section className="intro" aria-labelledby="intro-heading">
        <div className="intro-copy">
          <span className="kicker">Shared Studio/Web package</span>
          <h1 id="intro-heading">
            nirs4all-ui component and view-model showcase
          </h1>
          <p>
            A static GitHub Pages catalogue generated from the package exports:
            presentational React components, dataset previews, runtime status
            contracts, score helpers, reusable brand generators, default style
            tokens, motion assets, bundled publication assets, and the boundary
            between reusable UI and custom app hosts.
          </p>
        </div>
        <div className="intro-visual" aria-label="Package summary">
          <img src="./favicon.svg" alt="" />
          <div>
            <strong>v{packageVersion}</strong>
            <span>npm version</span>
          </div>
          <div>
            <strong>{ALL_SCORE_METRICS.length}</strong>
            <span>score metrics</span>
          </div>
          <div>
            <strong>{RUNTIME_RESULT_STATUSES.length}</strong>
            <span>runtime statuses</span>
          </div>
          <div>
            <strong>{reusableComponentCards.length}</strong>
            <span>React components</span>
          </div>
          <div>
            <strong>{NIRS4ALL_BRANDS.length}</strong>
            <span>brand kits</span>
          </div>
          <div>
            <strong>{publicApiSymbolCount}</strong>
            <span>public entries</span>
          </div>
        </div>
      </section>

      <Section id="exports" title="Export Inventory" kicker="package surface">
        <div className="inventory-grid">
          {exportGroups.map((group) => (
            <article className="surface-panel export-panel" key={group.entry}>
              <div className="panel-head">
                <span>{group.title}</span>
                <code>{group.entry}</code>
              </div>
              <ul className="token-list">
                {group.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <p>{group.note}</p>
            </article>
          ))}
        </div>

        <div className="demo-heading">
          <span className="kicker">complete public API</span>
          <h3>Exported symbols and package assets</h3>
        </div>

        <div className="public-api-grid">
          {publicApiGroups.map((group) => (
            <article className="surface-panel api-panel" key={group.entry}>
              <div className="panel-head">
                <span>{group.title}</span>
                <code>{group.entry}</code>
              </div>
              <div className="symbol-cloud" aria-label={`${group.title} symbols`}>
                {group.symbols.map((symbol) => <code key={symbol}>{symbol}</code>)}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section id="hosts" title="Custom Host Integration" kicker="core + ui">
        <div className="host-layout">
          <article className="surface-panel host-flow-panel">
            <div className="panel-head">
              <span>Portable contract flow</span>
              <code>core -&gt; ui -&gt; host</code>
            </div>
            <div className="host-flow" aria-label="Host integration boundaries">
              {hostIntegrationSteps.map((step) => (
                <div className="host-flow-step" key={step.title}>
                  <strong>{step.title}</strong>
                  <code>{step.code}</code>
                  <ul className="token-list">
                    {step.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </article>

          <article className="surface-panel host-boundary-panel">
            <div className="panel-head">
              <span>Reuse boundary</span>
              <code>host adapter checklist</code>
            </div>
            <div className="host-boundary-table">
              {hostBoundaryRows.map((row) => (
                <div className="host-boundary-row" key={row.area}>
                  <strong>{row.area}</strong>
                  <span>{row.ui}</span>
                  <span>{row.host}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="surface-panel host-code-panel">
            <div className="panel-head">
              <span>Consumer import surface</span>
              <code>custom app host</code>
            </div>
            <pre className="code-sample">{hostImportSample}</pre>
            <p>
              Hosts can combine the same helpers, components, and brand files
              without importing Studio, Web, provider clients, or runtime
              execution code.
            </p>
          </article>
        </div>
      </Section>

      <Section id="components" title="Reusable React Components" kicker="components">
        <div className="component-catalog">
          {reusableComponentCards.map((component) => (
            <article className="surface-panel component-card" key={component.name}>
              <div className="panel-head">
                <span>{component.name}</span>
                <code>{component.entry}</code>
              </div>
              <p>{component.summary}</p>
              <div className="component-detail-grid">
                <div className="component-detail">
                  <strong>Stable props</strong>
                  <ul>
                    {component.props.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div className="component-detail">
                  <strong>Host-owned</strong>
                  <ul>
                    {component.hostOwned.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              </div>
              <div className="component-api-row">
                <span>Props interface</span>
                <code>{component.propsInterface}</code>
              </div>
              <pre className="code-sample">{component.importLine}</pre>
              <span className="component-status">{component.status}</span>
            </article>
          ))}
        </div>

        <div className="demo-heading">
          <span className="kicker">live renderings</span>
          <h3>RuntimeEngineBadge states</h3>
        </div>

        <div className="surface-grid component-demo-grid">
          {runtimeSources.map((item) => {
            const status = buildRuntimeEngineStatus(item.source);
            return (
              <article className="surface-panel" key={item.id}>
                <div className="panel-head">
                  <span>{item.label}</span>
                  <code>
                    Runtime<wbr />Engine<wbr />Badge
                  </code>
                </div>
                <RuntimeEngineBadge
                  lineage={item.lineage ?? null}
                  source={item.source}
                  className={`engine-badge tone-${status?.tone ?? "default"}`}
                  defaultIcon={<BadgeIcon tone={status?.tone ?? "default"} />}
                  fallbackIcon={<BadgeIcon tone="warning" />}
                />
                <p>
                  {formatRuntimeEngineTitle(status)
                    ?? runtimeEngineLabel(item.lineage)
                    ?? "No runtime metadata"}
                </p>
              </article>
            );
          })}

          <article className="surface-panel">
            <div className="panel-head">
              <span>Runtime status badge</span>
              <code>
                Runtime<wbr />Result<wbr />Status<wbr />Badge
              </code>
            </div>
            <RuntimeResultStatusBadge
              status="running"
              progress={68}
              className="status-badge status-running"
              icon={<StatusIcon icon="refresh" />}
              progressClassName="status-progress"
            />
            <RuntimeResultStatusBadge
              status="completed"
              className="status-badge status-completed"
              icon={<StatusIcon icon="check" />}
              showProgress={false}
            />
          </article>

          <article className="surface-panel diagnostic-component-panel">
            <div className="panel-head">
              <span>Diagnostic list</span>
              <code>
                Runtime<wbr />Diagnostic<wbr />List
              </code>
            </div>
            <RuntimeDiagnosticList
              diagnostics={diagnostics}
              className="diagnostic-list"
              itemClassName={(item) => `diagnostic-item tone-${item.tone}`}
              metadataClassName="diagnostic-meta"
            />
          </article>

          <article className="surface-panel metric-badge-panel">
            <div className="panel-head">
              <span>Metric value badges</span>
              <code>
                Metric<wbr />Value<wbr />Badge
              </code>
            </div>
            <div className="metric-badge-grid">
              {scoreRows.slice(0, 4).map((row) => (
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
          </article>

          <DatasetPreviewCard
            view={datasetPreview}
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
        </div>
      </Section>

      <Section id="dataset" title="Dataset Preview View Models" kicker="dataset">
        <div className="dataset-layout">
          <DatasetPreviewCard
            view={datasetPreview}
            className="surface-panel dataset-preview-card dataset-preview-feature"
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

          <article className="surface-panel">
            <div className="panel-head">
              <span>Preview contract</span>
              <code>buildDatasetPreview</code>
            </div>
            <div className="fact-grid">
              <span>title</span>
              <strong>{datasetPreview?.title}</strong>
              <span>task kind</span>
              <strong>{resolveDatasetTaskKind(datasetFixture.taskType)}</strong>
              <span>task label</span>
              <strong>{formatDatasetTaskLabel(datasetFixture.taskType)}</strong>
              <span>samples</span>
              <strong>{formatDatasetCount(datasetFixture.sampleCount, "sample")}</strong>
              <span>features</span>
              <strong>{datasetPreview?.featureCountLabel}</strong>
            </div>
          </article>

          <article className="surface-panel">
            <div className="panel-head">
              <span>Split summary</span>
              <code>normalizeDatasetSplitCounts</code>
            </div>
            <div className="metric-groups">
              {datasetSplits.map((split) => (
                <div className="metric-group" key={split.id}>
                  <strong>{split.label}</strong>
                  <span>{split.countLabel} / {split.percentageLabel}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="surface-panel">
            <div className="panel-head">
              <span>Range and count helpers</span>
              <code>datasetPreview</code>
            </div>
            <div className="fact-grid">
              <span>spectral range</span>
              <strong>{datasetSpectralRange}</strong>
              <span>string count</span>
              <strong>{parseDatasetCount("128.9")}</strong>
              <span>class copy</span>
              <strong>{formatDatasetCount(3, "class", "classes")}</strong>
              <span>badges</span>
              <strong>{datasetPreview?.badges.length}</strong>
              <span>stats</span>
              <strong>{datasetPreview?.stats.map((stat) => stat.label).join(", ")}</strong>
            </div>
          </article>

          <article className="surface-panel helper-panel">
            <div className="panel-head">
              <span>Dataset exports</span>
              <code>nirs4all-ui/dataset</code>
            </div>
            {datasetHelperGroups.map((group) => (
              <div className="helper-group" key={group.title}>
                <strong>{group.title}</strong>
                <span>{group.items.join(", ")}</span>
              </div>
            ))}
          </article>
        </div>
      </Section>

      <Section id="runtime" title="Runtime View Models" kicker="runtime">
        <div className="runtime-layout">
          <div className="status-strip" aria-label="Runtime statuses">
            {RUNTIME_RESULT_STATUSES.map((status, index) => {
              const view = buildRuntimeResultStatusView(status, status === "running" ? 68 : null);
              const display = getRuntimeResultStatusDisplay(status);
              return (
                <div className={`status-tile status-${status}`} key={status}>
                  <StatusIcon icon={view.icon} />
                  <span>{display.label}</span>
                  <strong>{view.progress ?? (index + 1) * 12}</strong>
                </div>
              );
            })}
          </div>

          <article className="surface-panel diagnostics-panel">
            <div className="panel-head">
              <span>Diagnostic contract</span>
              <code>rt_error.v1</code>
            </div>
            {diagnostics.map((item) => (
              <pre key={item.id}>{formatRuntimeRefusalText(item)}</pre>
            ))}
          </article>

          <article className="surface-panel native-panel">
            <div className="panel-head">
              <span>Native result affordance</span>
              <code>
                buildRuntime<wbr />NativeResults<wbr />Affordance
              </code>
            </div>
            <div className="native-row">
              <strong>{nativeAffordance.nativeResultsLabel}</strong>
              <span>{nativeAffordance.exportLabel}</span>
            </div>
            <div className="native-row muted">
              <strong>{disabledNativeAffordance.nativeResultsLabel}</strong>
              <span>{disabledNativeAffordance.disabledReason}</span>
            </div>
            <p>{fallbackStatus?.detailLabel}</p>
          </article>

          <article className="surface-panel">
            <div className="panel-head">
              <span>Status helpers</span>
              <code>statusDisplay</code>
            </div>
            <div className="fact-grid">
              <span>queued known</span>
              <strong>{String(isRuntimeResultStatus("queued"))}</strong>
              <span>archived fallback</span>
              <strong>{invalidStatusFallback}</strong>
              <span>running progress</span>
              <strong>{getRuntimeResultStatusProgress("running", 42)}</strong>
              <span>display map</span>
              <strong>{Object.keys(RUNTIME_RESULT_STATUS_DISPLAY).length} statuses</strong>
              <span>failed busy</span>
              <strong>{String(isBusyRuntimeResultStatus("failed"))}</strong>
              <span>queued empty copy</span>
              <strong>{queuedEmptyMessage}</strong>
              <span>token label</span>
              <strong>{formatRuntimeTokenLabel("wasm_local")}</strong>
            </div>
          </article>

          <article className="surface-panel helper-panel">
            <div className="panel-head">
              <span>Runtime exports</span>
              <code>nirs4all-ui/runtime</code>
            </div>
            {runtimeHelperGroups.map((group) => (
              <div className="helper-group" key={group.title}>
                <strong>{group.title}</strong>
                <span>{group.items.join(", ")}</span>
              </div>
            ))}
          </article>
        </div>
      </Section>

      <Section id="score" title="Score View Models" kicker="score">
        <div className="score-layout">
          <article className="surface-panel score-table">
            <div className="panel-head">
              <span>Direction-aware values</span>
              <code>formatMetricValue</code>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Current</th>
                  <th>Candidate</th>
                  <th>Winner</th>
                </tr>
              </thead>
              <tbody>
                {scoreRows.map((row) => {
                  const metric = canonicalMetricKey(row.metric);
                  const currentWins = isBetterScore(row.value, row.challenger, row.metric);
                  return (
                    <tr key={row.metric}>
                      <td>{formatMetricDisplayName(row.metric)}</td>
                      <td>{formatMetricValue(row.value, metric)}</td>
                      <td>{formatMetricValue(row.challenger, metric)}</td>
                      <td>{currentWins ? "current" : "candidate"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </article>

          <article className="surface-panel">
            <div className="panel-head">
              <span>Catalog groups</span>
              <code>groupMetricDefinitions</code>
            </div>
            <div className="metric-groups">
              {groupedMetrics.map((group) => (
                <div className="metric-group" key={group.group}>
                  <strong>{group.label}</strong>
                  <span>{group.metrics.map((metric) => metric.abbreviation).join(", ")}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="surface-panel">
            <div className="panel-head">
              <span>Normalization</span>
              <code>metricKeyCandidates</code>
            </div>
            <div className="fact-grid">
              <span>lookup</span>
              <strong>{normalizeMetricLookupKey("R2 score")}</strong>
              <span>canonical</span>
              <strong>{canonicalMetricKey("r2_score")}</strong>
              <span>aliases</span>
              <strong>{metricKeyCandidates("root mean squared error").join(" / ")}</strong>
              <span>definition</span>
              <strong>{knownMetricDefinition?.label}</strong>
              <span>numeric string</span>
              <strong>{formatMetricValue(parseScoreNumber("0.91342"), "r2")}</strong>
            </div>
          </article>

          <article className="surface-panel presets-panel">
            <div className="panel-head">
              <span>Presets</span>
              <code>MetricPreset</code>
            </div>
            <div className="preset-columns">
              <div>
                <strong>Regression</strong>
                {REGRESSION_PRESETS.map((preset) => <span key={preset.id}>{preset.label}</span>)}
              </div>
              <div>
                <strong>Classification</strong>
                {CLASSIFICATION_PRESETS.map((preset) => <span key={preset.id}>{preset.label}</span>)}
              </div>
              <div>
                <strong>Mixed tasks</strong>
                {mixedPresets.map((preset) => <span key={preset.id}>{preset.label}</span>)}
              </div>
            </div>
          </article>

          <article className="surface-panel">
            <div className="panel-head">
              <span>Task selection</span>
              <code>metric catalog</code>
            </div>
            <div className="fact-grid">
              <span>regression defaults</span>
              <strong>{getDefaultSelectedMetrics("regression").join(", ")}</strong>
              <span>classification compact</span>
              <strong>{getMetricsForTaskType("classification").join(", ")}</strong>
              <span>compact constants</span>
              <strong>{REGRESSION_METRICS.join(", ")} / {CLASSIFICATION_METRICS.join(", ")}</strong>
              <span>classification filter</span>
              <strong>{filteredClassificationMetrics.join(", ")}</strong>
              <span>known MCC</span>
              <strong>{String(isKnownMetricKey("mcc"))}</strong>
              <span>task detector</span>
              <strong>{String(isClassificationTaskType("binary_classification"))}</strong>
            </div>
          </article>

          <article className="surface-panel">
            <div className="panel-head">
              <span>Catalog scope</span>
              <code>ALL_SCORE_METRICS</code>
            </div>
            <div className="metric-counts">
              <div>
                <strong>{ALL_REGRESSION_METRICS.length}</strong>
                <span>regression</span>
              </div>
              <div>
                <strong>{ALL_GENERAL_METRICS.length}</strong>
                <span>general</span>
              </div>
              <div>
                <strong>{ALL_CLASSIFICATION_METRICS.length}</strong>
                <span>classification</span>
              </div>
              <div>
                <strong>{availableMixedMetrics.length}</strong>
                <span>mixed available</span>
              </div>
              <div>
                <strong>{getAvailableMetrics("classification").length}</strong>
                <span>available class</span>
              </div>
            </div>
          </article>

          <article className="surface-panel helper-panel">
            <div className="panel-head">
              <span>Score exports</span>
              <code>nirs4all-ui/score</code>
            </div>
            {scoreHelperGroups.map((group) => (
              <div className="helper-group" key={group.title}>
                <strong>{group.title}</strong>
                <span>{group.items.join(", ")}</span>
              </div>
            ))}
          </article>

          <article className="surface-panel">
            <div className="panel-head">
              <span>Compatibility helpers</span>
              <code>legacy selections</code>
            </div>
            <div className="fact-grid">
              <span>default constants</span>
              <strong>
                {DEFAULT_DATASET_ITEM_REGRESSION_METRICS.length}
                {" / "}
                {DEFAULT_DATASET_ITEM_CLASSIFICATION_METRICS.length}
              </strong>
              <span>legacy constants</span>
              <strong>
                {LEGACY_DATASET_ITEM_REGRESSION_METRICS.length}
                {" / "}
                {LEGACY_DATASET_ITEM_CLASSIFICATION_METRICS.length}
              </strong>
              <span>mixed legacy</span>
              <strong>{legacyMetricKeys.join(", ")}</strong>
              <span>upgrade candidates</span>
              <strong>{upgradeCandidates.length}</strong>
              <span>ordered sample</span>
              <strong>{orderMetricKeys(["rpd", "rmse", "accuracy"]).join(", ")}</strong>
            </div>
          </article>

          <article className="surface-panel">
            <div className="panel-head">
              <span>Formatting helpers</span>
              <code>scoreValues</code>
            </div>
            <div className="fact-grid">
              <span>formatScore</span>
              <strong>{formatScore(parsedScoreRecord?.rmse as string | undefined)}</strong>
              <span>formatMetricName</span>
              <strong>{formatMetricName("median absolute error")}</strong>
              <span>lower is better</span>
              <strong>{String(isLowerBetter("rmse"))}</strong>
              <span>NIRS preset</span>
              <strong>{regressionPreset?.keys.join(", ")}</strong>
              <span>definitions</span>
              <strong>{getMetricDefinitions(["rmse", "r2", "mcc"]).map((metric) => metric.abbreviation).join(", ")}</strong>
            </div>
          </article>
        </div>
      </Section>

      <Section id="visual-system" title="Reusable Visual System" kicker="brand + styles">
        <div className="visual-layout">
          <article className="surface-panel visual-summary-panel">
            <div className="panel-head">
              <span>Default host foundation</span>
              <code>nirs4all-ui/styles</code>
            </div>
            <div className="visual-stat-grid">
              {visualSystemStats.map((stat) => (
                <div key={stat.label}>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>
            <div className="n4-spectrum-strip" aria-hidden="true" />
            <p>
              The CSS asset is plain framework-agnostic CSS: hosts can import it
              from `nirs4all-ui/assets/styles/nirs4all-default.css` and still own
              routing, state, icons, data loading, and runtime execution.
            </p>
          </article>

          <article className="surface-panel motion-panel">
            <div className="panel-head">
              <span>Reusable spectra motion</span>
              <code>assets/motion/nirs-spectra.svg</code>
            </div>
            <img src="./assets/motion/nirs-spectra.svg" alt="Animated NIRS spectra motif" />
            <p>
              SVG motion is shipped as a static asset and can be used in docs,
              splash surfaces, empty states, and custom application shells.
            </p>
          </article>

          <article className="surface-panel style-token-panel">
            <div className="panel-head">
              <span>CSS token manifest</span>
              <code>NIRS4ALL_CSS_TOKENS</code>
            </div>
            <div className="symbol-cloud">
              {NIRS4ALL_CSS_TOKENS.slice(0, 12).map((token) => (
                <code key={token}>{getNirs4allCssVariable(token)}</code>
              ))}
            </div>
          </article>

          <article className="surface-panel style-token-panel">
            <div className="panel-head">
              <span>Style assets</span>
              <code>NIRS4ALL_STYLE_ASSETS</code>
            </div>
            <div className="asset-list compact">
              {NIRS4ALL_STYLE_ASSETS.map((asset) => (
                <a href={`./${asset.path}`} key={asset.id}>
                  <strong>{asset.path}</strong>
                  <span>{asset.description}</span>
                </a>
              ))}
            </div>
          </article>
        </div>

        <div className="brand-grid" aria-label="Reusable NIRS4ALL brand assets">
          {brandCards.map(({ brand, iconSvg, horizontalPath, stackedPath }) => (
            <article className="surface-panel ecosystem-brand-card" key={brand.id}>
              <div className="panel-head">
                <span>{brand.name}</span>
                <code>assets/brands/{brand.id}</code>
              </div>
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(iconSvg)}`}
                alt={`${brand.name} generated icon`}
              />
              <p>{brand.description}</p>
              <div className="brand-swatch-row" aria-label={`${brand.name} palette`}>
                {Object.values(brand.palette).map((color) => (
                  <span key={color} style={{ backgroundColor: color }} title={color} />
                ))}
              </div>
              <div className="fact-grid compact">
                <span>horizontal</span>
                <strong>{horizontalPath}</strong>
                <span>stacked</span>
                <strong>{stackedPath}</strong>
                <span>package</span>
                <strong>{brand.packageName}</strong>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section id="assets" title="GitHub Pages Assets" kicker="publication">
        <div className="asset-layout">
          <article className="surface-panel brand-panel">
            <div className="panel-head">
              <span>Brand files</span>
              <code>assets/brand</code>
            </div>
            <img src="./logo.svg" alt="nirs4all-ui logo" />
            <p>
              The single-page showcase publishes namespaced GitHub Pages URLs for
              the same brand kit exported by the package through `assets/brand/*`.
            </p>
          </article>
          <article className="surface-panel">
            <div className="panel-head">
              <span>Publication contract</span>
              <code>canonical + crawler metadata</code>
            </div>
            <div className="fact-grid">
              <span>canonical URL</span>
              <strong>{CANONICAL_SITE_URL}</strong>
              <span>robots policy</span>
              <strong>Allow all; large image previews enabled</strong>
              <span>sitemap target</span>
              <strong>{CANONICAL_SITE_URL}sitemap.xml</strong>
              <span>manifest scope</span>
              <strong>standalone install surface with packaged brand icons</strong>
              <span>logo source</span>
              <strong>site/public/logo.svg mirrors assets/brand/horizontal.svg</strong>
              <span>asset count</span>
              <strong>{PUBLICATION_ASSETS.length} published files</strong>
            </div>
          </article>
          <article className="surface-panel asset-list-panel">
            <div className="panel-head">
              <span>Pages metadata</span>
              <code>site/public</code>
            </div>
            <div className="asset-list">
              {PUBLICATION_ASSETS.map((asset) => (
                <a href={asset.path} key={asset.name}>
                  <strong>{asset.name}</strong>
                  <span>{asset.role}</span>
                </a>
              ))}
            </div>
          </article>
        </div>
      </Section>
    </main>
  );
}
