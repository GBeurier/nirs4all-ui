/**
 * Pure data model behind `SpectralImportanceChart`: spectral-axis importance
 * curves, binned region values and keyboard/pointer cursor resolution.
 *
 * Framework-free and deterministic so hosts and tests can reuse the exact
 * values the chart draws. Nothing is recomputed scientifically here: the host
 * supplies the importance curve (for example mean |SHAP| per variable), an
 * optional reference spectrum and precomputed region values; this module only
 * orders, decimates for display and summarizes them.
 */

import { compactNumber, signedNumber } from "./description.js";

/** One precomputed region (bin) along the spectral axis. */
export interface SpectralImportanceRegion {
  /** First spectral coordinate covered by the region (inclusive). */
  start: number;
  /** Last spectral coordinate covered by the region (inclusive). */
  end: number;
  /** Aggregated region value; signed or magnitude depending on `regionValueKind`. */
  value: number;
  /** Display label; defaults to `start–end`. */
  label?: string;
}

/**
 * How region values must be read. `signed` values keep their direction (a
 * negative value lowers the model output); `magnitude` values are non-negative
 * strengths such as mean |SHAP|.
 */
export type RegionValueKind = "signed" | "magnitude";

/** A region resolved for display, ordered along the axis. */
export interface ResolvedSpectralRegion {
  /** Position in axis order (0-based). */
  index: number;
  start: number;
  end: number;
  center: number;
  value: number;
  label: string;
  /** |value| divided by the largest finite |value| (0 when unavailable). */
  strength: number;
  /** 1-based rank by |value| among finite regions (0 when unavailable). */
  rank: number;
}

export type SpectralCursor =
  | { kind: "point"; index: number }
  | { kind: "region"; index: number };

/** Default region label: `start–end` with the axis formatter. */
export function spectralRegionLabel(start: number, end: number, format: (v: number) => string = formatAxisValue): string {
  return `${format(start)}–${format(end)}`;
}

/** Axis coordinates print without spurious decimals once they are large. */
export function formatAxisValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 1) return Number(value.toFixed(2)).toString();
  return compactNumber(value);
}

/** Region values are signed as soon as one finite value is negative unless the host says otherwise. */
export function resolveRegionValueKind(
  regions: readonly SpectralImportanceRegion[],
  explicit?: RegionValueKind,
): RegionValueKind {
  if (explicit) return explicit;
  return regions.some((region) => Number.isFinite(region.value) && region.value < 0) ? "signed" : "magnitude";
}

/** Order regions along the axis, compute their strength and |value| rank. */
export function resolveSpectralRegions(
  regions: readonly SpectralImportanceRegion[],
  format: (v: number) => string = formatAxisValue,
): ResolvedSpectralRegion[] {
  const usable = regions.filter((region) => Number.isFinite(region.start) && Number.isFinite(region.end));
  const ordered = [...usable].sort((a, b) => Math.min(a.start, a.end) - Math.min(b.start, b.end));
  const maxAbs = ordered.reduce((max, region) => (Number.isFinite(region.value) ? Math.max(max, Math.abs(region.value)) : max), 0);
  const rankOrder = ordered
    .map((region, index) => ({ index, magnitude: Number.isFinite(region.value) ? Math.abs(region.value) : -1 }))
    .filter((entry) => entry.magnitude >= 0)
    .sort((a, b) => b.magnitude - a.magnitude);
  const ranks = new Map(rankOrder.map((entry, position) => [entry.index, position + 1]));
  return ordered.map((region, index) => {
    const start = Math.min(region.start, region.end);
    const end = Math.max(region.start, region.end);
    return {
      index,
      start,
      end,
      center: (start + end) / 2,
      value: region.value,
      label: region.label ?? spectralRegionLabel(start, end, format),
      strength: Number.isFinite(region.value) && maxAbs > 0 ? Math.abs(region.value) / maxAbs : 0,
      rank: ranks.get(index) ?? 0,
    };
  });
}

/**
 * Split `(axis, value)` into contiguous finite runs and decimate long runs with
 * a min/max envelope per bucket so narrow peaks survive display reduction.
 * Returns pixel-independent data coordinates; gaps are never interpolated.
 */
export function decimatedRuns(
  axis: readonly number[],
  values: readonly number[],
  maxPoints: number,
): Array<Array<[number, number]>> {
  const runs: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  const length = Math.min(axis.length, values.length);
  for (let index = 0; index < length; index += 1) {
    const x = axis[index]!;
    const y = values[index]!;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      current.push([x, y]);
    } else {
      if (current.length >= 2) runs.push(current);
      current = [];
    }
  }
  if (current.length >= 2) runs.push(current);

  const total = runs.reduce((sum, run) => sum + run.length, 0);
  const budget = Math.max(4, Math.trunc(maxPoints));
  if (total <= budget) return runs;
  const bucket = Math.max(2, Math.ceil((2 * total) / budget));
  return runs.map((run) => {
    const out: Array<[number, number]> = [];
    for (let start = 0; start < run.length; start += bucket) {
      const slice = run.slice(start, start + bucket);
      let lowIndex = 0;
      let highIndex = 0;
      slice.forEach(([, y], i) => {
        if (y < slice[lowIndex]![1]) lowIndex = i;
        if (y > slice[highIndex]![1]) highIndex = i;
      });
      const first = Math.min(lowIndex, highIndex);
      const second = Math.max(lowIndex, highIndex);
      out.push(slice[first]!);
      if (second !== first) out.push(slice[second]!);
    }
    return out;
  });
}

/** Index of the finite axis coordinate closest to `x` (or -1 when none). */
export function nearestAxisIndex(axis: readonly number[], x: number): number {
  let best = -1;
  let bestDistance = Infinity;
  for (let index = 0; index < axis.length; index += 1) {
    const value = axis[index]!;
    if (!Number.isFinite(value)) continue;
    const distance = Math.abs(value - x);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/** Regions whose inclusive range covers `x`. */
export function regionsAt(regions: readonly ResolvedSpectralRegion[], x: number): ResolvedSpectralRegion[] {
  return regions.filter((region) => x >= region.start && x <= region.end);
}

/**
 * Keyboard cursor transition. Arrow keys step through regions when any exist,
 * otherwise through roughly 1% of the axis points; Home/End jump to the ends
 * and Escape clears. Returns `undefined` for keys the chart does not handle.
 */
export function nextSpectralCursor(
  cursor: SpectralCursor | null,
  key: string,
  regionCount: number,
  pointCount: number,
): SpectralCursor | null | undefined {
  if (key === "Escape") return null;
  if (regionCount > 0) {
    const current = cursor?.kind === "region" ? cursor.index : -1;
    if (key === "ArrowRight" || key === "ArrowDown") return { kind: "region", index: Math.min(regionCount - 1, current + 1) };
    if (key === "ArrowLeft" || key === "ArrowUp") return { kind: "region", index: Math.max(0, current < 0 ? 0 : current - 1) };
    if (key === "Home") return { kind: "region", index: 0 };
    if (key === "End") return { kind: "region", index: regionCount - 1 };
    return undefined;
  }
  if (pointCount <= 0) return undefined;
  const step = Math.max(1, Math.round(pointCount / 100));
  const current = cursor?.kind === "point" ? cursor.index : -1;
  if (key === "ArrowRight" || key === "ArrowDown") return { kind: "point", index: Math.min(pointCount - 1, current < 0 ? 0 : current + step) };
  if (key === "ArrowLeft" || key === "ArrowUp") return { kind: "point", index: Math.max(0, current < 0 ? 0 : current - step) };
  if (key === "Home") return { kind: "point", index: 0 };
  if (key === "End") return { kind: "point", index: pointCount - 1 };
  return undefined;
}

export interface SpectralSummaryInput {
  axis: readonly number[];
  importance: readonly number[];
  spectrum?: readonly number[] | undefined;
  regions: readonly ResolvedSpectralRegion[];
  regionValueKind: RegionValueKind;
  importanceLabel: string;
  spectrumLabel: string;
  regionLabel: string;
  axisUnit?: string | undefined;
  valueFormat?: (v: number) => string;
  axisFormat?: (v: number) => string;
}

/** Data-derived sentence answering "where along the spectrum does the model look?". */
export function summarizeSpectralImportance({
  axis,
  importance,
  spectrum,
  regions,
  regionValueKind,
  importanceLabel,
  spectrumLabel,
  regionLabel,
  axisUnit,
  valueFormat = compactNumber,
  axisFormat = formatAxisValue,
}: SpectralSummaryInput): string {
  const suffix = axisUnit ? ` ${axisUnit}` : "";
  const parts: string[] = [];
  let peak = -1;
  let finite = 0;
  let missing = 0;
  const length = Math.min(axis.length, importance.length);
  for (let index = 0; index < length; index += 1) {
    const x = axis[index]!;
    const y = importance[index]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      missing += 1;
      continue;
    }
    finite += 1;
    if (peak < 0 || y > importance[peak]!) peak = index;
  }
  if (finite === 0) {
    parts.push(`No finite ${importanceLabel} values.`);
  } else {
    const xs = axis.filter((value) => Number.isFinite(value));
    const low = Math.min(...xs);
    const high = Math.max(...xs);
    parts.push(
      `${importanceLabel} over ${finite} points from ${axisFormat(low)} to ${axisFormat(high)}${suffix}; peak ${valueFormat(importance[peak]!)} at ${axisFormat(axis[peak]!)}${suffix}.`,
    );
  }
  if (missing > 0) parts.push(`${missing} unavailable points are shown as gaps.`);
  const ranked = regions.filter((region) => region.rank > 0).sort((a, b) => a.rank - b.rank);
  if (ranked.length > 0) {
    const top = ranked.slice(0, 3).map((region) => `${region.label}${suffix} (${regionValueKind === "signed" ? signedNumber(region.value, valueFormat) : valueFormat(region.value)})`);
    const direction = regionValueKind === "signed"
      ? ` ${ranked.filter((region) => region.value > 0).length} positive, ${ranked.filter((region) => region.value < 0).length} negative.`
      : "";
    parts.push(`${regionLabel}: ${ranked.length} regions, strongest ${top.join(", ")}.${direction}`);
  }
  if (spectrum && spectrum.some((value) => Number.isFinite(value))) parts.push(`${spectrumLabel} is drawn on the right axis.`);
  return parts.join(" ");
}

