// Pure adapter: engine report (snake_case JSON) -> display model. No numerical
// work: only validation of enums, null-preservation and counting for display.
import {
  AVAILABILITY_STATUSES,
  type AvailabilityStatus,
  type EngineReport,
  type ProfileStatus,
  type QualificationConfidence,
  type QualificationReportView,
  type QualificationSeverity,
  type QualificationMetricView,
  type QualificationValue,
} from './types.js';
import { AVAILABILITY_LABEL, METRIC_FAMILIES, QUALIFICATION_TEXT, metricLabel, type MetricFamily } from './locale.js';
import { loc, type Locale } from '../lab/locale.js';
import { formatEngineNumber, isScaledEngineNumber } from './engineNumber.js';

const PROFILE_STATUSES: readonly ProfileStatus[] = ['exploratory', 'partial', 'complete'];
const CONFIDENCES: readonly QualificationConfidence[] = ['unknown', 'low', 'medium', 'high'];
const SEVERITIES: readonly QualificationSeverity[] = ['info', 'warning', 'high', 'blocking'];

/** Unrecognised profile statuses degrade to the most conservative one. */
export function normalizeProfileStatus(value: string): ProfileStatus {
  return (PROFILE_STATUSES as readonly string[]).includes(value) ? (value as ProfileStatus) : 'exploratory';
}

/** Unrecognised availability statuses are shown as errors, never as computed. */
export function normalizeAvailability(value: string): AvailabilityStatus {
  return (AVAILABILITY_STATUSES as readonly string[]).includes(value) ? (value as AvailabilityStatus) : 'error';
}

/** Unrecognised confidence is "unknown": confidence is never invented. */
export function normalizeConfidence(value: string): QualificationConfidence {
  return (CONFIDENCES as readonly string[]).includes(value) ? (value as QualificationConfidence) : 'unknown';
}

/** Unrecognised severities are surfaced as warnings. */
export function normalizeSeverity(value: string): QualificationSeverity {
  return (SEVERITIES as readonly string[]).includes(value) ? (value as QualificationSeverity) : 'warning';
}

export function buildQualificationReportView(report: EngineReport): QualificationReportView {
  const counts = Object.fromEntries(AVAILABILITY_STATUSES.map((s) => [s, 0])) as Record<AvailabilityStatus, number>;
  const metrics = report.metrics.map((m) => {
    const status = normalizeAvailability(m.status);
    counts[status] += 1;
    return {
      id: m.metric_id,
      status,
      reasonCode: m.reason_code || null,
      scope: m.scope,
      sourceId: m.source_id ?? null,
      targetId: m.target_id ?? null,
      viewId: m.view_id,
      populationId: m.population_id,
      value: status === 'computed' ? (m.value ?? null) : null,
      unit: m.unit ?? null,
      denominators: { ...(m.denominators ?? {}) },
      parameters: { ...(m.parameters ?? {}) },
      protocolVersion: m.protocol_version,
    };
  });
  return {
    profileStatus: normalizeProfileStatus(report.profile_status),
    completion: report.status ?? null,
    provenance: {
      schemaVersion: report.schema_version,
      engineVersion: report.engine_version,
      protocolBundleVersion: report.protocol_bundle_version,
    },
    valid: report.validation ? report.validation.valid : null,
    issues: (report.validation?.issues ?? []).map((i) => ({ ...i })),
    metrics,
    findings: report.findings.map((f) => ({
      ruleId: f.rule_id,
      severity: normalizeSeverity(f.severity),
      confidence: normalizeConfidence(f.confidence),
      evidence: [...f.evidence],
      message: f.message,
      action: f.action,
    })),
    capabilities: report.capabilities.map((c) => ({
      id: c.capability_id,
      available: c.available,
      qualified: c.qualified,
      reason: c.reason ?? null,
    })),
    limitations: [...(report.limitations ?? [])],
    availabilityCounts: counts,
  };
}

/** Formats a metric value for display; null/undefined become an explicit "not available". */
export function formatQualificationValue(value: QualificationValue | undefined, locale: Locale = 'fr'): string {
  if (value === null || value === undefined) return loc(QUALIFICATION_TEXT.notAvailable, locale);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return loc(QUALIFICATION_TEXT.notAvailable, locale);
    // Counts are shown exactly; only non-integers are shortened for display.
    return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)));
  }
  if (typeof value === 'boolean') return loc(value ? QUALIFICATION_TEXT.yes : QUALIFICATION_TEXT.no, locale);
  if (typeof value === 'string') return value;
  if (isScaledEngineNumber(value)) return formatEngineNumber(value, locale) ?? loc(QUALIFICATION_TEXT.notAvailable, locale);
  return summarizeStructured(value, locale, 0);
}

const word = (key: keyof typeof QUALIFICATION_TEXT, locale: Locale, values: Record<string, number>) =>
  Object.entries(values).reduce((text, [k, v]) => text.replace(`{${k}}`, v.toLocaleString(locale)), loc(QUALIFICATION_TEXT[key], locale));
const MAX_LISTED = 4;

/** Readable summary of a structured value: counts, ranges and leading scalar fields, never raw JSON. */
function summarizeStructured(value: unknown, locale: Locale, depth: number): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString(locale) : (formatEngineNumber(value, locale) ?? '—');
  if (typeof value === 'boolean') return loc(value ? QUALIFICATION_TEXT.yes : QUALIFICATION_TEXT.no, locale);
  if (typeof value === 'string') return value;
  if (isScaledEngineNumber(value)) return formatEngineNumber(value, locale) ?? '—';
  if (Array.isArray(value)) {
    if (!value.length) return loc(QUALIFICATION_TEXT.empty, locale);
    if (value.every((v) => typeof v === 'number' || v === null)) {
      const finite = value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (value.length <= MAX_LISTED) return value.map((v) => summarizeStructured(v, locale, depth + 1)).join(' ; ');
      if (!finite.length) return word('nValues', locale, { n: value.length });
      return `${word('nValues', locale, { n: value.length })} (${summarizeStructured(Math.min(...finite), locale, depth + 1)} … ${summarizeStructured(Math.max(...finite), locale, depth + 1)})`;
    }
    if (value.every(Array.isArray)) return word('nTable', locale, { n: value.length, m: (value[0] as unknown[]).length });
    if (value.every((v) => typeof v === 'string') && value.length <= MAX_LISTED) return value.join(', ');
    return word('nEntries', locale, { n: value.length });
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return loc(QUALIFICATION_TEXT.empty, locale);
    if (depth > 0) return word('nFields', locale, { n: entries.length });
    const shown = entries.slice(0, MAX_LISTED - 1).map(([k, v]) => `${k}: ${summarizeStructured(v, locale, depth + 1)}`);
    const rest = entries.length - shown.length;
    return rest > 0 ? `${shown.join(' · ')} · ${word('more', locale, { n: rest })}` : shown.join(' · ');
  }
  return String(value);
}

/** Family of an engine metric id, from its protocol prefix. */
export function metricFamily(id: string): MetricFamily {
  const prefix = id.split('.')[0] ?? '';
  if (['population', 'integrity', 'reference'].includes(prefix)) return 'data';
  if (prefix === 'measurement' || prefix === 'intrinsic') return 'measurement';
  if (['structure', 'clustering'].includes(prefix)) return 'structure';
  if (['target', 'local'].includes(prefix)) return 'target';
  if (['association', 'confounding', 'domain_shift'].includes(prefix)) return 'design';
  if (prefix === 'probe') return 'validation';
  return 'other';
}

/** Metrics grouped by family in a fixed order; engine order is kept inside each family. */
export function groupMetricsByFamily<M extends { id: string }>(metrics: readonly M[]): { family: MetricFamily; metrics: M[] }[] {
  return METRIC_FAMILIES.map((family) => ({ family, metrics: metrics.filter((m) => metricFamily(m.id) === family) })).filter((g) => g.metrics.length);
}

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** RFC 4180 CSV of the evidence table: one row per metric, full-precision values, structured values as JSON. */
export function evidenceCsv(metrics: readonly QualificationMetricView[], locale: Locale = 'fr'): string {
  const header = ['family', 'metric_id', 'label', 'status', 'reason_code', 'value', 'unit', 'source_id', 'target_id', 'population_id', 'view_id', 'parameters', 'denominators', 'protocol_version'];
  const rows = groupMetricsByFamily(metrics).flatMap(({ family, metrics: items }) => items.map((m) => [
    family, m.id, metricLabel(m.id, locale), m.status, m.reasonCode, m.value, m.unit, m.sourceId, m.targetId, m.populationId, m.viewId,
    Object.keys(m.parameters).length ? m.parameters : null, Object.keys(m.denominators).length ? m.denominators : null, m.protocolVersion,
  ]));
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** `samples=5 · observations=6` style denominator summary ("" when none). */
export function formatDenominators(denominators: Readonly<Record<string, number>>): string {
  return Object.entries(denominators).map(([k, v]) => `${k}=${v}`).join(' · ');
}

/**
 * Scalar engine parameters (`repeat_type=rescan · instrument=a`), so metrics sharing one id
 * but computed in different contexts stay distinguishable. Arrays/objects are left to the JSON.
 */
export function formatScalarParameters(parameters: Readonly<Record<string, unknown>>): string {
  return Object.entries(parameters)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(' · ');
}

export function availabilityText(status: AvailabilityStatus, locale: Locale = 'fr'): string {
  return loc(AVAILABILITY_LABEL[status], locale);
}
