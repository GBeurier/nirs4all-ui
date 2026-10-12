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

/** Stop lists of the continuous ramps offered by the palette picker (low → high). */
export const RAMP_STOPS = {
  sequential: N4_SEQUENTIAL_STOPS,
  viridis: N4_VIRIDIS_STOPS,
  plasma: ["#0d0887", "#46039f", "#7201a8", "#9c179e", "#bd3786", "#d8576b", "#ed7953", "#fb9f3a", "#fdca26", "#f0f921"],
  inferno: ["#000004", "#1b0c41", "#4a0c6b", "#781c6d", "#a52c60", "#cf4446", "#ed6925", "#fb9b06", "#f7d13d", "#fcffa4"],
  magma: ["#000004", "#180f3d", "#440f76", "#721f81", "#9e2f7f", "#cd4071", "#f1605d", "#fd9668", "#feca8d", "#fcfdbf"],
  cividis: ["#00224e", "#123570", "#3b496c", "#575d6d", "#707173", "#8a8779", "#a69d75", "#c4b56c", "#e4cf5b", "#fee838"],
  turbo: ["#30123b", "#4145ab", "#4675ed", "#39a2fc", "#1bcfd4", "#24eca6", "#61fc6c", "#a4fc3b", "#d1e834", "#f3c63a", "#fe9b2d", "#f36315", "#d93806", "#b11901", "#7a0403"],
  coolwarm: ["#3b4cc0", "#6788ee", "#9abbff", "#c9d7f0", "#edd1c2", "#f7a889", "#e26952", "#b40426"],
  diverging: N4_DIVERGING_STOPS,
  spectral: ["#5e4fa2", "#3288bd", "#66c2a5", "#abdda4", "#e6f598", "#ffffbf", "#fee08b", "#fdae61", "#f46d43", "#d53e4f", "#9e0142"],
  blues: ["#c6dbef", "#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#08519c", "#08306b"],
  greens: ["#c7e9c0", "#a1d99b", "#74c476", "#41ab5d", "#238b45", "#006d2c", "#00441b"],
  greys: ["#d9d9d9", "#bdbdbd", "#969696", "#737373", "#525252", "#252525"],
} as const satisfies Record<string, readonly string[]>;

export type ContinuousRamp = keyof typeof RAMP_STOPS;

export const RAMP_LABELS: Readonly<Record<ContinuousRamp, string>> = {
  sequential: "nirs4all",
  viridis: "Viridis",
  plasma: "Plasma",
  inferno: "Inferno",
  magma: "Magma",
  cividis: "Cividis",
  turbo: "Turbo",
  coolwarm: "Cool–warm",
  diverging: "Blue–red",
  spectral: "Spectral",
  blues: "Blues",
  greens: "Greens",
  greys: "Greys",
};

/** Categorical palettes offered by the palette picker. */
export const CATEGORICAL_PALETTES = {
  nirs4all: N4_CATEGORICAL,
  okabeIto: ["#0072b2", "#e69f00", "#009e73", "#cc79a7", "#56b4e9", "#d55e00", "#f0e442", "#000000"],
  tableau10: ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac"],
  set1: ["#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00", "#ffd92f", "#a65628", "#f781bf", "#999999"],
  set2: ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3"],
  dark2: ["#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#e6ab02", "#a6761d", "#666666"],
  paired: ["#1f78b4", "#a6cee3", "#33a02c", "#b2df8a", "#e31a1c", "#fb9a99", "#ff7f00", "#fdbf6f", "#6a3d9a", "#cab2d6"],
} as const satisfies Record<string, readonly string[]>;

export type CategoricalPalette = keyof typeof CATEGORICAL_PALETTES;

export const CATEGORICAL_PALETTE_LABELS: Readonly<Record<CategoricalPalette, string>> = {
  nirs4all: "nirs4all",
  okabeIto: "Okabe–Ito (color-blind safe)",
  tableau10: "Tableau 10",
  set1: "Set 1",
  set2: "Set 2",
  dark2: "Dark 2",
  paired: "Paired",
};

/** The user's color preferences, applied by every view of a capsule. */
export interface ColorScheme {
  categorical: CategoricalPalette;
  continuous: ContinuousRamp;
  /** Flip the continuous ramp (high values get the low color). */
  reverse: boolean;
  /** `robust` clips the ramp at the 2–98 % quantiles; `full` spans min–max. */
  clip: "robust" | "full";
}

export const DEFAULT_COLOR_SCHEME: ColorScheme = { categorical: "nirs4all", continuous: "sequential", reverse: false, clip: "robust" };

/** Stops of a continuous ramp, reversed on demand. */
export function rampStops(ramp: ContinuousRamp, reverse = false): readonly string[] {
  const stops = RAMP_STOPS[ramp];
  return reverse ? [...stops].reverse() : stops;
}

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

/** Robust [q02, q98] range of the finite values of a continuous column (`full`: min–max). */
export function robustRange(values: ReadonlyArray<string | number | null>, clip: ColorScheme["clip"] = "robust"): { min: number; max: number } | null {
  const finite: number[] = [];
  for (const value of values) if (typeof value === "number" && Number.isFinite(value)) finite.push(value);
  if (finite.length === 0) return null;
  finite.sort((a, b) => a - b);
  if (clip === "full") return { min: finite[0]!, max: finite[finite.length - 1]! };
  const min = quantileSorted(finite, 0.02);
  const max = quantileSorted(finite, 0.98);
  return min < max ? { min, max } : { min: finite[0]!, max: finite[finite.length - 1]! };
}

const RAMP_BUCKETS = 32;

export interface RowColorOptions {
  ramp?: ContinuousRamp | undefined;
  reverse?: boolean | undefined;
  clip?: ColorScheme["clip"] | undefined;
  fallback?: string | undefined;
  /**
   * Categorical palette. Without it the brand palette is used and partition
   * values (train / validation / test) keep their canonical colors.
   */
  palette?: readonly string[] | undefined;
}

/** Row-color options for a user {@link ColorScheme}. */
export function colorSchemeOptions(scheme: ColorScheme): RowColorOptions {
  return {
    ramp: scheme.continuous,
    reverse: scheme.reverse,
    clip: scheme.clip,
    ...(scheme.categorical === "nirs4all" ? {} : { palette: CATEGORICAL_PALETTES[scheme.categorical] }),
  };
}

/**
 * Resolve one color per row. Without a column, every row gets `fallback`.
 */
export function resolveRowColors(rowCount: number, column: RowColumn | null | undefined, options: RowColorOptions = {}): ColorMapping {
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
      (value, index) => column.colors?.[value] ?? (options.palette ? undefined : partitionColor(value)) ?? basePalette[index % basePalette.length]!,
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

  const stops = rampStops(options.ramp ?? "sequential", options.reverse);
  const range = robustRange(column.values, options.clip);
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
