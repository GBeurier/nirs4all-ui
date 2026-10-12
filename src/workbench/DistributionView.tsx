import { useCallback, useMemo, type ReactNode } from "react";

import { CanvasPlot, type Domain, type PlotGeometry } from "./CanvasPlot.js";
import { formatValue } from "./format.js";
import type { WorkbenchIcons } from "./icons.js";
import { clickSelection, combineSelection, selectionModeFromModifiers, type Selection, type SelectionMode } from "./selection.js";
import { normalizeRect } from "./spatial.js";

export interface DistributionStack {
  groups: Int32Array;
  palette: readonly string[];
}

export interface DistributionViewProps {
  /** Numeric value per row (regression) — or category label per row (classification). */
  values: ArrayLike<number> | ReadonlyArray<string | number | null>;
  kind?: "numeric" | "categorical" | undefined;
  /** Category order for the categorical variant. */
  categories?: readonly string[] | undefined;
  rows?: readonly number[] | undefined;
  /** Stack bars by these color groups (categorical color-by). */
  stack?: DistributionStack | null | undefined;
  color?: string | undefined;
  selected: Selection;
  binCount?: number | undefined;
  showMean?: boolean | undefined;
  showMedian?: boolean | undefined;
  xLabel?: string | undefined;
  yLabel?: string | undefined;
  onSelectionChange?: ((next: Selection, mode: SelectionMode) => void) | undefined;
  onHover?: ((row: number | null) => void) | undefined;
  icons?: WorkbenchIcons | undefined;
  toolExtras?: ReactNode | undefined;
  ariaLabel: string;
  className?: string | undefined;
}

interface Bin {
  x0: number;
  x1: number;
  rows: number[];
  /** Per-stack-group counts, in palette order. */
  stacks: Map<number, number>;
  selected: number;
}

/** Freedman–Diaconis bin count, clamped to [6, 60]. */
export function autoBinCount(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 6;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(n * 0.25)]!;
  const q3 = sorted[Math.floor(n * 0.75)]!;
  const iqr = q3 - q1;
  const span = sorted[n - 1]! - sorted[0]!;
  if (iqr <= 0 || span <= 0) return Math.max(6, Math.min(60, Math.ceil(Math.log2(n) + 1)));
  const width = (2 * iqr) / Math.cbrt(n);
  return Math.max(6, Math.min(60, Math.ceil(span / width)));
}

/**
 * Distribution of a per-row value with linked selection: bars stacked by the
 * active color groups, the current selection outlined on top, and a brush on
 * the value axis that selects every row in range. The categorical variant
 * draws one bar per class.
 */
export function DistributionView({
  values,
  kind = "numeric",
  categories,
  rows,
  stack,
  color = "#0d9488",
  selected,
  binCount,
  showMean = true,
  showMedian = false,
  xLabel = "Value",
  yLabel = "Count",
  onSelectionChange,
  onHover,
  icons,
  toolExtras,
  ariaLabel,
  className,
}: DistributionViewProps) {
  const universe = useMemo(() => rows ?? Array.from({ length: values.length }, (_, i) => i), [rows, values.length]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const model = useMemo(() => {
    const bins: Bin[] = [];
    let labels: string[] = [];
    let numeric: number[] = [];
    if (kind === "categorical") {
      const present = new Set<string>();
      for (const row of universe) {
        const v = values[row];
        if (v !== null && v !== undefined && v !== "") present.add(String(v));
      }
      labels = categories ? categories.filter((c) => present.has(c)) : [...present].sort();
      for (const [i] of labels.entries()) bins.push({ x0: i - 0.4, x1: i + 0.4, rows: [], stacks: new Map(), selected: 0 });
      const indexOf = new Map(labels.map((label, i) => [label, i]));
      for (const row of universe) {
        const i = indexOf.get(String(values[row]));
        if (i === undefined) continue;
        bins[i]!.rows.push(row);
      }
    } else {
      for (const row of universe) {
        const v = values[row];
        if (typeof v === "number" && Number.isFinite(v)) numeric.push(v);
      }
      if (numeric.length === 0) return { bins, labels, numeric, max: 1, lo: 0, hi: 1 };
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of numeric) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (lo === hi) {
        lo -= 0.5;
        hi += 0.5;
      }
      const count = binCount ?? autoBinCount(numeric);
      const width = (hi - lo) / count;
      for (let i = 0; i < count; i += 1) bins.push({ x0: lo + i * width, x1: lo + (i + 1) * width, rows: [], stacks: new Map(), selected: 0 });
      for (const row of universe) {
        const v = values[row];
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        const i = Math.min(count - 1, Math.max(0, Math.floor((v - lo) / width)));
        bins[i]!.rows.push(row);
      }
    }
    let max = 1;
    for (const bin of bins) {
      max = Math.max(max, bin.rows.length);
      if (stack) for (const row of bin.rows) bin.stacks.set(stack.groups[row] ?? 0, (bin.stacks.get(stack.groups[row] ?? 0) ?? 0) + 1);
    }
    const lo = bins.length ? bins[0]!.x0 : 0;
    const hi = bins.length ? bins[bins.length - 1]!.x1 : 1;
    return { bins, labels, numeric, max, lo, hi };
  }, [kind, universe, values, categories, binCount, stack]);

  const bins = model.bins;
  const selectedPerBin = useMemo(() => bins.map((bin) => bin.rows.reduce((n, row) => n + (selectedSet.has(row) ? 1 : 0), 0)), [bins, selectedSet]);

  const xDomain: Domain = kind === "categorical" ? [-0.6, Math.max(0.6, model.labels.length - 0.4)] : [model.lo, model.hi];
  const yDomain: Domain = [0, model.max * 1.08];
  const hasSelection = selected.length > 0;

  const drawBase = useCallback(
    (ctx: CanvasRenderingContext2D, geo: PlotGeometry) => {
      const base = geo.y(0);
      for (const bin of bins) {
        const x0 = geo.x(bin.x0) + 0.5;
        const x1 = geo.x(bin.x1) - 0.5;
        const w = Math.max(1, x1 - x0);
        ctx.globalAlpha = hasSelection ? 0.35 : 0.9;
        if (stack && bin.stacks.size > 0) {
          let acc = 0;
          const ordered = [...bin.stacks.entries()].sort((a, b) => a[0] - b[0]);
          for (const [group, count] of ordered) {
            const yTop = geo.y(acc + count);
            ctx.fillStyle = stack.palette[group] ?? color;
            ctx.fillRect(x0, yTop, w, geo.y(acc) - yTop);
            acc += count;
          }
        } else {
          const yTop = geo.y(bin.rows.length);
          ctx.fillStyle = color;
          ctx.fillRect(x0, yTop, w, base - yTop);
        }
      }
      ctx.globalAlpha = 1;
    },
    [bins, stack, color, hasSelection],
  );

  const drawHighlight = useCallback(
    (ctx: CanvasRenderingContext2D, geo: PlotGeometry) => {
      if (!hasSelection) return;
      const base = geo.y(0);
      bins.forEach((bin, i) => {
        const count = selectedPerBin[i]!;
        if (count === 0) return;
        const x0 = geo.x(bin.x0) + 1.5;
        const x1 = geo.x(bin.x1) - 1.5;
        const yTop = geo.y(count);
        ctx.fillStyle = "rgba(15,23,42,0.72)";
        ctx.fillRect(x0, yTop, Math.max(1, x1 - x0), base - yTop);
      });
    },
    [bins, selectedPerBin, hasSelection],
  );

  const hitBin = (px: number, geo: PlotGeometry) => {
    const v = geo.x.invert(px);
    return bins.findIndex((bin) => v >= bin.x0 && v <= bin.x1);
  };

  const stats = useMemo(() => {
    if (kind === "categorical" || model.numeric.length === 0) return null;
    const sorted = [...model.numeric].sort((a, b) => a - b);
    return { mean: sorted.reduce((s, v) => s + v, 0) / sorted.length, median: sorted[Math.floor(sorted.length / 2)]! };
  }, [kind, model.numeric]);

  const overlay = (geo: PlotGeometry) => (
    <>
      {showMean && stats ? (
        <g>
          <line className="n4wb-guide is-accent" x1={geo.x(stats.mean)} x2={geo.x(stats.mean)} y1={geo.top} y2={geo.top + geo.height} />
          <text className="n4wb-guide-label" x={geo.x(stats.mean) + 4} y={geo.top + 11}>
            μ {formatValue(stats.mean)}
          </text>
        </g>
      ) : null}
      {showMedian && stats ? (
        <line className="n4wb-guide" x1={geo.x(stats.median)} x2={geo.x(stats.median)} y1={geo.top} y2={geo.top + geo.height} />
      ) : null}
    </>
  );

  const xTickValues = kind === "categorical" ? model.labels.map((_, i) => i) : undefined;
  return (
    <CanvasPlot
      className={className}
      xDomain={xDomain}
      yDomain={yDomain}
      xLabel={xLabel}
      yLabel={yLabel}
      {...(xTickValues ? { xTickValues, formatX: (v: number) => model.labels[Math.round(v)] ?? "" } : {})}
      formatY={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
      zoomAxes="x"
      tools={["select", "zoom", "pan"]}
      drawBase={drawBase}
      drawHighlight={drawHighlight}
      hitTest={(px, _py, geo) => {
        const i = hitBin(px, geo);
        return i >= 0 ? i : null;
      }}
      onHover={() => onHover?.(null)}
      onClickRow={(binIndex, mods) => {
        const next = clickSelection(selected, null, mods);
        if (binIndex === null) {
          if (next && onSelectionChange) onSelectionChange(next, "replace");
          return;
        }
        const mode = selectionModeFromModifiers(mods);
        onSelectionChange?.(combineSelection(selected, bins[binIndex]?.rows ?? [], mode), mode);
      }}
      onSelectRect={(rect, geo, mods) => {
        const r = normalizeRect(rect);
        const a = geo.x.invert(r.x0);
        const b = geo.x.invert(r.x1);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const hits: number[] = [];
        if (kind === "categorical") {
          bins.forEach((bin, i) => {
            if (i >= lo - 0.4 && i <= hi + 0.4) hits.push(...bin.rows);
          });
        } else {
          for (const row of universe) {
            const v = values[row];
            if (typeof v === "number" && v >= lo && v <= hi) hits.push(row);
          }
        }
        const mode = selectionModeFromModifiers(mods);
        onSelectionChange?.(combineSelection(selected, hits, mode), mode);
      }}
      overlay={overlay}
      ariaLabel={ariaLabel}
      description={`${universe.length} values in ${bins.length} ${kind === "categorical" ? "classes" : "bins"}.`}
      {...(icons ? { icons } : {})}
      toolExtras={toolExtras}
    />
  );
}
