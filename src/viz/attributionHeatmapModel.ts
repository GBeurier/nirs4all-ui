/**
 * Pure data model behind `AttributionHeatmap`: symmetric color domain, raster
 * (canvas) pixels with a peak-preserving column reduction, keyboard cursor and
 * text summary for a rows × groups matrix of signed attributions.
 *
 * Presentation only: the host supplies the attributions (for example per-row
 * grouped SHAP values); nothing is recomputed here.
 */

import { compactNumber, signedNumber } from "./description.js";
import { N4_DIVERGING_STOPS, rampLookupTable } from "./theme.js";

/** One heatmap row (for example one sample's grouped attributions). */
export interface AttributionHeatmapRow {
  id: string;
  label: string;
  /** Values aligned to `columns`; non-finite entries are transparent. */
  values: readonly number[];
}

/** One heatmap column (for example one wavelength group). */
export interface AttributionHeatmapColumn {
  label: string;
}

export interface AttributionCursor {
  row: number;
  col: number;
}

/** Largest finite |value| over all rows (0 when none): the symmetric color domain is `[-max, +max]`. */
export function attributionMaxAbs(rows: ReadonlyArray<{ values: readonly number[] }>): number {
  let max = 0;
  for (const row of rows) {
    for (const value of row.values) {
      if (Number.isFinite(value)) max = Math.max(max, Math.abs(value));
    }
  }
  return max;
}

let defaultLut: Uint8ClampedArray | null = null;

/**
 * RGBA pixels (`pixelWidth × rows.length`) of the heatmap. Each pixel column
 * covers one or more data columns; when several fall in one pixel the value
 * with the largest |value| is kept so narrow strong attributions stay visible.
 * Zero maps to the neutral midpoint, `±maxAbs` to the ramp ends; non-finite
 * cells are transparent.
 */
export function rasterizeAttributions(
  rows: ReadonlyArray<{ values: readonly number[] }>,
  columnCount: number,
  pixelWidth: number,
  maxAbs: number,
  lut: Uint8ClampedArray = (defaultLut ??= rampLookupTable(N4_DIVERGING_STOPS)),
): Uint8ClampedArray {
  const width = Math.max(1, Math.min(Math.trunc(pixelWidth), Math.max(1, columnCount)));
  const out = new Uint8ClampedArray(width * rows.length * 4);
  const levels = lut.length / 3;
  const scale = maxAbs > 0 ? maxAbs : 1;
  for (let r = 0; r < rows.length; r += 1) {
    const values = rows[r]!.values;
    for (let p = 0; p < width; p += 1) {
      const from = Math.floor((p * columnCount) / width);
      const to = Math.max(from + 1, Math.floor(((p + 1) * columnCount) / width));
      let picked = Number.NaN;
      for (let c = from; c < to; c += 1) {
        const value = values[c];
        if (value === undefined || !Number.isFinite(value)) continue;
        if (!Number.isFinite(picked) || Math.abs(value) > Math.abs(picked)) picked = value;
      }
      const offset = (r * width + p) * 4;
      if (!Number.isFinite(picked)) continue; // transparent
      const t = Math.max(0, Math.min(1, 0.5 + 0.5 * (picked / scale)));
      const level = Math.round(t * (levels - 1)) * 3;
      out[offset] = lut[level]!;
      out[offset + 1] = lut[level + 1]!;
      out[offset + 2] = lut[level + 2]!;
      out[offset + 3] = 255;
    }
  }
  return out;
}

/**
 * Keyboard cursor transition: arrows move one cell (Shift: ten columns),
 * Home/End jump to the first/last column, Escape clears. Returns `undefined`
 * for keys the heatmap does not handle.
 */
export function nextAttributionCursor(
  cursor: AttributionCursor | null,
  key: string,
  shiftKey: boolean,
  rowCount: number,
  columnCount: number,
): AttributionCursor | null | undefined {
  if (key === "Escape") return null;
  if (rowCount <= 0 || columnCount <= 0) return undefined;
  const current = cursor ?? { row: 0, col: 0 };
  const step = shiftKey ? 10 : 1;
  const clampRow = (row: number) => Math.max(0, Math.min(rowCount - 1, row));
  const clampCol = (col: number) => Math.max(0, Math.min(columnCount - 1, col));
  if (!cursor && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) return current;
  switch (key) {
    case "ArrowUp":
      return { row: clampRow(current.row - 1), col: current.col };
    case "ArrowDown":
      return { row: clampRow(current.row + 1), col: current.col };
    case "ArrowLeft":
      return { row: current.row, col: clampCol(current.col - step) };
    case "ArrowRight":
      return { row: current.row, col: clampCol(current.col + step) };
    case "Home":
      return { row: current.row, col: 0 };
    case "End":
      return { row: current.row, col: columnCount - 1 };
    default:
      return undefined;
  }
}

/** Evenly spread column indices for sparse tick labels (always includes the ends). */
export function sparseColumnTicks(columnCount: number, maxTicks: number): number[] {
  if (columnCount <= 0) return [];
  const count = Math.max(1, Math.min(columnCount, Math.trunc(maxTicks)));
  if (count === 1) return [0];
  const out = new Set<number>();
  for (let k = 0; k < count; k += 1) out.add(Math.round((k * (columnCount - 1)) / (count - 1)));
  return [...out];
}

/** Data-derived description of the heatmap. */
export function summarizeAttributionHeatmap(
  rows: readonly AttributionHeatmapRow[],
  columns: readonly AttributionHeatmapColumn[],
  valueLabel: string,
  format: (v: number) => string = compactNumber,
): string {
  const head = `${valueLabel} for ${rows.length} row${rows.length === 1 ? "" : "s"} across ${columns.length} column${columns.length === 1 ? "" : "s"}.`;
  let strongest: { row: number; col: number; value: number } | null = null;
  let positive = 0;
  let negative = 0;
  rows.forEach((row, r) => {
    row.values.forEach((value, c) => {
      if (!Number.isFinite(value)) return;
      if (value > 0) positive += 1;
      if (value < 0) negative += 1;
      if (!strongest || Math.abs(value) > Math.abs(strongest.value)) strongest = { row: r, col: c, value };
    });
  });
  if (!strongest) return `${head} No finite values.`;
  const peak = strongest as { row: number; col: number; value: number };
  const max = Math.abs(peak.value);
  return `${head} Symmetric color scale from ${signedNumber(-max, format)} to ${signedNumber(max, format)}; ${positive} positive and ${negative} negative cells. Strongest ${signedNumber(peak.value, format)} at ${rows[peak.row]!.label} / ${columns[peak.col]?.label ?? `column ${peak.col + 1}`}.`;
}
