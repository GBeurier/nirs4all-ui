import type { QualityRanking, RankingCandidate, RankingViewProps } from "./types.js";

const value = (n: number | null) => n === null ? "Not available" : String(n);

const dimensions: Record<string, string> = {
  pipeline: "pipeline", model: "model", preprocessing_sequence: "preprocessing sequence",
  preprocessing_operator: "preprocessing operator", feature_selection: "feature selection",
  augmentation: "augmentation", parameter: "parameter", split: "split strategy",
};
const reasons: Record<string, string> = {
  split_requires_matched_external_error: "Split strategy rankings require matched external error on a test or final partition.",
  mixed_effects_backend_not_qualified: "Mixed effects analysis is not yet qualified.",
  fanova_backend_not_qualified: "Functional ANOVA analysis is not yet qualified.",
  matched_contribution_not_implemented: "Matched contribution analysis is not yet implemented.",
  interaction_backend_not_qualified: "Interaction analysis is not yet qualified.",
  unsupported_method_or_dimension: "This method or dimension is not supported.",
  operator_qualified_parameter_required: "Select an operator and parameter for this ranking.",
  metric_direction_mismatch: "The requested direction does not match the metric direction.",
  no_eligible_observations: "No eligible observations were found.",
  ambiguous_protocol_requires_filter: "Select a single scoring protocol.",
  incompatible_task_type_or_aggregation: "Task types or aggregation levels are incompatible.",
  ambiguous_dataset_context_requires_filter: "Select a single context for each dataset.",
  no_matched_comparisons: "No matched candidate comparisons were found.",
  cohort_size_limit_requires_filter: "Filter the cohort to reduce its size.",
  average_rank_requires_common_dataset_panel: "Average rank requires a common candidate panel within each dataset.",
  average_rank_requires_nonoverlapping_components: "Average rank requires nonoverlapping components.",
  native_ranking_runtime_unavailable: "The native ranking runtime is unavailable.",
  native_ranking_rejected_input: "The native ranking runtime rejected the input.",
  native_ranking_schema_unsupported: "The native ranking result schema is unsupported.",
};
const friendly = (code: string) => code.replaceAll("_", " ");
const dimensionLabel = (code: string) => dimensions[code] ?? friendly(code);
const reasonLabel = (code: string) => reasons[code] ?? friendly(code);

// This order only presents native ranks. It does not infer ranks from scores.
function orderedCandidates(candidates: RankingCandidate[]): RankingCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.rank !== null && b.rank === null) return -1;
    if (a.rank === null && b.rank !== null) return 1;
    if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank;
    if (a.rank === null && b.rank === null && a.component !== b.component) return a.component - b.component;
    return a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
  });
}

function axisFor(candidates: RankingCandidate[]) {
  const ids = candidates.map(c => c.id);
  return { type: "category", categoryorder: "array", categoryarray: ids, autorange: "reversed",
    tickmode: "array", tickvals: ids, ticktext: candidates.map(c => c.label) };
}


function CandidateTable({ candidates, showSd }: { candidates: RankingCandidate[]; showSd: boolean }) {
  return <table><caption>Candidate ranking values</caption><thead><tr>
    <th scope="col">Candidate</th><th scope="col">Rank</th><th scope="col">Score</th>
    <th scope="col">Approximate posterior SD</th><th scope="col">Average rank</th>
    <th scope="col">Observations</th><th scope="col">Matches</th><th scope="col">Connected component</th>
    <th scope="col">Wins</th><th scope="col">Ties</th><th scope="col">Losses</th>
  </tr></thead><tbody>{candidates.map(c => <tr key={c.id}>
    <th scope="row">{c.label}</th><td>{value(c.rank)}</td><td>{value(c.score)}</td>
    <td>{showSd ? value(c.uncertainty) : "Not available"}</td><td>{value(c.average_rank)}</td><td>{c.observations}</td>
    <td>{c.matches}</td><td>{c.component}</td><td>{c.wins}</td><td>{c.ties}</td><td>{c.losses}</td>
  </tr>)}</tbody></table>;
}

/** Displays supplied scores and, where available, one approximate posterior SD. */
export function RankingPlot({ ranking, Plot, className }: RankingViewProps) {
  const candidates = orderedCandidates(ranking.candidates);
  const scored = candidates.filter(c => c.score !== null);
  const sd = ranking.uncertainty_kind === "approximate_posterior_sd";
  const withSd = scored.filter(c => sd && c.uncertainty !== null);
  const withoutSd = scored.filter(c => !sd || c.uncertainty === null);
  const trace = (items: RankingCandidate[], error: boolean): Record<string, unknown> => ({
    type: "scatter", mode: "markers", name: error ? "Score with posterior SD" : "Score without posterior SD",
    x: items.map(c => c.score), y: items.map(c => c.id),
    ...(error ? { error_x: { type: "data", array: items.map(c => c.uncertainty), visible: true } } : {}),
  });
  return <figure className={className}>
    <figcaption><strong>Ranking scores</strong><p>Scores are shown for {scored.length} of {ranking.candidates.length} candidates. {ranking.score_direction === "lower_is_better" ? "Lower scores are better." : ranking.score_direction === "higher_is_better" ? "Higher scores are better." : "Score direction is not available."} {sd ? "Error bars show one approximate posterior standard deviation (1 SD), not a confidence interval." : "Posterior standard deviations are not available."} Missing values are shown as Not available in the table.</p></figcaption>
    {Plot && scored.length > 0 ? <Plot data={[...(withSd.length ? [trace(withSd, true)] : []), ...(withoutSd.length ? [trace(withoutSd, false)] : [])]} layout={{ xaxis: { title: { text: "Ranking score" } }, yaxis: axisFor(scored), showlegend: false }} config={{ displayModeBar: false, staticPlot: true }} /> : null}
    <CandidateTable candidates={candidates} showSd={sd} />
  </figure>;
}

/** Displays native comparison totals without deriving pairwise effects. */
export function CandidateComparisonChart({ ranking, Plot, className }: RankingViewProps) {
  const candidates = orderedCandidates(ranking.candidates);
  const series = (["wins", "ties", "losses"] as const).map((key, i) => ({
    type: "bar", orientation: "h", name: key[0]!.toUpperCase() + key.slice(1),
    x: candidates.map(c => c[key]), y: candidates.map(c => c.id),
    marker: { pattern: { shape: ["", "/", "x"][i] } },
  }));
  return <figure className={className}><figcaption><strong>Observed comparison totals</strong>
    <p>Wins, ties and losses are native counts per candidate. The table provides exact counts; stacked segments do not share a common baseline.</p></figcaption>
    {Plot && candidates.length > 0 ? <Plot data={series} layout={{ barmode: "stack", xaxis: { title: { text: "Comparison count" }, rangemode: "tozero" }, yaxis: axisFor(candidates) }} config={{ displayModeBar: false, staticPlot: true }} /> : null}
    <table><caption>Observed comparison counts</caption><thead><tr><th scope="col">Candidate</th><th scope="col">Wins</th><th scope="col">Ties</th><th scope="col">Losses</th></tr></thead><tbody>{candidates.map(c => <tr key={c.id}><th scope="row">{c.label}</th><td>{c.wins}</td><td>{c.ties}</td><td>{c.losses}</td></tr>)}</tbody></table>
  </figure>;
}

function Evidence({ ranking: r }: { ranking: QualityRanking }) {
  return <><p>Method: {r.method}; dimension: {dimensionLabel(r.dimension)}; metric: {r.metric}; scope: {r.scope}; partition: {r.partition}.</p>
    <p>Aggregation: {r.provenance.aggregation}. Dataset weighting: {r.provenance.dataset_weighting}.</p>
    <details><summary>Request identity and configuration</summary><p>Request ID: {r.request_id}</p><pre>{JSON.stringify({ request: r.request, config: r.config }, null, 2)}</pre></details>
    {r.inference ? <details><summary>Inference details</summary><pre>{JSON.stringify(r.inference, null, 2)}</pre></details> : <p>Inference is not available.</p>}
    <p>Evidence: {r.provenance.datasets.length} datasets, {r.provenance.matched_blocks} matched blocks, {r.provenance.comparison_rows} comparison rows, {r.provenance.accepted_observations} accepted of {r.provenance.source_observations} source observations.</p>
    {r.coverage ? <p>Coverage: {r.coverage.blocks} blocks, {r.coverage.complete_blocks} complete blocks, {r.coverage.paired_comparisons} paired comparisons, {r.coverage.connected_components} connected components.</p> : null}
    {Object.entries(r.provenance.excluded).length ? <><p>Excluded observations:</p><ul>{Object.entries(r.provenance.excluded).map(([reason, count]) => <li key={reason}>{reason}: {count}</li>)}</ul></> : null}
    {r.warnings.length ? <ul>{r.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : null}
  </>;
}

/** Presents an authoritative ranking; no calculations or runtime calls are made. */
export function QualityRankingPanel({ ranking, Plot, className }: RankingViewProps) {
  const universe = ranking.provenance.candidate_universe ?? [];
  return <section className={className}><h2>Observed {dimensionLabel(ranking.dimension)} ranking</h2>
    <p>{ranking.interpretation === "observed_component_performance" ? "Observed component performance is descriptive and does not establish causal contribution." : "Observed pipeline performance is descriptive."}</p>
    <Evidence ranking={ranking} />
    {ranking.state === "unavailable" ? <><p>Ranking unavailable: {ranking.reason ? reasonLabel(ranking.reason) : "Reason not provided."}</p>{ranking.reason ? <details><summary>Reason code</summary><code>{ranking.reason}</code></details> : null}{universe.length ? <><p>Identified candidates:</p><ul>{universe.map(c => <li key={c.id}>{c.label}</li>)}</ul></> : null}</> : <><RankingPlot ranking={ranking} {...(Plot ? { Plot } : {})} /><CandidateComparisonChart ranking={ranking} {...(Plot ? { Plot } : {})} /></>}
    {Object.keys(ranking.capabilities.deferred).length ? <><p>Deferred analyses:</p><ul>{Object.entries(ranking.capabilities.deferred).map(([name, reason]) => <li key={name}>{friendly(name)}: {reasonLabel(reason)} <code>({reason})</code></li>)}</ul></> : null}
  </section>;
}

/** Component dimensions use the same observed, descriptive evidence view. */
export function ComponentRankingView(props: RankingViewProps) {
  return <QualityRankingPanel {...props} />;
}
