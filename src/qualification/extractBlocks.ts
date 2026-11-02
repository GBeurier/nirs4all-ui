// Pure selectors for the 0.1.0 capability blocks (clustering, confounding, domain shift,
// metadata associations, validation probe, SNV, repeatability uncertainty, quasi-duplicates).
// No statistics: every number is an engine output; selectors only read, pair and type them.
import { parseEngineNumber, type EngineNumber } from './engineNumber.js';
import type { RepeatabilityContext } from './extract.js';
import type { AvailabilityStatus, QualificationMetricView, QualificationReportView } from './types.js';

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (isNumber(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const rec = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => arr(v).map(String);
const numbersOrNull = (v: unknown): (number | null)[] => arr(v).map(num);

/** Availability of one engine metric (computed or not), with its reason. */
export interface MetricState {
  status: AvailabilityStatus;
  reasonCode: string | null;
}

const state = (m: QualificationMetricView): MetricState => ({ status: m.status, reasonCode: m.reasonCode });

/** Engine (Methods) summary of a replicate series: `{count, min, q25, median, q75, max, mean}`. */
export interface ReplicateSummary {
  count: number;
  min: number | null;
  q25: number | null;
  median: number | null;
  q75: number | null;
  max: number | null;
  mean: number | null;
}

export function readSummary(v: unknown): ReplicateSummary | null {
  if (!isRecord(v) || !isNumber(v.count)) return null;
  return { count: v.count, min: num(v.min), q25: num(v.q25), median: num(v.median), q75: num(v.q75), max: num(v.max), mean: num(v.mean) };
}

const metricsOf = (view: QualificationReportView, id: string, sourceId?: string | null) =>
  view.metrics.filter((m) => m.id === id && (sourceId === undefined || m.sourceId === sourceId));

/** Metrics of one block that are not computed (for the "why not" list of a section). */
export function unavailableMetrics(view: QualificationReportView, prefixes: readonly string[], sourceId?: string | null): QualificationMetricView[] {
  return view.metrics.filter((m) => m.status !== 'computed' && prefixes.some((p) => m.id.startsWith(p)) && (sourceId === undefined || m.sourceId === sourceId || m.sourceId === null));
}

/** True when the report carries at least one metric of the block (any status). */
export function hasBlock(view: QualificationReportView, prefixes: readonly string[]): boolean {
  return view.metrics.some((m) => prefixes.some((p) => m.id.startsWith(p)));
}

// --- clustering ------------------------------------------------------------------------------

export interface ClusterPartition {
  sampleIds: string[];
  aggregationKeys: string[];
  /** HDBSCAN labels; -1 (the published noise label) = noise */
  labels: number[];
  membership: (number | null)[];
  outlierScores: (number | null)[];
  noiseLabel: number;
  minClusterSize: number | null;
}

export interface ClusterInfo {
  label: number;
  nMembers: number | null;
  persistence: number | null;
  stability: number | null;
}

export interface SubsampleStability {
  ari: ReplicateSummary | null;
  assignedInBothFraction: ReplicateSummary | null;
  noiseAgreement: ReplicateSummary | null;
  clusterCount: ReplicateSummary | null;
  noiseFraction: ReplicateSummary | null;
  nSubsamples: number | null;
  nAriEvaluable: number | null;
  parameterPolicy: string | null;
}

export interface ClusterAppearance {
  label: number;
  frequency: number | null;
  nAppeared: number | null;
  nEvaluable: number | null;
  nMembers: number | null;
  matchedJaccard: ReplicateSummary | null;
}

export interface AssessmentCriterion {
  id: string;
  passed: boolean | null;
  value: number | boolean | null;
  threshold: number | null;
}

export interface ClusteringResult {
  sourceId: string;
  partitionState: MetricState | null;
  partition: ClusterPartition | null;
  candidateCount: number | null;
  noiseFraction: number | null;
  nNoise: number | null;
  nEligible: number | null;
  clusters: ClusterInfo[];
  stability: { scaled: SubsampleStability | null; constant: SubsampleStability | null };
  appearance: { scaled: ClusterAppearance[]; constant: ClusterAppearance[]; threshold: number | null };
  nullModel: {
    statistic: string | null;
    observed: number | null;
    tailFraction: number | null;
    threshold: number | null;
    decisional: boolean | null;
    resolution: number | null;
    /** per-replicate values of the null statistic, in replicate order */
    replicates: (number | null)[];
    fractionWithTwoClusters: number | null;
    nReplicates: number | null;
  } | null;
  assessment: { verdict: string | null; criteria: AssessmentCriterion[]; ruleVersion: string | null } | null;
}

function readStability(m: QualificationMetricView | undefined): SubsampleStability | null {
  if (!m || m.status !== 'computed' || !isRecord(m.value)) return null;
  const v = m.value;
  return {
    ari: readSummary(v.ari_assigned_in_both),
    assignedInBothFraction: readSummary(v.assigned_in_both_fraction_of_eligible),
    noiseAgreement: readSummary(v.assigned_noise_agreement),
    clusterCount: readSummary(v.cluster_count),
    noiseFraction: readSummary(v.noise_fraction),
    nSubsamples: m.denominators.n_subsamples ?? null,
    nAriEvaluable: m.denominators.n_ari_evaluable_subsamples ?? null,
    parameterPolicy: str(m.parameters.parameter_policy),
  };
}

function readAppearance(m: QualificationMetricView | undefined): ClusterAppearance[] {
  if (!m || m.status !== 'computed' || !isRecord(m.value)) return [];
  return arr(m.value.clusters).filter(isRecord).map((c) => ({
    label: num(c.label) ?? -1,
    frequency: num(c.appearance_frequency),
    nAppeared: num(c.n_appeared),
    nEvaluable: num(c.n_evaluable_subsamples),
    nMembers: num(c.n_members),
    matchedJaccard: readSummary(c.matched_jaccard),
  }));
}

/** Clustering block of one source (null when the report has no clustering metric for it). */
export function extractClustering(view: QualificationReportView, sourceId: string): ClusteringResult | null {
  const one = (id: string) => metricsOf(view, id, sourceId)[0];
  const partitionMetric = one('clustering.partition');
  if (!partitionMetric) return null;
  const pv = partitionMetric.status === 'computed' && isRecord(partitionMetric.value) ? partitionMetric.value : null;
  const partition: ClusterPartition | null = pv
    ? {
        sampleIds: strings(pv.sample_ids),
        aggregationKeys: strings(pv.aggregation_keys),
        labels: arr(pv.labels).map((l) => num(l) ?? -1),
        membership: numbersOrNull(pv.membership),
        outlierScores: numbersOrNull(pv.outlier_scores),
        noiseLabel: num(partitionMetric.parameters.noise_label) ?? -1,
        minClusterSize: num(partitionMetric.parameters.min_cluster_size),
      }
    : null;
  const noise = one('clustering.noise_fraction');
  const clusters = one('clustering.clusters');
  const appearance = one('clustering.cluster_appearance_frequency');
  const nullModel = one('clustering.gaussian_null_model');
  const assessment = one('clustering.partition_assessment');
  const nv = nullModel?.status === 'computed' && isRecord(nullModel.value) ? nullModel.value : null;
  const tail = rec(nv?.fitted_null_tail);
  const statistic = str(tail.statistic);
  const av = assessment?.status === 'computed' && isRecord(assessment.value) ? assessment.value : null;
  return {
    sourceId,
    partitionState: state(partitionMetric),
    partition,
    candidateCount: one('clustering.candidate_cluster_count')?.status === 'computed' ? num(one('clustering.candidate_cluster_count')?.value) : null,
    noiseFraction: noise?.status === 'computed' ? num(noise.value) : null,
    nNoise: noise?.denominators.n_noise ?? null,
    nEligible: partitionMetric.denominators.n_eligible_samples ?? null,
    clusters: clusters?.status === 'computed'
      ? arr(clusters.value).filter(isRecord).map((c) => ({ label: num(c.label) ?? -1, nMembers: num(c.n_members), persistence: num(c.persistence), stability: num(c.stability) }))
      : [],
    stability: { scaled: readStability(one('clustering.subsample_stability')), constant: readStability(one('clustering.subsample_stability_constant_parameters')) },
    appearance: {
      scaled: readAppearance(appearance),
      constant: readAppearance(one('clustering.cluster_appearance_frequency_constant_parameters')),
      threshold: appearance ? num(appearance.parameters.appearance_threshold) : null,
    },
    nullModel: nv
      ? {
          statistic,
          observed: num(tail.observed),
          tailFraction: num(tail.tail_fraction),
          threshold: num(tail.threshold),
          decisional: bool(tail.decisional),
          resolution: num(tail.resolution),
          replicates: statistic ? arr(nv.per_replicate).map((r) => num(rec(r)[statistic])) : [],
          fractionWithTwoClusters: num(rec(nv.null).fraction_with_at_least_two_clusters),
          nReplicates: nullModel?.denominators.n_replicates ?? null,
        }
      : null,
    assessment: av
      ? {
          verdict: str(av.assessment),
          ruleVersion: str(assessment?.parameters.rule_version),
          criteria: Object.entries(rec(av.criteria)).map(([id, c]) => {
            const r = rec(c);
            return { id, passed: bool(r.passed), value: isNumber(r.value) || typeof r.value === 'boolean' ? r.value : null, threshold: num(r.threshold) };
          }),
        }
      : null,
  };
}

// --- domain shift ----------------------------------------------------------------------------

export interface DomainComparison {
  key: string;
  factor: string;
  comparison: string | null;
  targetDomain: string;
  referenceDomains: string[];
  /** retained-test X audit (never reads retained-test Y) */
  audit: boolean;
  nReference: number | null;
  nTarget: number | null;
  centroidDistance: number | null;
  subspaceDistance: number | null;
  residualDistance: number | null;
  hotellingT2: number | null;
  varianceRatio: number | null;
  energy: number | null;
  energyInterval: [number, number] | null;
  beyondEitherFraction: number | null;
  beyondT2Fraction: number | null;
  beyondQFraction: number | null;
  nominalFraction: number | null;
  medianDifference: number | null;
  targetOutsideRangeFraction: number | null;
  targetUnit: string | null;
  /** not-computed measures of this comparison, by metric id */
  unavailable: Record<string, MetricState>;
}

export interface DomainShiftTest {
  state: MetricState;
  statistic: number | null;
  pValue: number | null;
  pValueConservative: number | null;
  pValueHolm: number | null;
  rejects: boolean | null;
  nPermutations: number | null;
  family: string | null;
}

export interface DomainShiftFactor {
  factor: string;
  audit: boolean;
  design: MetricState | null;
  levels: { level: string; nUnits: number | null }[];
  comparisons: DomainComparison[];
  test: DomainShiftTest | null;
}

const COMPARISON_IDS = ['domain_shift.center_shift', 'domain_shift.dispersion', 'domain_shift.distribution_distance', 'domain_shift.coverage', 'domain_shift.target_change'] as const;

/** Domain-shift block of one source, grouped by factor (the retained-test audit is factor `partition`). */
export function extractDomainShift(view: QualificationReportView, sourceId: string): DomainShiftFactor[] {
  const factors = new Map<string, DomainShiftFactor>();
  const factorOf = (m: QualificationMetricView) => str(m.parameters.factor) ?? '—';
  const isAudit = (m: QualificationMetricView) => typeof m.parameters.test_access === 'string' || m.parameters.comparison === 'development_vs_retained_test';
  const get = (m: QualificationMetricView) => {
    const key = factorOf(m);
    let f = factors.get(key);
    if (!f) {
      f = { factor: key, audit: isAudit(m), design: null, levels: [], comparisons: [], test: null };
      factors.set(key, f);
    }
    return f;
  };
  for (const m of view.metrics) {
    if (m.sourceId !== sourceId || !m.id.startsWith('domain_shift.') || m.id === 'domain_shift.test_family') continue;
    const f = get(m);
    if (m.id === 'domain_shift.design') {
      f.design = state(m);
      if (m.status === 'computed') f.levels = arr(rec(m.value).levels).filter(isRecord).map((l) => ({ level: String(l.level), nUnits: num(rec(l.composition).n_units) }));
    } else if (m.id === 'domain_shift.energy_test') {
      const v = rec(m.value);
      const plan = rec(m.parameters.permutation_plan);
      f.test = {
        state: state(m),
        statistic: num(v.statistic) ?? num(m.parameters.energy_statistic),
        pValue: num(v.p_value),
        pValueConservative: num(v.p_value_conservative),
        pValueHolm: num(v.p_value_holm),
        rejects: bool(v.rejects_null_at_family_alpha),
        nPermutations: num(plan.n_permutations_executed),
        family: str(m.parameters.family),
      };
    } else if ((COMPARISON_IDS as readonly string[]).includes(m.id)) {
      const target = str(m.parameters.target_domain) ?? '—';
      const refs = strings(m.parameters.reference_domains);
      const key = `${f.factor}|${target}|${refs.join(',')}`;
      let c = f.comparisons.find((x) => x.key === key);
      if (!c) {
        c = {
          key, factor: f.factor, comparison: str(m.parameters.comparison), targetDomain: target, referenceDomains: refs, audit: isAudit(m),
          nReference: m.denominators.n_reference_units ?? null, nTarget: m.denominators.n_target_units ?? null,
          centroidDistance: null, subspaceDistance: null, residualDistance: null, hotellingT2: null, varianceRatio: null, energy: null, energyInterval: null,
          beyondEitherFraction: null, beyondT2Fraction: null, beyondQFraction: null, nominalFraction: null, medianDifference: null, targetOutsideRangeFraction: null,
          targetUnit: null, unavailable: {},
        };
        f.comparisons.push(c);
      }
      if (m.status !== 'computed') {
        c.unavailable[m.id] = state(m);
        continue;
      }
      const v = rec(m.value);
      if (m.id === 'domain_shift.center_shift') {
        c.centroidDistance = num(v.centroid_distance);
        c.subspaceDistance = num(v.reference_subspace_distance);
        c.residualDistance = num(v.residual_distance);
        c.hotellingT2 = num(v.centroid_hotelling_t2);
      } else if (m.id === 'domain_shift.dispersion') {
        c.varianceRatio = num(v.variance_ratio);
      } else if (m.id === 'domain_shift.distribution_distance') {
        c.energy = num(v.energy_e);
        const [lo = null, hi = null] = numbersOrNull(v.energy_e_interval);
        c.energyInterval = lo !== null && hi !== null ? [lo, hi] : null;
      } else if (m.id === 'domain_shift.coverage') {
        c.beyondEitherFraction = num(v.fraction_target_beyond_either_limit);
        c.beyondT2Fraction = num(v.fraction_target_beyond_t2_limit);
        c.beyondQFraction = num(v.fraction_target_beyond_q_limit);
        c.nominalFraction = num(v.nominal_fraction_per_limit);
      } else if (m.id === 'domain_shift.target_change') {
        c.medianDifference = num(v.median_difference);
        c.targetOutsideRangeFraction = num(v.fraction_target_outside_reference_range);
        c.targetUnit = str(rec(m.parameters.value_units).median_difference);
      }
    }
  }
  return [...factors.values()];
}

/** Holm family of a source's domain-shift tests (development factors or the audit). */
export function extractDomainShiftFamilies(view: QualificationReportView, sourceId: string): { family: string | null; alpha: number | null; holmAvailable: boolean | null; size: number | null }[] {
  return metricsOf(view, 'domain_shift.test_family', sourceId).filter((m) => m.status === 'computed').map((m) => {
    const v = rec(m.value);
    return { family: str(m.parameters.family), alpha: num(v.family_alpha), holmAvailable: bool(v.holm_available), size: num(v.family_size) };
  });
}


// --- validation probe ------------------------------------------------------------------------

export interface ProbeDomainScore {
  instrument: string | null;
  campaign: string | null;
  nSamples: number | null;
  rmse: number | null;
  mae: number | null;
  trainMeanRmse: number | null;
  trainMeanMae: number | null;
  /** plain double or scaled `significand × 2^exponent` (see engineNumber) */
  skill: EngineNumber | null;
}

export interface ProbeFold {
  foldId: string;
  nFit: number;
  nEval: number;
  selectedComponents: number | null;
  trainMean: number | null;
  innerRmseByComponents: { components: number; rmse: number | null }[];
}

export interface ProbeResult {
  sourceId: string;
  targetId: string;
  /** state of `probe.rmse` (the headline score) */
  state: MetricState;
  unit: string | null;
  estimator: string | null;
  outerSplits: number | null;
  innerSplits: number | null;
  componentGrid: number[];
  plannedFits: number | null;
  nFits: number | null;
  nSamples: number | null;
  rmse: number | null;
  mae: number | null;
  trainMeanRmse: number | null;
  trainMeanMae: number | null;
  r2: EngineNumber | null;
  skill: EngineNumber | null;
  /** not-computed score metrics by id (e.g. r2 undefined with a zero denominator) */
  unavailable: Record<string, MetricState>;
  oof: { sampleIds: string[]; observed: (number | null)[]; predicted: (number | null)[]; trainMean: (number | null)[]; foldIds: string[] } | null;
  folds: ProbeFold[];
  domains: ProbeDomainScore[];
}

/** Validation-probe results, one per source × target × estimator present in the report (report order). */
export function extractProbes(view: QualificationReportView): ProbeResult[] {
  const est = (m: QualificationMetricView) => str(m.parameters.estimator) ?? '';
  const keyOf = (m: QualificationMetricView) => `${m.sourceId ?? ''}\u0000${m.targetId ?? ''}\u0000${est(m)}`;
  const probeMetrics = view.metrics.filter((m) => m.id.startsWith('probe.'));
  const keys = [...new Set(probeMetrics.map(keyOf))];
  return keys.map((key) => {
    const [sourceId = '', targetId = '', estimator = ''] = key.split('\u0000');
    const mine = probeMetrics.filter((m) => keyOf(m) === key);
    const of = (id: string) => mine.find((m) => m.id === id);
    const val = (id: string) => (of(id)?.status === 'computed' ? of(id)?.value : null);
    const headline = of('probe.rmse') ?? of('probe.plan');
    const plan = of('probe.plan');
    const pv = rec(val('probe.plan'));
    const oof = val('probe.oof_predictions');
    const unavailable: Record<string, MetricState> = {};
    for (const m of mine) if (m.status !== 'computed') unavailable[m.id] = state(m);
    return {
      sourceId,
      targetId,
      state: headline ? state(headline) : { status: 'error', reasonCode: null },
      unit: of('probe.rmse')?.unit ?? of('probe.oof_predictions')?.unit ?? null,
      estimator: estimator || null,
      outerSplits: num(pv.outer_splits) ?? num(plan?.parameters.outer_splits),
      innerSplits: num(pv.inner_splits) ?? num(plan?.parameters.inner_splits),
      componentGrid: arr(pv.component_grid).filter(isNumber),
      plannedFits: num(pv.planned_fits),
      nFits: num(plan?.parameters.n_fits),
      nSamples: headline?.denominators.n_samples ?? null,
      rmse: num(val('probe.rmse')),
      mae: num(val('probe.mae')),
      trainMeanRmse: num(val('probe.train_mean_rmse')),
      trainMeanMae: num(val('probe.train_mean_mae')),
      r2: parseEngineNumber(val('probe.r2_oof')),
      skill: parseEngineNumber(val('probe.skill_vs_train_mean')),
      unavailable,
      oof: isRecord(oof)
        ? { sampleIds: strings(oof.sample_ids), observed: numbersOrNull(oof.y_true), predicted: numbersOrNull(oof.prediction), trainMean: numbersOrNull(oof.train_mean_prediction), foldIds: strings(oof.fold_ids) }
        : null,
      folds: arr(val('probe.folds')).filter(isRecord).map((f) => ({
        foldId: String(f.fold_id),
        nFit: arr(f.fit_sample_ids).length,
        nEval: arr(f.eval_sample_ids).length,
        selectedComponents: num(f.selected_components),
        trainMean: num(f.train_mean),
        innerRmseByComponents: arr(f.inner_rmse_by_components).map((pair) => ({ components: num(arr(pair)[0]) ?? 0, rmse: num(arr(pair)[1]) })),
      })),
      domains: arr(val('probe.domain_scores')).filter(isRecord).map((d) => ({
        instrument: str(d.instrument),
        campaign: str(d.campaign),
        nSamples: num(d.n_samples),
        rmse: num(d.rmse),
        mae: num(d.mae),
        trainMeanRmse: num(d.train_mean_rmse),
        trainMeanMae: num(d.train_mean_mae),
        skill: parseEngineNumber(d.skill_vs_train_mean),
      })),
    };
  });
}

// --- confounding -----------------------------------------------------------------------------

/** One permutation test row (confounding, metadata association or domain shift). */
export interface PermutationTestView {
  factor: string;
  /** metric id of the test (e.g. `confounding.permanova_marginal_test`) */
  test: string;
  state: MetricState;
  statistic: number | null;
  statisticName: string | null;
  pValue: number | null;
  pValueHolm: number | null;
  rejects: boolean | null;
  multiplicityAvailable: boolean | null;
  nPermutations: number | null;
  restrictions: string | null;
  reducedModel: string | null;
}

export interface ConfoundingFactor {
  factor: string;
  levels: { level: string; nUnits: number | null }[];
  dfNominal: number | null;
  dfIdentifiableGivenOtherFactors: number | null;
  dfIdentifiableGivenOtherMainEffects: number | null;
  aliasedWithOtherFactorCells: boolean | null;
  identifiableUnderAdditiveModel: boolean | null;
  determinedBy: string[];
  partiallyConfounded: boolean | null;
}

export interface VarianceShare {
  factor: string;
  r2Marginal: number | null;
  r2UniqueGivenOtherFactors: number | null;
  r2UniqueGivenOtherMainEffects: number | null;
  pseudoFMarginal: number | null;
  reasonCode: string | null;
}

export interface ConfoundingResult {
  sourceId: string;
  design: MetricState | null;
  factors: ConfoundingFactor[];
  crossings: { factors: string[]; unitCounts: Record<string, Record<string, number>> }[];
  partition: { shares: VarianceShare[]; r2AllFactorCells: number | null; ssTotal: number | null; ssBinaryExponent: number | null; unit: string | null } | null;
  dispersion: { factor: string; state: MetricState; anovaF: number | null; levels: { level: string; meanDistance: number | null; nUnits: number | null }[] }[];
  tests: PermutationTestView[];
  families: { id: string; alpha: number | null; size: number | null; holmAvailable: boolean | null }[];
}

function readTest(m: QualificationMetricView): PermutationTestView {
  const v = rec(m.value);
  const plan = rec(m.parameters.permutation_plan);
  return {
    factor: str(m.parameters.factor) ?? str(m.parameters.metadata) ?? '—',
    test: m.id,
    state: state(m),
    statistic: num(v.statistic),
    statisticName: str(v.statistic_name),
    pValue: num(v.p_value),
    pValueHolm: num(v.p_value_holm),
    rejects: bool(v.rejects_null_at_family_alpha),
    multiplicityAvailable: bool(v.multiplicity_available),
    nPermutations: num(plan.n_permutations_executed),
    restrictions: str(plan.restrictions),
    reducedModel: str(plan.reduced_model),
  };
}

const TEST_IDS = ['confounding.permanova_marginal_test', 'confounding.permanova_conditional_test', 'confounding.permanova_freedman_lane_test', 'confounding.permdisp_test'];

/** Confounding block of one source (null when absent). */
export function extractConfounding(view: QualificationReportView, sourceId: string): ConfoundingResult | null {
  const mine = view.metrics.filter((m) => m.sourceId === sourceId && m.id.startsWith('confounding.'));
  if (!mine.length) return null;
  const design = mine.find((m) => m.id === 'confounding.design');
  const dv = design?.status === 'computed' ? rec(design.value) : {};
  const vp = mine.find((m) => m.id === 'confounding.variance_partition');
  const pv = vp?.status === 'computed' ? rec(vp.value) : null;
  return {
    sourceId,
    design: design ? state(design) : null,
    factors: arr(dv.factors).filter(isRecord).map((f) => ({
      factor: String(f.factor),
      levels: arr(f.levels).filter(isRecord).map((l) => ({ level: String(l.level), nUnits: num(l.n_units) })),
      dfNominal: num(f.df_nominal),
      dfIdentifiableGivenOtherFactors: num(f.df_identifiable_given_other_factors),
      dfIdentifiableGivenOtherMainEffects: num(f.df_identifiable_given_other_main_effects),
      aliasedWithOtherFactorCells: bool(f.aliased_with_other_factor_cells),
      identifiableUnderAdditiveModel: bool(f.identifiable_under_additive_model),
      determinedBy: strings(f.determined_by),
      partiallyConfounded: bool(f.partially_confounded),
    })),
    crossings: arr(dv.crossings).filter(isRecord).map((c) => ({
      factors: strings(c.factors),
      unitCounts: Object.fromEntries(Object.entries(rec(c.unit_counts)).map(([k, row]) => [k, Object.fromEntries(Object.entries(rec(row)).filter(([, n]) => isNumber(n))) as Record<string, number>])),
    })),
    partition: pv
      ? {
          shares: arr(pv.factors).filter(isRecord).map((f) => ({
            factor: String(f.factor),
            r2Marginal: num(f.r2_marginal),
            r2UniqueGivenOtherFactors: num(f.r2_unique_given_other_factors),
            r2UniqueGivenOtherMainEffects: num(f.r2_unique_given_other_main_effects),
            pseudoFMarginal: num(f.pseudo_f_marginal),
            reasonCode: str(f.reason_code),
          })),
          r2AllFactorCells: num(rec(pv.joint).r2_all_factor_cells),
          ssTotal: num(pv.ss_total),
          ssBinaryExponent: num(pv.ss_binary_exponent),
          unit: vp?.unit ?? null,
        }
      : null,
    dispersion: mine.filter((m) => m.id === 'confounding.dispersion').map((m) => {
      const v = rec(m.value);
      return {
        factor: str(m.parameters.factor) ?? '—',
        state: state(m),
        anovaF: num(v.anova_f),
        levels: arr(v.levels).filter(isRecord).map((l) => ({ level: String(l.level), meanDistance: num(l.mean_distance_to_centroid), nUnits: num(l.n_units) })),
      };
    }),
    tests: mine.filter((m) => TEST_IDS.includes(m.id)).map(readTest),
    families: mine.filter((m) => m.id.endsWith('_family') && m.status === 'computed').map((m) => {
      const v = rec(m.value);
      return { id: m.id, alpha: num(v.family_alpha), size: num(v.family_size), holmAvailable: bool(v.holm_available) };
    }),
  };
}

// --- metadata associations -------------------------------------------------------------------

export interface MetadataAssociation {
  targetId: string;
  metadata: string;
  metadataKind: string | null;
  associationType: string | null;
  metadataUnit: string | null;
  /** descriptive association (`association.metadata_target`) */
  state: MetricState;
  effectSize: number | null;
  effectSizeName: string | null;
  statistic: number | null;
  statisticName: string | null;
  /** categorical metadata: per-level target summaries / counts */
  levels: { level: string; nUnits: number | null; target: ReplicateSummary | null }[];
  /** permutation test (`association.metadata_target_test`) */
  test: (PermutationTestView & { pValueBhExploratory: number | null }) | null;
}

/** Metadata–target associations, one row per target × metadata column, in report order. */
export function extractAssociations(view: QualificationReportView): MetadataAssociation[] {
  const out: MetadataAssociation[] = [];
  const keyOf = (m: QualificationMetricView) => `${m.targetId ?? '—'}\u0000${str(m.parameters.metadata) ?? '—'}`;
  for (const m of view.metrics) {
    if (m.id !== 'association.metadata_target') continue;
    const v = rec(m.value);
    out.push({
      targetId: m.targetId ?? '—',
      metadata: str(m.parameters.metadata) ?? '—',
      metadataKind: str(m.parameters.metadata_kind),
      associationType: str(m.parameters.association_type),
      metadataUnit: str(m.parameters.metadata_unit),
      state: state(m),
      effectSize: num(v.effect_size),
      effectSizeName: str(v.effect_size_name),
      statistic: num(v.statistic),
      statisticName: str(v.statistic_name),
      levels: arr(v.levels).filter(isRecord).map((l) => ({ level: String(l.level), nUnits: num(l.n_units), target: readSummary(l.target_summary) })),
      test: null,
    });
  }
  for (const m of view.metrics) {
    if (m.id !== 'association.metadata_target_test') continue;
    const row = out.find((a) => `${a.targetId}\u0000${a.metadata}` === keyOf(m));
    if (!row) continue;
    const t = readTest(m);
    const v = rec(m.value);
    row.test = { ...t, factor: row.metadata, statistic: num(v.effect_size), statisticName: str(v.effect_size_name), pValueBhExploratory: num(v.p_value_bh_exploratory) };
  }
  return out;
}

/** Holm family of the metadata–target tests (dataset scope). */
export function extractAssociationFamily(view: QualificationReportView): { alpha: number | null; size: number | null; holmAvailable: boolean | null } | null {
  const m = view.metrics.find((x) => x.id === 'association.metadata_target_family' && x.status === 'computed');
  if (!m) return null;
  const v = rec(m.value);
  return { alpha: num(v.family_alpha), size: num(v.family_size), holmAvailable: bool(v.holm_available) };
}

// --- SNV sensitivity / balanced repeats ------------------------------------------------------

/** Structure summary of one view (canonical, SNV or balanced repeats). */
export interface ViewStructure {
  effectiveDimension: number | null;
  firstComponentShare: number | null;
  retainedShare: number | null;
  eigenvalueShares: number[];
  nResolvedComponents: number | null;
}

const readView = (v: unknown): ViewStructure => {
  const r = rec(v);
  return {
    effectiveDimension: num(r.effective_dimension),
    firstComponentShare: num(r.first_component_share),
    retainedShare: num(r.retained_share),
    eigenvalueShares: arr(r.eigenvalue_shares).filter(isNumber),
    nResolvedComponents: num(r.n_resolved_components),
  };
};

export interface StructureComparison {
  /** metric id: `structure.snv_sensitivity` or `structure.balanced_repeat_sensitivity` */
  id: string;
  state: MetricState;
  reference: ViewStructure | null;
  compared: ViewStructure | null;
  deltaEffectiveDimension: number | null;
  deltaFirstComponentShare: number | null;
  deltaRetainedShare: number | null;
  /** SNV only: SNV-view eigenvalues and numerical-resolution decision */
  snvEigenvalues: number[] | null;
  snvTotalVariance: number | null;
  numericallyResolved: boolean | null;
  /** balanced repeats only: r* and the repeat-count histogram */
  rStar: number | null;
  repeatHistogram: { r: number; nSamples: number }[];
}

/** SNV and balanced-repeat sensitivities of a source's structure (raw view as reference). */
export function extractStructureSensitivity(view: QualificationReportView, sourceId: string): StructureComparison[] {
  return view.metrics.filter((m) => m.sourceId === sourceId && (m.id === 'structure.snv_sensitivity' || m.id === 'structure.balanced_repeat_sensitivity')).map((m) => {
    const v = m.status === 'computed' ? rec(m.value) : null;
    const snv = m.id === 'structure.snv_sensitivity';
    const eig = view.metrics.find((x) => x.id === 'structure.snv_pca_eigenvalues' && x.sourceId === sourceId && x.status === 'computed');
    return {
      id: m.id,
      state: state(m),
      reference: v ? readView(v.canonical) : null,
      compared: v ? readView(snv ? v.snv : v.balanced) : null,
      deltaEffectiveDimension: v ? num(v.delta_effective_dimension) : null,
      deltaFirstComponentShare: v ? num(v.delta_first_component_share) : null,
      deltaRetainedShare: v ? num(v.delta_retained_share) : null,
      snvEigenvalues: snv && eig ? arr(eig.value).filter(isNumber) : null,
      snvTotalVariance: snv ? num(m.parameters.snv_total_variance) : null,
      numericallyResolved: snv ? bool(m.parameters.numerically_resolved) : null,
      rStar: snv ? null : num(m.parameters.r_star),
      repeatHistogram: snv ? [] : arr(m.parameters.repeat_count_histogram).filter(isRecord).map((h) => ({ r: num(h.r) ?? 0, nSamples: num(h.n_samples) ?? 0 })),
    };
  });
}

// --- repeatability uncertainty / noise proxy -------------------------------------------------

export interface BandInterval {
  lower: (number | null)[];
  upper: (number | null)[];
  /** metric id the interval comes from */
  method: string;
  confidence: number | null;
}

export interface RepeatabilityUncertainty {
  /** `repeat_type · instrument · campaign` (same key as RepeatabilityContext.id) */
  id: string;
  repeatCounts: { histogram: { r: number; nGroups: number }[]; nGroups: number | null; nRepeatedGroups: number | null; rMin: number | null; rMedian: number | null; rMax: number | null } | null;
  sdInterval: BandInterval | null;
  /** REML ICC(1) per band (unbalanced designs, singletons included) */
  iccReml: (number | null)[] | null;
  iccInterval: BandInterval | null;
  unavailable: Record<string, MetricState>;
}

const contextId = (m: QualificationMetricView, sourceId: string, index: number) =>
  [str(m.parameters.repeat_type), str(m.parameters.instrument), str(m.parameters.campaign)].filter((x): x is string => x !== null).join(' · ') || `${sourceId}#${index + 1}`;

const readInterval = (m: QualificationMetricView): BandInterval | null => {
  if (m.status !== 'computed' || !isRecord(m.value)) return null;
  return { lower: numbersOrNull(m.value.lower), upper: numbersOrNull(m.value.upper), method: m.id, confidence: num(m.parameters.confidence) };
};

const UNCERTAINTY_IDS = ['measurement.repeat_counts', 'measurement.icc_1_reml', 'measurement.repeatability_sd_ci_chi_square', 'measurement.repeatability_sd_ci_cluster_bootstrap', 'measurement.icc_1_1_ci_exact_f', 'measurement.icc_1_reml_ci_cluster_bootstrap'];

/**
 * Repeatability uncertainty per technical context. SD intervals prefer the exact chi-square
 * one, then the cluster bootstrap; ICC intervals prefer the exact F one (balanced ICC(1,1)),
 * then the REML bootstrap. Contexts are keyed like `extractRepeatability`.
 */
export function extractRepeatabilityUncertainty(view: QualificationReportView, sourceId: string): RepeatabilityUncertainty[] {
  const out = new Map<string, RepeatabilityUncertainty>();
  view.metrics.filter((m) => m.sourceId === sourceId && UNCERTAINTY_IDS.includes(m.id)).forEach((m, i) => {
    const id = contextId(m, sourceId, i);
    let c = out.get(id);
    if (!c) {
      c = { id, repeatCounts: null, sdInterval: null, iccReml: null, iccInterval: null, unavailable: {} };
      out.set(id, c);
    }
    if (m.status !== 'computed') {
      c.unavailable[m.id] = state(m);
      return;
    }
    if (m.id === 'measurement.repeat_counts') {
      const v = rec(m.value);
      c.repeatCounts = {
        histogram: arr(v.histogram).filter(isRecord).map((h) => ({ r: num(h.r) ?? 0, nGroups: num(h.n_groups) ?? 0 })),
        nGroups: num(v.n_groups), nRepeatedGroups: num(v.n_repeated_groups), rMin: num(v.r_min), rMedian: num(v.r_median), rMax: num(v.r_max),
      };
    } else if (m.id === 'measurement.icc_1_reml') c.iccReml = numbersOrNull(m.value);
    else if (m.id === 'measurement.repeatability_sd_ci_chi_square') c.sdInterval = readInterval(m);
    else if (m.id === 'measurement.repeatability_sd_ci_cluster_bootstrap') c.sdInterval ??= readInterval(m);
    else if (m.id === 'measurement.icc_1_1_ci_exact_f') c.iccInterval = readInterval(m);
    else if (m.id === 'measurement.icc_1_reml_ci_cluster_bootstrap' && c.iccInterval?.method !== 'measurement.icc_1_1_ci_exact_f') c.iccInterval = readInterval(m);
  });
  return [...out.values()];
}

export interface NoiseProxyContext {
  id: string;
  unit: string | null;
  values: (number | null)[];
  pooled: number | null;
  nEvaluableBands: number | null;
  windowBands: number | null;
  polyorder: number | null;
}

/** Per-band noise proxy (Savitzky–Golay residual) per instrument × campaign context. */
export function extractNoiseProxy(view: QualificationReportView, sourceId: string): NoiseProxyContext[] {
  const out: NoiseProxyContext[] = [];
  view.metrics.forEach((m, i) => {
    if (m.id !== 'measurement.noise_proxy' || m.sourceId !== sourceId || m.status !== 'computed') return;
    const id = contextId(m, sourceId, i);
    const pooled = view.metrics.find((p) => p.id === 'measurement.noise_proxy_pooled' && p.sourceId === sourceId && p.status === 'computed' && contextId(p, sourceId, i) === id);
    out.push({
      id,
      unit: m.unit,
      values: numbersOrNull(m.value),
      pooled: pooled ? num(pooled.value) : null,
      nEvaluableBands: m.denominators.n_evaluable_bands ?? null,
      windowBands: num(m.parameters.window_bands),
      polyorder: num(m.parameters.polyorder),
    });
  });
  return out;
}

// --- quasi-duplicates and reference conflicts ------------------------------------------------

export interface PairListing {
  a: string;
  b: string;
  distance: number | null;
  referenceA?: number | null;
  referenceB?: number | null;
  difference?: number | null;
}

export interface DuplicateSummary {
  id: string;
  targetId: string | null;
  state: MetricState;
  /** suspect (quasi-identical) or incompatible pairs, by metric */
  pairs: number | null;
  candidatePairs: number | null;
  affectedFraction: number | null;
  tolerance: number | null;
  toleranceUnit: string | null;
  context: string | null;
  listed: PairListing[];
  truncated: boolean | null;
}

const DUP_IDS = ['integrity.quasi_duplicate_pairs', 'integrity.cross_partition_quasi_duplicate_pairs', 'reference.exact_duplicate_conflicts', 'reference.quasi_duplicate_conflicts', 'reference.within_physical_sample_conflicts'];

/** Quasi-duplicate searches and reference-conflict checks of a source (per-target ones included). */
export function extractDuplicates(view: QualificationReportView, sourceId: string): DuplicateSummary[] {
  return view.metrics.filter((m) => DUP_IDS.includes(m.id) && (m.sourceId === sourceId || (m.sourceId === null && m.id === 'reference.within_physical_sample_conflicts'))).map((m) => {
    const v = m.status === 'computed' ? rec(m.value) : {};
    const integrity = m.id.startsWith('integrity.');
    return {
      id: m.id,
      targetId: m.targetId,
      state: state(m),
      pairs: integrity ? (num(v.suspect_pairs) ?? arr(v.listed_pairs).length) : num(v.incompatible_sample_pairs),
      candidatePairs: integrity ? num(v.candidate_pairs) : num(v.compared_sample_pairs),
      affectedFraction: num(v.affected_development_fraction) ?? num(v.affected_sample_fraction),
      tolerance: num(m.parameters.tolerance) ?? num(m.parameters.contradiction_tolerance),
      toleranceUnit: str(m.parameters.tolerance_unit) ?? str(m.parameters.contradiction_tolerance_unit),
      context: str(m.parameters.context),
      listed: arr(v.listed_pairs).filter(isRecord).map((p) => (integrity
        ? { a: String(p.observation_a), b: String(p.observation_b), distance: num(p.rms_difference) }
        : { a: String(p.sample_a), b: String(p.sample_b), distance: num(p.min_rms_difference), referenceA: num(p.reference_a), referenceB: num(p.reference_b), difference: num(p.absolute_difference) ?? num(p.relative_difference) })),
      truncated: bool(v.listing_truncated),
    };
  });
}

/**
 * Adds the engine intervals to repeatability contexts (same context key). When ICC(1,1) is not
 * computed (unbalanced design), the REML ICC(1) becomes the ICC series, labelled as such.
 */
export function withRepeatabilityUncertainty(contexts: readonly RepeatabilityContext[], uncertainty: readonly RepeatabilityUncertainty[]): RepeatabilityContext[] {
  return contexts.map((c) => {
    const u = uncertainty.find((x) => x.id === c.id);
    if (!u) return c;
    const reml = c.icc === null && u.iccReml !== null;
    const iccInterval = u.iccInterval && (reml ? u.iccInterval.method === 'measurement.icc_1_reml_ci_cluster_bootstrap' : u.iccInterval.method === 'measurement.icc_1_1_ci_exact_f') ? u.iccInterval : null;
    return {
      ...c,
      icc: reml ? u.iccReml : c.icc,
      iccKind: reml ? 'icc_1_reml' : 'icc_1_1',
      sdInterval: u.sdInterval,
      iccInterval,
    };
  });
}

/** One per-observation intrinsic signature (Methods), with its native median and p95. */
export interface IntrinsicSignal {
  /** `<family>.<signal>`, e.g. `pca.pca_t2`, `events.spike_count`, `reference.rms` */
  id: string;
  state: MetricState;
  unit: string | null;
  /** observation-aligned; a null value is an observation the signal could not use */
  sampleIds: string[];
  observationIds: string[];
  values: (number | null)[];
  median: number | null;
  p95: number | null;
}

/** Intrinsic spectral signatures of one source (`options.intrinsic_qc`), or null when not requested. */
export interface IntrinsicSignatures {
  signals: Readonly<Record<string, IntrinsicSignal>>;
  /** computed dataset-level scalars, keyed `<family>.<name>` (e.g. `events.global_spike_count`) */
  globals: Readonly<Record<string, number>>;
}

export function extractIntrinsic(view: QualificationReportView, sourceId: string): IntrinsicSignatures | null {
  const metrics = view.metrics.filter((m) => m.sourceId === sourceId && m.id.startsWith('intrinsic.') && !m.id.endsWith('.protocol_evidence'));
  if (!metrics.length) return null;
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const signals: Record<string, IntrinsicSignal> = {};
  const globals: Record<string, number> = {};
  for (const m of metrics) {
    const key = m.id.slice('intrinsic.'.length);
    if (/_(median|p95)$/.test(key)) continue;
    if (/\.global_|\.observed_extrema_/.test(key)) {
      if (m.status === 'computed' && isNumber(m.value)) globals[key] = m.value;
      continue;
    }
    const v = rec(m.value);
    const summary = (suffix: string) => {
      const s = byId.get(`${m.id}_${suffix}`);
      return s && s.status === 'computed' ? num(s.value) : null;
    };
    signals[key] = {
      id: key,
      state: state(m),
      unit: m.unit,
      sampleIds: strings(v.sample_ids),
      observationIds: strings(v.observation_ids),
      values: numbersOrNull(v.values),
      median: summary('median'),
      p95: summary('p95'),
    };
  }
  return { signals, globals };
}
