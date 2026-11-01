import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AvailabilitySummary,
  CapabilityTable,
  ChartDataTable,
  EvidenceTable,
  FindingList,
  QualificationOverview,
  buildQualificationReportView,
  evidenceCsv,
  formatQualificationValue,
  groupMetricsByFamily,
  metricFamily,
  normalizeConfidence,
  normalizeProfileStatus,
  normalizeSeverity,
  type EngineReport,
} from "./index.js";

const report: EngineReport = {
  schema_version: 1,
  engine_version: "0.1.0-alpha.1",
  protocol_bundle_version: "0.1.0-alpha.1",
  profile_status: "exploratory",
  status: "partial",
  validation: { valid: true, issues: [] },
  capabilities: [
    { capability_id: "integrity", available: true, qualified: false, reason: "ALPHA_PROTOCOL_UNQUALIFIED" },
    { capability_id: "methods.pca", available: false, qualified: false, reason: "METHODS_PROVIDER_NOT_CONFIGURED" },
  ],
  metrics: [
    { metric_id: "population.development_real_samples", protocol_version: "p1", status: "computed", reason_code: null, scope: "source_target", view_id: "native", population_id: "development_real", value: 5, denominators: { samples: 6 } },
    { metric_id: "structure.pca", protocol_version: "p1", status: "unsupported", reason_code: "METHODS_PROVIDER_NOT_CONFIGURED", scope: "source_target", view_id: "native", population_id: "development_real", value: 3 },
  ],
  findings: [
    { rule_id: "identity.possible_undocumented_repeats.v1", severity: "warning", confidence: "unknown", evidence: ["integrity.x"], message: "m", action: "a" },
  ],
  limitations: ["Alpha"],
};

describe("buildQualificationReportView", () => {
  const view = buildQualificationReportView(report);

  it("keeps provenance and status", () => {
    expect(view.profileStatus).toBe("exploratory");
    expect(view.completion).toBe("partial");
    expect(view.provenance.engineVersion).toBe("0.1.0-alpha.1");
  });

  it("nulls values of metrics that are not computed", () => {
    expect(view.metrics[0]?.value).toBe(5);
    expect(view.metrics[1]?.value).toBeNull();
    expect(view.availabilityCounts.computed).toBe(1);
    expect(view.availabilityCounts.unsupported).toBe(1);
  });

  it("never invents confidence or promotes unknown statuses", () => {
    expect(normalizeConfidence("certain")).toBe("unknown");
    expect(normalizeProfileStatus("validated")).toBe("exploratory");
    expect(view.findings[0]?.confidence).toBe("unknown");
  });

  it("formats nullable values explicitly", () => {
    expect(formatQualificationValue(null, "en")).toBe("not available");
    expect(formatQualificationValue(0.123456789)).toBe("0.123457");
  });

  it("shows counts exactly instead of rounding them", () => {
    expect(formatQualificationValue(1234567)).toBe("1234567");
  });

  it("keeps the spec severities, including blocking and high", () => {
    expect(normalizeSeverity("blocking")).toBe("blocking");
    expect(normalizeSeverity("high")).toBe("high");
    expect(normalizeSeverity("info")).toBe("info");
  });
});

describe("evidence context", () => {
  it("distinguishes metrics sharing an id by their scalar parameters", () => {
    const repeat = (campaign: string) => ({ metric_id: "measurement.repeatability_sd", protocol_version: "p1", status: "computed", reason_code: null, scope: "source_target", source_id: "s", view_id: "native", population_id: "development_real", value: [0.1], parameters: { repeat_type: "rescan", campaign, band_status: [0] } });
    const v = buildQualificationReportView({ ...report, metrics: [repeat("2026-A"), repeat("2026-B")] });
    const html = renderToStaticMarkup(<EvidenceTable metrics={v.metrics} locale="en" />);
    expect(html).toContain("repeat_type=rescan · campaign=2026-A");
    expect(html).toContain("campaign=2026-B");
    expect(html).not.toContain("band_status=");
  });
});

describe("qualification components", () => {
  const view = buildQualificationReportView(report);
  it("renders the evidence table with reasons and a null marker", () => {
    const html = renderToStaticMarkup(<EvidenceTable metrics={view.metrics} locale="en" />);
    expect(html).toContain("METHODS_PROVIDER_NOT_CONFIGURED");
    expect(html).toContain("not available");
    expect(html).toContain("samples=6");
  });
  it("renders findings, capabilities, overview and data tables", () => {
    expect(renderToStaticMarkup(<FindingList findings={view.findings} locale="en" />)).toContain("Unknown confidence");
    expect(renderToStaticMarkup(<FindingList findings={[]} locale="en" />)).toContain("no findings");
    expect(renderToStaticMarkup(<CapabilityTable capabilities={view.capabilities} />)).toContain("methods.pca");
    const overview = renderToStaticMarkup(<QualificationOverview view={view} locale="en" />);
    expect(overview).toContain("Exploratory");
    expect(overview).toContain("<table");
    expect(renderToStaticMarkup(<AvailabilitySummary counts={view.availabilityCounts} />)).toContain("<svg");
    expect(renderToStaticMarkup(<ChartDataTable caption="c" columns={["a"]} rows={[[null]]} locale="en" />)).toContain("not available");
  });
});

describe("evidence readability", () => {
  it("summarizes structured values instead of printing JSON", () => {
    expect(formatQualificationValue([0.0485, 0.0000068, 0.002, 0.001, 0.0003] as never, "en")).toBe("5 values (6.8 × 10⁻⁶ … 0.0485)");
    expect(formatQualificationValue([1, 2] as never, "en")).toBe("1 ; 2");
    expect(formatQualificationValue([[1, 2], [3, 4], [5, 6]] as never, "en")).toBe("3 × 2 table");
    expect(formatQualificationValue({ sum_eigenvalues: 0.04853, trace: 0.05, keys: ["a", "b"], scores: [[1]] } as never, "en")).toBe("sum_eigenvalues: 0.04853 · trace: 0.05 · keys: a, b · +1");
    expect(formatQualificationValue({ nested: { a: 1 } } as never, "en")).toBe("nested: 1 fields");
  });

  it("groups metrics by family and exports them as CSV", () => {
    expect(metricFamily("integrity.missing_cells")).toBe("data");
    expect(metricFamily("clustering.partition")).toBe("structure");
    expect(metricFamily("probe.rmse")).toBe("validation");
    expect(metricFamily("unknown.thing")).toBe("other");
    const v = buildQualificationReportView(report);
    const html = renderToStaticMarkup(<EvidenceTable metrics={v.metrics} locale="en" />);
    expect(html).toContain("n4q-family-row");
    expect(html).not.toContain("[{");
    const csv = evidenceCsv(v.metrics, "en");
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("family,metric_id,label,status,reason_code,value,unit,source_id,target_id,population_id,view_id,parameters,denominators,protocol_version");
    expect(lines).toHaveLength(v.metrics.length + 1);
    expect(groupMetricsByFamily(v.metrics).reduce((n, g) => n + g.metrics.length, 0)).toBe(v.metrics.length);
  });
});
