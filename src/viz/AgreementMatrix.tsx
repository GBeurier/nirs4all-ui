import { useId, type KeyboardEvent } from "react";

import { cx } from "./_cx.js";
import { summaryNumber } from "./description.js";
import { clamp, round } from "./geometry.js";
import { N4_DIVERGING_STOPS, divergingPosition, rampAt, readableTextColor, viridisColor } from "./theme.js";

export interface AgreementMatrixProps {
  /** Row and column labels (the compared profiles), index-aligned to `values`. */
  labels: readonly string[];
  /** `values[i][j]` agreement between profiles i and j; `null`/non-finite cells print "—". */
  values: ReadonlyArray<ReadonlyArray<number | null>>;
  /** Value domain, e.g. `[-1, 1]` for Spearman or `[0, 1]` for Jaccard. A domain spanning zero uses a diverging scale centred on zero, otherwise a sequential one. */
  domain: readonly [number, number];
  /** Metric name used in the title, legend, tooltips and summary, e.g. "Spearman ρ". */
  metricLabel: string;
  /** Cell text format (default two decimals). */
  format?: (v: number) => string;
  /** When supplied, cells become buttons (click, Enter or Space). */
  onCellClick?: (row: number, col: number) => void;
  /** Cell drawn with a selection outline. */
  selectedCell?: { row: number; col: number } | null;
  /** Side of one cell in SVG units (default 44). */
  cellSize?: number;
  /** Width reserved for row labels (default from the longest label). */
  labelWidth?: number;
  title?: string;
  /** Faithful host-provided text alternative; defaults to a data summary. */
  description?: string;
  /** Show the summary as visible caption text (default false). */
  showSummary?: boolean;
  className?: string;
}

function defaultFormat(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "—";
}

function usable(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Fill of an agreement value: diverging around zero when the domain spans it, sequential (viridis) otherwise. */
export function agreementColor(value: number, domain: readonly [number, number]): string {
  const [min, max] = domain[0] <= domain[1] ? domain : [domain[1], domain[0]];
  if (min < 0 && max > 0) return rampAt(N4_DIVERGING_STOPS, divergingPosition(clamp(value, min, max), min, max));
  return viridisColor(max > min ? clamp((value - min) / (max - min), 0, 1) : 0.5);
}

/** Data-derived description of an agreement matrix (off-diagonal extremes). */
export function summarizeAgreementMatrix(
  labels: readonly string[],
  values: ReadonlyArray<ReadonlyArray<number | null>>,
  metricLabel: string,
): string {
  const n = labels.length;
  let lowest: { i: number; j: number; v: number } | null = null;
  let highest: { i: number; j: number; v: number } | null = null;
  let missing = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const v = values[i]?.[j];
      if (!usable(v)) {
        missing += 1;
        continue;
      }
      if (!lowest || v < lowest.v) lowest = { i, j, v };
      if (!highest || v > highest.v) highest = { i, j, v };
    }
  }
  const head = `${metricLabel} between ${n} profiles.`;
  if (!lowest || !highest) return n < 2 ? head : `${head} No pair has a defined value.`;
  const pair = (entry: { i: number; j: number; v: number }) => `${labels[entry.i]} / ${labels[entry.j]} (${summaryNumber(entry.v)})`;
  return [
    head,
    `Highest agreement ${pair(highest)}; lowest ${pair(lowest)}.`,
    missing > 0 ? `${missing} pair${missing === 1 ? " is" : "s are"} undefined (shown as —).` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Square m × m matrix of agreement scores between importance profiles (for
 * example Spearman rank correlation or top-K Jaccard overlap), with labelled
 * rows/columns, the value printed in every cell and a color scale fixed by the
 * host `domain` (diverging around zero, sequential otherwise). Undefined
 * entries print "—". Hosts compute every value.
 */
export function AgreementMatrix({
  labels,
  values,
  domain,
  metricLabel,
  format = defaultFormat,
  onCellClick,
  selectedCell = null,
  cellSize = 44,
  labelWidth,
  title,
  description,
  showSummary = false,
  className,
}: AgreementMatrixProps) {
  const descriptionId = useId();
  const n = labels.length;
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0);
  const left = labelWidth ?? clamp(Math.round(longest * 6.2) + 14, 48, 180);
  const top = clamp(Math.round(longest * 4.6) + 18, 34, 140);
  const legendGap = 18;
  const legendWidth = 10;
  const gridSize = n * cellSize;
  const width = left + gridSize + legendGap + legendWidth + 44;
  const height = top + Math.max(gridSize, 60) + 10;
  const [lo, hi] = domain[0] <= domain[1] ? domain : [domain[1], domain[0]];
  const resolvedTitle = title ?? `${metricLabel} agreement matrix`;
  const summary = description?.trim() || summarizeAgreementMatrix(labels, values, metricLabel);
  const rotate = longest > 3;
  const segments = 24;
  const legendX = left + gridSize + legendGap;
  const legendHeight = Math.max(gridSize, 60);

  const handleKey = (event: KeyboardEvent<SVGGElement>, i: number, j: number) => {
    if (!onCellClick || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onCellClick(i, j);
  };

  return (
    <figure className={cx("n4viz-figure", "n4viz-agreement", className)}>
      <svg
        className="n4viz"
        viewBox={`0 0 ${width} ${height}`}
        role={onCellClick ? "group" : "img"}
        aria-label={resolvedTitle}
        aria-describedby={descriptionId}
        preserveAspectRatio="xMidYMid meet"
      >
        <title>{resolvedTitle}</title>
        <desc id={descriptionId}>{summary}</desc>
        {labels.map((rowLabel, i) =>
          labels.map((colLabel, j) => {
            const raw = values[i]?.[j];
            const has = usable(raw);
            const fill = has ? agreementColor(raw, [lo, hi]) : "transparent";
            const x = left + j * cellSize;
            const y = top + i * cellSize;
            const selected = selectedCell?.row === i && selectedCell?.col === j;
            const text = has ? format(raw) : "—";
            const label = `${rowLabel} / ${colLabel}: ${metricLabel} ${text}`;
            return (
              <g
                key={`cell-${i}-${j}`}
                className={cx("n4viz-agreement-cell", onCellClick && "n4viz-clickable")}
                data-row={i}
                data-col={j}
                data-selected={selected ? "true" : undefined}
                role={onCellClick ? "button" : undefined}
                tabIndex={onCellClick ? 0 : undefined}
                aria-label={onCellClick ? label : undefined}
                onClick={onCellClick ? () => onCellClick(i, j) : undefined}
                onKeyDown={onCellClick ? (event) => handleKey(event, i, j) : undefined}
              >
                <title>{label}</title>
                <rect
                  className="n4viz-cell"
                  x={round(x + 1)}
                  y={round(y + 1)}
                  width={round(cellSize - 2)}
                  height={round(cellSize - 2)}
                  rx={3}
                  fill={fill}
                  stroke={selected ? "currentColor" : has ? "transparent" : "currentColor"}
                  strokeOpacity={selected ? 1 : has ? 0 : 0.2}
                  strokeWidth={selected ? 2 : 1}
                />
                <text
                  className="n4viz-cell-value"
                  x={round(x + cellSize / 2)}
                  y={round(y + cellSize / 2 + 4)}
                  textAnchor="middle"
                  style={has ? { fill: readableTextColor(fill) } : undefined}
                >
                  {text}
                </text>
              </g>
            );
          }),
        )}
        {labels.map((label, i) => (
          <text key={`row-${i}`} className="n4viz-tick" x={left - 6} y={round(top + i * cellSize + cellSize / 2 + 3)} textAnchor="end">
            {label}
          </text>
        ))}
        {labels.map((label, j) => {
          const x = round(left + j * cellSize + cellSize / 2);
          const y = top - 6;
          return rotate ? (
            <text key={`col-${j}`} className="n4viz-tick" transform={`rotate(-40 ${x} ${y})`} x={x} y={y} textAnchor="start">
              {label}
            </text>
          ) : (
            <text key={`col-${j}`} className="n4viz-tick" x={x} y={y} textAnchor="middle">
              {label}
            </text>
          );
        })}
        <g className="n4viz-agreement-legend" aria-hidden="true">
          {Array.from({ length: segments }, (_, k) => {
            const t = 1 - k / (segments - 1);
            return (
              <rect
                key={`legend-${k}`}
                className="n4viz-legend-cell"
                x={legendX}
                y={round(top + (k / segments) * legendHeight)}
                width={legendWidth}
                height={round(legendHeight / segments + 0.6)}
                fill={agreementColor(lo + t * (hi - lo), [lo, hi])}
              />
            );
          })}
          <text className="n4viz-tick" x={legendX + legendWidth + 4} y={top + 8} textAnchor="start">{format(hi)}</text>
          {lo < 0 && hi > 0 ? (
            <text className="n4viz-tick" x={legendX + legendWidth + 4} y={round(top + legendHeight * (hi / (hi - lo)) + 3)} textAnchor="start">{format(0)}</text>
          ) : null}
          <text className="n4viz-tick" x={legendX + legendWidth + 4} y={top + legendHeight} textAnchor="start">{format(lo)}</text>
        </g>
      </svg>
      {showSummary ? <figcaption className="n4viz-summary">{summary}</figcaption> : null}
    </figure>
  );
}
