import { useId, type ReactNode } from "react";

import { cx } from "./_cx.js";
import { countLabel, rangeText } from "./description.js";
import {
  bandPath,
  buildFrame,
  extentOf,
  linePath,
  makeScale,
  niceExtent,
  round,
  ticks,
  type PlotPadding,
} from "./geometry.js";
import { N4_PARTITION_COLORS, N4_VIZ_COLORS, type PartitionKey } from "./theme.js";

/** One overlaid spectrum (absorbance values aligned to the shared wavelength axis). */
export interface SpectraSeries {
  id: string;
  values: readonly number[];
  color?: string;
  label?: string;
  partition?: PartitionKey;
  opacity?: number;
}

/**
 * Translucent precomputed envelope (min/max, ±σ, quantiles) drawn behind the
 * lines, with an optional precomputed median line. Nothing is recomputed here.
 */
export interface SpectraBand {
  lower: readonly number[];
  upper: readonly number[];
  color?: string;
  opacity?: number;
  /** Precomputed median line aligned to `wavelengths`; drawn independently of the bounds. */
  median?: readonly number[];
  /** Name used by the default text summary. */
  label?: string;
  /** SVG `stroke-dasharray` for the median line (default "4 3"). */
  medianDash?: string;
}

export interface SpectraPlotProps {
  /** Shared wavelength / wavenumber axis. Non-finite entries are gaps. */
  wavelengths: readonly number[];
  /** Overlaid per-sample spectra (colored by `partition` unless `color` is set). */
  series?: readonly SpectraSeries[];
  /** Emphasized true mean spectrum drawn on top (never a median). */
  mean?: readonly number[];
  /** Precomputed envelopes, each with an optional median line. */
  bands?: readonly SpectraBand[];
  width?: number;
  height?: number;
  padding?: PlotPadding;
  unit?: string;
  xLabel?: string;
  yLabel?: string;
  showGrid?: boolean;
  showAxes?: boolean;
  meanColor?: string;
  title?: string;
  /** Faithful host-provided text alternative; defaults to a data summary. */
  description?: string;
  className?: string;
  /** Extra SVG content rendered in data space last (annotations, legends). */
  children?: ReactNode;
}

type Pair = readonly [number, number];
type Triple = readonly [number, number, number];

interface Runs<T> {
  /** Contiguous finite runs of at least two points, in input order. */
  runs: T[][];
  /** Positions with a non-finite coordinate. */
  missing: number;
  /** Finite points with no finite neighbour (not drawn). */
  isolated: number;
}

/** Split an (axis, value) pair list into contiguous finite runs; no sorting, filling or interpolation. */
function pairRuns(xs: readonly number[], ys: readonly number[]): Runs<Pair> {
  const runs: Pair[][] = [];
  let missing = 0;
  let isolated = 0;
  let current: Pair[] = [];
  const flush = (): void => {
    if (current.length >= 2) runs.push(current);
    else if (current.length === 1) isolated += 1;
    current = [];
  };
  for (let i = 0; i < xs.length; i += 1) {
    const x = xs[i]!;
    const y = ys[i]!;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      current.push([x, y]);
    } else {
      missing += 1;
      flush();
    }
  }
  flush();
  return { runs, missing, isolated };
}

/** Same as `pairRuns` for band bounds: axis, lower and upper must all be finite. */
function boundRuns(xs: readonly number[], lower: readonly number[], upper: readonly number[]): Runs<Triple> {
  const runs: Triple[][] = [];
  let missing = 0;
  let isolated = 0;
  let current: Triple[] = [];
  const flush = (): void => {
    if (current.length >= 2) runs.push(current);
    else if (current.length === 1) isolated += 1;
    current = [];
  };
  for (let i = 0; i < xs.length; i += 1) {
    const x = xs[i]!;
    const lo = lower[i]!;
    const up = upper[i]!;
    if (Number.isFinite(x) && Number.isFinite(lo) && Number.isFinite(up)) {
      current.push([x, lo, up]);
    } else {
      missing += 1;
      flush();
    }
  }
  flush();
  return { runs, missing, isolated };
}

/** True when any pair of finite bounds is inverted (non-finite pairs are gaps, not inversions). */
function hasFiniteInversion(lower: readonly number[], upper: readonly number[]): boolean {
  for (let i = 0; i < lower.length; i += 1) {
    const lo = lower[i]!;
    const up = upper[i]!;
    if (Number.isFinite(lo) && Number.isFinite(up) && lo > up) return true;
  }
  return false;
}

interface PreparedBand {
  index: number;
  band: SpectraBand;
  fill: Runs<Triple>;
  median: Runs<Pair> | null;
}

function partitionColor(series: SpectraSeries): string {
  if (series.color) return series.color;
  if (series.partition) return N4_PARTITION_COLORS[series.partition];
  return N4_VIZ_COLORS.teal;
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(1);
  return value.toFixed(2);
}

/**
 * The signature NIRS chart: absorbance vs. wavelength. Overlays per-sample
 * lines (colored by partition), an optional emphasized mean, and translucent
 * precomputed bands with optional median lines. Non-finite axis or value
 * entries are gaps: each contiguous run of at least two finite points is drawn
 * on its own and nothing is sorted, interpolated or zero-filled. Pure inline
 * SVG — no chart library, no state. Hosts pass already-aligned numeric arrays.
 */
export function SpectraPlot({
  wavelengths,
  series = [],
  mean,
  bands = [],
  width = 520,
  height = 260,
  padding,
  unit = "nm",
  xLabel,
  yLabel = "Absorbance",
  showGrid = true,
  showAxes = true,
  meanColor = N4_VIZ_COLORS.tealDark,
  title = "NIRS spectra",
  description,
  className,
  children,
}: SpectraPlotProps) {
  const descriptionId = useId();
  const frame = buildFrame(width, height, padding);
  const { top, left } = frame.padding;
  const bottom = top + frame.innerHeight;

  const axisLength = wavelengths.length;
  const aligned = (values: readonly number[]): boolean => axisLength > 0 && values.length === axisLength;

  let missingTotal = 0;
  let isolatedTotal = 0;
  const take = <T,>(runs: Runs<T>): Runs<T> => {
    missingTotal += runs.missing;
    isolatedTotal += runs.isolated;
    return runs;
  };

  const drawnSeries = series
    .filter((curve) => aligned(curve.values))
    .map((curve) => ({ curve, runs: take(pairRuns(wavelengths, curve.values)) }))
    .filter((entry) => entry.runs.runs.length > 0);
  const drawnMean = mean && aligned(mean) ? take(pairRuns(wavelengths, mean)) : null;
  const meanRuns = drawnMean && drawnMean.runs.length > 0 ? drawnMean.runs : null;

  let rejectedBands = 0;
  const preparedBands: PreparedBand[] = [];
  bands.forEach((band, index) => {
    if (!aligned(band.lower) || !aligned(band.upper) || hasFiniteInversion(band.lower, band.upper)) {
      rejectedBands += 1;
      return;
    }
    const fill = take(boundRuns(wavelengths, band.lower, band.upper));
    const median = band.median && aligned(band.median) ? take(pairRuns(wavelengths, band.median)) : null;
    if (fill.runs.length > 0 || (median && median.runs.length > 0)) {
      preparedBands.push({ index, band, fill, median });
    }
  });

  // Domains come only from coordinates that are actually drawn (runs of >= 2 points).
  const drawnX: number[] = [];
  const drawnY: number[] = [];
  const collect = (runs: readonly (readonly Pair[])[]): void => {
    for (const run of runs) {
      for (const [x, y] of run) {
        drawnX.push(x);
        drawnY.push(y);
      }
    }
  };
  for (const entry of drawnSeries) collect(entry.runs.runs);
  if (meanRuns) collect(meanRuns);
  for (const prepared of preparedBands) {
    for (const run of prepared.fill.runs) {
      for (const [x, lo, up] of run) {
        drawnX.push(x);
        drawnY.push(lo, up);
      }
    }
    if (prepared.median) collect(prepared.median.runs);
  }

  const xDomain = extentOf(drawnX);
  const yDomain = drawnY.length ? niceExtent(drawnY, 0.08) : { min: 0, max: 1 };

  const xScale = makeScale(xDomain, left, left + frame.innerWidth);
  const yScale = makeScale(yDomain, bottom, top);

  const runsPath = (runs: readonly (readonly Pair[])[]): string =>
    runs.map((run) => linePath(run.map(([x, y]) => [xScale(x), yScale(y)] as [number, number]))).join(" ");
  const bandsPath = (runs: readonly (readonly Triple[])[]): string =>
    runs
      .map((run) =>
        bandPath(
          run.map(([x, , up]) => [xScale(x), yScale(up)] as [number, number]),
          run.map(([x, lo]) => [xScale(x), yScale(lo)] as [number, number]),
        ),
      )
      .join(" ");

  const xTicks = ticks(xDomain, 5);
  const yTicks = ticks(yDomain, 4);
  const resolvedXLabel = xLabel ?? `Wavelength (${unit})`;
  const hasDrawn = drawnX.length > 0;
  const wavelengthRange = rangeText(drawnX);
  const valueRange = rangeText(drawnY);
  const isolatedNote = isolatedTotal > 0
    ? `${countLabel(isolatedTotal, "isolated finite value")} not drawn as lines`
    : null;
  const bandNames = preparedBands.map(({ index, band, fill, median }) => {
    const name = band.label?.trim() || `band ${index + 1}`;
    const hasBounds = fill.runs.length > 0;
    const hasMedian = !!median && median.runs.length > 0;
    return `${name} (${hasBounds && hasMedian ? "bounds and median" : hasBounds ? "bounds" : "median only"})`;
  });
  const missingNote = missingTotal > 0
    ? `${countLabel(missingTotal, "position")} missing or non-finite in the supplied curves`
    : null;
  const rejectedNote = rejectedBands > 0
    ? `${countLabel(rejectedBands, "band")} rejected (misaligned or inverted bounds)`
    : null;
  const dataNotes = [
    ...(missingNote ? [missingNote] : []),
    ...(isolatedNote ? [isolatedNote] : []),
  ];
  const summary = description?.trim() || (
    !hasDrawn
      ? ["No spectral curves available.", ...(dataNotes.length || rejectedNote ? [[...dataNotes, ...(rejectedNote ? [rejectedNote] : [])].join("; ") + "."] : [])].join(" ")
      : [
          `${countLabel(drawnSeries.length, "sample spectrum", "sample spectra")} across ${countLabel(axisLength, "axis position")}`,
          ...(wavelengthRange ? [`axis range ${wavelengthRange} ${unit}`] : []),
          ...(valueRange ? [`${yLabel} range ${valueRange}`] : []),
          ...dataNotes,
          ...(meanRuns ? ["mean curve shown"] : []),
          ...(preparedBands.length > 0 ? [`${countLabel(preparedBands.length, "band")} shown: ${bandNames.join(", ")}`] : []),
          ...(rejectedNote ? [rejectedNote] : []),
        ].join("; ") + "."
  );

  return (
    <svg
      className={cx("n4viz", "n4viz-spectra", className)}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title}
      aria-describedby={descriptionId}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{title}</title>
      <desc id={descriptionId}>{summary}</desc>
      {showGrid
        ? yTicks.map((t) => (
            <line
              key={`gy-${t}`}
              className="n4viz-grid"
              x1={left}
              x2={left + frame.innerWidth}
              y1={round(yScale(t))}
              y2={round(yScale(t))}
            />
          ))
        : null}

      {preparedBands.map(({ index, band, fill }) =>
        fill.runs.length > 0 ? (
          <path
            key={`band-${index}`}
            className="n4viz-band"
            d={bandsPath(fill.runs)}
            fill={band.color ?? N4_VIZ_COLORS.teal}
            fillOpacity={band.opacity ?? 0.12}
            stroke="none"
          />
        ) : null,
      )}

      {preparedBands.map(({ index, band, median }) =>
        median && median.runs.length > 0 ? (
          <path
            key={`band-median-${index}`}
            className="n4viz-line n4viz-band-median"
            d={runsPath(median.runs)}
            fill="none"
            stroke={band.color ?? N4_VIZ_COLORS.teal}
            strokeWidth={1.5}
            strokeDasharray={band.medianDash ?? "4 3"}
          />
        ) : null,
      )}

      {drawnSeries.map(({ curve, runs }) => (
        <path
          key={curve.id}
          className="n4viz-line"
          d={runsPath(runs.runs)}
          fill="none"
          stroke={partitionColor(curve)}
          strokeOpacity={curve.opacity ?? 0.5}
          strokeWidth={1}
        />
      ))}

      {meanRuns ? (
        <path
          className="n4viz-line n4viz-line-mean"
          d={runsPath(meanRuns)}
          fill="none"
          stroke={meanColor}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}

      {showAxes ? (
        <>
          <line className="n4viz-axis" x1={left} x2={left + frame.innerWidth} y1={bottom} y2={bottom} />
          <line className="n4viz-axis" x1={left} x2={left} y1={top} y2={bottom} />
          {xTicks.map((t) => (
            <text key={`tx-${t}`} className="n4viz-tick" x={round(xScale(t))} y={bottom + 16} textAnchor="middle">
              {formatTick(t)}
            </text>
          ))}
          {yTicks.map((t) => (
            <text key={`ty-${t}`} className="n4viz-tick" x={left - 6} y={round(yScale(t)) + 3} textAnchor="end">
              {formatTick(t)}
            </text>
          ))}
          <text className="n4viz-axis-label" x={left + frame.innerWidth / 2} y={height - 2} textAnchor="middle">
            {resolvedXLabel}
          </text>
          <text
            className="n4viz-axis-label"
            transform={`translate(11 ${top + frame.innerHeight / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            {yLabel}
          </text>
        </>
      ) : null}
      {children}
    </svg>
  );
}
