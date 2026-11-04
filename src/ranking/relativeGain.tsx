import type { QualityRanking, RankingPlotRenderer } from "./types.js";

export interface RelativeGainResult {
  schema_version: "n4m.relative_gain/1";
  effect: string;
  meta_analysis: "dersimonian_laird" | null;
  variance_source: "caller_supplied_effect_variance" | null;
  inference_assumption: string;
  n: number;
  mean_gain: number | null;
  sample_sd: number | null;
  pooled_gain: number | null;
  standard_error: number | null;
  tau_squared: number | null;
  q: number | null;
  i_squared: number | null;
}

export interface QualityRelativeGain {
  schema_version: "n4a.quality-relative-gain/1";
  state: "ready" | "unavailable";
  reason: string | null;
  request_id: string;
  request: Record<string, unknown>;
  dimension: string;
  metric: string;
  scope: string;
  partition: string;
  direction: string;
  baseline_id: string;
  candidate_id: string;
  candidates: { id: string; label: string }[];
  studies: { dataset: string; baseline_loss: number; candidate_loss: number; effect_variance: number | null; matched_blocks: string[] }[];
  result: RelativeGainResult | null;
  provenance: QualityRanking["provenance"] & { study_dataset_ids?: string[]; independence_assumption?: string };
  warnings: string[];
  capabilities: QualityRanking["capabilities"];
}

export interface RelativeGainViewProps {
  relativeGain: QualityRelativeGain;
  Plot?: RankingPlotRenderer;
  className?: string;
}

const reasons: Record<string, string> = {
  relative_gain_requires_positive_loss_metric: "Relative gain requires a positive loss metric with a lower-is-better direction.",
  distinct_baseline_and_candidate_required: "Choose different baseline and candidate configurations.",
  comparison_candidate_not_in_cohort: "The baseline or candidate is not in the eligible cohort.",
  relative_gain_requires_strictly_positive_losses: "Both losses must be strictly positive.",
  no_direct_paired_dataset_evidence: "No directly paired dataset evidence was found.",
  effect_variances_must_match_paired_dataset_ids: "Supply an effect variance for every paired dataset and no others.",
  effect_variances_must_be_finite_positive: "Effect variances must be finite and positive.",
  native_ranking_runtime_unavailable: "The native ranking runtime is unavailable.",
  native_relative_gain_rejected_input: "The native relative gain runtime rejected the input.",
  native_relative_gain_schema_unsupported: "The native relative gain result schema is unsupported.",
};
const value = (n: number | null) => n === null ? "Not available" : String(n);

/** Presents the native paired result and input evidence without estimating effects. */
export function RelativeGainView({ relativeGain: artifact, Plot, className }: RelativeGainViewProps) {
  const result = artifact.result;
  const meta = result?.meta_analysis === "dersimonian_laird" && result.variance_source === "caller_supplied_effect_variance";
  const label = (id: string) => artifact.candidates.find(candidate => candidate.id === id)?.label ?? id;
  const traces: Record<string, unknown>[] = [];
  if (result?.mean_gain !== null && result?.mean_gain !== undefined) {
    traces.push({ type: "scatter", mode: "markers", name: "Mean gain", x: [result.mean_gain], y: ["Mean gain"],
      ...(result.sample_sd !== null ? { error_x: { type: "data", array: [result.sample_sd], visible: true } } : {}) });
  }
  if (meta && result.pooled_gain !== null) {
    traces.push({ type: "scatter", mode: "markers", name: "Pooled gain", x: [result.pooled_gain], y: ["Pooled gain"],
      ...(result.standard_error !== null ? { error_x: { type: "data", array: [result.standard_error], visible: true } } : {}) });
  }
  return <section className={className}><h2>Observed relative gain</h2>
    <p>Baseline: {label(artifact.baseline_id)}; candidate: {label(artifact.candidate_id)}. Metric: {artifact.metric}; scope: {artifact.scope}; partition: {artifact.partition}.</p>
    <p>Positive gain means the candidate has a lower loss than the baseline. Gains use directly paired datasets.</p>
    {artifact.state === "unavailable" || !result ? <><p>Relative gain unavailable: {artifact.reason ? reasons[artifact.reason] ?? artifact.reason.replaceAll("_", " ") : "Reason not provided."}</p>{artifact.reason ? <details><summary>Reason code</summary><code>{artifact.reason}</code></details> : null}</> : <>
      <figure><figcaption><strong>Relative gain estimates</strong><p>When available, the mean gain error bar shows one sample SD, describing variation across dataset gains; it is not a standard error or confidence interval. {meta ? "The pooled estimate and its standard error use caller-supplied effect variances and a DerSimonian–Laird model; the error bar is one standard error, not a confidence interval." : "No pooled estimate or standard error is reported without a supplied-variance meta-analysis."} Missing values are shown as Not available.</p></figcaption>
        {Plot && traces.length ? <Plot data={traces} layout={{ xaxis: { title: { text: "Relative gain" } }, showlegend: false }} config={{ displayModeBar: false, staticPlot: true }} /> : null}
        <table><caption>Native relative gain results</caption><tbody>
          <tr><th scope="row">Datasets</th><td>{result.n}</td></tr>
          <tr><th scope="row">Mean gain</th><td>{value(result.mean_gain)}</td></tr>
          <tr><th scope="row">Sample SD (descriptive)</th><td>{value(result.sample_sd)}</td></tr>
          {meta ? <><tr><th scope="row">Pooled gain</th><td>{value(result.pooled_gain)}</td></tr><tr><th scope="row">Standard error</th><td>{value(result.standard_error)}</td></tr><tr><th scope="row">Tau squared</th><td>{value(result.tau_squared)}</td></tr><tr><th scope="row">Q</th><td>{value(result.q)}</td></tr><tr><th scope="row">I squared</th><td>{value(result.i_squared)}</td></tr></> : null}
        </tbody></table>
      </figure>
      {meta ? <p>Inference assumption: {result.inference_assumption}</p> : null}
    </>}
    {artifact.studies.length ? <table><caption>Paired dataset evidence</caption><thead><tr><th scope="col">Dataset</th><th scope="col">Baseline loss</th><th scope="col">Candidate loss</th><th scope="col">Supplied effect variance</th><th scope="col">Matched blocks</th></tr></thead><tbody>{artifact.studies.map(study => <tr key={study.dataset}><th scope="row">{study.dataset}</th><td>{study.baseline_loss}</td><td>{study.candidate_loss}</td><td>{value(study.effect_variance)}</td><td>{study.matched_blocks.join(", ") || "Not available"}</td></tr>)}</tbody></table> : null}
    {artifact.warnings.length ? <ul>{artifact.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : null}
    <details><summary>Request identity</summary><p>Request ID: {artifact.request_id}</p><pre>{JSON.stringify(artifact.request, null, 2)}</pre></details>
  </section>;
}
