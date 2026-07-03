import {
  RuntimeEngineBadge,
} from "../../src/components/index.js";
import {
  RUNTIME_RESULT_STATUSES,
  buildRuntimeEngineStatus,
  buildRuntimeNativeResultsAffordance,
  buildRuntimeResultStatusView,
  formatRuntimeEngineTitle,
  formatRuntimeRefusalText,
  normalizeRuntimeDiagnostics,
} from "../../src/runtime/index.js";
import {
  CLASSIFICATION_PRESETS,
  REGRESSION_PRESETS,
  formatMetricDisplayName,
  formatMetricValue,
  getDefaultSelectedMetricsForTaskTypes,
  getMetricDefinition,
  groupMetricDefinitions,
  isBetterScore,
  metricKeyCandidates,
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

const runtimeSources = [
  { id: "dagml", label: "DAG-ML execution", source: engineFixture },
  { id: "fallback", label: "Strict fallback diagnostic", source: fallbackFixture },
  {
    id: "wasm",
    label: "Local WASM execution",
    source: { engine_actual: "wasm-local", engine_requested: "wasm-local" },
  },
];

const scoreRows = [
  { metric: "rmse", value: 0.32742, challenger: 0.41291 },
  { metric: "r2", value: 0.91881, challenger: 0.88763 },
  { metric: "rpd", value: 3.11492, challenger: 2.7731 },
  { metric: "balanced_accuracy", value: 0.84218, challenger: 0.8294 },
];

const groupedMetrics = groupMetricDefinitions(getDefaultSelectedMetricsForTaskTypes(["regression", "classification"]));
const nativeAffordance = buildRuntimeNativeResultsAffordance({
  artifactCount: 4,
  hasRefit: true,
});
const disabledNativeAffordance = buildRuntimeNativeResultsAffordance();
const fallbackStatus = buildRuntimeEngineStatus(fallbackFixture);
const diagnostics = normalizeRuntimeDiagnostics(fallbackFixture);

function StatusIcon({ icon }: { icon: string }) {
  return <span className={`status-icon status-icon-${icon}`} aria-hidden="true" />;
}

function BadgeIcon({ tone }: { tone: string }) {
  return <span className={`badge-dot tone-${tone}`} aria-hidden="true" />;
}

function Section({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section" aria-labelledby={title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}>
      <div>
        <span className="kicker">{kicker}</span>
        <h2 id={title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function App() {
  return (
    <main>
      <header className="topbar">
        <img src="./logo.svg" alt="nirs4all-ui" className="brand" />
        <nav aria-label="Package exports">
          <a href="#components">Components</a>
          <a href="#runtime">Runtime</a>
          <a href="#score">Score</a>
        </nav>
      </header>

      <section className="intro">
        <div>
          <span className="kicker">Shared Studio/Web UI</span>
          <h1>
            <span className="headline-part">nirs4all-ui</span>{" "}
            <span className="headline-part">components</span>{" "}
            <span className="headline-part">and view models</span>
          </h1>
        </div>
        <div className="intro-grid">
          <div className="summary-panel">
            <strong>Exports</strong>
            <span>components</span>
            <span>runtime</span>
            <span>score</span>
          </div>
          <div className="summary-panel">
            <strong>Boundary</strong>
            <span>presentational React</span>
            <span>pure TypeScript helpers</span>
            <span>host-owned app state</span>
          </div>
        </div>
      </section>

      <Section title="Component Surface" kicker="components" >
        <div id="components" className="surface-grid">
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
                  source={item.source}
                  className={`engine-badge tone-${status?.tone ?? "default"}`}
                  defaultIcon={<BadgeIcon tone={status?.tone ?? "default"} />}
                  fallbackIcon={<BadgeIcon tone="warning" />}
                />
                <p>{formatRuntimeEngineTitle(status) ?? "No runtime metadata"}</p>
              </article>
            );
          })}
        </div>
      </Section>

      <Section title="Runtime View Models" kicker="runtime">
        <div id="runtime" className="runtime-layout">
          <div className="status-strip" aria-label="Runtime statuses">
            {RUNTIME_RESULT_STATUSES.map((status, index) => {
              const view = buildRuntimeResultStatusView(status, status === "running" ? 68 : null);
              return (
                <div className={`status-tile status-${status}`} key={status}>
                  <StatusIcon icon={view.icon} />
                  <span>{view.label}</span>
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
        </div>
      </Section>

      <Section title="Score View Models" kicker="score">
        <div id="score" className="score-layout">
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
                  const currentWins = isBetterScore(row.value, row.challenger, row.metric);
                  return (
                    <tr key={row.metric}>
                      <td>{formatMetricDisplayName(row.metric)}</td>
                      <td>{formatMetricValue(row.value, row.metric)}</td>
                      <td>{formatMetricValue(row.challenger, row.metric)}</td>
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
            <div className="normalization">
              <span>root mean squared error</span>
              <strong>{metricKeyCandidates("root mean squared error").join(" / ")}</strong>
              <span>R2 score</span>
              <strong>{getMetricDefinition("r2_score")?.label}</strong>
              <span>Numeric strings</span>
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
            </div>
          </article>
        </div>
      </Section>
    </main>
  );
}
