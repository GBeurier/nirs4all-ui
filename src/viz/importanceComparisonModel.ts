/**
 * Pure data model behind `ImportanceComparisonChart`: per-series display
 * scaling and the text summary of several importance profiles drawn on one
 * spectral axis.
 *
 * Presentation only: the host supplies every profile (SHAP, coefficients, VIP,
 * …) already computed; display scaling divides a series by its own largest
 * finite |value| so profiles with different units can share one y axis. The
 * raw values stay available for readouts.
 */

import { compactNumber } from "./description.js";
import { errorBounds, formatAxisValue } from "./spectralImportance.js";

/** How series are scaled for display: `max_abs` divides each by its largest finite |value|. */
export type ImportanceDisplayScaling = "max_abs" | "none";

/** One importance profile aligned to the shared spectral axis. */
export interface ImportanceComparisonSeries {
  /** Stable identifier used by `hiddenIds` and `onToggleSeries`. */
  id: string;
  label: string;
  /** Profile values aligned to `axis`; non-finite entries are gaps. */
  values: readonly number[];
  /** Signed profile (direction matters, e.g. coefficients); magnitudes otherwise. */
  signed?: boolean;
  /** Dashed stroke, e.g. for local or approximate profiles. */
  dashed?: boolean;
  /** Optional host-computed uncertainty aligned to `values`, drawn as a ± band. */
  error?: readonly number[];
  /** Explicit stroke color; defaults to the colorblind-safe series palette. */
  color?: string;
}

/** A series after display scaling. */
export interface ScaledImportanceSeries {
  values: number[];
  lower: number[] | null;
  upper: number[] | null;
  /** Divisor applied for display (1 when unscaled or when every value is zero/non-finite). */
  divisor: number;
}

/** Largest finite |value| (0 when none). */
export function maxAbsFinite(values: readonly number[]): number {
  let max = 0;
  for (const value of values) {
    if (Number.isFinite(value)) max = Math.max(max, Math.abs(value));
  }
  return max;
}

/**
 * Display copy of a series. With `max_abs` the values (and error) are divided
 * by the largest finite |value| so the strongest point reaches ±1; a series
 * with no non-zero finite value is left unscaled.
 */
export function scaleImportanceSeries(
  series: Pick<ImportanceComparisonSeries, "values" | "error">,
  scaling: ImportanceDisplayScaling,
): ScaledImportanceSeries {
  const maxAbs = scaling === "max_abs" ? maxAbsFinite(series.values) : 0;
  const divisor = maxAbs > 0 ? maxAbs : 1;
  const values = series.values.map((value) => value / divisor);
  if (!series.error || series.error.length === 0) return { values, lower: null, upper: null, divisor };
  const { lower, upper } = errorBounds(values, series.error.map((value) => value / divisor));
  return { values, lower, upper, divisor };
}

/** Axis coordinate of the largest finite |value| of a series, or `null`. */
export function peakAxisValue(axis: readonly number[], values: readonly number[]): { x: number; value: number } | null {
  let best = -1;
  const length = Math.min(axis.length, values.length);
  for (let index = 0; index < length; index += 1) {
    const x = axis[index]!;
    const value = values[index]!;
    if (!Number.isFinite(x) || !Number.isFinite(value)) continue;
    if (best < 0 || Math.abs(value) > Math.abs(values[best]!)) best = index;
  }
  return best < 0 ? null : { x: axis[best]!, value: values[best]! };
}

export interface ImportanceComparisonSummaryInput {
  axis: readonly number[];
  series: readonly ImportanceComparisonSeries[];
  hiddenIds: ReadonlySet<string>;
  scaling: ImportanceDisplayScaling;
  axisUnit?: string | undefined;
  valueFormat?: (v: number) => string;
  axisFormat?: (v: number) => string;
}

/** Data-derived sentence: where each visible profile peaks and how it is scaled. */
export function summarizeImportanceComparison({
  axis,
  series,
  hiddenIds,
  scaling,
  axisUnit,
  valueFormat = compactNumber,
  axisFormat = formatAxisValue,
}: ImportanceComparisonSummaryInput): string {
  if (series.length === 0) return "No importance profiles to compare.";
  const suffix = axisUnit ? ` ${axisUnit}` : "";
  const visible = series.filter((entry) => !hiddenIds.has(entry.id));
  const parts = [`${visible.length} of ${series.length} importance profiles shown on one axis.`];
  if (visible.length > 0) {
    const peaks = visible.map((entry) => {
      const peak = peakAxisValue(axis, entry.values);
      return peak
        ? `${entry.label} peaks at ${axisFormat(peak.x)}${suffix} (${valueFormat(peak.value)}${entry.signed ? ", signed" : ""})`
        : `${entry.label} has no finite values`;
    });
    parts.push(`${peaks.join("; ")}.`);
  }
  parts.push(
    scaling === "max_abs"
      ? "Display scaling: each profile is divided by its own largest |value|, so heights compare shapes, not magnitudes."
      : "Display scaling: none, values share one y axis in their own units.",
  );
  const hidden = series.filter((entry) => hiddenIds.has(entry.id));
  if (hidden.length > 0) parts.push(`Hidden: ${hidden.map((entry) => entry.label).join(", ")}.`);
  return parts.join(" ");
}
