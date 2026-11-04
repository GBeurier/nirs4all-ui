import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RelativeGainView } from "./index.js";
import type { QualityRelativeGain, RankingPlotProps } from "./index.js";

const artifact: QualityRelativeGain = {
  schema_version: "n4a.quality-relative-gain/1", state: "ready", reason: null, request_id: "request", request: {},
  dimension: "pipeline", metric: "rmse", scope: "test", partition: "test", direction: "min", baseline_id: "a", candidate_id: "b",
  candidates: [{ id: "a", label: "Baseline" }, { id: "b", label: "Candidate" }],
  studies: [{ dataset: "d1", baseline_loss: 2, candidate_loss: 1.5, effect_variance: null, matched_blocks: ["block"] }],
  result: { schema_version: "n4m.relative_gain/1", effect: "(baseline-candidate)/baseline", meta_analysis: null, variance_source: null, inference_assumption: "not available", n: 1, mean_gain: 0.25, sample_sd: null, pooled_gain: null, standard_error: null, tau_squared: null, q: null, i_squared: null },
  provenance: { datasets: ["d1"], matched_blocks: 1, comparison_rows: 1, source_observations: 2, accepted_observations: 2, excluded: {}, aggregation: "dataset_pair_mean", dataset_weighting: "one pair per dataset", blocks: [], comparisons: [] },
  warnings: [], capabilities: { methods: [], dimensions: [], deferred: {} },
};

describe("RelativeGainView", () => {
  it("shows descriptive gain and a missing sample SD without inventing inference", () => {
    let captured: RankingPlotProps | undefined;
    const Plot = (props: RankingPlotProps) => { captured = props; return null; };
    const html = renderToStaticMarkup(<RelativeGainView relativeGain={artifact} Plot={Plot} />);
    expect(html).toContain("Positive gain means the candidate has a lower loss");
    expect(html).toContain("Sample SD (descriptive)</th><td>Not available");
    expect(html).toContain("not a standard error or confidence interval");
    expect(html).not.toContain("<th scope=\"row\">Pooled gain");
    expect(captured?.data).toHaveLength(1);
    expect(captured?.data[0]).toMatchObject({ x: [0.25] });
    expect(captured?.data[0]).not.toHaveProperty("error_x");
    expect(html).toContain("<td>2</td><td>1.5</td><td>Not available</td><td>block</td>");
  });
  it("shows supplied-variance pooling and standard error separately from sample SD", () => {
    const withVariance: QualityRelativeGain = { ...artifact, studies: [{ ...artifact.studies[0]!, effect_variance: 0.04 }], result: { ...artifact.result!, sample_sd: 0.2, meta_analysis: "dersimonian_laird", variance_source: "caller_supplied_effect_variance", pooled_gain: 0.3, standard_error: 0.1, tau_squared: 0.01, q: 1, i_squared: 0.2, inference_assumption: "independent datasets" } };
    let captured: RankingPlotProps | undefined;
    const Plot = (props: RankingPlotProps) => { captured = props; return null; };
    const html = renderToStaticMarkup(<RelativeGainView relativeGain={withVariance} Plot={Plot} />);
    expect(html).toContain("Sample SD (descriptive)</th><td>0.2");
    expect(html).toContain("Pooled gain</th><td>0.3");
    expect(html).toContain("Standard error</th><td>0.1");
    expect(html).toContain("independent datasets");
    expect(captured?.data[0]).toMatchObject({ x: [0.25], error_x: { array: [0.2] } });
    expect(captured?.data[1]).toMatchObject({ x: [0.3], error_x: { array: [0.1] } });
  });
  it("explains unavailable results", () => {
    const unavailable: QualityRelativeGain = { ...artifact, state: "unavailable", reason: "no_direct_paired_dataset_evidence", result: null, studies: [] };
    const html = renderToStaticMarkup(<RelativeGainView relativeGain={unavailable} />);
    expect(html).toContain("No directly paired dataset evidence was found.");
    expect(html).toContain("no_direct_paired_dataset_evidence");
    expect(html).not.toContain("Native relative gain results");
  });
});
