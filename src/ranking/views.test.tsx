import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CandidateComparisonChart, ComponentRankingView, QualityRankingPanel, RankingPlot } from "./index.js";
import type { QualityRanking, RankingPlotProps } from "./index.js";

const ranking: QualityRanking = {
  schema_version: "n4a.quality-ranking/1", request_id: "request", request: {}, state: "ready", reason: null,
  dimension: "model", method: "trueskill", metric: "rmse", scope: "cv", partition: "validation", config: {},
  interpretation: "observed_component_performance", uncertainty_kind: "approximate_posterior_sd", score_direction: "higher_is_better",
  candidates: [
    { id: "a", label: "Model A", score: 3, rank: 1, uncertainty: 0.4, average_rank: 1.2, observations: 4, matches: 5, component: 0, wins: 3, ties: 1, losses: 1 },
    { id: "b", label: "Model B", score: 2, rank: null, uncertainty: null, average_rank: null, observations: 3, matches: 5, component: 0, wins: 1, ties: 1, losses: 3 },
  ],
  coverage: { blocks: 4, complete_blocks: 3, paired_comparisons: 5, connected_components: 1 },
  inference: { reason: "friedman_suppressed" }, convergence: null,
  provenance: { datasets: ["dataset"], matched_blocks: 4, comparison_rows: 5, source_observations: 8, accepted_observations: 7, excluded: { missing: 1 }, aggregation: "dataset_pair_mean", dataset_weighting: "one comparison per dataset and candidate pair", blocks: [], comparisons: [] },
  warnings: ["Descriptive only"], capabilities: { methods: [], dimensions: [], deferred: { fanova: "not_qualified", mixed_effects: "not_qualified" } },
};

describe("ranking views", () => {
  it("exposes descriptive interpretation, missing values, and evidence without a plot", () => {
    const html = renderToStaticMarkup(<ComponentRankingView ranking={ranking} />);
    expect(html).toContain("does not establish causal contribution");
    expect(html).toContain("Not available");
    expect(html).toContain("one approximate posterior standard deviation (1 SD), not a confidence interval");
    expect(html).toContain("missing: 1");
    expect(html).toContain("friedman_suppressed");
    expect(html).toContain("fanova: not_qualified");
    expect(html).toContain("Model B");
  });
  it("projects the same scores and SD into plot and table, without inventing an SD", () => {
    let captured: RankingPlotProps | undefined;
    const Plot = (props: RankingPlotProps) => { captured = props; return <div>Host plot</div>; };
    const html = renderToStaticMarkup(<RankingPlot ranking={ranking} Plot={Plot} />);
    expect(captured?.data[0]).toMatchObject({ x: [3], y: ["a"], error_x: { array: [0.4] } });
    expect(captured?.data[1]).toMatchObject({ x: [2], y: ["b"] });
    expect(captured?.data[1]).not.toHaveProperty("error_x");
    expect(html).toContain("<td>3</td><td>0.4</td>");
    expect(html).toContain("<td>2</td><td>Not available</td>");
  });
  it("projects comparison counts into both plot and table", () => {
    let captured: RankingPlotProps | undefined;
    const Plot = (props: RankingPlotProps) => { captured = props; return null; };
    const html = renderToStaticMarkup(<CandidateComparisonChart ranking={ranking} Plot={Plot} />);
    expect(captured?.data.map(trace => trace.x)).toEqual([[3, 1], [1, 1], [1, 3]]);
    expect(html).toContain("<th scope=\"row\">Model A</th><td>3</td><td>1</td><td>1</td>");
    expect(html).toContain("<th scope=\"row\">Model B</th><td>1</td><td>1</td><td>3</td>");
  });
  it("explains unavailable results and preserves identified candidates", () => {
    const unavailable: QualityRanking = { ...ranking, state: "unavailable", reason: "split_requires_matched_external_error", candidates: [], coverage: null,
      provenance: { ...ranking.provenance, candidate_universe: [{ id: "a", label: "Model A", pipelines: ["p"] }] } };
    const html = renderToStaticMarkup(<QualityRankingPanel ranking={unavailable} />);
    expect(html).toContain("split_requires_matched_external_error");
    expect(html).toContain("Model A");
    expect(html).not.toContain("Candidate ranking values");
  });
});
