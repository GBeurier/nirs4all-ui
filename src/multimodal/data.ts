/**
 * Pure read-only access helpers over supplied multimodal data: identity
 * lookup, row slicing, display subsets and formatting. No statistics, no
 * preprocessing, no scoring.
 */

import type { MultimodalAxis, MultimodalDataset, MultimodalSource } from "./types.js";

/** Values per sample: product of the declared shape (falls back to feature count). */
export function rowWidth(source: Pick<MultimodalSource, "shape" | "featureNames">): number {
  if (source.shape.length === 0) return source.featureNames.length;
  return source.shape.reduce((product, dimension) => product * dimension, 1);
}

/** Identity → row index for a source's own row order. */
export function sourceRowIndex(source: Pick<MultimodalSource, "sampleIds">): ReadonlyMap<string, number> {
  const index = new Map<string, number>();
  source.sampleIds.forEach((id, row) => {
    if (!index.has(id)) index.set(id, row);
  });
  return index;
}

/** Copy one row out of a contiguous row-major buffer. */
export function readRow(source: Pick<MultimodalSource, "data" | "shape" | "featureNames">, row: number): number[] {
  const width = rowWidth(source);
  const start = row * width;
  const values = new Array<number>(width);
  for (let column = 0; column < width; column += 1) values[column] = Number(source.data[start + column]);
  return values;
}

/** Validity row (`true` = present). Missing validity means every cell is present. */
export function readValidityRow(
  source: Pick<MultimodalSource, "validity" | "shape" | "featureNames">,
  row: number,
): boolean[] | null {
  if (!source.validity) return null;
  const width = rowWidth(source);
  const start = row * width;
  const flags = new Array<boolean>(width);
  for (let column = 0; column < width; column += 1) flags[column] = source.validity[start + column] !== 0;
  return flags;
}

/** Number of cells flagged invalid by the supplied validity mask. */
export function invalidCellCount(source: Pick<MultimodalSource, "validity">): number {
  const validity = source.validity;
  if (!validity) return 0;
  let count = 0;
  for (let index = 0; index < validity.length; index += 1) if (validity[index] === 0) count += 1;
  return count;
}

/**
 * Up to `max` identities spread evenly over `ids` (display decimation only),
 * always including `selected` when it is one of them.
 */
export function displaySubset(ids: readonly string[], max: number, selected: string | null): string[] {
  if (ids.length <= max) return [...ids];
  const picked: string[] = [];
  const seen = new Set<string>();
  const slots = Math.max(1, selected && ids.includes(selected) ? max - 1 : max);
  for (let slot = 0; slot < slots; slot += 1) {
    const id = ids[Math.round((slot * (ids.length - 1)) / Math.max(1, slots - 1))];
    if (id !== undefined && !seen.has(id)) {
      seen.add(id);
      picked.push(id);
    }
  }
  if (selected && ids.includes(selected) && !seen.has(selected)) picked.push(selected);
  return picked;
}

export function targetValueOf(dataset: MultimodalDataset, sampleId: string): number | null {
  const row = dataset.sampleIds.indexOf(sampleId);
  if (row < 0) return null;
  const value = Number(dataset.target.values[row]);
  return Number.isFinite(value) ? value : null;
}

export function groupOf(dataset: MultimodalDataset, sampleId: string): string | null {
  if (!dataset.groupIds) return null;
  const row = dataset.sampleIds.indexOf(sampleId);
  return row < 0 ? null : (dataset.groupIds[row] ?? null);
}

export function partitionOf(dataset: MultimodalDataset, sampleId: string): string | null {
  if (!dataset.partitions) return null;
  const row = dataset.sampleIds.indexOf(sampleId);
  return row < 0 ? null : (dataset.partitions[row] ?? null);
}

/** Distinct declared group labels (a count of supplied labels, not a statistic). */
export function distinctGroupCount(dataset: MultimodalDataset): number | null {
  return dataset.groupIds ? new Set(dataset.groupIds).size : null;
}

export function partitionCounts(dataset: MultimodalDataset): { train: number; test: number } | null {
  if (!dataset.partitions) return null;
  let train = 0;
  let test = 0;
  for (const partition of dataset.partitions) {
    if (partition === "test") test += 1;
    else train += 1;
  }
  return { train, test };
}

const AXIS_KIND_LABEL: Readonly<Record<string, string>> = {
  wavelength: "Wavelength",
  raman_shift: "Raman shift",
  wavenumber: "Wavenumber",
};

export function axisTitle(axis: MultimodalAxis): string {
  const kind = AXIS_KIND_LABEL[axis.kind] ?? axis.kind.replace(/_/g, " ");
  return `${kind} (${axis.unit})`;
}

export function axisRangeText(axis: MultimodalAxis): string {
  const first = axis.values[0];
  const last = axis.values[axis.values.length - 1];
  if (first === undefined || last === undefined) return "empty axis";
  return `${formatNumber(first, 4)}–${formatNumber(last, 4)} ${axis.unit}, ${axis.values.length} points`;
}

/** Fixed display range for image intensities; never derived from the data. */
export function imageDisplayRange(source: Pick<MultimodalSource, "displayRange" | "provenance">): {
  range: readonly [number, number];
  declared: boolean;
} {
  if (source.displayRange) return { range: source.displayRange, declared: true };
  const declared = source.provenance?.["intensityRange"];
  if (
    Array.isArray(declared) &&
    declared.length === 2 &&
    typeof declared[0] === "number" &&
    typeof declared[1] === "number" &&
    declared[1] > declared[0]
  ) {
    return { range: [declared[0], declared[1]], declared: true };
  }
  return { range: [0, 255], declared: false };
}

export function shapeText(shape: readonly number[]): string {
  return shape.length === 0 ? "—" : shape.join(" × ");
}

export function formatNumber(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e5 || magnitude < 1e-3)) return value.toExponential(Math.max(1, digits - 1));
  return Number(value.toPrecision(digits)).toString();
}

export function formatMetric(value: number | null | undefined): string {
  if (value === null || value === undefined) return "n/a";
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e5 || magnitude < 1e-3)) return value.toExponential(2);
  return value.toFixed(magnitude >= 100 ? 1 : magnitude >= 10 ? 2 : 3);
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds - minutes * 60)} s`;
}

export function shortFingerprint(value: string): string {
  return value.length > 14 ? `${value.slice(0, 12)}…` : value;
}
