/**
 * Pure helpers for the controlled `MultimodalDatasetBuilder`.
 *
 * They only rearrange the host-supplied draft and report field readiness. They
 * never read files, parse values, match samples or decide whether a dataset is
 * scientifically valid: the host runs the owner checks and reports them through
 * `MultimodalBuilderValidation`.
 */

import type {
  MultimodalBuilderDraft,
  MultimodalBuilderFile,
  MultimodalBuilderProfile,
  MultimodalBuilderRole,
  MultimodalBuilderSource,
} from "./multimodalTypes.js";
import type { WizardStep } from "./types.js";

export type MultimodalBuilderStep = WizardStep;
export type MultimodalBuilderModality = MultimodalBuilderSource["modality"];
export type MultimodalBuilderAxisMode = MultimodalBuilderSource["axisMode"];

export const MULTIMODAL_BUILDER_STEPS: readonly MultimodalBuilderStep[] = ["source", "role", "columns", "validation"];

export interface MultimodalBuilderOption<T extends string> {
  value: T;
  label: string;
  description: string;
}

export const MULTIMODAL_ROLE_OPTIONS: readonly MultimodalBuilderOption<MultimodalBuilderRole>[] = [
  { value: "source", label: "Measurements", description: "Feature columns of one modality." },
  { value: "metadata", label: "Metadata & target", description: "Sample identity, target, groups and partition." },
  { value: "combined", label: "Combined", description: "Measurements and the target in one table." },
  { value: "ignored", label: "Ignore", description: "Kept in the inventory, not imported." },
];

export const MULTIMODAL_PROFILE_OPTIONS: readonly MultimodalBuilderOption<MultimodalBuilderProfile>[] = [
  { value: "numeric_csv", label: "Numeric table (CSV)", description: "One row per sample, one numeric column per feature." },
  { value: "vcf_gt_dosage", label: "VCF genotypes → dosage", description: "GT calls of every variant converted to 0/1/2 dosage." },
  { value: "png_manifest", label: "PNG image manifest", description: "A sample_id,file table that lists one PNG per sample." },
];

export const MULTIMODAL_MODALITY_OPTIONS: readonly MultimodalBuilderOption<MultimodalBuilderModality>[] = [
  { value: "spectroscopy", label: "Spectroscopy", description: "Spectra on a physical axis." },
  { value: "genetics", label: "Genetics", description: "Genotype dosages coded 0/1/2 (CSV) or VCF GT calls." },
  { value: "image", label: "Images", description: "Fixed-shape 8-bit grayscale or RGB PNG images." },
];

export const MULTIMODAL_AXIS_OPTIONS: readonly MultimodalBuilderOption<MultimodalBuilderAxisMode>[] = [
  { value: "none", label: "None", description: "Features are named variables without a physical axis." },
  { value: "headers", label: "Numeric column names", description: "Each selected column name is its axis value (e.g. 1100, 1102…)." },
  { value: "declared", label: "Exact declared values", description: "Type the exact axis value of every selected feature." },
];

/** Exact headers read by the current PNG manifest owner profile. */
export const PNG_MANIFEST_HEADERS = ["sample_id", "file"] as const;

/** Channel counts of the supported PNG profile: 8-bit grayscale (1) or RGB (3). */
export const PNG_SUPPORTED_CHANNELS: readonly number[] = [1, 3];

export function optionLabel<T extends string>(options: readonly MultimodalBuilderOption<T>[], value: T): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function isMeasurementRole(role: MultimodalBuilderRole): boolean {
  return role === "source" || role === "combined";
}

export function carriesTarget(role: MultimodalBuilderRole): boolean {
  return role === "metadata" || role === "combined";
}

/** Files that become mapping tables (everything except PNG image assets). */
export function isMappingFile(file: MultimodalBuilderFile): boolean {
  return file.kind !== "image";
}

/** Data tables counted as tables: CSV and VCF (an optional manifest is counted apart). */
export function isDataTableFile(file: MultimodalBuilderFile): boolean {
  return file.kind === "table" || file.kind === "vcf";
}

/**
 * Spectroscopy measurements in a numeric table need their own explicit axis
 * (column names or declared values) with kind and unit; the owner refuses them
 * otherwise. Genetics dosage tables may keep no axis.
 */
export function requiresExplicitAxis(source: MultimodalBuilderSource): boolean {
  return isMeasurementRole(source.role) && source.profile === "numeric_csv" && source.modality === "spectroscopy";
}

/** Axis modes offered for one source (no "None" when an explicit axis is required). */
export function allowedAxisModes(source: MultimodalBuilderSource): readonly MultimodalBuilderAxisMode[] {
  return requiresExplicitAxis(source) ? ["headers", "declared"] : ["none"];
}

export function fileForSource(
  files: readonly MultimodalBuilderFile[],
  source: MultimodalBuilderSource,
): MultimodalBuilderFile | undefined {
  return files.find((file) => file.name === source.file);
}

/** Roles offered for one source; VCF and PNG manifests never carry the target. */
export function allowedRoles(source: MultimodalBuilderSource): readonly MultimodalBuilderRole[] {
  if (source.profile === "vcf_gt_dosage" || source.profile === "png_manifest") return ["source", "ignored"];
  return ["source", "metadata", "combined", "ignored"];
}

/** Profiles offered for one source, constrained by the inventory file kind. */
export function allowedProfiles(file: MultimodalBuilderFile | undefined): readonly MultimodalBuilderProfile[] {
  if (file?.kind === "vcf") return ["vcf_gt_dosage"];
  if (file?.kind === "table" || file?.kind === "manifest") return ["numeric_csv", "png_manifest"];
  return ["numeric_csv", "vcf_gt_dosage", "png_manifest"];
}

export function allowedModalities(profile: MultimodalBuilderProfile): readonly MultimodalBuilderModality[] {
  if (profile === "vcf_gt_dosage") return ["genetics"];
  if (profile === "png_manifest") return ["image"];
  return ["spectroscopy", "genetics"];
}

/** Columns already used for identity, target, group or partition. */
export function reservedColumns(source: MultimodalBuilderSource): ReadonlyMap<string, string> {
  const reserved = new Map<string, string>();
  if (source.sampleId) reserved.set(source.sampleId, "Sample ID");
  if (carriesTarget(source.role)) {
    if (source.target) reserved.set(source.target, "Target");
    if (source.group) reserved.set(source.group, "Group");
    if (source.partition) reserved.set(source.partition, "Partition");
  }
  return reserved;
}

const NUMERIC_KIND = /^(num|number|numeric|float|double|real|decimal|int|integer|f32|f64|i32|i64)/i;

export function isNumericKind(kind: string): boolean {
  return NUMERIC_KIND.test(kind.trim());
}

/** Field-level check only: whether a header is a plain finite number string. */
export function isNumericName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed !== "" && Number.isFinite(Number(trimmed));
}

// ---------------------------------------------------------------------------
// Draft edits (immutable)
// ---------------------------------------------------------------------------

export function replaceSource(
  draft: MultimodalBuilderDraft,
  id: string,
  update: (source: MultimodalBuilderSource) => MultimodalBuilderSource,
): MultimodalBuilderDraft {
  return { ...draft, sources: draft.sources.map((source) => (source.id === id ? update(source) : source)) };
}

export function withRole(source: MultimodalBuilderSource, role: MultimodalBuilderRole): MultimodalBuilderSource {
  return { ...source, role };
}

export function withProfile(source: MultimodalBuilderSource, profile: MultimodalBuilderProfile): MultimodalBuilderSource {
  const modalities = allowedModalities(profile);
  const modality = modalities.includes(source.modality) ? source.modality : (modalities[0] ?? source.modality);
  const roles: readonly MultimodalBuilderRole[] =
    profile === "numeric_csv" ? ["source", "metadata", "combined", "ignored"] : ["source", "ignored"];
  const role = roles.includes(source.role) ? source.role : "source";
  const next: MultimodalBuilderSource = { ...source, profile, modality, role };
  return profile === "numeric_csv" ? next : { ...next, axisMode: "none" };
}

/** Assigns an identity/target/group/partition column and removes it from the features. */
export function withFieldColumn(
  source: MultimodalBuilderSource,
  field: "sampleId" | "target" | "group" | "partition",
  column: string,
): MultimodalBuilderSource {
  const features = column ? source.features.filter((name) => name !== column) : source.features;
  return { ...source, [field]: column, features };
}

/** Adds or removes features while keeping the table column order. */
export function withFeatures(
  source: MultimodalBuilderSource,
  names: readonly string[],
  selected: boolean,
): MultimodalBuilderSource {
  const reserved = reservedColumns(source);
  const chosen = new Set(source.features);
  for (const name of names) {
    if (selected && !reserved.has(name)) chosen.add(name);
    else if (!selected) chosen.delete(name);
  }
  const ordered = source.columns.map((column) => column.name).filter((name) => chosen.has(name));
  // Keep imported features that are not (yet) described as columns.
  const placed = new Set(ordered);
  for (const name of source.features) if (chosen.has(name) && !placed.has(name)) ordered.push(name);
  return { ...source, features: ordered };
}

export function withCoordinate(
  source: MultimodalBuilderSource,
  feature: string,
  value: number | null,
): MultimodalBuilderSource {
  const coordinates: Record<string, number> = { ...(source.coordinates ?? {}) };
  if (value === null || !Number.isFinite(value)) delete coordinates[feature];
  else coordinates[feature] = value;
  return { ...source, coordinates };
}

export function withShapeDimension(
  source: MultimodalBuilderSource,
  index: number,
  value: number | null,
): MultimodalBuilderSource {
  const shape = [0, 1, 2].map((i) => (i === index ? (value ?? 0) : (source.shape[i] ?? 0)));
  return { ...source, shape };
}

// ---------------------------------------------------------------------------
// Field readiness (never a substitute for owner validation)
// ---------------------------------------------------------------------------

export interface MultimodalBuilderIssue {
  step: MultimodalBuilderStep;
  sourceId?: string;
  message: string;
  /** Blocking issues disable "Validate alignment"; others are hints. */
  blocking: boolean;
}

export function builderIssues(
  files: readonly MultimodalBuilderFile[],
  draft: MultimodalBuilderDraft,
): MultimodalBuilderIssue[] {
  const issues: MultimodalBuilderIssue[] = [];
  const add = (step: MultimodalBuilderStep, message: string, blocking: boolean, sourceId?: string) =>
    issues.push(sourceId === undefined ? { step, message, blocking } : { step, message, blocking, sourceId });

  if (!draft.name.trim()) add("source", "Name the dataset.", true);
  if (!files.some(isMappingFile)) add("source", "Add at least one CSV or VCF table.", true);

  const active = draft.sources.filter((source) => source.role !== "ignored");
  if (draft.sources.length > 0 && !active.some((source) => isMeasurementRole(source.role))) {
    add("role", "Mark at least one table as measurements or combined.", true);
  }
  const targetTables = active.filter((source) => carriesTarget(source.role));
  if (draft.sources.length > 0 && targetTables.length === 0) {
    add("role", "Mark the table that holds the target as metadata & target or combined.", true);
  }
  const declaredTargets = targetTables.filter((source) => source.target);
  if (targetTables.length > 0 && declaredTargets.length === 0) {
    add("columns", "Choose the target column.", true, targetTables[0]?.id);
  }
  if (declaredTargets.length > 1) {
    add("columns", "Declare the target in exactly one table.", true, declaredTargets[1]?.id);
  }

  const labels = new Map<string, number>();
  for (const source of active) labels.set(source.label.trim(), (labels.get(source.label.trim()) ?? 0) + 1);

  const images = files.filter((file) => file.kind === "image").length;

  for (const source of active) {
    const name = source.label.trim() || source.file;
    if (source.refusal) add("columns", `${name}: ${source.refusal}`, true, source.id);
    if (!source.label.trim()) add("role", `${source.file}: give the source a label.`, true, source.id);
    else if ((labels.get(source.label.trim()) ?? 0) > 1) add("role", `${name}: another source uses the same label.`, false, source.id);

    if (source.profile === "numeric_csv" && !source.sampleId) {
      add("columns", `${name}: choose the sample identifier column.`, true, source.id);
    }

    if (source.profile === "png_manifest") {
      const headers = new Set(source.columns.map((column) => column.name));
      const missing = PNG_MANIFEST_HEADERS.filter((header) => !headers.has(header));
      if (source.columns.length > 0 && missing.length > 0) {
        add("columns", `${name}: the manifest needs the exact headers ${missing.join(" and ")}.`, true, source.id);
      }
      const dims = [0, 1, 2].map((i) => source.shape[i]);
      if (source.shape.length !== 3 || dims.some((d) => d === undefined || !Number.isInteger(d) || d <= 0)) {
        add("columns", `${name}: declare the image shape as height × width × channels.`, true, source.id);
      } else if (!PNG_SUPPORTED_CHANNELS.includes(source.shape[2] ?? 0)) {
        add("columns", `${name}: channels must be 1 (grayscale) or 3 (RGB); alpha is not supported.`, true, source.id);
      }
      if (images === 0) add("source", `${name}: add the PNG files listed by the manifest.`, true, source.id);
    }

    if (isMeasurementRole(source.role) && source.profile === "numeric_csv") {
      if (source.features.length === 0) add("columns", `${name}: select at least one feature column.`, true, source.id);
      const reserved = reservedColumns(source);
      const clash = source.features.filter((feature) => reserved.has(feature));
      if (clash.length > 0) {
        add("columns", `${name}: ${clash.join(", ")} cannot be both a feature and an identity/target column.`, true, source.id);
      }
      if (requiresExplicitAxis(source) && source.axisMode === "none") {
        add(
          "columns",
          `${name}: spectroscopy sources need their own explicit axis. In Columns › Feature axis, choose Numeric column names or Exact declared values, then enter the axis kind and unit.`,
          true,
          source.id,
        );
      }
      if (source.modality === "genetics" && source.axisMode !== "none") {
        add("columns", `${name}: genetic dosage columns have no spectral axis. In Columns › Feature axis, select None.`, true, source.id);
      }
      if (source.axisMode !== "none") {
        if (!source.axisKind.trim()) add("columns", `${name}: name the axis kind (e.g. wavelength).`, true, source.id);
        if (!source.axisUnit.trim()) add("columns", `${name}: give the axis unit (e.g. nm).`, true, source.id);
      }
      if (source.axisMode === "headers") {
        const bad = source.features.filter((feature) => !isNumericName(feature)).length;
        if (bad > 0) {
          add("columns", `${name}: ${bad} selected column name${bad === 1 ? " is" : "s are"} not plain numbers; the owner will refuse them as axis values.`, false, source.id);
        }
      }
      if (source.axisMode === "declared") {
        const coordinates = source.coordinates ?? {};
        const missing = source.features.filter((feature) => !Number.isFinite(coordinates[feature])).length;
        if (missing > 0) add("columns", `${name}: declare the axis value of ${missing} feature${missing === 1 ? "" : "s"}.`, true, source.id);
      }
    }
  }
  return issues;
}

/**
 * Stable identity of everything a validation result depends on: the file
 * inventory and every editable mapping field. Host-reported warnings are
 * excluded so that annotating a draft does not invalidate it.
 */
export function builderDraftKey(files: readonly MultimodalBuilderFile[], draft: MultimodalBuilderDraft): string {
  return JSON.stringify({
    files: files.map((file) => [file.name, file.size, file.kind]),
    name: draft.name,
    sources: draft.sources.map(({ warnings: _warnings, ...rest }) => rest),
  });
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
