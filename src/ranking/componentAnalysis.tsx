import type { RankingPlotRenderer } from "./types.js";

export interface AnalysisFactorPreview {
  name: string;
  dimension: string;
  kind: "numeric" | "categorical";
  operator: string | null;
  operator_version: string | null;
  parameter: string | null;
  reference: string | number | boolean | null;
  levels: (string | number | boolean)[] | null;
  bounds: [number, number] | null;
  observed_levels: (string | number | boolean)[];
}
export interface MixedEffectsResult {
  schema_version: "n4m.mixed_effects/1";
  state: "ready" | "unavailable";
  reason: string | null;
  beta: (number | null)[] | null;
  standard_errors: (number | null)[] | null;
  covariance: (number | null)[][] | null;
  variances: (number | null)[] | null;
  diagnostics: Record<string, unknown>;
  options: Record<string, unknown>;
  warnings: string[];
}
export interface FanovaResult {
  schema_version: "n4m.fanova/1";
  state: "ready" | "unavailable";
  reason: string | null;
  feature_importance: { index: number; fraction: number | null; tree_sd: number | null }[];
  interactions: { indices: [number, number]; fraction: number | null; tree_sd: number | null }[];
  diagnostics: Record<string, unknown>;
  domain_measure: string;
  aggregation: string;
  uncertainty_kind: string;
  options: Record<string, unknown>;
  warnings: string[];
}
export interface ComponentAnalysis {
  schema_version: "n4a.component-analysis/1";
  state: "ready" | "unavailable";
  reason: string | null;
  request_id: string;
  request: Record<string, unknown>;
  method: "mixed_effects" | "fanova";
  metric: string;
  scope: string;
  partition: string;
  direction: "min" | "max" | null;
  design: {
    factors: AnalysisFactorPreview[];
    columns: { name: string; factor: string | null; level: string | number | boolean | null }[];
    references: Record<string, string | number | boolean>;
    domains: { factor: string; kind: string; bounds: [number, number] | null; levels: (string | number | boolean)[] | null }[];
    model_slice: string | null;
    outcome_policy: string;
    group_names: string[];
  };
  provenance: {
    source_observations: number;
    accepted_observations: number;
    excluded: Record<string, number>;
    datasets: string[];
    observations: unknown[];
    baseline_observations: unknown[];
    training_datasets: string[];
    validation_datasets: string[];
  };
  result: MixedEffectsResult | FanovaResult | null;
  warnings: string[];
}
export interface ComponentAnalysisViewProps {
  analysis: ComponentAnalysis;
  Plot?: RankingPlotRenderer;
  className?: string;
}
const value = (number: number | null | undefined) => number == null ? "Not available" : String(number);
const jsonValue = (item: unknown) => item == null ? "Not specified" : JSON.stringify(item);
const friendly = (code: string) => code.replaceAll("_", " ");
const flag = (item: unknown) => item === true || item === 1 ? "Yes" : item === false || item === 0 ? "No" : "Not available";
const diagnostic = (items: Record<string, unknown>, key: string) => typeof items[key] === "number" ? String(items[key]) : "Not available";

/** Shows the exact declared factors, references and domains before any fit. */
export function AnalysisDesignPreview({ analysis }: { analysis: ComponentAnalysis }) {
  return <details open><summary>Design, references and domain</summary>
    <p>Outcome: {analysis.design.outcome_policy === "native_baseline_ratio" ? "Native loss / paired baseline loss ratio; lower values are better." : `${analysis.metric}, a dimensionless metric; ${analysis.direction === "max" ? "higher" : "lower"} values are better.`} Model slice: {analysis.design.model_slice ?? "All eligible models"}.</p>
    <table><caption>Declared analysis factors</caption><thead><tr><th scope="col">Factor</th><th scope="col">Selection</th><th scope="col">Kind</th><th scope="col">Reference</th><th scope="col">Domain</th><th scope="col">Observed values</th></tr></thead><tbody>{analysis.design.factors.map(factor => <tr key={factor.name}>
      <th scope="row">{factor.name}</th><td>{friendly(factor.dimension)}{factor.operator ? ` · ${factor.operator}` : ""}{factor.parameter ? `::${factor.parameter}` : ""}</td><td>{factor.kind}</td><td>{jsonValue(factor.reference)}</td><td>{factor.kind === "numeric" ? jsonValue(factor.bounds) : jsonValue(factor.levels)}</td><td>{jsonValue(factor.observed_levels)}</td>
    </tr>)}</tbody></table>
    <p>Original observations: {analysis.provenance.accepted_observations} eligible of {analysis.provenance.source_observations}; datasets: {analysis.provenance.datasets.join(", ") || "None"}.</p>
    {analysis.method === "fanova" ? <><p>Training datasets: {analysis.provenance.training_datasets.join(", ") || "None selected"}. Held-out datasets: {analysis.provenance.validation_datasets.join(", ") || "None selected"}.</p><p>Importance is defined over the declared uniform product domain. Parameter factors require an explicit model slice; missing conditional settings are never imputed.</p></> : <p>Random intercept groups: {analysis.design.group_names.map(friendly).join(", ")}. Fixed effects condition only on the declared design columns.</p>}
  </details>;
}

function Evidence({ analysis }: { analysis: ComponentAnalysis }) {
  return <><p>Metric: {analysis.metric}; scope: {analysis.scope}; partition: {analysis.partition}. Estimates describe observed configurations and do not establish causal effects.</p>
    <AnalysisDesignPreview analysis={analysis} />
    {analysis.warnings.length ? <ul>{analysis.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
    {Object.entries(analysis.provenance.excluded).length ? <details><summary>Excluded observations</summary><ul>{Object.entries(analysis.provenance.excluded).map(([reason, count]) => <li key={reason}>{friendly(reason)}: {count}</li>)}</ul></details> : null}
    {analysis.result ? <details><summary>Native fit and generalization diagnostics</summary><pre>{JSON.stringify(analysis.result.diagnostics, null, 2)}</pre></details> : null}
    <details><summary>Exact request and evidence</summary><p>Request ID: {analysis.request_id}</p><pre>{JSON.stringify({ request: analysis.request, design: analysis.design, provenance: analysis.provenance }, null, 2)}</pre></details>
  </>;
}

/** Presents native beta, SE and covariance without computing intervals or tests. */
export function MixedEffectsView({ analysis, Plot, className }: ComponentAnalysisViewProps) {
  const result = analysis.result?.schema_version === "n4m.mixed_effects/1" ? analysis.result : null;
  const reml = result?.options.reml;
  const method = reml === true || reml === 1 ? "REML" : reml === false || reml === 0 ? "ML" : "Not reported";
  const coefficients = result?.beta?.map((beta, index) => ({ name: analysis.design.columns[index]?.name ?? `Column ${index}`, beta, se: result.standard_errors?.[index] ?? null })) ?? [];
  const scored = coefficients.filter(row => row.beta !== null);
  const withSe = scored.filter(row => row.se !== null);
  const withoutSe = scored.filter(row => row.se === null);
  const trace = (rows: typeof coefficients, error: boolean) => ({ type: "scatter", mode: "markers", name: "Adjusted coefficient", x: rows.map(row => row.beta), y: rows.map(row => row.name), ...(error ? { error_x: { type: "data", array: rows.map(row => row.se), visible: true } } : {}) });
  return <section className={className}><h2>Adjusted mixed effects</h2><Evidence analysis={analysis} />
    {result ? <table><caption>Native mixed effect fit diagnostics</caption><tbody>
      <tr><th scope="row">Estimation method</th><td>{method}</td></tr>
      <tr><th scope="row">Fit state</th><td>{typeof result.diagnostics.fit_state === "string" ? friendly(result.diagnostics.fit_state) : "Not available"}</td></tr>
      <tr><th scope="row">Converged</th><td>{flag(result.diagnostics.converged)}</td></tr>
      <tr><th scope="row">Boundary variance estimate</th><td>{flag(result.diagnostics.boundary)}</td></tr>
      <tr><th scope="row">Design rank</th><td>{diagnostic(result.diagnostics, "design_rank")}</td></tr>
      <tr><th scope="row">Design condition number</th><td>{diagnostic(result.diagnostics, "condition_number")}</td></tr>
      <tr><th scope="row">{method === "REML" ? "Restricted log likelihood (REML)" : method === "ML" ? "Log likelihood (ML)" : "Log likelihood (method not reported)"}</th><td>{diagnostic(result.diagnostics, "log_likelihood")}</td></tr>
    </tbody></table> : null}
    {analysis.state !== "ready" || !result ? <p>Analysis unavailable: {analysis.reason ? friendly(analysis.reason) : "Reason not provided"}. {analysis.reason ? <code>{analysis.reason}</code> : null}</p> : <>
      <figure><figcaption><strong>Adjusted coefficients</strong><p>Each categorical coefficient compares its level with the declared reference, conditional on the displayed fixed effects and random intercepts. Numeric coefficients describe one unit of the parameter. Error bars show one native coefficient standard error, not a confidence interval. {analysis.direction === "min" ? "Negative coefficients indicate a lower response." : "Positive coefficients indicate a higher response."}</p></figcaption>
        {Plot && scored.length ? <Plot data={[...(withSe.length ? [trace(withSe, true)] : []), ...(withoutSe.length ? [trace(withoutSe, false)] : [])]} layout={{ xaxis: { title: { text: "Adjusted coefficient in response units" }, zeroline: true }, yaxis: { type: "category", autorange: "reversed" }, showlegend: false }} config={{ staticPlot: true, displayModeBar: false }} /> : null}
        <table><caption>Native fixed effect estimates</caption><thead><tr><th scope="col">Design column</th><th scope="col">Coefficient</th><th scope="col">Standard error</th></tr></thead><tbody>{coefficients.map((row, index) => <tr key={index}><th scope="row">{row.name}</th><td>{value(row.beta)}</td><td>{value(row.se)}</td></tr>)}</tbody></table>
      </figure>
      <table><caption>Native variance components</caption><thead><tr><th scope="col">Component</th><th scope="col">Variance</th></tr></thead><tbody>{result.variances?.map((variance, index) => <tr key={index}><th scope="row">{index === 0 ? "Residual" : friendly(analysis.design.group_names[index - 1] ?? `Group ${index}`)}</th><td>{value(variance)}</td></tr>)}</tbody></table>
      {result.covariance ? <details><summary>Native coefficient covariance matrix</summary><table><caption>Coefficient covariance in design column order</caption><thead><tr><th scope="col">Column</th>{analysis.design.columns.map((column, index) => <th key={index} scope="col">{column.name}</th>)}</tr></thead><tbody>{result.covariance.map((row, index) => <tr key={index}><th scope="row">{analysis.design.columns[index]?.name ?? index}</th>{row.map((cell, column) => <td key={column}>{value(cell)}</td>)}</tr>)}</tbody></table></details> : null}
    </>}
  </section>;
}

/** Displays native per-tree variance fractions; importance has no gain direction. */
export function FanovaView({ analysis, Plot, className }: ComponentAnalysisViewProps) {
  const result = analysis.result?.schema_version === "n4m.fanova/1" ? analysis.result : null;
  const name = (index: number) => analysis.design.factors[index]?.name ?? `Factor ${index}`;
  const main = result?.feature_importance ?? [];
  const scored = main.filter(row => row.fraction !== null);
  return <section className={className}><h2>Surrogate functional ANOVA</h2><Evidence analysis={analysis} />
    <p>Importance describes variation of a fitted surrogate over the declared domain. A larger fraction does not mean a configuration improves performance, and it does not establish causality.</p>
    {result ? <table><caption>Native surrogate fit and held-out diagnostics</caption><tbody>
      <tr><th scope="row">Trees</th><td>{diagnostic(result.diagnostics, "trees")}</td></tr>
      <tr><th scope="row">Informative trees</th><td>{diagnostic(result.diagnostics, "informative_trees")}</td></tr>
      <tr><th scope="row">Mean tree variance</th><td>{diagnostic(result.diagnostics, "total_variance_mean")}</td></tr>
      <tr><th scope="row">Unreported variance fraction</th><td>{diagnostic(result.diagnostics, "remaining_fraction")}</td></tr>
      <tr><th scope="row">Training RMSE</th><td>{diagnostic(result.diagnostics, "train_rmse")}</td></tr>
      <tr><th scope="row">Held-out RMSE</th><td>{diagnostic(result.diagnostics, "validation_rmse")}</td></tr>
      <tr><th scope="row">Held-out R²</th><td>{diagnostic(result.diagnostics, "validation_r2")}</td></tr>
    </tbody></table> : null}
    {analysis.state !== "ready" || !result ? <p>Analysis unavailable: {analysis.reason ? friendly(analysis.reason) : "Reason not provided"}. {analysis.reason ? <code>{analysis.reason}</code> : null}</p> : <>
      <figure><figcaption><strong>Main factor importance</strong><p>Fractions and tree dispersion come from the native backend. Tree SD describes variation between trees; it is not a standard error or confidence interval. Missing values are shown as Not available.</p></figcaption>
        {Plot && scored.length ? <Plot data={[{ type: "bar", orientation: "h", x: scored.map(row => row.fraction), y: scored.map(row => name(row.index)) }]} layout={{ xaxis: { title: { text: "Fraction of surrogate variance" }, rangemode: "tozero" }, yaxis: { type: "category", autorange: "reversed" }, showlegend: false }} config={{ staticPlot: true, displayModeBar: false }} /> : null}
        <table><caption>Native main effect importance</caption><thead><tr><th scope="col">Factor</th><th scope="col">Variance fraction</th><th scope="col">Tree SD</th></tr></thead><tbody>{main.map(row => <tr key={row.index}><th scope="row">{name(row.index)}</th><td>{value(row.fraction)}</td><td>{value(row.tree_sd)}</td></tr>)}</tbody></table>
      </figure>
      <table><caption>Native pair interaction importance</caption><thead><tr><th scope="col">Factor pair</th><th scope="col">Variance fraction</th><th scope="col">Tree SD</th></tr></thead><tbody>{result.interactions.map((row, index) => <tr key={index}><th scope="row">{row.indices.map(name).join(" × ")}</th><td>{value(row.fraction)}</td><td>{value(row.tree_sd)}</td></tr>)}</tbody></table>
      <p>Domain measure: {friendly(result.domain_measure)}. Aggregation: {friendly(result.aggregation)}. Without held-out dataset diagnostics, surrogate generalization is not established.</p>
    </>}
  </section>;
}
