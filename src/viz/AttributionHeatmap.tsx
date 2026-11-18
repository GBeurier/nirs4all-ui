import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { cx } from "./_cx.js";
import {
  attributionMaxAbs,
  nextAttributionCursor,
  rasterizeAttributions,
  sparseColumnTicks,
  summarizeAttributionHeatmap,
  type AttributionCursor,
  type AttributionHeatmapColumn,
  type AttributionHeatmapRow,
} from "./attributionHeatmapModel.js";
import { compactNumber, signedNumber } from "./description.js";
import { N4_DIVERGING_STOPS } from "./theme.js";

export interface AttributionHeatmapProps {
  /** Rows (for example samples), each with values aligned to `columns`. */
  rows: readonly AttributionHeatmapRow[];
  /** Columns (for example wavelength groups). */
  columns: readonly AttributionHeatmapColumn[];
  /** Row drawn with a selection outline and named beside the plot. */
  selectedRowId?: string | null;
  /** Called on row click, or on Enter/Space for the row under the keyboard cursor. */
  onRowActivate?: (id: string) => void;
  /** Column drawn with a highlight stripe, for example linked from a spectral chart. */
  highlightColumn?: number | null;
  /** Called with the column under the pointer or keyboard cursor when it changes, and `null` on leave. */
  onColumnHover?: (index: number | null) => void;
  /** Override of the symmetric color domain half-width; defaults to the largest finite |value|. */
  maxAbs?: number;
  /** Name of the plotted values, e.g. "SHAP value" (default "Attribution"). */
  valueLabel?: string;
  rowAxisLabel?: string;
  columnAxisLabel?: string;
  positiveLabel?: string;
  negativeLabel?: string;
  /** Pixel height of one row; defaults to fitting about 480px (3–22px per row). */
  rowHeight?: number;
  /** Width of the row-label gutter in pixels (default 132). */
  labelWidth?: number;
  /** Maximum number of column tick labels (default 8). */
  maxColumnTicks?: number;
  valueFormat?: (v: number) => string;
  title?: string;
  /** Faithful host-provided text alternative; defaults to a data summary. */
  description?: string;
  /** Show the summary as visible caption text (default false). */
  showSummary?: boolean;
  instructions?: string;
  className?: string;
}

const NO_ROWS_LABEL_MIN_HEIGHT = 11;
const MAX_RASTER_WIDTH = 4096;

function defaultRowHeight(count: number): number {
  return Math.max(3, Math.min(22, Math.floor(480 / Math.max(1, count))));
}

/**
 * Rows × columns heatmap of signed attributions (for example per-sample SHAP
 * values per wavelength group) on a symmetric diverging scale centred on zero.
 * Rendered on a canvas so ~100 rows × ~700 columns stay fast; when columns
 * outnumber device pixels the strongest |value| in each pixel is kept. Rows
 * are selectable, a column can be highlighted for linking, and pointer hover
 * or keyboard (arrows, Shift+arrows, Home/End, Enter, Escape) drive a tooltip
 * and a live readout. Row labels are listed when rows are tall enough;
 * otherwise only the selected and hovered rows are named.
 */
export function AttributionHeatmap({
  rows,
  columns,
  selectedRowId = null,
  onRowActivate,
  highlightColumn = null,
  onColumnHover,
  maxAbs,
  valueLabel = "Attribution",
  rowAxisLabel = "Rows",
  columnAxisLabel = "Columns",
  positiveLabel = "Raises prediction",
  negativeLabel = "Lowers prediction",
  rowHeight,
  labelWidth = 132,
  maxColumnTicks = 8,
  valueFormat = compactNumber,
  title = "Attribution heatmap",
  description,
  showSummary = false,
  instructions = "Hover the heatmap, or focus it and use the arrow keys (Shift for larger steps), Home and End. Enter selects the row, Escape clears.",
  className,
}: AttributionHeatmapProps) {
  const baseId = useId();
  const descriptionId = `${baseId}-desc`;
  const instructionsId = `${baseId}-help`;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hoveredColumn = useRef<number | null>(null);
  const [cursor, setCursor] = useState<AttributionCursor | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);

  const nRows = rows.length;
  const nCols = columns.length;
  const resolvedRowHeight = Math.max(1, rowHeight ?? defaultRowHeight(nRows));
  const plotHeight = Math.max(1, nRows * resolvedRowHeight);
  const domainMax = maxAbs !== undefined && Number.isFinite(maxAbs) && maxAbs > 0 ? maxAbs : attributionMaxAbs(rows);
  const pixelWidth = Math.max(1, Math.min(nCols, measuredWidth > 0 ? measuredWidth : MAX_RASTER_WIDTH));
  const showAllLabels = resolvedRowHeight >= NO_ROWS_LABEL_MIN_HEIGHT;
  const selectedIndex = selectedRowId === null ? -1 : rows.findIndex((row) => row.id === selectedRowId);
  const summary = description?.trim() || summarizeAttributionHeatmap(rows, columns, valueLabel, valueFormat);
  const ticks = useMemo(() => sparseColumnTicks(nCols, maxColumnTicks), [nCols, maxColumnTicks]);

  // Track the drawn width in device pixels so the raster never exceeds it.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const measure = () => {
      const ratio = wrap.ownerDocument.defaultView?.devicePixelRatio ?? 1;
      setMeasuredWidth(Math.round(wrap.clientWidth * ratio));
    };
    measure();
    const Observer = wrap.ownerDocument.defaultView?.ResizeObserver;
    if (!Observer) return undefined;
    const observer = new Observer(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || nRows === 0 || nCols === 0) return;
    const pixels = rasterizeAttributions(rows, nCols, pixelWidth, domainMax);
    const image = context.createImageData(pixelWidth, nRows);
    image.data.set(pixels);
    context.putImageData(image, 0, 0);
  }, [rows, nRows, nCols, pixelWidth, domainMax]);

  const moveCursor = (next: AttributionCursor | null) => {
    setCursor(next);
    const column = next ? next.col : null;
    if (!onColumnHover || column === hoveredColumn.current) return;
    hoveredColumn.current = column;
    onColumnHover(column);
  };
  const cellAt = (event: MouseEvent<HTMLDivElement>): AttributionCursor | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || nRows === 0 || nCols === 0) return null;
    const col = Math.floor(((event.clientX - rect.left) / rect.width) * nCols);
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * nRows);
    if (col < 0 || col >= nCols || row < 0 || row >= nRows) return null;
    return { row, col };
  };
  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === "Enter" || event.key === " ") && onRowActivate && cursor) {
      event.preventDefault();
      onRowActivate(rows[cursor.row]!.id);
      return;
    }
    const next = nextAttributionCursor(cursor, event.key, event.shiftKey, nRows, nCols);
    if (next === undefined) return;
    event.preventDefault();
    moveCursor(next);
  };

  const active = cursor && cursor.row < nRows && cursor.col < nCols ? cursor : null;
  const activeValue = active ? rows[active.row]!.values[active.col] : undefined;
  const activeText = active
    ? `${rows[active.row]!.label} · ${columns[active.col]?.label ?? `column ${active.col + 1}`} · ${valueLabel} ${
        activeValue !== undefined && Number.isFinite(activeValue) ? signedNumber(activeValue, valueFormat) : "unavailable"
      }`
    : null;
  const percent = (index: number, count: number) => `${(index / Math.max(1, count)) * 100}%`;
  const stripe = `max(2px, ${100 / Math.max(1, nCols)}%)`;
  const gradient = `linear-gradient(90deg, ${N4_DIVERGING_STOPS.join(", ")})`;
  const highlighted = highlightColumn !== null && highlightColumn >= 0 && highlightColumn < nCols ? highlightColumn : null;
  const markers = showAllLabels
    ? []
    : [...new Set([selectedIndex, active?.row ?? -1])].filter((index) => index >= 0 && index < nRows);

  return (
    <figure className={cx("n4viz-figure", "n4viz-attr-heatmap", className)}>
      <div className="n4viz-attr-body" style={{ gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)` }}>
        <div className="n4viz-attr-rowlabels" style={{ height: plotHeight }} title={rowAxisLabel}>
          {showAllLabels
            ? rows.map((row, index) => {
                const content = <span className="n4viz-attr-rowlabel-text">{row.label}</span>;
                const style = { top: index * resolvedRowHeight, height: resolvedRowHeight, lineHeight: `${resolvedRowHeight}px` };
                return onRowActivate ? (
                  <button
                    key={row.id}
                    type="button"
                    className="n4viz-attr-rowlabel"
                    style={style}
                    data-selected={index === selectedIndex ? "true" : undefined}
                    aria-pressed={index === selectedIndex}
                    onClick={() => onRowActivate(row.id)}
                  >
                    {content}
                  </button>
                ) : (
                  <span key={row.id} className="n4viz-attr-rowlabel" style={style} data-selected={index === selectedIndex ? "true" : undefined}>
                    {content}
                  </span>
                );
              })
            : markers.map((index) => (
                <span
                  key={`marker-${index}`}
                  className="n4viz-attr-rowlabel n4viz-attr-rowmarker"
                  style={{ top: (index + 0.5) * resolvedRowHeight }}
                  data-selected={index === selectedIndex ? "true" : undefined}
                >
                  <span className="n4viz-attr-rowlabel-text">{rows[index]!.label}</span>
                </span>
              ))}
        </div>
        <div
          className="n4viz-focus n4viz-attr-plot"
          role="group"
          tabIndex={0}
          aria-label={title}
          aria-describedby={`${instructionsId} ${descriptionId}`}
          onKeyDown={handleKey}
        >
          <div
            ref={wrapRef}
            className={cx("n4viz-attr-canvas-wrap", onRowActivate && "n4viz-clickable")}
            style={{ height: plotHeight }}
            onPointerMove={(event) => {
              const next = cellAt(event);
              if (next && (next.row !== cursor?.row || next.col !== cursor?.col)) moveCursor(next);
            }}
            onPointerLeave={() => moveCursor(null)}
            onClick={(event) => {
              const cell = cellAt(event);
              if (cell && onRowActivate) onRowActivate(rows[cell.row]!.id);
            }}
          >
            <canvas
              ref={canvasRef}
              className="n4viz-attr-canvas"
              width={pixelWidth}
              height={Math.max(1, nRows)}
              role="img"
              aria-label={title}
              aria-describedby={descriptionId}
            />
            {highlighted !== null ? (
              <div className="n4viz-attr-column" style={{ left: percent(highlighted, nCols), width: stripe }} aria-hidden="true" />
            ) : null}
            {selectedIndex >= 0 ? (
              <div
                className="n4viz-attr-selected-row"
                style={{ top: selectedIndex * resolvedRowHeight, height: Math.max(2, resolvedRowHeight) }}
                aria-hidden="true"
              />
            ) : null}
            {active ? (
              <>
                <div
                  className="n4viz-attr-cursor"
                  style={{ left: percent(active.col, nCols), width: stripe, top: active.row * resolvedRowHeight, height: Math.max(2, resolvedRowHeight) }}
                  aria-hidden="true"
                />
                <div
                  className="n4viz-attr-tooltip"
                  data-side={active.row < nRows / 2 ? "below" : "above"}
                  style={{
                    left: percent(active.col + 0.5, nCols),
                    top: (active.row + (active.row < nRows / 2 ? 1 : 0)) * resolvedRowHeight,
                    // shift by the same fraction of its own width so it never leaves the plot
                    translate: `${-((active.col + 0.5) / Math.max(1, nCols)) * 100}% 0`,
                  }}
                  aria-hidden="true"
                >
                  {activeText}
                </div>
              </>
            ) : null}
          </div>
          <div className="n4viz-attr-xticks" aria-hidden="true">
            {ticks.map((index) => (
              <span
                key={`tick-${index}`}
                className="n4viz-tick-label"
                data-edge={index === 0 ? "start" : index === nCols - 1 ? "end" : undefined}
                style={{ left: percent(index + 0.5, nCols) }}
              >
                {columns[index]!.label}
              </span>
            ))}
          </div>
          <div className="n4viz-attr-axis-label">{columnAxisLabel}</div>
        </div>
      </div>

      <p className="n4viz-readout" aria-live="polite">{activeText ?? instructions}</p>
      <p id={instructionsId} className="n4viz-sr-only">{instructions}</p>
      <p id={descriptionId} className="n4viz-sr-only">{summary}</p>

      <div className="n4viz-legend-row" aria-hidden="true">
        <span className="n4viz-legend-item">
          {negativeLabel} {signedNumber(-domainMax, valueFormat)}
          <span className="n4viz-swatch-ramp n4viz-attr-ramp" style={{ background: gradient }} />
          {signedNumber(domainMax, valueFormat)} {positiveLabel}
        </span>
        <span className="n4viz-legend-item">{valueLabel} (symmetric scale, 0 = neutral)</span>
      </div>

      {showSummary ? <figcaption className="n4viz-summary">{summary}</figcaption> : null}
    </figure>
  );
}
