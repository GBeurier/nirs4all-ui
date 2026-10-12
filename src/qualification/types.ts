// Qualification (nirs4all-preflight) display contracts. PURE: no React, no IO.
// The engine (Rust + Methods) owns every number; this domain only describes how
// an already-computed report is shown. Values are nullable and never defaulted.

export type ProfileStatus = 'exploratory' | 'partial' | 'complete';

/** Mirrors the engine `Availability` enum (snake_case wire values). */
export type AvailabilityStatus =
  | 'computed'
  | 'not_applicable'
  | 'insufficient_data'
  | 'unsupported'
  | 'not_identifiable'
  | 'undefined'
  | 'cancelled'
  | 'error';

export const AVAILABILITY_STATUSES: readonly AvailabilityStatus[] = [
  'computed',
  'not_applicable',
  'insufficient_data',
  'unsupported',
  'not_identifiable',
  'undefined',
  'cancelled',
  'error',
];

export type QualificationConfidence = 'unknown' | 'low' | 'medium' | 'high';
/** Spec §6: only certain technical defects are `blocking`; other findings are info/warning/high. */
export type QualificationSeverity = 'info' | 'warning' | 'high' | 'blocking';

/** JSON value as emitted by the engine for a metric. */
export type QualificationValue = number | string | boolean | null | readonly unknown[] | { readonly [key: string]: unknown };

// --- wire shape (engine report v1, snake_case) ---

export interface EngineMetric {
  metric_id: string;
  protocol_version: string;
  status: string;
  reason_code?: string | null;
  scope: string;
  source_id?: string | null;
  target_id?: string | null;
  view_id: string;
  population_id: string;
  value?: QualificationValue;
  unit?: string | null;
  denominators?: Record<string, number>;
  parameters?: Record<string, unknown>;
}

export interface EngineFinding {
  rule_id: string;
  severity: string;
  confidence: string;
  evidence: readonly string[];
  message: string;
  action: string;
}

export interface EngineCapability {
  capability_id: string;
  available: boolean;
  qualified: boolean;
  reason?: string | null;
}

export interface EngineValidationIssue {
  code: string;
  path: string;
  message: string;
  blocking: boolean;
}

export interface EngineReport {
  schema_version: number;
  engine_version: string;
  protocol_bundle_version: string;
  profile_status: string;
  status?: string;
  validation?: { valid: boolean; issues: readonly EngineValidationIssue[] };
  capabilities: readonly EngineCapability[];
  metrics: readonly EngineMetric[];
  findings: readonly EngineFinding[];
  limitations?: readonly string[];
}

// --- display model ---

export interface QualificationProvenance {
  schemaVersion: number;
  engineVersion: string;
  protocolBundleVersion: string;
}

export interface QualificationMetricView {
  id: string;
  status: AvailabilityStatus;
  reasonCode: string | null;
  scope: string;
  sourceId: string | null;
  targetId: string | null;
  viewId: string;
  populationId: string;
  /** raw engine value; null whenever the metric is not computed */
  value: QualificationValue;
  unit: string | null;
  /** denominators keyed by name (e.g. samples, observations) */
  denominators: Readonly<Record<string, number>>;
  parameters: Readonly<Record<string, unknown>>;
  protocolVersion: string;
}

export interface QualificationFindingView {
  ruleId: string;
  severity: QualificationSeverity;
  confidence: QualificationConfidence;
  evidence: readonly string[];
  message: string;
  action: string;
}

export interface QualificationCapabilityView {
  id: string;
  available: boolean;
  qualified: boolean;
  reason: string | null;
}

export interface QualificationIssueView {
  code: string;
  path: string;
  message: string;
  blocking: boolean;
}

export interface QualificationReportView {
  profileStatus: ProfileStatus;
  /** engine completion status (e.g. "partial"), when reported */
  completion: string | null;
  provenance: QualificationProvenance;
  valid: boolean | null;
  issues: readonly QualificationIssueView[];
  metrics: readonly QualificationMetricView[];
  findings: readonly QualificationFindingView[];
  capabilities: readonly QualificationCapabilityView[];
  limitations: readonly string[];
  /** count of metrics per availability status (presentation tally only) */
  availabilityCounts: Readonly<Record<AvailabilityStatus, number>>;
}
