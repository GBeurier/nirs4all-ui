/**
 * "Color by" resolution shared by every workbench view.
 *
 * Hosts expose per-row *columns* (target, metadata, partition, fold, cluster,
 * score…). The user picks one; this module turns it into one CSS color per row
 * plus a legend, so canvases, SVG charts and tables all paint the same row with
 * the same color. Categorical columns map to the brand categorical palette,
 * continuous ones to a sequential ramp clipped at robust quantiles so one
 * outlier does not flatten the gradient.
 */

import { quantileSorted } from "../viz/geometry.js";
import {
  N4_CATEGORICAL,
  N4_PARTITION_COLORS,
  N4_VIZ_COLORS,
  rampAt,
  N4_SEQUENTIAL_STOPS,
  N4_VIRIDIS_STOPS,
  N4_DIVERGING_STOPS,
} from "../viz/theme.js";

export type ColumnKind = "categorical" | "continuous";

/** One per-row attribute the user can color, filter or group by. */
export interface RowColumn {
  key: string;
  label: string;
  kind: ColumnKind;
  /** One value per row; `null` marks a missing value. */
  values: ReadonlyArray<string | number | null>;
  unit?: string;
  /** Explicit category → color overrides (e.g. partitions). */
  colors?: Readonly<Record<string, string>>;
  /** Category display order (defaults to natural sort). */
  order?: readonly string[];
}

export type ContinuousRamp = "sequential" | "viridis" | "diverging";

export const RAMP_STOPS: Readonly<Record<ContinuousRamp, readonly string[]>> = {
  sequential: N4_SEQUENTIAL_STOPS,
  viridis: N4_VIRIDIS_STOPS,
  diverging: N4_DIVERGING_STOPS,
};

export const MISSING_COLOR = "#94a3b8";
export const DEFAULT_ROW_COLOR = N4_VIZ_COLORS.teal;

export interface CategoricalLegend {
  kind: "categorical";
  entries: Array<{ value: string; color: string; count: number }>;
  missing: number;
}

export interface ContinuousLegend {
  kind: "continuous";
  min: number;
  max: number;
  stops: readonly string[];
  missing: number;
  unit?: string;
}

export interface ColorMapping {
  /** One CSS color per row. */
  colors: string[];
  /**
   * Stable integer group per row (category index, or a quantized ramp bucket)
   * so canvas renderers can batch draws by color.
   */
  groups: Int32Array;
  /** Distinct colors indexed by `groups`. */
  palette: string[];
  legend: CategoricalLegend | ContinuousLegend | null;
}

const NATURAL = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function categoriesOf(column: RowColumn): string[] {
  const present = new Set<string>();
  for (const value of column.values) if (value !== null && value !== "") present.add(String(value));
  if (column.order) {
    const ordered = column.order.filter((value) => present.has(value));
    const rest = [...present].filter((value) => !column.order!.includes(value)).sort(NATURAL.compare);
    return [...ordered, ...rest];
  }
  return [...present].sort(NATURAL.compare);
}

function partitionColor(value: string): string | undefined {
  const key = value.toLowerCase();
  if (key === "train" || key === "calibration" || key === "cal") return N4_PARTITION_COLORS.train;
  if (key === "val" || key === "valid" || key === "validation") return N4_PARTITION_COLORS.validation;
  if (key === "test" || key === "holdout") return N4_PARTITION_COLORS.test;
  return undefined;
}

/** Robust [q02, q98] range of the finite values of a continuous column. */
export function robustRange(values: ReadonlyArray<string | number | null>): { min: number; max: number } | null {
  const finite: number[] = [];
  for (const value of values) if (typeof value === "number" && Number.isFinite(value)) finite.push(value);
  if (finite.length === 0) return null;
  finite.sort((a, b) => a - b);
  const min = quantileSorted(finite, 0.02);
  const max = quantileSorted(finite, 0.98);
  return min < max ? { min, max } : { min: finite[0]!, max: finite[finite.length - 1]! };
}

const RAMP_BUCKETS = 32;

/**
 * Resolve one color per row. Without a column, every row gets `fallback`.
 */
export function resolveRowColors(
  rowCount: number,
  column: RowColumn | null | undefined,
  options: { ramp?: ContinuousRamp; fallback?: string; palette?: readonly string[] } = {},
): ColorMapping {
  const fallback = options.fallback ?? DEFAULT_ROW_COLOR;
  if (!column) {
    return {
      colors: new Array<string>(rowCount).fill(fallback),
      groups: new Int32Array(rowCount),
      palette: [fallback],
      legend: null,
    };
  }

  if (column.kind === "categorical") {
    const categories = categoriesOf(column);
    const basePalette = options.palette ?? N4_CATEGORICAL;
    const palette = categories.map(
      (value, index) => column.colors?.[value] ?? partitionColor(value) ?? basePalette[index % basePalette.length]!,
    );
    const missingGroup = palette.length;
    palette.push(MISSING_COLOR);
    const indexOf = new Map(categories.map((value, index) => [value, index]));
    const counts = new Array<number>(categories.length).fill(0);
    const colors = new Array<string>(rowCount);
    const groups = new Int32Array(rowCount);
    let missing = 0;
    for (let row = 0; row < rowCount; row += 1) {
      const raw = column.values[row];
      const group = raw === null || raw === undefined || raw === "" ? undefined : indexOf.get(String(raw));
      if (group === undefined) {
        groups[row] = missingGroup;
        colors[row] = MISSING_COLOR;
        missing += 1;
      } else {
        groups[row] = group;
        colors[row] = palette[group]!;
        counts[group]! += 1;
      }
    }
    return {
      colors,
      groups,
      palette,
      legend: {
        kind: "categorical",
        entries: categories.map((value, index) => ({ value, color: palette[index]!, count: counts[index]! })),
        missing,
      },
    };
  }

  const stops = RAMP_STOPS[options.ramp ?? "sequential"];
  const range = robustRange(column.values);
  const palette = Array.from({ length: RAMP_BUCKETS }, (_, bucket) => rampAt(stops, bucket / (RAMP_BUCKETS - 1)));
  const missingGroup = palette.length;
  palette.push(MISSING_COLOR);
  const colors = new Array<string>(rowCount);
  const groups = new Int32Array(rowCount);
  let missing = 0;
  for (let row = 0; row < rowCount; row += 1) {
    const raw = column.values[row];
    if (typeof raw !== "number" || !Number.isFinite(raw) || !range) {
      groups[row] = missingGroup;
      colors[row] = MISSING_COLOR;
      missing += 1;
      continue;
    }
    const t = (raw - range.min) / (range.max - range.min || 1);
    const bucket = Math.max(0, Math.min(RAMP_BUCKETS - 1, Math.round(t * (RAMP_BUCKETS - 1))));
    groups[row] = bucket;
    colors[row] = palette[bucket]!;
  }
  const legend: ContinuousLegend = {
    kind: "continuous",
    min: range?.min ?? 0,
    max: range?.max ?? 1,
    stops,
    missing,
  };
  if (column.unit) legend.unit = column.unit;
  return { colors, groups, palette, legend };
}

/** Group rows by the categories of a column (missing values under `null`). */
export function groupRows(column: RowColumn, rows?: readonly number[]): Map<string | null, number[]> {
  const out = new Map<string | null, number[]>();
  const universe = rows ?? column.values.map((_, index) => index);
  for (const row of universe) {
    const raw = column.values[row];
    const key = raw === null || raw === undefined || raw === "" ? null : String(raw);
    const bucket = out.get(key);
    if (bucket) bucket.push(row);
    else out.set(key, [row]);
  }
  return out;
}
