/**
 * Pure derivations that turn the host dataset + result into what the views
 * draw: the output matrix and its row ↔ dataset-row mapping, the color-by
 * columns (target, partition, folds, replicate groups, filter tags, metadata),
 * per-output-row colors, and the scoped row universe.
 */

import { resolveRowColors, type ColorMapping, type RowColumn } from "../workbench/colorBy.js";
import { toSpectraMatrix, type SpectraMatrix } from "../workbench/matrix.js";
import type { PlaygroundDataset, PlaygroundResult, PlaygroundScope, PlaygroundTarget } from "./types.js";

export interface PlaygroundFrame {
  matrix: SpectraMatrix;
  wavelengths: readonly number[];
  /** Dataset row of each matrix row. */
  rows: Int32Array;
  unit: string;
  signal: string;
}

/** Raw dataset as a frame (identity row mapping). */
export function rawFrame(dataset: PlaygroundDataset): PlaygroundFrame {
  const matrix = toSpectraMatrix(dataset.spectra);
  return {
    matrix,
    wavelengths: dataset.wavelengths,
    rows: Int32Array.from({ length: matrix.rows }, (_, i) => i),
    unit: dataset.unit ?? "nm",
    signal: dataset.signal ?? "Absorbance",
  };
}

/** Output frame of a result (falls back to the raw frame without result). */
export function outputFrame(dataset: PlaygroundDataset, result: PlaygroundResult | null | undefined): PlaygroundFrame {
  if (!result) return rawFrame(dataset);
  const matrix = toSpectraMatrix(result.spectra);
  const rows = result.rows && result.rows.length === matrix.rows ? Int32Array.from(result.rows) : Int32Array.from({ length: matrix.rows }, (_, i) => i);
  return {
    matrix,
    wavelengths: result.wavelengths,
    rows,
    unit: result.unit ?? dataset.unit ?? "nm",
    signal: result.signal ?? dataset.signal ?? "Absorbance",
  };
}

/** Dataset row → output rows (several when augmentation duplicates samples). */
export function inverseRows(rows: Int32Array, datasetRows: number): Int32Array[] {
  const counts = new Uint32Array(datasetRows);
  for (const row of rows) if (row >= 0 && row < datasetRows) counts[row]! += 1;
  const out = Array.from({ length: datasetRows }, (_, i) => new Int32Array(counts[i]!));
  const fill = new Uint32Array(datasetRows);
  rows.forEach((row, outputRow) => {
    if (row < 0 || row >= datasetRows) return;
    out[row]![fill[row]!] = outputRow;
    fill[row]! += 1;
  });
  return out;
}

export function datasetRowCount(dataset: PlaygroundDataset): number {
  return toSpectraMatrix(dataset.spectra).rows;
}

export const TARGET_KEY_PREFIX = "target:";

export function targetColumn(target: PlaygroundTarget): RowColumn {
  const column: RowColumn = {
    key: `${TARGET_KEY_PREFIX}${target.name}`,
    label: target.name,
    kind: target.kind === "classification" ? "categorical" : "continuous",
    values: target.values,
  };
  if (target.unit) column.unit = target.unit;
  if (target.classes) column.order = target.classes;
  return column;
}

/**
 * Every column the user can color / group by, indexed by dataset row.
 * Result-derived columns (folds, replicate groups, filter tags) are mapped
 * back from output rows; rows absent from the output get `null`.
 */
export function buildColumns(dataset: PlaygroundDataset, result: PlaygroundResult | null | undefined, frame: PlaygroundFrame): RowColumn[] {
  const n = datasetRowCount(dataset);
  const columns: RowColumn[] = [];
  for (const target of dataset.targets ?? []) columns.push(targetColumn(target));
  if (dataset.partition) {
    columns.push({ key: "partition", label: "Partition", kind: "categorical", values: dataset.partition, order: ["train", "validation", "test"] });
  }
  const folds = result?.folds;
  if (folds && folds.folds.length > 0) {
    const values = new Array<string | null>(n).fill(null);
    if (folds.kind === "holdout") {
      for (const fold of folds.folds) {
        for (const row of fold.train) if (frame.rows[row] !== undefined) values[frame.rows[row]!] = "train";
        for (const row of fold.test) if (frame.rows[row] !== undefined) values[frame.rows[row]!] = "test";
      }
      columns.push({ key: "split", label: folds.splitter ? `Split · ${folds.splitter}` : "Split", kind: "categorical", values, order: ["train", "test"] });
    } else {
      for (const fold of folds.folds) for (const row of fold.test) if (frame.rows[row] !== undefined) values[frame.rows[row]!] = fold.label;
      columns.push({ key: "fold", label: folds.splitter ? `Fold · ${folds.splitter}` : "Fold", kind: "categorical", values, order: folds.folds.map((f) => f.label) });
    }
  }
  const tagged = new Map<string, Set<number>>();
  for (const outcome of result?.steps ?? []) {
    if (outcome.taggedRows && outcome.taggedRows.length > 0) tagged.set(outcome.stepId, new Set(outcome.taggedRows));
  }
  if (tagged.size > 0) {
    const values = new Array<string | null>(n).fill("inlier");
    for (const rows of tagged.values()) for (const row of rows) if (row < n) values[row] = "flagged";
    columns.push({ key: "flags", label: "Filter flags", kind: "categorical", values, order: ["inlier", "flagged"], colors: { inlier: "#94a3b8", flagged: "#e11d48" } });
  }
  const repetitions = result?.repetitions;
  if (repetitions) {
    const distance = new Array<number | null>(n).fill(null);
    frame.rows.forEach((row, outputRow) => {
      const value = repetitions.distance[outputRow];
      if (value !== undefined && Number.isFinite(value)) distance[row] = value;
    });
    columns.push({ key: "rep-distance", label: `Replicate distance (${repetitions.metric})`, kind: "continuous", values: distance });
  }
  for (const column of dataset.metadata ?? []) columns.push(column);
  return columns;
}

/** Re-index a dataset-row color mapping onto output rows. */
export function colorsForFrame(mapping: ColorMapping, frame: PlaygroundFrame): { colors: string[]; groups: Int32Array } {
  const colors = new Array<string>(frame.rows.length);
  const groups = new Int32Array(frame.rows.length);
  frame.rows.forEach((row, outputRow) => {
    colors[outputRow] = mapping.colors[row] ?? mapping.palette[0] ?? "#0d9488";
    groups[outputRow] = mapping.groups[row] ?? 0;
  });
  return { colors, groups };
}

export function colorMappingFor(columns: readonly RowColumn[], key: string | null, rowCount: number): ColorMapping {
  const column = key ? columns.find((c) => c.key === key) : undefined;
  return resolveRowColors(rowCount, column ?? null);
}

/** Dataset rows in scope (`all`, the selection, or one partition value). */
export function scopeRows(scope: PlaygroundScope, rowCount: number, selection: readonly number[], partition?: ReadonlyArray<string | null>): Set<number> | null {
  if (scope === "all") return null;
  if (scope === "selection") return new Set(selection);
  const value = scope.slice("partition:".length);
  const out = new Set<number>();
  if (!partition) return null;
  for (let row = 0; row < rowCount; row += 1) if (partition[row] === value) out.add(row);
  return out;
}

/** Output rows whose dataset row is in scope (all when `scope` is null). */
export function outputRowsInScope(frame: PlaygroundFrame, scope: Set<number> | null): number[] {
  const out: number[] = [];
  frame.rows.forEach((row, outputRow) => {
    if (!scope || scope.has(row)) out.push(outputRow);
  });
  return out;
}

/** Output rows for a dataset-row selection. */
export function selectionToOutput(selection: readonly number[], inverse: readonly Int32Array[]): number[] {
  const out: number[] = [];
  for (const row of selection) {
    const outputs = inverse[row];
    if (outputs) for (const o of outputs) out.push(o);
  }
  return out.sort((a, b) => a - b);
}

/** Dataset rows for output rows (deduplicated, sorted). */
export function outputToSelection(outputRows: readonly number[], frame: PlaygroundFrame): number[] {
  const set = new Set<number>();
  for (const o of outputRows) {
    const row = frame.rows[o];
    if (row !== undefined) set.add(row);
  }
  return [...set].sort((a, b) => a - b);
}

/** Numeric target values per output row (NaN when missing / categorical). */
export function numericTargetForFrame(target: PlaygroundTarget | undefined, frame: PlaygroundFrame): Float64Array {
  const out = new Float64Array(frame.rows.length).fill(Number.NaN);
  if (!target || target.kind !== "regression") return out;
  frame.rows.forEach((row, outputRow) => {
    const v = target.values[row];
    if (typeof v === "number") out[outputRow] = v;
  });
  return out;
}

export function sampleLabel(dataset: PlaygroundDataset, row: number): string {
  return dataset.sampleIds?.[row] ?? `#${row + 1}`;
}
