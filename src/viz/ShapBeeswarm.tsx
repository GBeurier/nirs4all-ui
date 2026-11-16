import { useId } from "react";

import { cx } from "./_cx.js";
import { countLabel, rangeText, summaryNumber } from "./description.js";
import { extentOf, makeScale, round, ticks } from "./geometry.js";
import { divergingColor, N4_VIZ_COLORS } from "./theme.js";

/** A single SHAP contribution for one sample against one feature. */
export interface BeeswarmPoint {
  shap: number;
  featureValue: number;
  /** Host sample identity, used for selection and point titles. */
  sampleId?: number | string;
}

/** One feature row: every sample's SHAP value + raw feature value. */
export interface BeeswarmFeature {
  label: string;
  points: readonly BeeswarmPoint[];
}

export interface ShapBeeswarmProps {
  features: readonly BeeswarmFeature[];
  width?: number;
  /** Auto-sized from the feature count when omitted. */
  height?: number;
  pointRadius?: number;
  title?: string;
  /** Faithful host-provided text alternative; defaults to a data summary. */
  description?: string;
  className?: string;
  xLabel?: string;
  /** Legend title for the feature-value color ramp (default "Feature value"). */
  colorLabel?: string;
  /** Selected host sample identities; matching points are emphasized and drawn on top. */
  selectedSampleIds?: ReadonlyArray<number | string>;
  /** Pointer activation of a point carrying a `sampleId` (hosts toggle selection). */
  onPointActivate?: (sampleId: number | string, featureIndex: number) => void;
  /** Accessible host label for a sample in point titles (default "Sample <id>"). */
  sampleLabel?: (sampleId: number | string) => string;
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function truncate(label: string, max = 15): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/** Deterministic pseudo-jitter in [-1, 1] derived only from the point index. */
function jitterUnit(index: number): number {
  const hashed = (Math.trunc(index) * 2654435761) >>> 0;
  return ((hashed % 1000) / 999) * 2 - 1;
}

/**
 * SHAP beeswarm: one horizontal row per feature with a dot per sample placed by
 * its SHAP value and colored (blue→neutral→red) by the sample's normalized
 * feature value. A dashed zero reference line separates negative from positive
 * contributions. Jitter is deterministic (index-derived, never random) so the
 * markup is stable across renders. Points carrying a `sampleId` expose a
 * native hover title and can be emphasized through `selectedSampleIds`; hosts
 * that make points clickable must offer an equivalent keyboard selection path.
 * Pure inline SVG.
 */
export function ShapBeeswarm({
  features,
  width = 420,
  height,
  pointRadius = 2.5,
  title = "SHAP beeswarm",
  description,
  className,
  xLabel = "SHAP value",
  colorLabel = "Feature value",
  selectedSampleIds,
  onPointActivate,
  sampleLabel = (sampleId) => `Sample ${sampleId}`,
}: ShapBeeswarmProps) {
  const descriptionId = useId();
  const gradientId = `${descriptionId}-ramp`;
  const selected = new Set(selectedSampleIds ?? []);
  const hasSelection = selected.size > 0;
  const validFeatures = features.map((feature) => ({
    ...feature, points: feature.points.filter((point) => Number.isFinite(point.shap)),
  }));
  const resolvedHeight = height ?? Math.max(190, features.length * 34 + 76);

  const padLeft = 96;
  const padRight = 16;
  const padTop = 10;
  const padBottom = 58;
  const plotLeft = padLeft;
  const plotRight = width - padRight;
  const plotTop = padTop;
  const plotBottom = resolvedHeight - padBottom;
  const plotHeight = Math.max(0, plotBottom - plotTop);

  const allShap = validFeatures.flatMap((f) => f.points.map((p) => p.shap));
  const ext = extentOf(allShap);
  const domain = { min: Math.min(0, ext.min), max: Math.max(0, ext.max) };
  const xScale = makeScale(domain, plotLeft, plotRight);
  const axisTicks = ticks(domain, 5);
  const xZero = xScale(0);

  const n = features.length;
  const band = n > 0 ? plotHeight / n : plotHeight;
  const amplitude = Math.min(band, 30) * 0.35;
  const featureSummaries = validFeatures.flatMap((feature) => {
    const values = feature.points.map((point) => point.shap).filter((value) => Number.isFinite(value));
    return values.length
      ? [`${feature.label}: ${countLabel(values.length, "contribution")}, mean ${summaryNumber(values.reduce((sum, value) => sum + value, 0) / values.length)}, range ${rangeText(values)}`]
      : [];
  });
  const missingFeatureValues = validFeatures.some((feature) => feature.points.some((point) => !Number.isFinite(point.featureValue)));
  const summary = description?.trim() || (
    featureSummaries.length === 0
      ? "No finite SHAP contributions."
      : `${countLabel(featureSummaries.length, "feature")}; ${featureSummaries.join("; ")}. Color encodes feature value.${missingFeatureValues ? " Unavailable feature values use a neutral color." : ""}${hasSelection ? ` ${countLabel(selected.size, "selected sample")} emphasized.` : ""}`
  );
  const legendWidth = Math.min(120, Math.max(60, (plotRight - plotLeft) * 0.3));
  const legendX = plotRight - legendWidth - 28;
  const legendY = plotBottom + 40;

  return (
    <svg
      className={cx("n4viz", "n4viz-beeswarm", className)}
      viewBox={`0 0 ${width} ${resolvedHeight}`}
      role="img"
      aria-label={title}
      aria-describedby={descriptionId}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{title}</title>
      <desc id={descriptionId}>{summary}</desc>

      <line
        className="n4viz-reference n4viz-zero"
        x1={round(xZero)}
        x2={round(xZero)}
        y1={plotTop}
        y2={plotBottom}
        stroke={N4_VIZ_COLORS.slate}
        strokeDasharray="5 4"
        strokeWidth={1.4}
      />

      {validFeatures.map((feature, fi) => {
        const center = plotTop + band * fi + band / 2;
        const fvExtent = extentOf(feature.points.map((p) => p.featureValue));
        const fvSpan = fvExtent.max - fvExtent.min;
        return (
          <g key={`${feature.label}-${fi}`}>
            <text
              className="n4viz-tick"
              x={plotLeft - 6}
              y={round(center + 3)}
              textAnchor="end"
            >
              {truncate(feature.label)}
            </text>
            {feature.points
              .map((point, pi) => ({ point, pi, isSelected: point.sampleId !== undefined && selected.has(point.sampleId) }))
              .sort((a, b) => Number(a.isSelected) - Number(b.isSelected))
              .map(({ point, pi, isSelected }) => {
                const norm = fvSpan > 0 ? (point.featureValue - fvExtent.min) / fvSpan : 0.5;
                const cy = center + jitterUnit(pi + fi * 131) * amplitude;
                const sampleId = point.sampleId;
                return (
                  <circle
                    key={`p-${fi}-${pi}`}
                    className={cx("n4viz-dot", isSelected && "n4viz-dot-selected")}
                    cx={round(xScale(point.shap))}
                    cy={round(cy)}
                    r={isSelected ? pointRadius + 1.5 : pointRadius}
                    fill={Number.isFinite(point.featureValue) ? divergingColor(norm) : N4_VIZ_COLORS.slate}
                    fillOpacity={isSelected ? 1 : hasSelection ? 0.35 : 0.72}
                    stroke={isSelected ? "currentColor" : undefined}
                    strokeWidth={isSelected ? 1.4 : undefined}
                    style={onPointActivate && sampleId !== undefined ? { cursor: "pointer" } : undefined}
                    onClick={onPointActivate && sampleId !== undefined ? () => onPointActivate(sampleId, fi) : undefined}
                  >
                    {sampleId !== undefined ? (
                      <title>{`${sampleLabel(sampleId)} · ${feature.label}: SHAP ${point.shap > 0 ? "+" : ""}${fmt(point.shap)}, ${colorLabel.toLowerCase()} ${Number.isFinite(point.featureValue) ? fmt(point.featureValue) : "unavailable"}${isSelected ? " (selected)" : ""}`}</title>
                    ) : null}
                  </circle>
                );
              })}
          </g>
        );
      })}

      <line className="n4viz-axis" x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} />
      {axisTicks.map((t) => (
        <text
          key={`tx-${t}`}
          className="n4viz-tick"
          x={round(xScale(t))}
          y={plotBottom + 15}
          textAnchor="middle"
        >
          {fmt(t)}
        </text>
      ))}
      <text className="n4viz-axis-label" x={round(plotLeft + (plotRight - plotLeft) / 2)} y={plotBottom + 29} textAnchor="middle">
        {xLabel}
      </text>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          {[0, 0.5, 1].map((stop) => (
            <stop key={stop} offset={`${stop * 100}%`} stopColor={divergingColor(stop)} />
          ))}
        </linearGradient>
      </defs>
      <g className="n4viz-color-legend">
        <text className="n4viz-legend-label" x={round(legendX - 6)} y={legendY + 7} textAnchor="end">{colorLabel}: low</text>
        <rect x={round(legendX)} y={legendY} width={round(legendWidth)} height={8} rx={4} fill={`url(#${gradientId})`} />
        <text className="n4viz-legend-label" x={round(legendX + legendWidth + 4)} y={legendY + 7} textAnchor="start">high</text>
      </g>
    </svg>
  );
}
