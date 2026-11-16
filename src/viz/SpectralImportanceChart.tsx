import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

import { cx } from "./_cx.js";
import { compactNumber, distinctTickLabels, signedNumber } from "./description.js";
import { extentOf, linePath, makeScale, round, ticks, type Extent } from "./geometry.js";
import {
  decimatedRuns,
  formatAxisValue,
  nearestAxisIndex,
  nextSpectralCursor,
  regionsAt,
  resolveRegionValueKind,
  resolveSpectralRegions,
  summarizeSpectralImportance,
  type RegionValueKind,
  type SpectralCursor,
  type SpectralImportanceRegion,
} from "./spectralImportance.js";
import { N4_SIGNED_COLORS, N4_VIZ_COLORS } from "./theme.js";

export interface SpectralImportanceChartProps {
  /** Shared spectral coordinates (wavelength, wavenumber or feature index). Non-finite entries are gaps. */
  axis: readonly number[];
  /** Importance curve aligned to `axis` (for example mean |SHAP| per variable). */
  importance: readonly number[];
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
  className?: string;
}

const PAD = { top: 14, bottom: 46, left: 64, gap: 22 } as const;

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
  className,
}: SpectralImportanceChartProps) {
  const baseId = useId();
  const descriptionId = `${baseId}-desc`;
  const instructionsId = `${baseId}-help`;
  const gradientId = `${baseId}-area`;
  const [cursor, setCursor] = useState<SpectralCursor | null>(null);

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
  const importanceDomain = domainWithZero(importanceRuns.flat().map(([, y]) => y), 0.1);
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

  const summary = description?.trim() || summarizeSpectralImportance({
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

  // --- cursor resolution -------------------------------------------------
  const pointCount = axis.length;
  const activeRegion = cursor?.kind === "region" ? resolved[cursor.index] ?? null : null;
  const activePoint = cursor?.kind === "point" && cursor.index >= 0 && cursor.index < pointCount ? cursor.index : -1;
  const cursorX = activeRegion ? activeRegion.center : activePoint >= 0 ? axis[activePoint]! : NaN;

  const readout = (() => {
    if (activeRegion) {
      const centerIndex = nearestAxisIndex(axis, activeRegion.center);
      const curve = centerIndex >= 0 ? importance[centerIndex] : undefined;
      return [
        `${regionLabel} ${activeRegion.label}${suffix}`,
        `${formatRegionValue(activeRegion.value)}`,
        activeRegion.rank > 0 ? `rank ${activeRegion.rank} of ${resolved.filter((region) => region.rank > 0).length} by magnitude` : "value unavailable",
        curve !== undefined && Number.isFinite(curve) ? `${importanceLabel} at center ${valueFormat(curve)}` : null,
      ].filter(Boolean).join(" · ");
    }
    if (activePoint >= 0) {
      const x = axis[activePoint]!;
      const y = importance[activePoint];
      const s = hasSpectrum && spectrum ? spectrum[activePoint] : undefined;
      const covering = Number.isFinite(x) ? regionsAt(resolved, x) : [];
      return [
        `${axisLabel} ${axisFormat(x)}${suffix}`,
        `${importanceLabel} ${y !== undefined && Number.isFinite(y) ? valueFormat(y) : "unavailable"}`,
        s !== undefined ? `${spectrumLabel} ${Number.isFinite(s) ? valueFormat(s) : "unavailable"}` : null,
        covering.length > 0 ? `${regionLabel} ${covering.map((region) => `${region.label}: ${formatRegionValue(region.value)}`).join(", ")}` : null,
      ].filter(Boolean).join(" · ");
    }
    return instructions;
  })();

  const handlePointer = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const px = ((event.clientX - rect.left) / rect.width) * width;
    if (px < plotLeft || px > plotRight) return;
    const x = xDomain.min + ((px - plotLeft) / (plotRight - plotLeft || 1)) * (xDomain.max - xDomain.min);
    const index = nearestAxisIndex(axis, x);
    if (index >= 0) setCursor({ kind: "point", index });
  };

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextSpectralCursor(cursor, event.key, resolved.length, pointCount);
    if (next === undefined) return;
    event.preventDefault();
    setCursor(next);
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
          onPointerLeave={() => setCursor((previous) => (previous?.kind === "point" ? null : previous))}
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
    </figure>
  );
}
