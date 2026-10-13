import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AvailabilitySummary,
  CapabilityGrid,
  CheckList,
  ClassCountBars,
  EigenvalueScree,
  FindingList,
  PopulationFlow,
  RepeatabilityProfile,
  ScoreMap,
  SpectraExplorer,
  StatTile,
  TargetDistribution,
  buildQualificationReportView,
  extractIntegrity,
  extractObservationFlow,
  extractPca,
  extractRepeatability,
  extractSamplePopulations,
  extractTarget,
  metricLabel,
  observationFlowStages,
  reportSourceIds,
  reportTargetIds,
  samplePopulationStage,
  scoreGroupColors,
  type EngineMetric,
  type EngineReport,
} from "./index.js";

const metric = (m: Partial<EngineMetric> & Pick<EngineMetric, "metric_id">): EngineMetric => ({
  protocol_version: "p1",
  status: "computed",
  scope: "source",
  view_id: "native",
  population_id: "development_real",
  ...m,
});

const STATUS_KEY = "band_status_0_icc_1_insufficient_2_unbalanced_3_zero_total";

const report: EngineReport = {
  schema_version: 1,
  engine_version: "0.1.0-alpha.1",
  protocol_bundle_version: "0.1.0-alpha.1",
  profile_status: "exploratory",
  capabilities: [
    { capability_id: "integrity", available: true, qualified: false, reason: "ALPHA_PROTOCOL_UNQUALIFIED" },
    { capability_id: "clustering", available: false, qualified: false, reason: "PROTOCOL_NOT_IMPLEMENTED" },
  ],
  findings: [],
  metrics: [
    metric({ metric_id: "population.development_real_samples", value: 24 }),
    metric({ metric_id: "population.retained_test_samples", value: 6 }),
    metric({ metric_id: "population.augmented_samples_excluded", value: 0 }),
    metric({ metric_id: "integrity.missing_cells", source_id: "nir", value: 1, denominators: { n_cells: 2820 } }),
    metric({ metric_id: "integrity.axis_order", source_id: "nir", value: "ascending" }),
    metric({ metric_id: "integrity.development_observations", source_id: "nir", value: 41, denominators: { n_observations_source: 47 } }),
    metric({ metric_id: "integrity.cross_physical_exact_duplicate_pairs", source_id: "nir", value: 1 }),
    metric({ metric_id: "integrity.cross_partition_exact_duplicate_pairs", source_id: "nir", value: 0 }),
    metric({ metric_id: "structure.eligible_samples", source_id: "nir", value: 22, denominators: { n_development_observations: 41, n_excluded_ambiguous_repeat_observations: 2, n_excluded_incomplete_observations: 1, n_excluded_multicontext_observations: 0 } }),
    metric({ metric_id: "structure.pca_eigenvalues", source_id: "nir", view_id: "canonical:centered", value: [3, 1] }),
    metric({ metric_id: "structure.full_variance_moments", source_id: "nir", view_id: "canonical:centered", value: { sum_eigenvalues: 5, sum_squared_eigenvalues: 11 } }),
    metric({ metric_id: "structure.explained_variance_retained", source_id: "nir", value: 0.8 }),
    metric({ metric_id: "structure.pca_scores", source_id: "nir", view_id: "canonical:centered", value: { sample_ids: ["a", "b"], aggregation_keys: ["pa|i|c1", "pb|i|c2"], scores: [[1, 2], [-1, -2]] } }),
    metric({ metric_id: "structure.effective_dimension", source_id: "nir", value: 2.27 }),
    metric({ metric_id: "measurement.repeatability_sd", source_id: "nir", unit: "absorbance", value: [0.1, null, 0.3], denominators: { n_observations: 6, n_physical_groups: 2 }, parameters: { repeat_type: "rescan", instrument: "i", campaign: "c1", [STATUS_KEY]: [0, 1, 0] } }),
    metric({ metric_id: "measurement.icc_1_1", source_id: "nir", value: [0.9, null, 0.5] }),
    metric({ metric_id: "measurement.repeatability_sd", source_id: "nir", status: "insufficient_data", reason_code: "NO_BAND_WITH_REPEATS" }),
    metric({ metric_id: "target.exact_eligible_samples", target_id: "y", value: 23, denominators: { n_excluded_censored: 1 } }),
    metric({ metric_id: "target.continuous_distribution", target_id: "y", unit: "g", value: { count: 23, min: 5, q25: 10, median: 15, q75: 22, max: 25, mean: 16, sample_sd: 6 } }),
    metric({ metric_id: "local.global_contrast", source_id: "nir", target_id: "y", value: 0.93, parameters: { k: 4 } }),
    metric({ metric_id: "target.class_counts", target_id: "z", value: { a: 3, b: 5 } }),
  ],
};
const view = buildQualificationReportView(report);

describe("report selectors", () => {
  it("lists sources and targets in report order", () => {
    expect(reportSourceIds(view)).toEqual(["nir"]);
    expect(reportTargetIds(view)).toEqual(["y", "z"]);
  });

  it("reads populations, integrity and the observation flow", () => {
    expect(extractSamplePopulations(view)).toEqual({ developmentReal: 24, retainedTest: 6, augmentedExcluded: 0 });
    expect(extractIntegrity(view, "nir")).toEqual({ missingCells: 1, totalCells: 2820, axisOrder: "ascending", physicalDuplicatePairs: 1, partitionDuplicatePairs: 0 });
    const flow = extractObservationFlow(view, "nir");
    expect(flow).toMatchObject({ sourceObservations: 47, developmentObservations: 41, excludedAmbiguousRepeat: 2, excludedIncomplete: 1, structureUnits: 22 });
    const stages = observationFlowStages(flow!, "en");
    expect(stages.map((s) => s.segments.reduce((n, g) => n + g.count, 0))).toEqual([47, 41, 22]);
    expect(stages[1]!.segments.find((s) => s.id === "used")!.count).toBe(38);
    expect(extractObservationFlow(view, "other")).toBeNull();
  });

  it("pairs each computed repeatability SD with the ICC emitted right after it", () => {
    const contexts = extractRepeatability(view, "nir");
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ id: "rescan · i · c1", pooledSd: [0.1, null, 0.3], icc: [0.9, null, 0.5], bandStatus: [0, 1, 0], physicalGroups: 2 });
  });

  it("reads PCA scores, eigenvalues and the trace", () => {
    expect(extractPca(view, "nir")).toMatchObject({ sampleIds: ["a", "b"], eigenvalues: [3, 1], totalVariance: 5, retainedFraction: 0.8, effectiveDimension: 2.27 });
  });

  it("reads target summaries, class counts and local contrast", () => {
    const y = extractTarget(view, "y");
    expect(y.summary).toMatchObject({ median: 15, sampleSd: 6 });
    expect(y.localContrast).toEqual([{ sourceId: "nir", value: 0.93, k: 4 }]);
    expect(extractTarget(view, "z").classCounts).toEqual({ a: 3, b: 5 });
  });
});

describe("chart components", () => {
  it("draws the flow with every segment labelled, zero ones in the legend", () => {
    const stage = samplePopulationStage(extractSamplePopulations(view), "en")!;
    const html = renderToStaticMarkup(<PopulationFlow stages={[stage]} title="Samples" locale="en" />);
    expect(html).toContain("Real development: 24 samples");
    expect(html).toContain("data-zero=\"true\"");
  });

  it("leaves gaps for null bands and lists every context", () => {
    const html = renderToStaticMarkup(<RepeatabilityProfile axis={[1000, 1100, 1200]} contexts={extractRepeatability(view, "nir")} title="R" locale="en" />);
    const sd = html.match(/<path d="([^"]+)" class="n4q-line"/)?.[1] ?? "";
    expect(sd.match(/M/g)).toHaveLength(2);
    expect(html).toContain("rescan · i · c1");
  });

  it("shows shares of the trace when it is reported", () => {
    expect(renderToStaticMarkup(<EigenvalueScree eigenvalues={[3, 1]} totalVariance={5} title="S" locale="en" />)).toContain("PC1: 60 %");
    expect(renderToStaticMarkup(<EigenvalueScree eigenvalues={[3, 1]} title="S" locale="en" />)).toContain("PC1: 3");
  });

  it("colours groups by name, not by rank", () => {
    const colors = scoreGroupColors([{ id: "1", x: 0, y: 0, group: "b" }, { id: "2", x: 1, y: 1, group: "a" }]);
    expect([...colors.keys()]).toEqual(["a", "b"]);
    const html = renderToStaticMarkup(<ScoreMap points={[{ id: "1", x: 0, y: 0, value: null }, { id: "2", x: 1, y: 1, value: 2 }]} colorBy="value" xLabel="PC1" yLabel="PC2" colorLabel="y" title="M" locale="en" />);
    expect(html).toContain("no value");
  });

  it("draws excluded target values hollow and class counts sorted", () => {
    const html = renderToStaticMarkup(<TargetDistribution summary={extractTarget(view, "y").summary} points={[{ id: "s1", value: 5, status: "censored" }, { id: "s2", value: 9, status: "exact" }]} title="T" locale="en" />);
    expect(html).toContain("Censored (excluded)");
    expect(html).toContain("stroke:#d97706");
    const bars = renderToStaticMarkup(<ClassCountBars counts={{ a: 3, b: 5 }} title="C" />);
    expect(bars.indexOf(">b<")).toBeLessThan(bars.indexOf(">a<"));
  });

  it("groups capabilities, links evidence and hides empty statuses on request", () => {
    expect(renderToStaticMarkup(<CapabilityGrid capabilities={view.capabilities} locale="en" />)).toContain("Integrity and identities");
    const findings = renderToStaticMarkup(<FindingList findings={[{ ruleId: "r", severity: "warning", confidence: "unknown", evidence: ["integrity.missing_cells"], message: "m", action: "a" }]} evidenceHref={(id) => `#ev-${id}`} locale="en" />);
    expect(findings).toContain('href="#ev-integrity.missing_cells"');
    expect(findings).toContain(metricLabel("integrity.missing_cells", "en"));
    const summary = renderToStaticMarkup(<AvailabilitySummary counts={view.availabilityCounts} hideEmpty locale="en" />);
    expect(summary).toContain("Insufficient data");
    expect(summary).not.toContain("Cancelled");
    expect(renderToStaticMarkup(<StatTile label="L" value={3} href="#x" tone="warning" />)).toContain('data-tone="warning"');
  });

  it("explorer draws gaps and flags missing cells, emphasising the selection", () => {
    const html = renderToStaticMarkup(
      <SpectraExplorer axis={[1, 2, 3, 4]} series={[{ id: "o1", values: [1, null, 3, 4], color: "#000" }, { id: "o2", values: [2, 2, 2, 2], color: "#111" }]} selected={["o1"]} title="E" locale="en" />,
    );
    expect(html.match(/n4q-explorer-missing/g)).toHaveLength(1);
    expect(html.match(/n4q-explorer-focus/g)).toHaveLength(1);
    expect(html).toContain('data-dim="true"');
  });

  it("checklist shows a text status for each point", () => {
    const html = renderToStaticMarkup(<CheckList items={[{ id: "a", status: "ok", title: "A", href: "#a" }, { id: "b", status: "critical", title: "B", detail: "d" }]} locale="en" />);
    expect(html).toContain('data-status="critical"');
    expect(html).toContain(">Critical<");
    expect(html).toContain('href="#a"');
  });
});
