import type { ReactNode } from "react";

import {
  MetricValueBadge,
  RuntimeDiagnosticList,
  RuntimeEngineBadge,
  RuntimeResultStatusBadge,
} from "../../src/components/index.js";
import {
  RUNTIME_RESULT_STATUSES,
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
  ALL_REGRESSION_METRICS,
  ALL_SCORE_METRICS,
  CLASSIFICATION_PRESETS,
  DEFAULT_DATASET_ITEM_CLASSIFICATION_METRICS,
  DEFAULT_DATASET_ITEM_REGRESSION_METRICS,
  LEGACY_DATASET_ITEM_CLASSIFICATION_METRICS,
  LEGACY_DATASET_ITEM_REGRESSION_METRICS,
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
    items: ["score namespace", "runtime namespace", "components namespace"],
    note: "Convenience import for package-wide consumers.",
  },
  {
    entry: "nirs4all-ui/components",
    title: "React components",
    items: [
      "MetricValueBadge",
      "RuntimeDiagnosticList",
      "RuntimeEngineBadge",
      "RuntimeResultStatusBadge",
    ],
    note: "Presentational only; hosts provide classes and icon nodes.",
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
    entry: "nirs4all-ui/assets/*",
    title: "Brand assets",
    items: ["icon SVG/PNG", "horizontal marks", "stacked marks", "Open Graph image"],
    note: "Packaged assets for downstream docs and registries.",
  },
];

const reusableComponentCards = [
  {
    name: "RuntimeEngineBadge",
    entry: "nirs4all-ui/components",
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

const publicationAssets = [
  { name: "logo.svg", role: "Header and Open Graph identity", path: "./logo.svg" },
  { name: "favicon.svg", role: "Browser icon and manifest icon", path: "./favicon.svg" },
  {
    name: "assets/brand/nirs4all-ui/icon.svg",
    role: "Stable GitHub Pages icon URL",
    path: "./assets/brand/nirs4all-ui/icon.svg",
  },
  {
    name: "assets/brand/nirs4all-ui/horizontal.svg",
    role: "Horizontal package mark",
    path: "./assets/brand/nirs4all-ui/horizontal.svg",
  },
  {
    name: "assets/brand/nirs4all-ui/stacked.svg",
    role: "Stacked package mark",
    path: "./assets/brand/nirs4all-ui/stacked.svg",
  },
  { name: "robots.txt", role: "GitHub Pages crawler policy", path: "./robots.txt" },
  { name: "sitemap.xml", role: "Canonical GitHub Pages URL", path: "./sitemap.xml" },
  { name: "site.webmanifest", role: "Install metadata", path: "./site.webmanifest" },
];

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
          <a href="#components">Components</a>
          <a href="#runtime">Runtime</a>
          <a href="#score">Score</a>
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
            presentational React components, runtime status contracts, score
            helpers, and bundled brand assets.
          </p>
        </div>
        <div className="intro-visual" aria-label="Package summary">
          <img src="./favicon.svg" alt="" />
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
                  lineage={item.lineage}
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
          <article className="surface-panel asset-list-panel">
            <div className="panel-head">
              <span>Pages metadata</span>
              <code>site/public</code>
            </div>
            <div className="asset-list">
              {publicationAssets.map((asset) => (
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
