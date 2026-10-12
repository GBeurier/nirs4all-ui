/**
 * nirs4all-ui `qualification` domain — display contracts for nirs4all-preflight.
 *
 * Pure view-model adapter (engine report JSON -> typed display model) and
 * stateless presentational React components: profile status, availability
 * status + reasons, scopes/denominators, unknown confidence, provenance and
 * nullable values. NO app state, IO, browser globals, runtime execution or
 * numerical algorithms: Methods computes, the Rust protocol decides, hosts
 * render. Default stylesheet: `nirs4all-ui/assets/qualification.css`.
 *
 * Consumed as `nirs4all-ui/qualification`.
 */

export * from './types.js';
export * from './locale.js';
export * from './report.js';

export * from './Badges.js';
export * from './EvidenceTable.js';
export * from './FindingList.js';
export * from './CapabilityTable.js';
export * from './AvailabilitySummary.js';
export * from './ChartDataTable.js';
export * from './QualificationOverview.js';
