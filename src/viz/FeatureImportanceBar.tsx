import { useId } from "react";

import { cx } from "./_cx.js";
import { countLabel, distinctTickLabels, signedNumber, summaryNumber } from "./description.js";
import { makeScale, round, ticks } from "./geometry.js";
import { N4_SIGNED_COLORS, N4_VIZ_COLORS } from "./theme.js";

/** One ranked feature / wavelength-region contribution. */
export interface ImportanceItem {
  label: string;
  value: number;
  color?: string;
}

export interface FeatureImportanceBarProps {
  items: readonly ImportanceItem[];
  /** Sort by value descending and keep the top N (default 12). */
  topN?: number;
  barColor?: string;
  /**
   * Signed values (e.g. mean signed SHAP) rank by |value| and draw from a zero
   * line in `positiveColor` / `negativeColor`. Inferred from any negative value
   * when omitted; magnitudes rank by value and shade by relative strength.
   */
  signed?: boolean;
  positiveColor?: string;
  negativeColor?: string;
  /** Prefix each label with its 1-based rank (default false). */
  showRank?: boolean;
  /** Value-axis title, e.g. "Mean |SHAP|". */
  xLabel?: string;
  valueFormat?: (v: number) => string;
  width?: number;
  /** Auto-sized from `topN` when omitted. */
  height?: number;
  title?: string;
  /** Faithful host-provided text alternative; defaults to a data summary. */
  description?: string;
  className?: string;
}

function defaultFormat(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function truncate(label: string, max = 18): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/**
 * Ranked horizontal-bar chart of the most important features / wavelength
 * regions — the Studio Variable-Importance view. Magnitudes sort by value and
 * shade by relative strength; signed values sort by |value| and extend left or
 * right of a zero line with signed labels. Keeps the top N, left-labels each
 * bar and prints its value at the bar end. Pure inline SVG; hosts pass
 * precomputed importances.
 */
export function FeatureImportanceBar({
  items,
  topN = 12,
  barColor = N4_VIZ_COLORS.teal,
  signed,
  positiveColor = N4_SIGNED_COLORS.positive,
  negativeColor = N4_SIGNED_COLORS.negative,
  showRank = false,
  xLabel,
  valueFormat = defaultFormat,
  width = 360,
  height,
  title = "Feature importance",
  description,
  className,
}: FeatureImportanceBarProps) {
  const descriptionId = useId();
  const keep = Math.max(0, Math.trunc(topN));
  const finite = items.filter((item) => Number.isFinite(item.value));
  const isSigned = signed ?? finite.some((item) => item.value < 0);
  const sorted = [...finite]
    .sort((a, b) => (isSigned ? Math.abs(b.value) - Math.abs(a.value) : b.value - a.value))
    .slice(0, keep);
  const resolvedHeight = height ?? Math.max(160, keep * 22 + 48 + (xLabel ? 14 : 0));

  const padLeft = showRank ? 118 : 104;
  const padRight = 50;
  const padTop = 10;
  const padBottom = xLabel ? 42 : 28;
  const plotLeft = padLeft;
  const plotRight = width - padRight;
  const plotTop = padTop;
  const plotBottom = resolvedHeight - padBottom;
  const plotHeight = Math.max(0, plotBottom - plotTop);

  const values = sorted.map((item) => item.value);
  const maxValue = Math.max(0, ...values);
  const minValue = isSigned ? Math.min(0, ...values) : 0;
  const domain = { min: minValue, max: maxValue || (minValue < 0 ? 0 : 1) };
  if (domain.max === domain.min) domain.max = domain.min + 1;
  const xScale = makeScale(domain, plotLeft, plotRight);
  const axisTicks = ticks(domain, 4);
  const axisTickLabels = distinctTickLabels(axisTicks, valueFormat);
  const xZero = xScale(0);
  const maxMagnitude = Math.max(0, ...values.map((value) => Math.abs(value))) || 1;

  const n = sorted.length;
  const band = n > 0 ? plotHeight / n : plotHeight;
  const barHeight = Math.min(18, Math.max(4, band - 8));
  const format = (value: number) => (isSigned ? signedNumber(value, valueFormat) : valueFormat(value));
  const summary = description?.trim() || (
    sorted.length === 0
      ? "No finite feature importance values."
      : `${countLabel(sorted.length, "shown feature")}${items.length > sorted.length ? ` of ${items.length} supplied` : ""}${isSigned ? ", ranked by absolute signed value" : ""}; ${sorted.map((item) => `${item.label}: ${isSigned && item.value > 0 ? "+" : ""}${summaryNumber(item.value)}`).join("; ")}.`
  );

  return (
    <svg
      className={cx("n4viz", "n4viz-importance", className)}
      viewBox={`0 0 ${width} ${resolvedHeight}`}
      role="img"
      aria-label={title}
      aria-describedby={descriptionId}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{title}</title>
      <desc id={descriptionId}>{summary}</desc>

      {axisTicks.map((t) => (
        <line
          key={`grid-${t}`}
          className="n4viz-grid"
          x1={round(xScale(t))}
          x2={round(xScale(t))}
          y1={plotTop}
          y2={plotBottom}
        />
      ))}

      {sorted.map((item, i) => {
        const center = plotTop + band * i + band / 2;
        const barEnd = xScale(item.value);
        const negative = item.value < 0;
        const fill = item.color ?? (isSigned ? (negative ? negativeColor : positiveColor) : barColor);
        const opacity = isSigned ? 0.85 : 0.45 + 0.55 * (Math.abs(item.value) / maxMagnitude);
        return (
          <g key={`${item.label}-${i}`}>
            <title>{`#${i + 1} ${item.label}: ${format(item.value)}`}</title>
            <text
              className="n4viz-tick"
              x={plotLeft - 6}
              y={round(center + 3)}
              textAnchor="end"
            >
              {showRank ? `#${i + 1} ` : ""}{truncate(item.label)}
            </text>
            <rect
              className="n4viz-bar"
              data-sign={isSigned ? (negative ? "negative" : "positive") : undefined}
              x={round(Math.min(xZero, barEnd))}
              y={round(center - barHeight / 2)}
              width={round(Math.max(0, Math.abs(barEnd - xZero)))}
              height={round(barHeight)}
              rx={2}
              fill={fill}
              fillOpacity={round(opacity)}
            />
            <text
              className="n4viz-badge"
              x={round(negative ? barEnd - 4 : barEnd + 4)}
              y={round(center + 3)}
              textAnchor={negative ? "end" : "start"}
            >
              {format(item.value)}
            </text>
          </g>
        );
      })}

      {isSigned ? (
        <line className="n4viz-reference n4viz-zero" x1={round(xZero)} x2={round(xZero)} y1={plotTop} y2={plotBottom} stroke={N4_VIZ_COLORS.slate} strokeWidth={1.2} />
      ) : null}
      <line className="n4viz-axis" x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} />
      {axisTicks.map((t, ti) => (
        <text
          key={`tx-${t}`}
          className="n4viz-tick"
          x={round(xScale(t))}
          y={plotBottom + 15}
          textAnchor="middle"
        >
          {axisTickLabels[ti]}
        </text>
      ))}
      {xLabel ? (
        <text className="n4viz-axis-label" x={round(plotLeft + (plotRight - plotLeft) / 2)} y={resolvedHeight - 4} textAnchor="middle">
          {xLabel}
        </text>
      ) : null}
    </svg>
  );
}
