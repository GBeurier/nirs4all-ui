/**
 * Shared visualization palette for the nirs4all `viz` domain.
 *
 * Pure data + pure color math: no DOM, no React. These are the canonical
 * "teal system" chart colors used across nirs4all Studio and the Web/WASM
 * client, exposed so every presentational chart in this package (and its
 * hosts) draws from one source of truth. Components read these as defaults but
 * always accept explicit color overrides so hosts can retheme.
 */

/** Named brand-ramp colors (verbatim from the nirs4all-org teal system). */
export const N4_VIZ_COLORS = {
  teal: "#0d9488",
  tealDark: "#0f766e",
  tealLight: "#2dd4bf",
  cyan: "#06b6d4",
  indigo: "#4f46e5",
  green: "#10b981",
  amber: "#d97706",
  rose: "#e11d48",
  violet: "#7c3aed",
  slate: "#64748b",
} as const;

/** Ordered categorical series (mirrors `--chart-1..5` in the shared theme). */
export const N4_CHART_SERIES = [
  N4_VIZ_COLORS.teal,
  N4_VIZ_COLORS.cyan,
  N4_VIZ_COLORS.indigo,
  N4_VIZ_COLORS.green,
  N4_VIZ_COLORS.amber,
] as const;

/**
 * Wide categorical palette for group-colored scatter/topology views (mirrors
 * Studio's `INSPECTOR_GROUP_COLORS`).
 */
export const N4_CATEGORICAL = [
  "#0d9488",
  "#2563eb",
  "#d97706",
  "#e11d48",
  "#7c3aed",
  "#059669",
  "#ea580c",
  "#0284c7",
  "#db2777",
  "#65a30d",
] as const;

/**
 * Signed-contribution colors: `positive` raises the model output, `negative`
 * lowers it. Teal/rose stay separable under common color-vision deficiencies;
 * charts also encode the sign by direction and signed text, never color alone.
 */
export const N4_SIGNED_COLORS = {
  positive: N4_VIZ_COLORS.teal,
  negative: N4_VIZ_COLORS.rose,
} as const;

/** Canonical train / validation / test partition colors. */
export const N4_PARTITION_COLORS = {
  train: N4_VIZ_COLORS.teal,
  validation: N4_VIZ_COLORS.indigo,
  test: N4_VIZ_COLORS.amber,
} as const;

export type PartitionKey = keyof typeof N4_PARTITION_COLORS;

/** Resolve a categorical color by index, wrapping around the palette. */
export function categoricalColor(index: number, palette: readonly string[] = N4_CATEGORICAL): string {
  if (palette.length === 0) return N4_VIZ_COLORS.teal;
  const wrapped = ((Math.trunc(index) % palette.length) + palette.length) % palette.length;
  return palette[wrapped] as string;
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.replace(/(.)/g, "$1$1") : clean;
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToCss([r, g, b]: Rgb): string {
  const round = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `rgb(${round(r)}, ${round(g)}, ${round(b)})`;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Interpolate a stop-based color ramp; `t` is clamped to [0, 1]. */
export function rampAt(stops: readonly string[], t: number): string {
  if (stops.length === 0) return N4_VIZ_COLORS.teal;
  if (stops.length === 1) return stops[0] as string;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const scaled = clamped * (stops.length - 1);
  const lower = Math.min(stops.length - 2, Math.floor(scaled));
  const frac = scaled - lower;
  return rgbToCss(mixRgb(hexToRgb(stops[lower] as string), hexToRgb(stops[lower + 1] as string), frac));
}

/** Sequential teal→amber ramp (used for continuous coloring by value). */
export const N4_SEQUENTIAL_STOPS = ["#0f766e", "#0d9488", "#06b6d4", "#84cc16", "#d97706"] as const;

/** Perceptual viridis approximation for heatmap intensity. */
export const N4_VIRIDIS_STOPS = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"] as const;

/** Diverging blue→neutral→red ramp for signed SHAP values. */
export const N4_DIVERGING_STOPS = ["#2563eb", "#e2e8f0", "#e11d48"] as const;

export function sequentialColor(t: number): string {
  return rampAt(N4_SEQUENTIAL_STOPS, t);
}

export function viridisColor(t: number): string {
  return rampAt(N4_VIRIDIS_STOPS, t);
}

export function divergingColor(t: number): string {
  return rampAt(N4_DIVERGING_STOPS, t);
}

/**
 * Colorblind-safe categorical series for overlaid curves (Okabe–Ito hues,
 * without its yellow and black, which fail on light or dark surfaces). Used by
 * `ImportanceComparisonChart`; hosts may still override per series.
 */
export const N4_COLORBLIND_SERIES = [
  "#0072b2",
  "#d55e00",
  "#009e73",
  "#cc79a7",
  "#e69f00",
  "#56b4e9",
  "#882255",
] as const;

/** `[r, g, b]` (0–255) of a `#rgb`, `#rrggbb` or `rgb(r, g, b)` color; `null` when unparsable. */
export function parseRgb(color: string): [number, number, number] | null {
  const trimmed = color.trim();
  if (trimmed.startsWith("#")) {
    const clean = trimmed.slice(1);
    if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(clean)) return null;
    return hexToRgb(clean);
  }
  const match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(trimmed);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Dark or light text, whichever reads better on `background` (WCAG relative luminance). */
export function readableTextColor(background: string, dark = "#0f172a", light = "#f8fafc"): string {
  const rgb = parseRgb(background);
  if (!rgb) return dark;
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.33 ? dark : light;
}

/**
 * Position of `value` on a diverging ramp whose neutral midpoint is zero:
 * negative values map to [0, 0.5) relative to `min`, positive values to
 * (0.5, 1] relative to `max`. Requires `min < 0 < max`.
 */
export function divergingPosition(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0.5;
  if (value >= 0) return max > 0 ? 0.5 + 0.5 * Math.min(1, value / max) : 0.5;
  return min < 0 ? 0.5 - 0.5 * Math.min(1, value / min) : 0.5;
}

/** `[r, g, b]` lookup table of a stop ramp for raster (canvas) rendering; the odd default size keeps an exact midpoint. */
export function rampLookupTable(stops: readonly string[], size = 257): Uint8ClampedArray {
  const table = new Uint8ClampedArray(size * 3);
  for (let index = 0; index < size; index += 1) {
    const rgb = parseRgb(rampAt(stops, size === 1 ? 0 : index / (size - 1))) ?? [0, 0, 0];
    table[index * 3] = rgb[0];
    table[index * 3 + 1] = rgb[1];
    table[index * 3 + 2] = rgb[2];
  }
  return table;
}
