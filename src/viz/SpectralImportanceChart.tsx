import { useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

import { cx } from "./_cx.js";
import { compactNumber, countLabel, distinctTickLabels, signedNumber } from "./description.js";
import { bandPath, extentOf, linePath, makeScale, round, ticks, type Extent } from "./geometry.js";
import {
  bandAssignmentLabel,
  bandsForImportantRegions,
  regionsWithImportanceStrength,
  layoutBandLabels,
  spectralBandReadout,
  spectralBandsAt,
  visibleSpectralBands,
  type SpectralBand,
} from "./spectralBands.js";
import {
  decimatedRuns,
  errorBounds,
  formatAxisValue,
  nearestAxisIndex,
  nextSpectralCursor,
  normalizeSpectralRange,
  regionsAt,
  resolveRegionValueKind,
  resolveSpectralRegions,
  sameSpectralRange,
  spectralRangeAt,
  summarizeSpectralImportance,
  type RegionValueKind,
  type SpectralCursor,
  type SpectralImportanceRegion,
  type SpectralRange,
} from "./spectralImportance.js";
import { N4_SIGNED_COLORS, N4_VIZ_COLORS } from "./theme.js";

export interface SpectralImportanceChartProps {
  /** Shared spectral coordinates (wavelength, wavenumber or feature index). Non-finite entries are gaps. */
  axis: readonly number[];
  /** Importance curve aligned to `axis` (for example mean |SHAP| per variable). */
  importance: readonly number[];
  /**
   * Optional host-computed uncertainty aligned to `axis` (same length as
   * `importance`), drawn as a translucent `importance ± error` band. Non-finite
   * or negative entries leave a gap in the band.
   */
  importanceError?: readonly number[];
  /** Label of the uncertainty band in the legend and readout (default "± uncertainty"). */
  importanceErrorLabel?: string;
  /** Range (axis units) shaded across both panels, for example linked from another view. */
  highlightRange?: SpectralRange | null;
  /**
   * Called with the range under the pointer or keyboard cursor (the narrowest
   * region covering it, otherwise the single axis coordinate) and with `null`
   * when the cursor leaves or is cleared. Called only when the range changes.
   */
  onRangeHover?: (range: SpectralRange | null) => void;
  /** Called with the range under the cursor on click, or on Enter/Space while focused. */
  onRangeSelect?: (range: SpectralRange) => void;
  /** Optional reference spectrum aligned to `axis`, drawn dashed on a right-hand axis. */
  spectrum?: readonly number[];
  /** Precomputed region (bin) values shaded behind the curve and drawn as bars below it. */
  regions?: readonly SpectralImportanceRegion[];
  /** How region values must be read; inferred from the presence of negative values when omitted. */
  regionValueKind?: RegionValueKind;
  /** Axis title including its unit, e.g. "Wavelength (nm)". */
  axisLabel?: string;
  /** Unit appended to coordinates in readouts and summaries, e.g. "nm". */
  axisUnit?: string;
  importanceLabel?: string;
  spectrumLabel?: string;
  regionLabel?: string;
  /** Legend text for signed region colors. */
  positiveLabel?: string;
  negativeLabel?: string;
  /** Regions whose relative strength is below this fraction are not shaded behind the curve (bars always show). */
  highlightThreshold?: number;
  /** Display budget for the curves; longer runs keep a min/max envelope per bucket. */
  maxPoints?: number;
  width?: number;
  height?: number;
  color?: string;
  positiveColor?: string;
  negativeColor?: string;
  spectrumColor?: string;
  valueFormat?: (v: number) => string;
  axisFormat?: (v: number) => string;
  title?: string;
  /** Faithful host-provided text alternative; defaults to a data summary. */
  description?: string;
  /** Show the summary as visible caption text (default true). */
  showSummary?: boolean;
  /** Show the region values as a collapsible HTML table (default true). */
  showDataTable?: boolean;
  /** Text shown in the readout before any point or region is active. */
  instructions?: string;
  /**
   * Reference annotation bands in the axis unit (for example from
   * `referenceBandsForAxis`), drawn as labelled translucent spans behind the
   * importance curve. They are annotations only and never alter the data.
   */
  bands?: readonly SpectralBand[];
  /** Caption for the band legend, readout and table (default "Reference absorption bands"). */
  bandsLabel?: string;
  /**
   * `"all"` (default) draws every band in range. `"important"` keeps only the
   * bands overlapping an important region (see `bandImportanceThreshold`),
   * draws them more prominently with their short assignment and lists each
   * important region's candidate bands in the summary and table.
   */
  bandFocus?: SpectralBandFocus;
  /** Important regions reach at least this fraction (default 0.5) of the peak of the magnitude `importance` curve (for example mean |SHAP|) inside their bounds; signed region values are not used because they can cancel. */
  bandImportanceThreshold?: number;
  /** Caption used instead of `bandsLabel` when `bandFocus` is `"important"`. */
  importantBandsLabel?: string;
  className?: string;
}

/** Which reference bands the chart draws: every band in range, or those overlapping important regions. */
export type SpectralBandFocus = "all" | "important";

const PAD = { top: 14, bottom: 46, left: 64, gap: 22 } as const;

/** Default band color; `assets/viz.css` themes it through `--n4-viz-band` (light and dark). */
const BAND_COLOR = N4_VIZ_COLORS.violet;
const BAND_LABEL_ROW_HEIGHT = 11;
const NO_BANDS: readonly SpectralBand[] = [];

function domainWithZero(values: readonly number[], pad = 0.08): Extent {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return { min: 0, max: 1 };
  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  const span = max - min || Math.abs(max) || 1;
  return { min: min < 0 ? min - span * pad : 0, max: max > 0 ? max + span * pad : min < 0 ? span * pad : 1 };
}

function paddedDomain(values: readonly number[], pad = 0.06): Extent {
  const { min, max } = extentOf(values);
  const span = max - min;
  return { min: min - span * pad, max: max + span * pad };
}

/**
 * Spectral importance view: an importance curve (for example mean |SHAP|)
 * along the spectral axis with shaded, strength-weighted regions behind it, an
 * optional dashed reference spectrum on a right-hand axis and a lower panel of
 * region bars sharing the same axis. Signed region values keep their direction
 * (bars above/below zero, signed text, two colors); magnitudes use one color
 * ramp. Pointer hover and keyboard focus (arrow keys step through regions,
 * Home/End, Escape) drive a persistent readout; a visible summary and an HTML
 * table of region values provide the text alternative. Hosts pass already
 * computed values; nothing scientific is recomputed here.
 */
export function SpectralImportanceChart({
  axis,
  importance,
  importanceError,
  importanceErrorLabel = "± uncertainty",
  highlightRange,
  onRangeHover,
  onRangeSelect,
  spectrum,
  regions = [],
  regionValueKind,
  axisLabel = "Spectral axis",
  axisUnit,
  importanceLabel = "Mean |SHAP|",
  spectrumLabel = "Mean spectrum",
  regionLabel = "Binned importance",
  positiveLabel = "Positive",
  negativeLabel = "Negative",
  highlightThreshold = 0.2,
  maxPoints = 1200,
  width = 760,
  height = 440,
  color = N4_VIZ_COLORS.teal,
  positiveColor = N4_SIGNED_COLORS.positive,
  negativeColor = N4_SIGNED_COLORS.negative,
  spectrumColor = N4_VIZ_COLORS.slate,
  valueFormat = compactNumber,
  axisFormat = formatAxisValue,
  title = "Spectral importance",
  description,
  showSummary = true,
  showDataTable = true,
  instructions = "Hover the chart, or focus it and use the arrow keys, Home and End to step through regions. Escape clears.",
  bands = NO_BANDS,
  bandsLabel = "Reference absorption bands",
  bandFocus = "all",
  bandImportanceThreshold = 0.5,
  importantBandsLabel = "Candidate absorption bands in important regions",
  className,
}: SpectralImportanceChartProps) {
  const baseId = useId();
  const descriptionId = `${baseId}-desc`;
  const instructionsId = `${baseId}-help`;
  const gradientId = `${baseId}-area`;
  const [cursor, setCursor] = useState<SpectralCursor | null>(null);
  const hoveredRange = useRef<SpectralRange | null>(null);

  const kind = resolveRegionValueKind(regions, regionValueKind);
  const signed = kind === "signed";
  const resolved = useMemo(() => resolveSpectralRegions(regions, axisFormat), [regions, axisFormat]);
  const hasSpectrum = Boolean(spectrum && spectrum.some((value) => Number.isFinite(value)));
  const suffix = axisUnit ? ` ${axisUnit}` : "";
  const formatRegionValue = (value: number) => (signed ? signedNumber(value, valueFormat) : valueFormat(value));

  const padRight = hasSpectrum ? 60 : 20;
  const plotLeft = PAD.left;
  const plotRight = Math.max(plotLeft + 10, width - padRight);
  const available = Math.max(60, height - PAD.top - PAD.bottom - PAD.gap);
  const hasRegions = resolved.length > 0;
  const topHeight = hasRegions ? available * 0.68 : available;
  const topTop = PAD.top;
  const topBottom = topTop + topHeight;
  const barTop = topBottom + PAD.gap;
  const barBottom = height - PAD.bottom;

  const xValues = useMemo(() => [...axis.filter((value) => Number.isFinite(value)), ...resolved.flatMap((region) => [region.start, region.end])], [axis, resolved]);
  const xDomain = extentOf(xValues);
  const xScale = makeScale(xDomain, plotLeft, plotRight);
  const xTicks = ticks(xDomain, Math.max(2, Math.round((plotRight - plotLeft) / 90)));
  const xTickLabels = distinctTickLabels(xTicks, axisFormat);

  const importanceRuns = useMemo(() => decimatedRuns(axis, importance, maxPoints), [axis, importance, maxPoints]);
  const spectrumRuns = useMemo(
    () => (hasSpectrum && spectrum ? decimatedRuns(axis, spectrum, maxPoints) : []),
    [axis, spectrum, hasSpectrum, maxPoints],
  );
  const errorRuns = useMemo(() => {
    if (!importanceError || importanceError.length === 0) return [];
    const { lower, upper } = errorBounds(importance, importanceError);
    const lowerRuns = decimatedRuns(axis, lower, maxPoints);
    const upperRuns = decimatedRuns(axis, upper, maxPoints);
    // Both bounds share the same finite mask, hence the same runs.
    return upperRuns.map((run, index) => ({ upper: run, lower: lowerRuns[index] ?? [] }));
  }, [axis, importance, importanceError, maxPoints]);
  const hasError = errorRuns.length > 0;
  const importanceDomain = domainWithZero(
    [
      ...importanceRuns.flat().map(([, y]) => y),
      ...errorRuns.flatMap((run) => [...run.upper.map(([, y]) => y), ...run.lower.map(([, y]) => y)]),
    ],
    0.1,
  );
  const yScale = makeScale(importanceDomain, topBottom, topTop);
  const yTicks = ticks(importanceDomain, 4);
  const yTickLabels = distinctTickLabels(yTicks, valueFormat);
  const spectrumDomain = paddedDomain(spectrumRuns.flat().map(([, y]) => y));
  const spectrumScale = makeScale(spectrumDomain, topBottom, topTop);
  const spectrumTicks = hasSpectrum ? ticks(spectrumDomain, 4) : [];
  const spectrumTickLabels = distinctTickLabels(spectrumTicks, valueFormat);

  const barDomain = signed
    ? domainWithZero(resolved.map((region) => region.value))
    : { min: 0, max: Math.max(0, ...resolved.map((region) => (Number.isFinite(region.value) ? region.value : 0))) * 1.08 || 1 };
  const barScale = makeScale(barDomain, barBottom, barTop);
  const barTicks = ticks(barDomain, 2);
  const barTickLabels = distinctTickLabels(barTicks, signed ? (v) => signedNumber(v, valueFormat) : valueFormat);
  const barZero = barScale(0);
  const centers = resolved.map((region) => xScale(region.center));
  let spacing = Infinity;
  for (let index = 1; index < centers.length; index += 1) {
    const delta = Math.abs(centers[index]! - centers[index - 1]!);
    if (delta > 0) spacing = Math.min(spacing, delta);
  }
  const singleWidth = resolved.length === 1 ? Math.abs(xScale(resolved[0]!.end) - xScale(resolved[0]!.start)) : Infinity;
  const barWidth = Math.max(1, Math.min(Number.isFinite(spacing) ? spacing * 0.86 : singleWidth, singleWidth, 48));

  const regionFill = (value: number) => (!signed ? color : value < 0 ? negativeColor : positiveColor);

  // --- reference bands (annotations, top panel only) -----------------------
  const hasBandInput = bands.length > 0;
  const focusImportant = bandFocus === "important";
  const bandCaption = focusImportant ? importantBandsLabel : bandsLabel;
  const visibleBands = useMemo(
    () => (hasBandInput ? visibleSpectralBands(bands, xDomain.min, xDomain.max) : []),
    [bands, hasBandInput, xDomain.min, xDomain.max],
  );
  const bandSelection = useMemo(
    () =>
      hasBandInput && focusImportant
        ? bandsForImportantRegions(visibleBands, regionsWithImportanceStrength(resolved, axis, importance), bandImportanceThreshold)
        : null,
    [hasBandInput, focusImportant, visibleBands, resolved, axis, importance, bandImportanceThreshold],
  );
  const shownBands = useMemo(
    () => (bandSelection ? bandSelection.bands.map((match) => match.band) : visibleBands),
    [bandSelection, visibleBands],
  );
  const unmatchedRegions = bandSelection ? bandSelection.regions.filter((entry) => entry.bands.length === 0) : [];
  const toSpan = (start: number, end: number) => {
    // min/max keeps spans valid whatever the scale direction; clamping clips them to the plot.
    const a = xScale(start);
    const b = xScale(end);
    const left = Math.min(plotRight - 1, Math.max(plotLeft, Math.min(a, b)));
    const right = Math.min(plotRight, Math.max(a, b));
    return { left, right: Math.max(right, left + 1) };
  };
  const bandSpans = shownBands.map((band) => ({ ...toSpan(band.start, band.end), label: band.label }));
  // In "important" mode a label names the band and its short assignment and is centred on the
  // part of the band covered by its important regions; the plain band label is the fallback.
  const bandLabelSpans = bandSelection
    ? bandSelection.bands.map(({ band, regions: hit }) => {
        const low = Math.max(band.start, Math.min(...hit.map((region) => region.start)));
        const high = Math.min(band.end, Math.max(...hit.map((region) => region.end)));
        return {
          ...(high >= low ? toSpan(low, high) : toSpan(band.start, band.end)),
          label: bandAssignmentLabel(band),
          fallbackLabel: band.label,
        };
      })
    : bandSpans;
  const bandLabelRows = focusImportant ? (topHeight >= 160 ? 3 : topHeight >= 120 ? 2 : 1) : topHeight >= 120 ? 2 : 1;
  const bandLabels = layoutBandLabels(bandLabelSpans, {
    minX: plotLeft + 2,
    maxX: plotRight - 2,
    rows: bandLabelRows,
    // important-mode labels are slightly larger and bold (see assets/viz.css)
    ...(focusImportant ? { maxChars: 44, minSpan: 1, charWidth: 5.8 } : {}),
  });
  const bandRangeText = (band: SpectralBand) => `${axisFormat(band.start)}–${axisFormat(band.end)}`;
  const thresholdText = `${Math.round(bandImportanceThreshold * 100)}%`;
  const bandSummary = (() => {
    if (!hasBandInput) return "";
    if (!bandSelection) {
      return shownBands.length > 0
        ? `${bandsLabel}: ${countLabel(shownBands.length, "band")} shown as annotations behind the curve.`
        : `${bandsLabel}: none within the displayed axis range.`;
    }
    if (bandSelection.regions.length === 0) {
      return resolved.length === 0
        ? `${importantBandsLabel}: no region values are available to select important regions.`
        : `${importantBandsLabel}: no region reaches ${thresholdText} of the ${importanceLabel} peak.`;
    }
    const items = bandSelection.regions.map(({ region, bands: matched }) => {
      const candidates = matched.length > 0
        ? matched
            .map((band) => {
              const short = band.shortAssignment ?? band.family;
              return short ? `${band.label} (${short})` : band.label;
            })
            .join(", ")
        : "no catalogued band";
      return `${region.label}${suffix} (${formatRegionValue(region.value)}): ${candidates}`;
    });
    return `${importantBandsLabel} (${importanceLabel} at least ${thresholdText} of its peak): ${items.join("; ")}. These are typical literature assignments for the ranges, candidates rather than evidence of chemical causation.`;
  })();

  const dataSummary = summarizeSpectralImportance({
    axis,
    importance,
    spectrum: hasSpectrum ? spectrum : undefined,
    regions: resolved,
    regionValueKind: kind,
    importanceLabel,
    spectrumLabel,
    regionLabel,
    axisUnit,
    valueFormat,
    axisFormat,
  });
  const errorSummary = hasError ? `A ${importanceErrorLabel} band is drawn around ${importanceLabel}.` : "";
  const summary = description?.trim() || [dataSummary, errorSummary, bandSummary].filter(Boolean).join(" ");

  // --- cursor resolution -------------------------------------------------
  const pointCount = axis.length;
  const activeRegion = cursor?.kind === "region" ? resolved[cursor.index] ?? null : null;
  const activePoint = cursor?.kind === "point" && cursor.index >= 0 && cursor.index < pointCount ? cursor.index : -1;
  const cursorX = activeRegion ? activeRegion.center : activePoint >= 0 ? axis[activePoint]! : NaN;
  const activeBands = shownBands.length > 0 ? spectralBandsAt(shownBands, cursorX) : [];
  const bandReadout = spectralBandReadout(activeBands, bandCaption);

  const readout = (() => {
    if (activeRegion) {
      const centerIndex = nearestAxisIndex(axis, activeRegion.center);
      const curve = centerIndex >= 0 ? importance[centerIndex] : undefined;
      return [
        `${regionLabel} ${activeRegion.label}${suffix}`,
        `${formatRegionValue(activeRegion.value)}`,
        activeRegion.rank > 0 ? `rank ${activeRegion.rank} of ${resolved.filter((region) => region.rank > 0).length} by magnitude` : "value unavailable",
        curve !== undefined && Number.isFinite(curve) ? `${importanceLabel} at center ${valueFormat(curve)}` : null,
        bandReadout,
      ].filter(Boolean).join(" · ");
    }
    if (activePoint >= 0) {
      const x = axis[activePoint]!;
      const y = importance[activePoint];
      const s = hasSpectrum && spectrum ? spectrum[activePoint] : undefined;
      const covering = Number.isFinite(x) ? regionsAt(resolved, x) : [];
      return [
        `${axisLabel} ${axisFormat(x)}${suffix}`,
        `${importanceLabel} ${y !== undefined && Number.isFinite(y) ? valueFormat(y) : "unavailable"}${
          hasError && Number.isFinite(importanceError?.[activePoint] ?? NaN) ? ` ± ${valueFormat(importanceError![activePoint]!)}` : ""
        }`,
        s !== undefined ? `${spectrumLabel} ${Number.isFinite(s) ? valueFormat(s) : "unavailable"}` : null,
        covering.length > 0 ? `${regionLabel} ${covering.map((region) => `${region.label}: ${formatRegionValue(region.value)}`).join(", ")}` : null,
        bandReadout,
      ].filter(Boolean).join(" · ");
    }
    return instructions;
  })();

  // --- range linking ----------------------------------------------------
  const rangeFor = (target: SpectralCursor | null): SpectralRange | null => {
    if (!target) return null;
    if (target.kind === "region") {
      const region = resolved[target.index];
      return region ? { start: region.start, end: region.end } : null;
    }
    return spectralRangeAt(resolved, axis[target.index] ?? NaN);
  };
  const moveCursor = (next: SpectralCursor | null) => {
    setCursor(next);
    if (!onRangeHover) return;
    const range = rangeFor(next);
    if (sameSpectralRange(range, hoveredRange.current)) return;
    hoveredRange.current = range;
    onRangeHover(range);
  };
  const highlight = normalizeSpectralRange(highlightRange);
  const highlightSpan = highlight ? toSpan(highlight.start, highlight.end) : null;

  const cursorAt = (event: MouseEvent<SVGSVGElement>): SpectralCursor | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const px = ((event.clientX - rect.left) / rect.width) * width;
    if (px < plotLeft || px > plotRight) return null;
    const x = xDomain.min + ((px - plotLeft) / (plotRight - plotLeft || 1)) * (xDomain.max - xDomain.min);
    const index = nearestAxisIndex(axis, x);
    return index >= 0 ? { kind: "point", index } : null;
  };
  const handlePointer = (event: PointerEvent<SVGSVGElement>) => {
    const next = cursorAt(event);
    if (next) moveCursor(next);
  };
  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    const next = cursorAt(event);
    if (!next) return;
    moveCursor(next);
    const range = rangeFor(next);
    if (range && onRangeSelect) onRangeSelect(range);
  };

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === "Enter" || event.key === " ") && onRangeSelect) {
      const range = rangeFor(cursor);
      if (range) {
        event.preventDefault();
        onRangeSelect(range);
      }
      return;
    }
    const next = nextSpectralCursor(cursor, event.key, resolved.length, pointCount);
    if (next === undefined) return;
    event.preventDefault();
    moveCursor(next);
  };

  return (
    <figure className={cx("n4viz-figure", "n4viz-spectral-importance", className)}>
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
          onPointerLeave={() => {
            if (cursor?.kind === "point") moveCursor(null);
          }}
        >
          <title>{title}</title>
          <desc id={descriptionId}>{summary}</desc>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* top panel: grid, region shading, curves */}
          {yTicks.map((tick) => (
            <line key={`gy-${tick}`} className="n4viz-grid" x1={plotLeft} x2={plotRight} y1={round(yScale(tick))} y2={round(yScale(tick))} />
          ))}
          {xTicks.map((tick) => (
            <line key={`gx-${tick}`} className="n4viz-grid" x1={round(xScale(tick))} x2={round(xScale(tick))} y1={topTop} y2={topBottom} />
          ))}
          {bandSpans.length > 0 ? (
            <g className="n4viz-bands">
              {bandSpans.map((span, index) => {
                const band = shownBands[index]!;
                const active = activeBands.includes(band);
                return (
                  <rect
                    key={`band-${index}`}
                    className="n4viz-band"
                    data-family={band.family}
                    data-focus={focusImportant ? "important" : undefined}
                    data-active={active ? "true" : undefined}
                    x={round(span.left)}
                    y={topTop}
                    width={round(span.right - span.left)}
                    height={round(topHeight)}
                    fill={BAND_COLOR}
                    fillOpacity={focusImportant ? (active ? 0.3 : 0.18) : active ? 0.2 : 0.09}
                  >
                    <title>
                      {`${band.label}: ${bandRangeText(band)}${suffix}${band.assignment ? ` — ${band.assignment}` : ""}${
                      bandSelection ? ` (candidate for ${bandSelection.bands[index]!.regions.map((region) => `${region.label}${suffix}`).join(", ")})` : ""
                    }`}
                    </title>
                  </rect>
                );
              })}
            </g>
          ) : null}
          {resolved.map((region) =>
            region.strength >= highlightThreshold && region.strength > 0 ? (
              <rect
                key={`shade-${region.index}`}
                className="n4viz-region-shade"
                data-sign={signed ? (region.value < 0 ? "negative" : "positive") : undefined}
                x={round(xScale(region.start))}
                y={topTop}
                width={round(Math.max(1, xScale(region.end) - xScale(region.start)))}
                height={round(topHeight)}
                fill={regionFill(region.value)}
                fillOpacity={round(0.05 + 0.33 * region.strength)}
              />
            ) : null,
          )}
          {highlightSpan ? (
            <rect
              className="n4viz-highlight-range"
              x={round(highlightSpan.left)}
              y={topTop}
              width={round(Math.max(2, highlightSpan.right - highlightSpan.left))}
              height={round(barBottom - topTop)}
            />
          ) : null}
          {errorRuns.map((run, index) => (
            <path
              key={`error-${index}`}
              className="n4viz-error-band"
              d={bandPath(
                run.upper.map(([x, y]) => [xScale(x), yScale(y)] as const),
                run.lower.map(([x, y]) => [xScale(x), yScale(y)] as const),
              )}
              fill={color}
              fillOpacity={0.18}
              stroke="none"
            />
          ))}
          {importanceRuns.map((run, index) => {
            const pixels = run.map(([x, y]) => [xScale(x), yScale(y)] as const);
            const baseline = yScale(Math.max(importanceDomain.min, Math.min(0, importanceDomain.max)));
            const first = pixels[0]!;
            const last = pixels[pixels.length - 1]!;
            return (
              <path
                key={`area-${index}`}
                className="n4viz-importance-area"
                d={`${linePath(pixels)} L${round(last[0])} ${round(baseline)} L${round(first[0])} ${round(baseline)} Z`}
                fill={`url(#${gradientId})`}
                stroke="none"
              />
            );
          })}
          {spectrumRuns.map((run, index) => (
            <path
              key={`spectrum-${index}`}
              className="n4viz-spectrum-line"
              d={linePath(run.map(([x, y]) => [xScale(x), spectrumScale(y)] as const))}
              fill="none"
              stroke={spectrumColor}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              strokeOpacity={0.75}
            />
          ))}
          {importanceRuns.map((run, index) => (
            <path
              key={`importance-${index}`}
              className="n4viz-importance-line"
              d={linePath(run.map(([x, y]) => [xScale(x), yScale(y)] as const))}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ))}
          {bandLabels.some(Boolean) ? (
            <g className="n4viz-band-labels" aria-hidden="true">
              {bandLabels.map((placement, index) =>
                placement ? (
                  <text
                    key={`band-label-${index}`}
                    className="n4viz-band-label"
                    data-focus={focusImportant ? "important" : undefined}
                    x={round(placement.x)}
                    y={round(topTop + 9 + placement.row * BAND_LABEL_ROW_HEIGHT)}
                    textAnchor="middle"
                    fill={BAND_COLOR}
                  >
                    {placement.text}
                  </text>
                ) : null,
              )}
            </g>
          ) : null}
          <line className="n4viz-axis" x1={plotLeft} x2={plotLeft} y1={topTop} y2={topBottom} />
          <line className="n4viz-axis" x1={plotLeft} x2={plotRight} y1={topBottom} y2={topBottom} />
          {yTicks.map((tick, index) => (
            <text key={`ty-${tick}`} className="n4viz-tick" x={plotLeft - 6} y={round(yScale(tick) + 3)} textAnchor="end">
              {yTickLabels[index]}
            </text>
          ))}
          <text
            className="n4viz-axis-label"
            transform={`translate(12 ${round((topTop + topBottom) / 2)}) rotate(-90)`}
            textAnchor="middle"
          >
            {importanceLabel}
          </text>
          {hasSpectrum ? (
            <>
              <line className="n4viz-axis" x1={plotRight} x2={plotRight} y1={topTop} y2={topBottom} />
              {spectrumTicks.map((tick, index) => (
                <text key={`ts-${tick}`} className="n4viz-tick" x={plotRight + 6} y={round(spectrumScale(tick) + 3)} textAnchor="start">
                  {spectrumTickLabels[index]}
                </text>
              ))}
              <text
                className="n4viz-axis-label"
                transform={`translate(${width - 8} ${round((topTop + topBottom) / 2)}) rotate(90)`}
                textAnchor="middle"
              >
                {spectrumLabel}
              </text>
            </>
          ) : null}

          {/* bottom panel: region bars */}
          {hasRegions ? (
            <>
              {barTicks.map((tick) => (
                <line key={`gb-${tick}`} className="n4viz-grid" x1={plotLeft} x2={plotRight} y1={round(barScale(tick))} y2={round(barScale(tick))} />
              ))}
              {resolved.map((region) => {
                if (!Number.isFinite(region.value)) return null;
                const x = xScale(region.center) - barWidth / 2;
                const y = barScale(region.value);
                const isActive = activeRegion?.index === region.index;
                return (
                  <rect
                    key={`bar-${region.index}`}
                    className="n4viz-bar n4viz-region-bar"
                    data-sign={signed ? (region.value < 0 ? "negative" : "positive") : undefined}
                    x={round(x)}
                    y={round(Math.min(y, barZero))}
                    width={round(barWidth)}
                    height={round(Math.max(region.value === 0 ? 0 : 1, Math.abs(barZero - y)))}
                    rx={Math.min(2, barWidth / 3)}
                    fill={regionFill(region.value)}
                    fillOpacity={isActive ? 1 : signed ? 0.82 : round(0.45 + 0.5 * region.strength)}
                    stroke={isActive ? "currentColor" : undefined}
                    strokeWidth={isActive ? 1.2 : undefined}
                  />
                );
              })}
              <line className="n4viz-axis" x1={plotLeft} x2={plotLeft} y1={barTop} y2={barBottom} />
              <line
                className={cx("n4viz-axis", signed && "n4viz-zero")}
                x1={plotLeft}
                x2={plotRight}
                y1={round(barZero)}
                y2={round(barZero)}
              />
              {barTicks.map((tick, index) => (
                <text key={`tb-${tick}`} className="n4viz-tick" x={plotLeft - 6} y={round(barScale(tick) + 3)} textAnchor="end">
                  {barTickLabels[index]}
                </text>
              ))}
              <text className="n4viz-panel-label" x={plotLeft + 6} y={barTop + 9} textAnchor="start">
                {regionLabel}
              </text>
            </>
          ) : null}

          {/* shared x axis */}
          <line className="n4viz-axis" x1={plotLeft} x2={plotRight} y1={barBottom} y2={barBottom} />
          {xTicks.map((tick, index) => (
            <text key={`tx-${tick}`} className="n4viz-tick" x={round(xScale(tick))} y={barBottom + 15} textAnchor="middle">
              {xTickLabels[index]}
            </text>
          ))}
          <text className="n4viz-axis-label" x={round((plotLeft + plotRight) / 2)} y={height - 8} textAnchor="middle">
            {axisLabel}
          </text>

          {/* cursor */}
          {activeRegion ? (
            <rect
              className="n4viz-cursor-region"
              x={round(xScale(activeRegion.start))}
              y={topTop}
              width={round(Math.max(1, xScale(activeRegion.end) - xScale(activeRegion.start)))}
              height={round(barBottom - topTop)}
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ) : null}
          {Number.isFinite(cursorX) ? (
            <line className="n4viz-cursor" x1={round(xScale(cursorX))} x2={round(xScale(cursorX))} y1={topTop} y2={barBottom} />
          ) : null}
          {activePoint >= 0 && Number.isFinite(importance[activePoint] ?? NaN) && Number.isFinite(axis[activePoint] ?? NaN) ? (
            <circle
              className="n4viz-cursor-dot"
              cx={round(xScale(axis[activePoint]!))}
              cy={round(yScale(importance[activePoint]!))}
              r={3.5}
              fill={color}
            />
          ) : null}
        </svg>
      </div>

      <p className="n4viz-readout" aria-live="polite">{readout}</p>
      <p id={instructionsId} className="n4viz-sr-only">{instructions}</p>

      <div className="n4viz-legend-row" aria-hidden="true">
        <span className="n4viz-legend-item"><span className="n4viz-swatch-line" style={{ borderColor: color }} />{importanceLabel}</span>
        {hasError ? (
          <span className="n4viz-legend-item"><span className="n4viz-swatch" style={{ background: color, opacity: 0.3 }} />{importanceErrorLabel}</span>
        ) : null}
        {hasSpectrum ? (
          <span className="n4viz-legend-item"><span className="n4viz-swatch-line n4viz-swatch-dashed" style={{ borderColor: spectrumColor }} />{spectrumLabel}</span>
        ) : null}
        {hasRegions && signed ? (
          <>
            <span className="n4viz-legend-item"><span className="n4viz-swatch" style={{ background: positiveColor }} />{positiveLabel}</span>
            <span className="n4viz-legend-item"><span className="n4viz-swatch" style={{ background: negativeColor }} />{negativeLabel}</span>
          </>
        ) : null}
        {hasRegions && !signed ? (
          <span className="n4viz-legend-item">
            {regionLabel}
            <span className="n4viz-swatch-ramp" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${color} 12%, transparent), ${color})` }} />
            low → high
          </span>
        ) : null}
        {shownBands.length > 0 ? (
          <span className="n4viz-legend-item"><span className="n4viz-swatch n4viz-band-swatch" />{bandCaption}</span>
        ) : null}
      </div>

      {showSummary ? <figcaption className="n4viz-summary">{summary}</figcaption> : null}

      {showDataTable && hasRegions ? (
        <details className="n4viz-datatable">
          <summary>{regionLabel} values ({resolved.length} regions)</summary>
          <div className="n4viz-table-wrap" role="region" tabIndex={0} aria-label={`${regionLabel} values`}>
            <table>
              <caption>
                {regionLabel} by {axisLabel}{signed ? " (signed: positive raises, negative lowers the output)" : " (magnitudes)"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Range{suffix ? ` (${axisUnit})` : ""}</th>
                  <th scope="col">Center</th>
                  <th scope="col">Value</th>
                  <th scope="col">Rank</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map((region) => (
                  <tr key={`row-${region.index}`} data-active={activeRegion?.index === region.index ? "true" : undefined}>
                    <th scope="row">{region.label}</th>
                    <td>{axisFormat(region.center)}</td>
                    <td>{Number.isFinite(region.value) ? formatRegionValue(region.value) : "unavailable"}</td>
                    <td>{region.rank > 0 ? region.rank : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      {showDataTable && (shownBands.length > 0 || unmatchedRegions.length > 0) ? (
        <details className="n4viz-datatable n4viz-band-table">
          <summary>{bandCaption} ({countLabel(shownBands.length, "band")})</summary>
          <div className="n4viz-table-wrap" role="region" tabIndex={0} aria-label={bandCaption}>
            <table>
              <caption>
                {bandSelection
                  ? `${importantBandsLabel} on ${axisLabel}: bands overlapping regions whose ${importanceLabel} reaches at least ${thresholdText} of its peak; typical assignments with approximate, matrix-dependent positions, candidates rather than evidence of chemical causation`
                  : `${bandsLabel} on ${axisLabel}: indicative annotations with approximate, matrix-dependent positions, not model output`}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Band</th>
                  <th scope="col">Range{suffix ? ` (${axisUnit})` : ""}</th>
                  <th scope="col">Assignment</th>
                  {bandSelection ? <th scope="col">Overlapping important regions</th> : null}
                </tr>
              </thead>
              <tbody>
                {shownBands.map((band, index) => (
                  <tr key={`band-row-${index}`} data-active={activeBands.includes(band) ? "true" : undefined}>
                    <th scope="row">{band.label}</th>
                    <td>{bandRangeText(band)}</td>
                    <td className="n4viz-band-assignment">{band.assignment ?? "—"}</td>
                    {bandSelection ? (
                      <td className="n4viz-band-assignment">
                        {bandSelection.bands[index]!.regions.map((region) => `${region.label} (${formatRegionValue(region.value)})`).join(", ")}
                      </td>
                    ) : null}
                  </tr>
                ))}
                {unmatchedRegions.map(({ region }) => (
                  <tr key={`band-unmatched-${region.index}`} data-unmatched="true">
                    <th scope="row">No catalogued band</th>
                    <td>—</td>
                    <td className="n4viz-band-assignment">—</td>
                    <td className="n4viz-band-assignment">{`${region.label} (${formatRegionValue(region.value)})`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </figure>
  );
}
