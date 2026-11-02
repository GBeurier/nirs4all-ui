import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TargetDistribution, buildQualificationReportView, extractIntrinsic, type EngineReport } from "./index.js";

const metric = (metric_id: string, status: string, value: unknown, unit: string | null = null) => ({
  metric_id, protocol_version: "pca-in-sample-t2-q.v1", status, reason_code: status === "computed" ? null : "PCA_REQUIRES_COMPLETE_SPECTRA",
  scope: "source", source_id: "nir", target_id: null, view_id: "native:observations", population_id: "development_real",
  value, unit, denominators: {}, parameters: {},
});

const report = {
  schema_version: 1, profile_status: "exploratory", status: "complete",
  validation: { valid: true, issues: [] }, capabilities: [], findings: [], limitations: [],
  metrics: [
    metric("intrinsic.pca.pca_t2", "computed", { sample_ids: ["a", "b", "c"], observation_ids: ["oa", "ob", "oc"], values: [1, null, 4] }, "1"),
    metric("intrinsic.pca.pca_t2_median", "computed", 2.5, "1"),
    metric("intrinsic.pca.pca_t2_p95", "computed", 3.85, "1"),
    metric("intrinsic.pca.protocol_evidence", "computed", { anything: 1 }),
    metric("intrinsic.events.global_spike_count", "computed", 3, "count"),
    metric("intrinsic.pca.pca_q", "unsupported", null),
  ],
} as unknown as EngineReport;

describe("intrinsic signatures", () => {
  it("pairs per-observation values with their native median and p95", () => {
    const intrinsic = extractIntrinsic(buildQualificationReportView(report), "nir")!;
    expect(intrinsic.signals["pca.pca_t2"]).toMatchObject({ sampleIds: ["a", "b", "c"], values: [1, null, 4], median: 2.5, p95: 3.85 });
    expect(intrinsic.signals["pca.pca_q"]?.state).toEqual({ status: "unsupported", reasonCode: "PCA_REQUIRES_COMPLETE_SPECTRA" });
    expect(intrinsic.globals).toEqual({ "events.global_spike_count": 3 });
    expect(extractIntrinsic(buildQualificationReportView(report), "other")).toBeNull();
  });

  it("draws the declared target values as a histogram", () => {
    const points = Array.from({ length: 25 }, (_, i) => ({ id: `s${i}`, value: i % 5, status: "exact" as const }));
    const html = renderToStaticMarkup(<TargetDistribution summary={null} points={points} title="T" locale="en" />);
    // √25 = 5 bins, one bar per non-empty bin, no per-sample dots
    expect(html.match(/fill="#0d9488" fill-opacity="0.85"/g)).toHaveLength(5);
    expect(html).not.toContain("n4q-dot");
  });
});
