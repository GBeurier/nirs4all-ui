import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// Fixtures follow the preflight 0.1.0 Rust contract (`Metric`, `PermutationPlan`, serde key
// order): one synthetic report per capability block, merged, plus the validation-probe case
// whose R² and skill exceed the double range (`significand_times_2_pow_exponent`).
import reportJson from "./fixtures/preflight-0.1.0-report.json" with { type: "json" };
import extendedJson from "./fixtures/preflight-0.1.0-probe-extended.json" with { type: "json" };
import {
  ComparisonMatrix,
  HypothesisTestTable,
  MeasureBars,
  RepeatabilityProfile,
  ReplicateHistogram,
  ScoreMap,
  buildQualificationReportView,
  scoreGroupColors,
  engineNumberToDouble,
  extractAssociationFamily,
  extractAssociations,
  extractClustering,
  extractConfounding,
  extractDomainShift,
  extractDomainShiftFamilies,
  extractDuplicates,
  extractNoiseProxy,
  extractProbes,
  extractRepeatability,
  extractRepeatabilityUncertainty,
  extractStructureSensitivity,
  formatEngineNumber,
  formatEngineNumberExact,
  formatPValue,
  formatQualificationValue,
  hasBlock,
  metricHelp,
  metricLabel,
  parseEngineNumber,
  statisticLabel,
  unavailableMetrics,
  withRepeatabilityUncertainty,
  type EngineReport,
} from "./index.js";

const view = buildQualificationReportView(reportJson as unknown as EngineReport);
const extended = buildQualificationReportView(extendedJson as unknown as EngineReport);
const scaled = (significand: number, exponent: number) => ({ significand, exponent, representation: "significand_times_2_pow_exponent" });

describe("engine numbers beyond the double range", () => {
  it("parses plain and scaled numbers, refuses anything else", () => {
    expect(parseEngineNumber(0.5)).toEqual({ kind: "double", value: 0.5 });
    expect(parseEngineNumber(scaled(0.75, 0))).toEqual({ kind: "double", value: 0.75 });
    expect(parseEngineNumber(scaled(-0.5, 1025))).toEqual({ kind: "scaled", significand: -0.5, exponent: 1025 });
    expect(parseEngineNumber(null)).toBeNull();
    expect(parseEngineNumber({ significand: 1, exponent: 2 })).toBeNull();
    expect(engineNumberToDouble(parseEngineNumber(scaled(-0.5, 1025)))).toBeNull();
    expect(engineNumberToDouble(parseEngineNumber(scaled(-0.5, 10)))).toBe(-512);
  });

  it("prints m × 10^k from the exact expansion, never NaN or Infinity", () => {
    // -0.5 × 2^1025 = -2^1024 = -1.797693…e308
    expect(formatEngineNumber(scaled(-0.5, 1025), "en")).toBe("−1.798 × 10³⁰⁸");
    expect(formatEngineNumber(scaled(-0.5, 1025), "fr")).toBe("−1,798 × 10³⁰⁸");
    // 2^4000 has 1205 digits
    expect(formatEngineNumber(scaled(-0.5, 4001), "en")).toMatch(/^−1\.\d+ × 10¹²⁰⁴$/);
    expect(formatEngineNumber(scaled(-0.9099448096242312, 1019), "en")).toBe("−5.112 × 10³⁰⁶");
    expect(formatEngineNumber(0.9578799262634762, "en")).toBe("0.9579");
    expect(formatEngineNumber(-3.2e-7, "en")).toBe("−3.2 × 10⁻⁷");
    expect(formatEngineNumberExact({ kind: "scaled", significand: -0.5, exponent: 1025 }, "en")).toBe("−0.5 × 2¹⁰²⁵");
    expect(formatQualificationValue(scaled(-0.5, 1025), "en")).toBe("−1.798 × 10³⁰⁸");
    for (const m of extended.metrics) expect(formatQualificationValue(m.value, "en")).not.toMatch(/NaN|Infinity/);
  });

  it("keeps p-values at their resolution", () => {
    expect(formatPValue(0.001)).toBe("0.001");
    expect(formatPValue(0.0002)).toBe("2.0e-4");
    expect(formatPValue(null)).toBe("—");
  });
});

describe("labels", () => {
  it("statistic ids get display names", () => {
    expect(statisticLabel("eta_squared", "en")).toBe("η²");
    expect(statisticLabel("cramers_v", "fr")).toBe("V de Cramér");
    expect(statisticLabel("unknown_stat")).toBe("unknown_stat");
  });

  it("every metric id of the 0.1.0 fixtures has a FR/EN label and a help sentence", () => {
    const ids = [...new Set([...view.metrics, ...extended.metrics].map((m) => m.id))];
    for (const id of ids) {
      expect(metricLabel(id, "fr"), id).not.toBe(id);
      expect(metricLabel(id, "en"), id).not.toBe(id);
      expect(metricHelp(id, "fr"), id).toBeTruthy();
      expect(metricHelp(id, "en"), id).toBeTruthy();
    }
  });
});

describe("block selectors", () => {
  it("clustering: partition, stability, appearance, Gaussian null and verdict", () => {
    const c = extractClustering(view, "nir")!;
    expect(c.candidateCount).toBe(2);
    expect(c.partition?.labels).toHaveLength(24);
    expect(c.nNoise).toBe(5);
    expect(c.clusters.map((x) => x.nMembers)).toEqual([11, 8]);
    expect(c.stability.scaled?.ari?.median).toBe(1);
    expect(c.stability.constant?.nAriEvaluable).toBe(48);
    expect(c.appearance.scaled.map((a) => a.frequency)).toEqual([0.94, 1]);
    expect(c.appearance.threshold).toBe(0.5);
    expect(c.nullModel).toMatchObject({ statistic: "coverage_weighted_stability", observed: 0.75, tailFraction: 0.02, decisional: true });
    expect(c.nullModel?.replicates).toHaveLength(99);
    expect(c.assessment?.verdict).toBe("uncertain_partition");
    expect(c.assessment?.criteria.find((k) => k.id === "median_ari_constant")).toMatchObject({ passed: false, threshold: 0.8 });
    const vis = extractClustering(view, "vis")!;
    expect(vis.partitionState).toEqual({ status: "insufficient_data", reasonCode: "FEWER_THAN_TWO_MIN_CLUSTER_SIZES" });
    expect(vis.partition).toBeNull();
    expect(extractClustering(view, "none")).toBeNull();
  });

  it("confounding: design, variance shares, dispersion and Holm tests", () => {
    const c = extractConfounding(view, "nir")!;
    expect(c.factors.map((f) => f.factor)).toEqual(["instrument", "campaign"]);
    expect(c.partition?.shares[0]).toMatchObject({ factor: "instrument", r2Marginal: 0.666447291274043 });
    expect(c.partition?.r2AllFactorCells).toBeCloseTo(0.7456, 4);
    expect(c.tests).toHaveLength(8);
    expect(c.tests[0]).toMatchObject({ test: "confounding.permanova_marginal_test", factor: "instrument", pValue: 0.001, pValueHolm: 0.006, rejects: true, nPermutations: 999 });
    expect(c.families.map((f) => f.size)).toEqual([6, 2]);
    const mir = extractConfounding(view, "mir")!;
    expect(mir.factors[0]).toMatchObject({ aliasedWithOtherFactorCells: true, determinedBy: ["campaign"] });
    expect(mir.tests.filter((t) => t.state.status === "not_identifiable").map((t) => t.state.reasonCode)).toEqual(Array(4).fill("FACTOR_ALIASED_WITH_OTHER_FACTORS"));
  });

  it("domain shift: comparisons grouped per factor, audit apart, energy tests", () => {
    const factors = extractDomainShift(view, "nir");
    const instrument = factors.find((f) => f.factor === "instrument")!;
    expect(instrument.levels.map((l) => l.level)).toEqual(["A", "B"]);
    expect(instrument.comparisons.map((c) => c.targetDomain)).toEqual(["A", "B"]);
    expect(instrument.comparisons[0]).toMatchObject({ referenceDomains: ["B"], nReference: 10, nTarget: 14, centroidDistance: 0.0905, beyondEitherFraction: 0.7857142857142857, medianDifference: -0.8200000000000003 });
    expect(instrument.test).toMatchObject({ pValueHolm: 0.002, rejects: true });
    expect(factors.find((f) => f.factor === "operator")?.design?.reasonCode).toBe("SINGLE_DOMAIN_LEVEL");
    const audit = factors.find((f) => f.audit)!;
    expect(audit.factor).toBe("partition");
    expect(audit.comparisons[0]!.unavailable["domain_shift.target_change"]?.reasonCode).toBe("RETAINED_TEST_Y_NEVER_READ");
    expect(extractDomainShiftFamilies(view, "nir").map((f) => f.family)).toEqual(["domain_factors", "external_domain_audit"]);
  });

  it("metadata associations: effect sizes paired with their permutation test", () => {
    const rows = extractAssociations(view);
    expect(rows).toHaveLength(8);
    const campaign = rows.find((r) => r.targetId === "protein" && r.metadata === "campaign")!;
    expect(campaign).toMatchObject({ effectSizeName: "eta_squared", levels: expect.any(Array) });
    expect(campaign.test).toMatchObject({ pValue: 0.001, pValueHolm: 0.007, rejects: true, pValueBhExploratory: 0.0035 });
    const grade = rows.find((r) => r.targetId === "grade" && r.metadata === "instrument")!;
    expect(grade.test?.state).toEqual({ status: "insufficient_data", reasonCode: "PERMUTATION_RESOLUTION_INSUFFICIENT" });
    expect(extractAssociationFamily(view)).toEqual({ alpha: 0.05, size: 7, holmAvailable: true });
  });

  it("validation probe: scores, OOF rows, folds and domains; scaled R²/skill kept exact", () => {
    const [p] = extractProbes(view);
    expect(p).toMatchObject({ sourceId: "nir", targetId: "protein", estimator: "pls", unit: "%", outerSplits: 5, rmse: 0.4088438473219422, trainMeanRmse: 2.277764974980957 });
    expect(p!.r2).toEqual({ kind: "double", value: 0.9578799262634762 });
    expect(p!.oof?.observed).toHaveLength(20);
    expect(p!.folds).toHaveLength(5);
    expect(p!.folds[0]).toMatchObject({ foldId: "fold0", nEval: 4, selectedComponents: 3 });
    expect(p!.domains.map((d) => d.campaign)).toEqual(["2025-03", "2025-09"]);
    const probes = extractProbes(extended);
    expect(probes.map((x) => x.targetId)).toEqual(["protein", "moisture"]);
    expect(probes[0]!.r2).toEqual({ kind: "scaled", significand: -0.5948083648714592, exponent: 1020 });
    expect(probes[0]!.domains[0]!.skill?.kind).toBe("scaled");
    expect(probes[1]!.state).toEqual({ status: "insufficient_data", reasonCode: "FEWER_THAN_THREE_INDEPENDENT_GROUPS" });
    expect(Object.keys(probes[1]!.unavailable)).toHaveLength(10);
  });

  it("SNV and balanced repeats against the canonical structure", () => {
    const [snv, balanced] = extractStructureSensitivity(view, "nir");
    expect(snv).toMatchObject({ id: "structure.snv_sensitivity", numericallyResolved: true, deltaEffectiveDimension: 0.1793667372954173 });
    expect(snv!.compared?.effectiveDimension).toBeCloseTo(1.2697, 4);
    expect(snv!.snvEigenvalues).toHaveLength(10);
    expect(balanced).toMatchObject({ id: "structure.balanced_repeat_sensitivity", rStar: 1 });
    expect(balanced!.repeatHistogram).toEqual([{ r: 1, nSamples: 1 }, { r: 2, nSamples: 8 }, { r: 3, nSamples: 11 }, { r: 4, nSamples: 4 }]);
    expect(extractStructureSensitivity(view, "vis")[0]!.state.reasonCode).toBe("SNV_VARIANCE_NOT_NUMERICALLY_RESOLVED");
  });

  it("repeatability intervals join their context; REML replaces an unbalanced ICC(1,1)", () => {
    const u = extractRepeatabilityUncertainty(view, "nir");
    const a = u.find((c) => c.id === "rescan · A · 2026-03")!;
    expect(a.sdInterval?.method).toBe("measurement.repeatability_sd_ci_chi_square");
    expect(a.unavailable["measurement.icc_1_1_ci_exact_f"]?.reasonCode).toBe("NO_BALANCED_BAND");
    expect(a.repeatCounts?.histogram).toHaveLength(4);
    const contexts = withRepeatabilityUncertainty(extractRepeatability(view, "nir"), u);
    const ctx = contexts.find((c) => c.id === "rescan · A · 2026-03")!;
    expect(ctx.iccKind).toBe("icc_1_reml");
    expect(ctx.icc).toHaveLength(12);
    expect(ctx.iccInterval).not.toBeNull();
    const html = renderToStaticMarkup(<RepeatabilityProfile axis={Array.from({ length: 12 }, (_, i) => 1100 + i * 127.27)} contexts={contexts} title="R" locale="en" />);
    expect(html).toContain("n4q-band");
    expect(html).toContain("REML ICC(1)");
    expect(html).toContain("Confidence interval");
  });

  it("noise proxy and duplicate checks", () => {
    expect(extractNoiseProxy(view, "nir")[0]).toMatchObject({ id: "A · 2026-03", pooled: 0.0014979076450138554, windowBands: 5 });
    const dups = extractDuplicates(view, "nir");
    expect(dups.find((d) => d.id === "integrity.cross_partition_quasi_duplicate_pairs" && d.state.status === "computed")).toMatchObject({ pairs: 2, tolerance: 0.005, toleranceUnit: "absorbance" });
    const conflicts = dups.find((d) => d.id === "reference.quasi_duplicate_conflicts" && d.targetId === "protein")!;
    expect(conflicts).toMatchObject({ pairs: 2, candidatePairs: 3 });
    expect(conflicts.listed[1]).toMatchObject({ a: "s07", b: "s15", referenceA: 11.8, referenceB: 13.1 });
    expect(dups.some((d) => d.id === "reference.within_physical_sample_conflicts")).toBe(true);
  });

  it("lists the unavailable metrics of a block and detects absent blocks", () => {
    expect(hasBlock(view, ["clustering."])).toBe(true);
    expect(hasBlock(view, ["network."])).toBe(false);
    expect(unavailableMetrics(view, ["clustering."], "vis")).toHaveLength(7);
  });
});

describe("block components", () => {
  it("measure bars: values, intervals, comparison marker and explicit gaps", () => {
    const html = renderToStaticMarkup(
      <MeasureBars
        rows={[{ id: "a", label: "Cluster 0", value: 0.94, low: 0.7, high: 1, compare: 1, note: "47/50" }, { id: "b", label: "Cluster 1", value: null }]}
        title="Appearance"
        valueLabel="scaled"
        intervalLabel="IQR"
        compareLabel="constant"
        format="fraction"
        reference={{ value: 0.8, label: "threshold" }}
        locale="en"
      />,
    );
    expect(html).toContain("Cluster 0: scaled 94 %, IQR 70 %–100 %, constant 100 %, 47/50");
    expect(html).toContain("no value");
    expect(html).toContain("threshold (80%)");
  });

  it("hypothesis tests: decision in text, status for non-computed tests", () => {
    const html = renderToStaticMarkup(
      <HypothesisTestTable
        caption="PERMANOVA"
        alpha={0.05}
        locale="en"
        rows={[
          { id: "1", effect: "instrument", test: "marginal", status: "computed", statistic: { label: "pseudo-F", value: 35.96 }, effectSize: { label: "R²", value: 0.666 }, pValue: 0.001, pAdjusted: 0.006, rejects: true },
          { id: "2", effect: "campaign", test: "conditional", status: "not_identifiable", reasonCode: "FACTOR_ALIASED_WITH_OTHER_FACTORS" },
        ]}
      />,
    );
    expect(html).toContain("H0 rejected");
    expect(html).toMatch(/\(α = (<!-- -->)?0\.05(<!-- -->)?\)/);
    expect(html).toContain("FACTOR_ALIASED_WITH_OTHER_FACTORS");
    expect(html).toContain('data-rejects="true"');
  });

  it("comparison matrix: per-column bars, ratios centred on 1, explicit n/a", () => {
    const html = renderToStaticMarkup(
      <ComparisonMatrix
        caption="Shift"
        rowHeader="Domain"
        locale="en"
        columns={[{ id: "d", label: "Centre" }, { id: "r", label: "Ratio", format: "ratio" }, { id: "c", label: "Beyond", format: "fraction" }]}
        rows={[{ id: "A", label: "A", cells: { d: 0.09, r: 0.86, c: 0.79 } }, { id: "B", label: "B", cells: { d: 0.02, r: null, c: 0 } }]}
      />,
    );
    expect(html).toContain("79 %");
    expect(html).toContain('data-centred="true"');
    expect(html).toContain('data-below="true"');
    expect(html).toContain("not available");
  });

  it("replicate histogram: counts, null replicates apart, observed line", () => {
    const c = extractClustering(view, "nir")!;
    const html = renderToStaticMarkup(<ReplicateHistogram values={[...c.nullModel!.replicates, null]} observed={c.nullModel!.observed} observedNote="tail 0.02" title="Null" valueLabel="stability" locale="en" />);
    expect(html).toContain("99 replicates");
    expect(html).toContain("1 no value");
    expect(html).toContain("Observed 0.75");
  });

  it("score map keeps fixed group colours (noise grey) and palette order for the others", () => {
    const colors = scoreGroupColors([{ id: "1", x: 0, y: 0, group: "Noise" }, { id: "2", x: 1, y: 1, group: "Group 0" }], { Noise: "#94a3b8" });
    expect(colors.get("Noise")).toBe("#94a3b8");
    expect(colors.get("Group 0")).toBe(scoreGroupColors([{ id: "2", x: 1, y: 1, group: "Group 0" }]).get("Group 0"));
  });

  it("score map draws the identity line on a shared extent", () => {
    const html = renderToStaticMarkup(<ScoreMap points={[{ id: "a", x: 1, y: 2 }, { id: "b", x: 3, y: 2.5 }]} identityLine xLabel="observed" yLabel="predicted" title="OOF" locale="en" />);
    expect(html).toContain("n4q-identity");
  });
});
