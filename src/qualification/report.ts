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
  type QualificationValue,
} from './types.js';
import { AVAILABILITY_LABEL, QUALIFICATION_TEXT } from './locale.js';
import { loc, type Locale } from '../lab/locale.js';

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
  const json = JSON.stringify(value);
  return json.length > 120 ? `${json.slice(0, 117)}…` : json;
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
