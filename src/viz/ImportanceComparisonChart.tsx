import { useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { cx } from "./_cx.js";
import { compactNumber, distinctTickLabels } from "./description.js";
import { bandPath, extentOf, linePath, makeScale, round, ticks, type Extent } from "./geometry.js";
import {
  maxAbsFinite,
  scaleImportanceSeries,
  summarizeImportanceComparison,
  type ImportanceComparisonSeries,
  type ImportanceDisplayScaling,
} from "./importanceComparisonModel.js";
import { layoutBandLabels, visibleSpectralBands, type SpectralBand } from "./spectralBands.js";
import {
  decimatedRuns,
  formatAxisValue,
  nearestAxisIndex,
  nextSpectralCursor,
  normalizeSpectralRange,
  sameSpectralRange,
  spectralRangeAt,
  type SpectralRange,
} from "./spectralImportance.js";
import { N4_COLORBLIND_SERIES, N4_VIZ_COLORS, categoricalColor } from "./theme.js";

export interface ImportanceComparisonChartProps {
  /** Shared spectral coordinates (wavelength, wavenumber or feature index). Non-finite entries are gaps. */
  axis: readonly number[];
  /** Profiles to overlay, each aligned to `axis`. */
  series: readonly ImportanceComparisonSeries[];
  /** Per-series display scaling (default `max_abs`); presentation only, readouts keep raw values. */
  scaling?: ImportanceDisplayScaling;
  /** Series ids not drawn (controlled by the host). */
  hiddenIds?: readonly string[];
  /** When supplied, legend entries become toggle buttons calling this with the series id. */
  onToggleSeries?: (id: string) => void;
  /** Axis title including its unit, e.g. "Wavelength (nm)". */
  axisLabel?: string;
  /** Unit appended to coordinates in readouts and summaries, e.g. "nm". */
  axisUnit?: string;
  /** Y-axis title when `scaling` is `none` (default "Importance"). */
  valueLabel?: string;
  /** Optional reference spectrum aligned to `axis`, drawn dashed on a right-hand axis. */
  spectrum?: readonly number[];
  spectrumLabel?: string;
  /** Reference annotation bands in the axis unit (for example from `referenceBandsForAxis`). */
  bands?: readonly SpectralBand[];
  bandsLabel?: string;
  /**
   * Optional groups/regions along the axis. They are not drawn; the hovered or
   * selected range is the narrowest one covering the cursor (otherwise the
   * single axis coordinate).
   */
  regions?: ReadonlyArray<{ start: number; end: number }>;
  /** Range (axis units) shaded behind the curves, for example linked from another view. */
  highlightRange?: SpectralRange | null;
  /** Called with the range under the cursor when it changes, and `null` when the cursor leaves. */
  onRangeHover?: (range: SpectralRange | null) => void;
  /** Called with the range under the cursor on click, or on Enter/Space while focused. */
  onRangeSelect?: (range: SpectralRange) => void;
  /** Display budget per curve; longer runs keep a min/max envelope per bucket. */
  maxPoints?: number;
  width?: number;
  height?: number;
  /** Default series colors (colorblind-safe palette); `series[i].color` wins. */
  palette?: readonly string[];
  spectrumColor?: string;
  valueFormat?: (v: number) => string;
  axisFormat?: (v: number) => string;
  title?: string;
  /** Faithful host-provided text alternative; defaults to a data summary. */
  description?: string;
  /** Show the summary as visible caption text (default true). */
  showSummary?: boolean;
  /** Text shown in the readout before any point is active. */
  instructions?: string;
  className?: string;
}

const PAD = { top: 14, bottom: 42, left: 64 } as const;
const BAND_COLOR = N4_VIZ_COLORS.violet;
const NO_IDS: readonly string[] = [];
const NO_BANDS: readonly SpectralBand[] = [];
const NO_REGIONS: ReadonlyArray<{ start: number; end: number }> = [];

function paddedDomain(values: readonly number[], pad = 0.06): Extent {
  const { min, max } = extentOf(values);
  const span = max - min;
  return { min: min - span * pad, max: max + span * pad };
}

/**
 * Several importance profiles (SHAP, coefficients, VIP, gradients, …) overlaid
 * on one spectral axis. Each series gets a colorblind-safe color and an
 * optional dashed style (for local or approximate profiles) and ± band; the
 * default `max_abs` display scaling divides every profile by its own largest
 * |value| so shapes compare across units. Legend entries toggle series when
 * the host passes `onToggleSeries`; hover/click and keyboard (arrows, Home/End,
 * Enter, Escape) report the range under the cursor for linking with other
 * views. Hosts supply every value; nothing scientific is computed here.
 */
export function ImportanceComparisonChart({
  axis,
  series,
  scaling = "max_abs",
  hiddenIds = NO_IDS,
  onToggleSeries,
  axisLabel = "Spectral axis",
  axisUnit,
  valueLabel = "Importance",
  spectrum,
  spectrumLabel = "Mean spectrum",
  bands = NO_BANDS,
  bandsLabel = "Reference absorption bands",
  regions = NO_REGIONS,
  highlightRange,
  onRangeHover,
  onRangeSelect,
  maxPoints = 1200,
  width = 760,
  height = 360,
  palette = N4_COLORBLIND_SERIES,
  spectrumColor = N4_VIZ_COLORS.slate,
  valueFormat = compactNumber,
  axisFormat = formatAxisValue,
  title = "Importance profile comparison",
  description,
  showSummary = true,
  instructions = "Hover the chart, or focus it and use the arrow keys, Home and End to move along the axis. Enter selects, Escape clears.",
  className,
}: ImportanceComparisonChartProps) {
  const baseId = useId();
  const descriptionId = `${baseId}-desc`;
  const instructionsId = `${baseId}-help`;
  const [cursor, setCursor] = useState<number | null>(null);
  const hoveredRange = useRef<SpectralRange | null>(null);

  const hidden = useMemo(() => new Set(hiddenIds), [hiddenIds]);
  const colored = useMemo(
    () => series.map((entry, index) => ({ entry, color: entry.color ?? categoricalColor(index, palette) })),
    [series, palette],
  );
  const visible = colored.filter(({ entry }) => !hidden.has(entry.id));
  const scaled = useMemo(
    () => new Map(series.map((entry) => [entry.id, scaleImportanceSeries(entry, scaling)])),
    [series, scaling],
  );
  const hasSpectrum = Boolean(spectrum && spectrum.some((value) => Number.isFinite(value)));
  const suffix = axisUnit ? ` ${axisUnit}` : "";

  const padRight = hasSpectrum ? 60 : 20;
  const plotLeft = PAD.left;
  const plotRight = Math.max(plotLeft + 10, width - padRight);
  const plotTop = PAD.top;
  const plotBottom = Math.max(plotTop + 40, height - PAD.bottom);

  const xDomain = extentOf(axis);
  const xScale = makeScale(xDomain, plotLeft, plotRight);
  const xTicks = ticks(xDomain, Math.max(2, Math.round((plotRight - plotLeft) / 90)));
  const xTickLabels = distinctTickLabels(xTicks, axisFormat);

  const runs = useMemo(
    () =>
      colored.map(({ entry }) => {
        const display = scaled.get(entry.id)!;
        return {
          id: entry.id,
          line: decimatedRuns(axis, display.values, maxPoints),
          band:
            display.lower && display.upper
              ? (() => {
                  const lower = decimatedRuns(axis, display.lower, maxPoints);
                  return decimatedRuns(axis, display.upper, maxPoints).map((run, index) => ({ upper: run, lower: lower[index] ?? [] }));
                })()
              : [],
        };
      }),
    [colored, scaled, axis, maxPoints],
  );
  const runsById = new Map(runs.map((run) => [run.id, run]));

  const yValues: number[] = [];
  for (const { entry } of visible) {
    const run = runsById.get(entry.id)!;
    for (const part of run.line) for (const [, y] of part) yValues.push(y);
    for (const part of run.band) for (const [, y] of [...part.upper, ...part.lower]) yValues.push(y);
  }
  const anySigned = visible.some(({ entry }) => entry.signed);
  let yMin = Math.min(0, ...yValues.filter(Number.isFinite));
  let yMax = Math.max(0, ...yValues.filter(Number.isFinite));
  if (scaling === "max_abs") {
    yMax = Math.max(1, yMax);
    if (anySigned || yMin < 0) yMin = Math.min(-1, yMin);
  } else if (anySigned && yMin === 0 && yMax > 0) {
    yMin = -yMax;
  }
  if (yMax === yMin) yMax = yMin + 1;
  const yPad = (yMax - yMin) * 0.05;
  const yDomain: Extent = { min: yMin < 0 ? yMin - yPad : 0, max: yMax + yPad };
  const yScale = makeScale(yDomain, plotBottom, plotTop);
  const yTicks = ticks(yDomain, 4);
  const yTickLabels = distinctTickLabels(yTicks, valueFormat);
  const yTitle = scaling === "max_abs" ? `${valueLabel} (÷ max |value| per profile)` : valueLabel;

  const spectrumRuns = useMemo(
    () => (hasSpectrum && spectrum ? decimatedRuns(axis, spectrum, maxPoints) : []),
    [axis, spectrum, hasSpectrum, maxPoints],
  );
  const spectrumDomain = paddedDomain(spectrumRuns.flat().map(([, y]) => y));
  const spectrumScale = makeScale(spectrumDomain, plotBottom, plotTop);
  const spectrumTicks = hasSpectrum ? ticks(spectrumDomain, 4) : [];
  const spectrumTickLabels = distinctTickLabels(spectrumTicks, valueFormat);

  const toSpan = (start: number, end: number) => {
    const a = xScale(start);
    const b = xScale(end);
    const left = Math.min(plotRight - 1, Math.max(plotLeft, Math.min(a, b)));
    const right = Math.min(plotRight, Math.max(a, b));
    return { left, right: Math.max(right, left + 1) };
  };
  const shownBands = useMemo(
    () => (bands.length > 0 ? visibleSpectralBands(bands, xDomain.min, xDomain.max) : []),
    [bands, xDomain.min, xDomain.max],
  );
  const bandSpans = shownBands.map((band) => ({ ...toSpan(band.start, band.end), label: band.label }));
  const bandLabels = layoutBandLabels(bandSpans, { minX: plotLeft + 2, maxX: plotRight - 2, rows: plotBottom - plotTop >= 140 ? 2 : 1 });

  const highlight = normalizeSpectralRange(highlightRange);
  const highlightSpan = highlight ? toSpan(highlight.start, highlight.end) : null;

  const summary =
    description?.trim() ||
    [
      summarizeImportanceComparison({ axis, series, hiddenIds: hidden, scaling, axisUnit, valueFormat, axisFormat }),
      hasSpectrum ? `${spectrumLabel} is drawn on the right axis.` : "",
      shownBands.length > 0 ? `${bandsLabel}: ${shownBands.length} shown as annotations.` : "",
    ]
      .filter(Boolean)
      .join(" ");

  // --- cursor + range linking --------------------------------------------
  const active = cursor !== null && cursor >= 0 && cursor < axis.length ? cursor : -1;
  const rangeFor = (index: number | null): SpectralRange | null =>
    index === null || index < 0 ? null : spectralRangeAt(regions, axis[index] ?? NaN);
  const moveCursor = (next: number | null) => {
    setCursor(next);
    if (!onRangeHover) return;
    const range = rangeFor(next);
    if (sameSpectralRange(range, hoveredRange.current)) return;
    hoveredRange.current = range;
    onRangeHover(range);
  };
  const indexAt = (event: MouseEvent<SVGSVGElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return -1;
    const px = ((event.clientX - rect.left) / rect.width) * width;
    if (px < plotLeft || px > plotRight) return -1;
    const x = xDomain.min + ((px - plotLeft) / (plotRight - plotLeft || 1)) * (xDomain.max - xDomain.min);
    return nearestAxisIndex(axis, x);
  };
  const handlePointer = (event: MouseEvent<SVGSVGElement>) => {
    const index = indexAt(event);
    if (index >= 0) moveCursor(index);
  };
  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    const index = indexAt(event);
    if (index < 0) return;
    moveCursor(index);
    const range = rangeFor(index);
    if (range && onRangeSelect) onRangeSelect(range);
  };
  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === "Enter" || event.key === " ") && onRangeSelect) {
      const range = rangeFor(active);
      if (range) {
        event.preventDefault();
        onRangeSelect(range);
      }
      return;
    }
    const next = nextSpectralCursor(active >= 0 ? { kind: "point", index: active } : null, event.key, 0, axis.length);
    if (next === undefined) return;
    event.preventDefault();
    moveCursor(next === null ? null : next.index);
  };

  const readout = (() => {
    if (active < 0) return instructions;
    const x = axis[active]!;
    const parts = [`${axisLabel} ${axisFormat(x)}${suffix}`];
    for (const { entry } of visible) {
      const raw = entry.values[active];
      const display = scaled.get(entry.id)!;
      if (raw === undefined || !Number.isFinite(raw)) {
        parts.push(`${entry.label} unavailable`);
        continue;
      }
      const err = entry.error?.[active];
      const errText = err !== undefined && Number.isFinite(err) ? ` ± ${valueFormat(err)}` : "";
      parts.push(
        scaling === "max_abs" && display.divisor !== 1
          ? `${entry.label} ${valueFormat(raw / display.divisor)} (raw ${valueFormat(raw)}${errText})`
          : `${entry.label} ${valueFormat(raw)}${errText}`,
      );
    }
    return parts.join(" · ");
  })();

  return (
    <figure className={cx("n4viz-figure", "n4viz-importance-compare", className)}>
      <div
        className="n4viz-focus"
        role="group"
        tabIndex={0}
        aria-label={title}
        aria-describedby={instructionsId}
        onKeyDown={handleKey}
      >
        <svg
          className="n4viz"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={title}
          aria-describedby={descriptionId}
          preserveAspectRatio="xMidYMid meet"
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onClick={onRangeSelect ? handleClick : undefined}
          onPointerLeave={() => moveCursor(null)}
        >
          <title>{title}</title>
          <desc id={descriptionId}>{summary}</desc>

          {yTicks.map((tick) => (
            <line key={`gy-${tick}`} className="n4viz-grid" x1={plotLeft} x2={plotRight} y1={round(yScale(tick))} y2={round(yScale(tick))} />
          ))}
          {xTicks.map((tick) => (
            <line key={`gx-${tick}`} className="n4viz-grid" x1={round(xScale(tick))} x2={round(xScale(tick))} y1={plotTop} y2={plotBottom} />
          ))}
          {bandSpans.length > 0 ? (
            <g className="n4viz-bands">
              {bandSpans.map((span, index) => {
                const band = shownBands[index]!;
                return (
                  <rect
                    key={`band-${index}`}
                    className="n4viz-band"
                    data-family={band.family}
                    x={round(span.left)}
                    y={plotTop}
                    width={round(span.right - span.left)}
                    height={round(plotBottom - plotTop)}
                    fill={BAND_COLOR}
                    fillOpacity={0.09}
                  >
                    <title>{`${band.label}: ${axisFormat(band.start)}–${axisFormat(band.end)}${suffix}${band.assignment ? ` — ${band.assignment}` : ""}`}</title>
                  </rect>
                );
              })}
            </g>
          ) : null}
          {highlightSpan ? (
            <rect
              className="n4viz-highlight-range"
              x={round(highlightSpan.left)}
              y={plotTop}
              width={round(Math.max(2, highlightSpan.right - highlightSpan.left))}
              height={round(plotBottom - plotTop)}
            />
          ) : null}
          {spectrumRuns.map((run, index) => (
            <path
              key={`spectrum-${index}`}
              className="n4viz-spectrum-line"
              d={linePath(run.map(([x, y]) => [xScale(x), spectrumScale(y)] as const))}
              fill="none"
              stroke={spectrumColor}
              strokeWidth={1.25}
              strokeDasharray="2 3"
              strokeOpacity={0.6}
            />
          ))}
          {yDomain.min < 0 ? (
            <line className="n4viz-axis n4viz-zero" x1={plotLeft} x2={plotRight} y1={round(yScale(0))} y2={round(yScale(0))} />
          ) : null}
          {visible.map(({ entry, color }) =>
            runsById.get(entry.id)!.band.map((part, index) => (
              <path
                key={`error-${entry.id}-${index}`}
                className="n4viz-error-band"
                data-series={entry.id}
                d={bandPath(
                  part.upper.map(([x, y]) => [xScale(x), yScale(y)] as const),
                  part.lower.map(([x, y]) => [xScale(x), yScale(y)] as const),
                )}
                fill={color}
                fillOpacity={0.14}
                stroke="none"
              />
            )),
          )}
          {visible.map(({ entry, color }) =>
            runsById.get(entry.id)!.line.map((run, index) => (
              <path
                key={`series-${entry.id}-${index}`}
                className="n4viz-compare-line"
                data-series={entry.id}
                d={linePath(run.map(([x, y]) => [xScale(x), yScale(y)] as const))}
                fill="none"
                stroke={color}
                strokeWidth={1.8}
                strokeLinejoin="round"
                strokeDasharray={entry.dashed ? "6 4" : undefined}
              />
            )),
          )}
          {bandLabels.some(Boolean) ? (
            <g className="n4viz-band-labels" aria-hidden="true">
              {bandLabels.map((placement, index) =>
                placement ? (
                  <text key={`band-label-${index}`} className="n4viz-band-label" x={round(placement.x)} y={round(plotTop + 9 + placement.row * 11)} textAnchor="middle" fill={BAND_COLOR}>
                    {placement.text}
                  </text>
                ) : null,
              )}
            </g>
          ) : null}
          {visible.length === 0 ? (
            <text className="n4viz-axis-label" x={round((plotLeft + plotRight) / 2)} y={round((plotTop + plotBottom) / 2)} textAnchor="middle">
              {series.length === 0 ? "No importance profiles" : "All profiles hidden"}
            </text>
          ) : null}

          <line className="n4viz-axis" x1={plotLeft} x2={plotLeft} y1={plotTop} y2={plotBottom} />
          <line className="n4viz-axis" x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} />
          {yTicks.map((tick, index) => (
            <text key={`ty-${tick}`} className="n4viz-tick" x={plotLeft - 6} y={round(yScale(tick) + 3)} textAnchor="end">
              {yTickLabels[index]}
            </text>
          ))}
          <text className="n4viz-axis-label" transform={`translate(12 ${round((plotTop + plotBottom) / 2)}) rotate(-90)`} textAnchor="middle">
            {yTitle}
          </text>
          {hasSpectrum ? (
            <>
              <line className="n4viz-axis" x1={plotRight} x2={plotRight} y1={plotTop} y2={plotBottom} />
              {spectrumTicks.map((tick, index) => (
                <text key={`ts-${tick}`} className="n4viz-tick" x={plotRight + 6} y={round(spectrumScale(tick) + 3)} textAnchor="start">
                  {spectrumTickLabels[index]}
                </text>
              ))}
              <text className="n4viz-axis-label" transform={`translate(${width - 8} ${round((plotTop + plotBottom) / 2)}) rotate(90)`} textAnchor="middle">
                {spectrumLabel}
              </text>
            </>
          ) : null}
          {xTicks.map((tick, index) => (
            <text key={`tx-${tick}`} className="n4viz-tick" x={round(xScale(tick))} y={plotBottom + 15} textAnchor="middle">
              {xTickLabels[index]}
            </text>
          ))}
          <text className="n4viz-axis-label" x={round((plotLeft + plotRight) / 2)} y={height - 8} textAnchor="middle">
            {axisLabel}
          </text>

          {active >= 0 && Number.isFinite(axis[active] ?? NaN) ? (
            <>
              <line className="n4viz-cursor" x1={round(xScale(axis[active]!))} x2={round(xScale(axis[active]!))} y1={plotTop} y2={plotBottom} />
              {visible.map(({ entry, color }) => {
                const value = scaled.get(entry.id)!.values[active];
                return value !== undefined && Number.isFinite(value) ? (
                  <circle key={`dot-${entry.id}`} className="n4viz-cursor-dot" cx={round(xScale(axis[active]!))} cy={round(yScale(value))} r={3} fill={color} />
                ) : null;
              })}
            </>
          ) : null}
        </svg>
      </div>

      <p className="n4viz-readout" aria-live="polite">{readout}</p>
      <p id={instructionsId} className="n4viz-sr-only">{instructions}</p>

      <div className="n4viz-legend-row n4viz-compare-legend" role={onToggleSeries ? "group" : undefined} aria-label={onToggleSeries ? "Show or hide profiles" : undefined}>
        {colored.map(({ entry, color }) => {
          const isHidden = hidden.has(entry.id);
          const swatch = <span className={cx("n4viz-swatch-line", entry.dashed && "n4viz-swatch-dashed")} style={{ borderColor: color }} aria-hidden="true" />;
          const extra = scaling === "max_abs" && maxAbsFinite(entry.values) > 0 ? ` (max |value| ${valueFormat(maxAbsFinite(entry.values))})` : "";
          return onToggleSeries ? (
            <button
              key={entry.id}
              type="button"
              className="n4viz-legend-item n4viz-legend-toggle"
              data-hidden={isHidden ? "true" : undefined}
              aria-pressed={!isHidden}
              title={`${isHidden ? "Show" : "Hide"} ${entry.label}${extra}`}
              onClick={() => onToggleSeries(entry.id)}
            >
              {swatch}
              {entry.label}
            </button>
          ) : (
            <span key={entry.id} className="n4viz-legend-item" data-hidden={isHidden ? "true" : undefined} title={`${entry.label}${extra}`}>
              {swatch}
              {entry.label}
            </span>
          );
        })}
        {hasSpectrum ? (
          <span className="n4viz-legend-item" aria-hidden="true">
            <span className="n4viz-swatch-line n4viz-swatch-dashed" style={{ borderColor: spectrumColor }} />
            {spectrumLabel}
          </span>
        ) : null}
        {shownBands.length > 0 ? (
          <span className="n4viz-legend-item" aria-hidden="true"><span className="n4viz-swatch n4viz-band-swatch" />{bandsLabel}</span>
        ) : null}
      </div>

      {showSummary ? <figcaption className="n4viz-summary">{summary}</figcaption> : null}
    </figure>
  );
}
