import { useId } from "react";

import { cx } from "./_cx.js";
import { countLabel, summaryNumber } from "./description.js";
import { makeScale, niceExtent, round, ticks } from "./geometry.js";
import { N4_VIZ_COLORS } from "./theme.js";

/** One signed feature contribution in a per-sample SHAP decomposition. */
export interface WaterfallContribution {
  label: string;
  value: number;
}

export interface WaterfallChartProps {
  /** Model base value (the expected prediction before any feature is applied). */
  baseValue: number;
  /** Signed per-feature contributions applied in order from `baseValue`. */
  contributions: readonly WaterfallContribution[];
  /** Final prediction (defaults to `baseValue + Σ contributions`). */
  predicted?: number;
  /** Keep the largest `|value|` contributions, preserving original order (default 10). */
  topN?: number;
  valueFormat?: (v: number) => string;
  width?: number;
  /** Auto-sized from the kept row count when omitted. */
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

function signed(value: number, format: (v: number) => string): string {
  if (!Number.isFinite(value)) return "—";
  return value > 0 ? `+${format(value)}` : format(value);
}

function truncate(label: string, max = 15): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/**
 * Per-sample SHAP waterfall — the Studio Variable-Importance waterfall. Each
 * feature contribution is a floating horizontal bar from the running total,
 * green when it pushes the prediction up and rose when down, walking from the
 * base value to the prediction. A dashed base reference and a solid prediction
 * reference frame the walk. Pure inline SVG; hosts pass precomputed SHAP values.
 */
export function WaterfallChart({
  baseValue,
  contributions,
  predicted,
  topN = 10,
  valueFormat = defaultFormat,
  width = 440,
  height,
  title = "SHAP waterfall",
  description,
  className,
}: WaterfallChartProps) {
  const descriptionId = useId();
  const sumAll = contributions.reduce((s, c) => s + c.value, 0);
  const resolvedPredicted = predicted ?? baseValue + sumAll;

  const keep = Math.max(0, Math.trunc(topN));
  const indexed = contributions.map((c, i) => ({ c, i })).filter(({ c }) => Number.isFinite(c.value));
  const keptIndices = new Set(
    [...indexed]
      .sort((a, b) => Math.abs(b.c.value) - Math.abs(a.c.value))
      .slice(0, keep)
      .map((x) => x.i),
  );
  const kept = indexed.filter((x) => keptIndices.has(x.i)).map((x) => x.c);

  const resolvedHeight = height ?? Math.max(180, kept.length * 30 + 70);

  const padLeft = 100;
  const padRight = 48;
  const padTop = 26;
  const padBottom = 30;
  const plotLeft = padLeft;
  const plotRight = width - padRight;
  const plotTop = padTop;
  const plotBottom = resolvedHeight - padBottom;
  const plotHeight = Math.max(0, plotBottom - plotTop);

  let running = baseValue;
  const rows = kept.map((c) => {
    const from = running;
    const value = c.value;
    const to = from + value;
    running = to;
    return { label: c.label, value, from, to };
  });
  const visibleRows = rows.filter((row) => Number.isFinite(row.from) && Number.isFinite(row.to));

  const boundaries = [baseValue, resolvedPredicted, ...rows.flatMap((r) => [r.from, r.to])];
  const domain = niceExtent(boundaries, 0.06);
  const xScale = makeScale(domain, plotLeft, plotRight);
  const xTicks = ticks(domain, 5);

  const n = visibleRows.length;
  const band = n > 0 ? plotHeight / n : plotHeight;
  const barHeight = Math.min(18, Math.max(4, band - 8));
  const keptSum = rows.reduce((sum, row) => sum + row.value, 0);
  const summary = description?.trim() || (
    [
      `base value ${summaryNumber(baseValue)}`,
      `predicted value ${summaryNumber(resolvedPredicted)}`,
      `${visibleRows.length} of ${countLabel(contributions.length, "contribution")} shown`,
      ...visibleRows.map((row) => `${row.label}: ${row.value >= 0 ? "+" : ""}${summaryNumber(row.value)}`),
      ...(contributions.length > visibleRows.length ? [`omitted contribution sum ${summaryNumber(sumAll - keptSum)}`] : []),
    ].join("; ") + "."
  );

  return (
    <svg
      className={cx("n4viz", "n4viz-waterfall", className)}
      viewBox={`0 0 ${width} ${resolvedHeight}`}
      role="img"
      aria-label={title}
      aria-describedby={descriptionId}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{title}</title>
      <desc id={descriptionId}>{summary}</desc>

      {xTicks.map((t) => (
        <line
          key={`grid-${t}`}
          className="n4viz-grid"
          x1={round(xScale(t))}
          x2={round(xScale(t))}
          y1={plotTop}
          y2={plotBottom}
        />
      ))}

      {Number.isFinite(baseValue) ? <line
        className="n4viz-reference n4viz-base"
        x1={round(xScale(baseValue))}
        x2={round(xScale(baseValue))}
        y1={plotTop}
        y2={plotBottom}
        stroke={N4_VIZ_COLORS.slate}
        strokeDasharray="5 4"
        strokeWidth={1.4}
      /> : null}
      {Number.isFinite(resolvedPredicted) ? <line
        className="n4viz-reference n4viz-prediction"
        x1={round(xScale(resolvedPredicted))}
        x2={round(xScale(resolvedPredicted))}
        y1={plotTop}
        y2={plotBottom}
        stroke={N4_VIZ_COLORS.tealDark}
        strokeWidth={1.6}
      /> : null}
      {Number.isFinite(baseValue) ? <text className="n4viz-tick" x={round(xScale(baseValue))} y={plotTop - 6} textAnchor="middle">
        base
      </text> : null}
      {Number.isFinite(resolvedPredicted) ? <text className="n4viz-tick" x={round(xScale(resolvedPredicted))} y={plotTop - 6} textAnchor="middle">
        f(x)
      </text> : null}

      {visibleRows.map((row, i) => {
        const center = plotTop + band * i + band / 2;
        const x0 = xScale(Math.min(row.from, row.to));
        const x1 = xScale(Math.max(row.from, row.to));
        const up = row.value > 0;
        const labelX = up ? xScale(row.to) + 4 : xScale(row.to) - 4;
        return (
          <g key={`${row.label}-${i}`}>
            <text className="n4viz-tick" x={plotLeft - 6} y={round(center + 3)} textAnchor="end">
              {truncate(row.label)}
            </text>
            <rect
              className="n4viz-bar"
              x={round(x0)}
              y={round(center - barHeight / 2)}
              width={round(Math.max(1, x1 - x0))}
              height={round(barHeight)}
              rx={2}
              fill={up ? N4_VIZ_COLORS.green : N4_VIZ_COLORS.rose}
            />
            <text
              className="n4viz-badge"
              x={round(labelX)}
              y={round(center + 3)}
              textAnchor={up ? "start" : "end"}
            >
              {signed(row.value, valueFormat)}
            </text>
          </g>
        );
      })}

      <line className="n4viz-axis" x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} />
      {xTicks.map((t) => (
        <text
          key={`tx-${t}`}
          className="n4viz-tick"
          x={round(xScale(t))}
          y={plotBottom + 15}
          textAnchor="middle"
        >
          {valueFormat(t)}
        </text>
      ))}
    </svg>
  );
}
