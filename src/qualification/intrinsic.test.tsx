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

// Body rows of the visible data table, as the raw `data-value` of each cell, and its column headers.
const bodyRows = (html: string) =>
  [...html.matchAll(/<tr>((?:<td [^>]*>[^<]*<\/td>)+)<\/tr>/g)].map((row) => [...row[1]!.matchAll(/<td data-value="([^"]*)"/g)].map((cell) => cell[1]!));
const headers = (html: string) => [...html.matchAll(/<th scope="col">([^<]*)<\/th>/g)].map((cell) => cell[1]!);
const tables = (html: string) => html.match(/<table\b/g)?.length ?? 0;

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
    // one visible, captioned data table carries the bin edges and per-status counts; bins are not unnamed tab stops
    expect(tables(html)).toBe(1);
    expect(html).toContain("<caption>T</caption>");
    expect(headers(html)).toEqual(["Range from", "Range to", "Exact reference", "Censored (excluded)", "Composite (excluded)"]);
    // values 0..4 five times each fall one per bin: 5 non-empty bins of 5 exact values, none censored or composite
    const rows = bodyRows(html);
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.slice(2))).toEqual(Array.from({ length: 5 }, () => ["5", "0", "0"]));
    // the bins tile the declared extent [0, 4] without gaps
    expect(rows[0]!.slice(0, 2)).toEqual(["0", "0.8"]);
    expect(rows[4]![1]).toBe("4");
    for (let i = 1; i < rows.length; i++) expect(rows[i]![0]).toBe(rows[i - 1]![1]);
    expect(html).not.toContain('tabindex="-1"');
  });

  it("ignores non-finite target values instead of crashing or miscounting", () => {
    const points = [
      { id: "a", value: 1, status: "exact" as const },
      { id: "b", value: Number.NaN, status: "exact" as const },
      { id: "c", value: Number.POSITIVE_INFINITY, status: "censored" as const },
      { id: "d", value: 3, status: "exact" as const },
    ];
    const html = renderToStaticMarkup(<TargetDistribution summary={null} points={points} title="T" locale="en" />);
    expect(html).toContain("Exact reference <strong>2</strong>");
    expect(html).not.toContain("Censored (excluded) <strong>");
    // only the two finite exact values are tabulated: one in the first and one in the last of 5 bins over [1, 3]
    expect(tables(html)).toBe(1);
    const rows = bodyRows(html);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.slice(2))).toEqual([["1", "0", "0"], ["1", "0", "0"]]);
    expect(rows[0]![0]).toBe("1");
    expect(rows[1]![1]).toBe("3");
  });
});
