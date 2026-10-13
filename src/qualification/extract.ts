// Pure selectors: typed chart inputs read from an already-built report view.
// No statistics: values are engine outputs, only counts are subtracted for display.
import type { QualificationMetricView, QualificationReportView } from './types.js';

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNullableNumberArray = (v: unknown): v is (number | null)[] => Array.isArray(v) && v.every((x) => x === null || isNumber(x));
const isNumberArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(isNumber);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** First computed metric matching id (and source/target when given). */
export function findComputed(
  view: QualificationReportView,
  id: string,
  where: { sourceId?: string | null; targetId?: string | null } = {},
): QualificationMetricView | null {
  return view.metrics.find((m) => m.id === id
    && m.status === 'computed'
    && (where.sourceId === undefined || m.sourceId === where.sourceId)
    && (where.targetId === undefined || m.targetId === where.targetId)) ?? null;
}

/** Numeric engine value of a computed metric, or null. */
export function computedNumber(view: QualificationReportView, id: string, where: { sourceId?: string | null; targetId?: string | null } = {}): number | null {
  const value = findComputed(view, id, where)?.value;
  return isNumber(value) ? value : null;
}

/** Distinct source / target ids that appear in metrics, in report order. */
export function reportSourceIds(view: QualificationReportView): string[] {
  return [...new Set(view.metrics.flatMap((m) => (m.sourceId === null ? [] : [m.sourceId])))];
}

export function reportTargetIds(view: QualificationReportView): string[] {
  return [...new Set(view.metrics.flatMap((m) => (m.targetId === null ? [] : [m.targetId])))];
}

export interface SamplePopulations {
  developmentReal: number | null;
  retainedTest: number | null;
  augmentedExcluded: number | null;
}

export function extractSamplePopulations(view: QualificationReportView): SamplePopulations {
  return {
    developmentReal: computedNumber(view, 'population.development_real_samples'),
    retainedTest: computedNumber(view, 'population.retained_test_samples'),
    augmentedExcluded: computedNumber(view, 'population.augmented_samples_excluded'),
  };
}

/** Observation accounting of one source, from integrity + structure denominators. */
export interface ObservationFlow {
  sourceId: string;
  sourceObservations: number;
  developmentObservations: number;
  excludedAmbiguousRepeat: number;
  excludedIncomplete: number;
  excludedMulticontext: number;
  /** aggregated structure units (null when the structure eligibility metric is absent) */
  structureUnits: number | null;
}

export function extractObservationFlow(view: QualificationReportView, sourceId: string): ObservationFlow | null {
  const dev = findComputed(view, 'integrity.development_observations', { sourceId });
  const total = dev?.denominators.n_observations_source;
  if (!dev || !isNumber(dev.value) || !isNumber(total)) return null;
  const eligible = findComputed(view, 'structure.eligible_samples', { sourceId });
  const d = eligible?.denominators ?? {};
  return {
    sourceId,
    sourceObservations: total,
    developmentObservations: dev.value,
    excludedAmbiguousRepeat: d.n_excluded_ambiguous_repeat_observations ?? 0,
    excludedIncomplete: d.n_excluded_incomplete_observations ?? 0,
    excludedMulticontext: d.n_excluded_multicontext_observations ?? 0,
    structureUnits: eligible && isNumber(eligible.value) ? eligible.value : null,
  };
}

export interface IntegritySummary {
  missingCells: number | null;
  totalCells: number | null;
  axisOrder: string | null;
  physicalDuplicatePairs: number | null;
  partitionDuplicatePairs: number | null;
}

export function extractIntegrity(view: QualificationReportView, sourceId: string): IntegritySummary {
  const missing = findComputed(view, 'integrity.missing_cells', { sourceId });
  const axis = findComputed(view, 'integrity.axis_order', { sourceId })?.value;
  return {
    missingCells: missing && isNumber(missing.value) ? missing.value : null,
    totalCells: missing?.denominators.n_cells ?? null,
    axisOrder: typeof axis === 'string' ? axis : null,
    physicalDuplicatePairs: computedNumber(view, 'integrity.cross_physical_exact_duplicate_pairs', { sourceId }),
    partitionDuplicatePairs: computedNumber(view, 'integrity.cross_partition_exact_duplicate_pairs', { sourceId }),
  };
}

/** One repeatability context (repeat type × instrument × campaign) with its paired ICC. */
export interface RepeatabilityContext {
  id: string;
  repeatType: string | null;
  instrument: string | null;
  campaign: string | null;
  unit: string | null;
  pooledSd: (number | null)[];
  icc: (number | null)[] | null;
  /** engine band status: 0 computed, 1 insufficient, 2 unbalanced, 3 zero total variance */
  bandStatus: number[];
  observations: number | null;
  physicalGroups: number | null;
}

const BAND_STATUS_KEY = 'band_status_0_icc_1_insufficient_2_unbalanced_3_zero_total';
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Computed repeatability contexts of a source; each ICC metric is emitted right after its SD metric. */
export function extractRepeatability(view: QualificationReportView, sourceId: string): RepeatabilityContext[] {
  const out: RepeatabilityContext[] = [];
  const metrics = view.metrics;
  metrics.forEach((m, i) => {
    if (m.id !== 'measurement.repeatability_sd' || m.sourceId !== sourceId || m.status !== 'computed' || !isNullableNumberArray(m.value)) return;
    const next = metrics[i + 1];
    const icc = next && next.id === 'measurement.icc_1_1' && next.sourceId === sourceId && next.status === 'computed' && isNullableNumberArray(next.value) ? next.value : null;
    const p = m.parameters;
    const status = p[BAND_STATUS_KEY];
    const parts = [str(p.repeat_type), str(p.instrument), str(p.campaign)].filter((x): x is string => x !== null);
    out.push({
      id: parts.join(' · ') || `${sourceId}#${out.length + 1}`,
      repeatType: str(p.repeat_type),
      instrument: str(p.instrument),
      campaign: str(p.campaign),
      unit: m.unit,
      pooledSd: m.value,
      icc,
      bandStatus: isNumberArray(status) ? status : m.value.map((v) => (v === null ? 1 : 0)),
      observations: m.denominators.n_observations ?? null,
      physicalGroups: m.denominators.n_physical_groups ?? null,
    });
  });
  return out;
}

export interface PcaStructure {
  sourceId: string;
  viewId: string;
  sampleIds: string[];
  aggregationKeys: string[];
  scores: number[][];
  eigenvalues: number[] | null;
  /** trace of the full centered covariance (sum of all eigenvalues), when reported */
  totalVariance: number | null;
  retainedFraction: number | null;
  effectiveDimension: number | null;
}

export function extractPca(view: QualificationReportView, sourceId: string): PcaStructure | null {
  const scores = findComputed(view, 'structure.pca_scores', { sourceId });
  const v = scores?.value;
  if (!scores || !isRecord(v) || !Array.isArray(v.sample_ids) || !Array.isArray(v.scores)) return null;
  const rows = v.scores.filter(isNumberArray);
  if (rows.length !== v.sample_ids.length) return null;
  const eig = findComputed(view, 'structure.pca_eigenvalues', { sourceId })?.value;
  const moments = findComputed(view, 'structure.full_variance_moments', { sourceId })?.value;
  return {
    sourceId,
    viewId: scores.viewId,
    sampleIds: v.sample_ids.map(String),
    aggregationKeys: Array.isArray(v.aggregation_keys) ? v.aggregation_keys.map(String) : [],
    scores: rows,
    eigenvalues: isNumberArray(eig) ? eig : null,
    totalVariance: isRecord(moments) && isNumber(moments.sum_eigenvalues) ? moments.sum_eigenvalues : null,
    retainedFraction: computedNumber(view, 'structure.explained_variance_retained', { sourceId }),
    effectiveDimension: computedNumber(view, 'structure.effective_dimension', { sourceId }),
  };
}

/** Engine (Methods) summary of a continuous target. */
export interface ContinuousSummary {
  count: number;
  min: number;
  q25: number;
  median: number;
  q75: number;
  max: number;
  mean: number;
  sampleSd: number | null;
}

export interface TargetOverview {
  targetId: string;
  unit: string | null;
  eligible: number | null;
  denominators: Readonly<Record<string, number>>;
  summary: ContinuousSummary | null;
  classCounts: Record<string, number> | null;
  /** local X→Y contrast per source, when computed */
  localContrast: { sourceId: string | null; value: number; k: number | null }[];
}

export function extractTarget(view: QualificationReportView, targetId: string): TargetOverview {
  const eligible = findComputed(view, 'target.exact_eligible_samples', { targetId });
  const dist = findComputed(view, 'target.continuous_distribution', { targetId });
  const classes = findComputed(view, 'target.class_counts', { targetId })?.value;
  const s = dist?.value;
  const summary = isRecord(s) && ['count', 'min', 'q25', 'median', 'q75', 'max', 'mean'].every((k) => isNumber(s[k]))
    ? {
        count: s.count as number,
        min: s.min as number,
        q25: s.q25 as number,
        median: s.median as number,
        q75: s.q75 as number,
        max: s.max as number,
        mean: s.mean as number,
        sampleSd: isNumber(s.sample_sd) ? s.sample_sd : null,
      }
    : null;
  return {
    targetId,
    unit: dist?.unit ?? null,
    eligible: eligible && isNumber(eligible.value) ? eligible.value : null,
    denominators: eligible?.denominators ?? {},
    summary,
    classCounts: isRecord(classes) && Object.values(classes).every(isNumber) ? (classes as Record<string, number>) : null,
    localContrast: view.metrics
      .filter((m) => m.id === 'local.global_contrast' && m.targetId === targetId && m.status === 'computed' && isNumber(m.value))
      .map((m) => ({ sourceId: m.sourceId, value: m.value as number, k: isNumber(m.parameters.k) ? m.parameters.k : null })),
  };
}
