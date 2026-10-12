import { useCallback, useMemo, type ReactNode } from "react";

import { rampAt } from "../viz/theme.js";
import { CanvasPlot, type Domain, type PlotGeometry, type PlotTool } from "./CanvasPlot.js";
import { formatValue } from "./format.js";
import { matrixExtent, wavelengthQuantiles, wavelengthStats, type SpectraMatrix } from "./matrix.js";
import { clickSelection, combineSelection, type ModifierState, type Selection, type SelectionMode, selectionModeFromModifiers } from "./selection.js";
import { decimationIndices, nearestAxisIndex, normalizeRect, type PixelRect } from "./spatial.js";
import type { WorkbenchIcons } from "./icons.js";

export type SpectraDisplayMode = "lines" | "bands" | "density";
export type SpectraBandKind = "meanStd" | "quantiles";

/** A per-group envelope precomputed by the view (or supplied by the host). */
export interface SpectraBandGroup {
  key: string;
  color: string;
  rows: readonly number[];
}

/** Faint reference layer drawn under the data (e.g. the input of the step). */
export interface SpectraGhost {
  matrix: SpectraMatrix;
  wavelengths: ArrayLike<number>;
  label?: string;
}

/** Highlighted wavelength regions (e.g. a crop window, absorbance bands). */
export interface SpectraRegion {
  from: number;
  to: number;
  label?: string;
  tone?: "accent" | "muted" | "warning";
}

export interface SpectraViewProps {
  matrix: SpectraMatrix;
  wavelengths: ArrayLike<number>;
  /** Matrix rows to draw (defaults to all). */
  rows?: readonly number[] | undefined;
  /** One CSS color per matrix row. */
  colors: readonly string[];
  /** Color batching groups per matrix row + their palette (from `resolveRowColors`). */
  groups: Int32Array;
  palette: readonly string[];
  /** Rows (matrix space) in the current selection. */
  selected: Selection;
  hoverRow?: number | null | undefined;
  mode?: SpectraDisplayMode | undefined;
  bandKind?: SpectraBandKind | undefined;
  /** Envelope groups for `bands` mode; defaults to one group over `rows`. */
  bandGroups?: readonly SpectraBandGroup[] | undefined;
  ghost?: SpectraGhost | null | undefined;
  regions?: readonly SpectraRegion[] | undefined;
  unit?: string | undefined;
  xLabel?: string | undefined;
  yLabel?: string | undefined;
  invertX?: boolean | undefined;
  onHover?: ((row: number | null) => void) | undefined;
  /** New selection (matrix rows) after a click / box gesture. */
  onSelectionChange?: ((next: Selection, mode: SelectionMode) => void) | undefined;
  /** Wavelength window chosen with the zoom tool (for "crop to view"). */
  renderTooltip?: ((row: number) => ReactNode) | undefined;
  toolExtras?: ReactNode | undefined;
  icons?: WorkbenchIcons | undefined;
  ariaLabel?: string | undefined;
  className?: string | undefined;
}

/** Above this many selected curves, non-line modes draw the selection as an envelope. */
const SELECTION_LINE_LIMIT = 60;

const DENSITY_STOPS = ["#e6f6f4", "#99e0d6", "#2dd4bf", "#0d9488", "#0f766e", "#134e4a"] as const;

/** Line opacity that keeps overplotting readable from 10 to 10 000 curves. */
export function lineAlpha(count: number): number {
  if (count <= 1) return 0.95;
  return Math.max(0.05, Math.min(0.85, 3.2 / Math.sqrt(count)));
}

function columnWindow(wavelengths: ArrayLike<number>, domain: Domain): [number, number] {
  const a = nearestAxisIndex(wavelengths, domain[0]);
  const b = nearestAxisIndex(wavelengths, domain[1]);
  return [Math.max(0, Math.min(a, b) - 1), Math.min(wavelengths.length, Math.max(a, b) + 2)];
}

function strokeRows(
  ctx: CanvasRenderingContext2D,
  matrix: SpectraMatrix,
  wavelengths: ArrayLike<number>,
  rows: Iterable<number>,
  columns: Uint32Array,
  geo: PlotGeometry,
) {
  ctx.beginPath();
  for (const row of rows) {
    const offset = row * matrix.cols;
    let pen = false;
    for (let k = 0; k < columns.length; k += 1) {
      const c = columns[k]!;
      const value = matrix.data[offset + c]!;
      if (!Number.isFinite(value)) {
        pen = false;
        continue;
      }
      const x = geo.x(wavelengths[c]!);
      const y = geo.y(value);
      if (pen) ctx.lineTo(x, y);
      else {
        ctx.moveTo(x, y);
        pen = true;
      }
    }
  }
  ctx.stroke();
}

function bandPath(
  ctx: CanvasRenderingContext2D,
  wavelengths: ArrayLike<number>,
  lower: ArrayLike<number>,
  upper: ArrayLike<number>,
  geo: PlotGeometry,
) {
  ctx.beginPath();
  for (let c = 0; c < wavelengths.length; c += 1) {
    const x = geo.x(wavelengths[c]!);
    const y = geo.y(upper[c]!);
    if (c === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let c = wavelengths.length - 1; c >= 0; c -= 1) ctx.lineTo(geo.x(wavelengths[c]!), geo.y(lower[c]!));
  ctx.closePath();
}

function linePath(ctx: CanvasRenderingContext2D, wavelengths: ArrayLike<number>, values: ArrayLike<number>, geo: PlotGeometry) {
  ctx.beginPath();
  let pen = false;
  for (let c = 0; c < wavelengths.length; c += 1) {
    const v = values[c]!;
    if (!Number.isFinite(v)) {
      pen = false;
      continue;
    }
    const x = geo.x(wavelengths[c]!);
    const y = geo.y(v);
    if (pen) ctx.lineTo(x, y);
    else {
      ctx.moveTo(x, y);
      pen = true;
    }
  }
}

function rgba(color: string, alpha: number): string {
  // Accept #rgb/#rrggbb and rgb(); fall back to globalAlpha for anything else.
  if (color.startsWith("#")) {
    const clean = color.slice(1);
    const full = clean.length === 3 ? clean.replace(/(.)/g, "$1$1") : clean;
    const n = Number.parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  if (color.startsWith("rgb(")) return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  return color;
}

/**
 * The workbench spectra canvas. Three display modes share one interaction
 * model: `lines` (every curve, batched by color, decimated to the pixel
 * width), `bands` (mean ± σ or 5–25–50–75–95 % envelopes per color group) and
 * `density` (a log-density raster of all curves — scales to any sample count).
 * Click picks the nearest curve; drag a box to select every curve crossing it.
 */
export function SpectraView({
  matrix,
  wavelengths,
  rows,
  colors,
  groups,
  palette,
  selected,
  hoverRow = null,
  mode = "lines",
  bandKind = "meanStd",
  bandGroups,
  ghost,
  regions,
  unit = "nm",
  xLabel,
  yLabel = "Absorbance",
  invertX = false,
  onHover,
  onSelectionChange,
  renderTooltip,
  toolExtras,
  icons,
  ariaLabel = "Spectra",
  className,
}: SpectraViewProps) {
  const universe = useMemo(() => rows ?? Array.from({ length: matrix.rows }, (_, i) => i), [rows, matrix.rows]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const hasSelection = selected.length > 0;

  const xDomain: Domain = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < wavelengths.length; i += 1) {
      const w = wavelengths[i]!;
      if (w < lo) lo = w;
      if (w > hi) hi = w;
    }
    return Number.isFinite(lo) ? [lo, hi] : [0, 1];
  }, [wavelengths]);

  const yDomain: Domain = useMemo(() => {
    const extent = matrixExtent(matrix, universe) ?? { min: 0, max: 1 };
    const pad = (extent.max - extent.min || 1) * 0.06;
    return [extent.min - pad, extent.max + pad];
  }, [matrix, universe]);

  const bands = useMemo(() => {
    if (mode !== "bands") return [];
    const sources = bandGroups && bandGroups.length > 0 ? bandGroups : [{ key: "all", color: palette[0] ?? "#0d9488", rows: universe }];
    return sources
      .filter((group) => group.rows.length > 0)
      .map((group) => {
        if (bandKind === "quantiles") {
          const [q05, q25, q50, q75, q95] = wavelengthQuantiles(matrix, [0.05, 0.25, 0.5, 0.75, 0.95], group.rows);
          return { ...group, outer: [q05!, q95!] as const, inner: [q25!, q75!] as const, center: q50! };
        }
        const stats = wavelengthStats(matrix, group.rows);
        const lo = new Float32Array(matrix.cols);
        const hi = new Float32Array(matrix.cols);
        const lo2 = new Float32Array(matrix.cols);
        const hi2 = new Float32Array(matrix.cols);
        for (let c = 0; c < matrix.cols; c += 1) {
          lo[c] = stats.mean[c]! - stats.std[c]!;
          hi[c] = stats.mean[c]! + stats.std[c]!;
          lo2[c] = stats.mean[c]! - 2 * stats.std[c]!;
          hi2[c] = stats.mean[c]! + 2 * stats.std[c]!;
        }
        return { ...group, outer: [lo2, hi2] as const, inner: [lo, hi] as const, center: stats.mean };
      });
  }, [mode, bandGroups, bandKind, matrix, universe, palette]);

  const ghostStats = useMemo(() => (ghost ? wavelengthStats(ghost.matrix) : null), [ghost]);
  // Outside `lines` mode a large selection is summarized as its own envelope.
  const selectionEnvelope = useMemo(
    () => (mode !== "lines" && selected.length > SELECTION_LINE_LIMIT ? wavelengthStats(matrix, selected.filter((row) => row < matrix.rows)) : null),
    [mode, selected, matrix],
  );

  const drawBase = useCallback(
    (ctx: CanvasRenderingContext2D, geo: PlotGeometry) => {
      if (regions) {
        for (const region of regions) {
          const x0 = geo.x(region.from);
          const x1 = geo.x(region.to);
          ctx.fillStyle = region.tone === "warning" ? "rgba(217,119,6,0.08)" : region.tone === "muted" ? "rgba(100,116,139,0.08)" : "rgba(13,148,136,0.08)";
          ctx.fillRect(Math.min(x0, x1), geo.top, Math.abs(x1 - x0), geo.height);
        }
      }
      if (ghost && ghostStats) {
        ctx.fillStyle = "rgba(100,116,139,0.12)";
        bandPath(ctx, ghost.wavelengths, ghostStats.min, ghostStats.max, geo);
        ctx.fill();
        ctx.strokeStyle = "rgba(100,116,139,0.55)";
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.2;
        linePath(ctx, ghost.wavelengths, ghostStats.mean, geo);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const [c0, c1] = columnWindow(wavelengths, geo.x.domain);
      const span = Math.max(2, c1 - c0);
      const local = decimationIndices(span, geo.width * 1.25);
      const columns = new Uint32Array(local.length);
      for (let i = 0; i < local.length; i += 1) columns[i] = local[i]! + c0;

      if (mode === "lines") {
        const alpha = lineAlpha(universe.length) * (hasSelection ? 0.35 : 1);
        const byGroup = new Map<number, number[]>();
        for (const row of universe) {
          const group = groups[row] ?? 0;
          const bucket = byGroup.get(group);
          if (bucket) bucket.push(row);
          else byGroup.set(group, [row]);
        }
        ctx.lineWidth = universe.length > 2000 ? 0.7 : 1;
        ctx.lineJoin = "round";
        for (const [group, groupRows] of byGroup) {
          ctx.strokeStyle = rgba(palette[group] ?? "#0d9488", alpha);
          strokeRows(ctx, matrix, wavelengths, groupRows, columns, geo);
        }
        return;
      }

      if (mode === "bands") {
        for (const band of bands) {
          ctx.fillStyle = rgba(band.color, hasSelection ? 0.06 : 0.1);
          bandPath(ctx, wavelengths, band.outer[0], band.outer[1], geo);
          ctx.fill();
          ctx.fillStyle = rgba(band.color, hasSelection ? 0.1 : 0.2);
          bandPath(ctx, wavelengths, band.inner[0], band.inner[1], geo);
          ctx.fill();
          ctx.strokeStyle = rgba(band.color, hasSelection ? 0.5 : 0.95);
          ctx.lineWidth = 2;
          linePath(ctx, wavelengths, band.center, geo);
          ctx.stroke();
        }
        return;
      }

      // density: rasterize every curve into a per-pixel hit count, log-scaled.
      const W = Math.max(1, Math.floor(geo.width));
      const H = Math.max(1, Math.floor(geo.height));
      const counts = new Float32Array(W * H);
      const colAt = new Float32Array(W);
      for (let px = 0; px < W; px += 1) {
        const w = geo.x.invert(geo.left + px + 0.5);
        colAt[px] = nearestAxisIndex(wavelengths, w);
      }
      for (const row of universe) {
        const offset = row * matrix.cols;
        let prev = -1;
        for (let px = 0; px < W; px += 1) {
          const value = matrix.data[offset + colAt[px]!]!;
          if (!Number.isFinite(value)) {
            prev = -1;
            continue;
          }
          const py = Math.round(geo.y(value) - geo.top);
          const a = prev < 0 ? py : prev;
          const lo = Math.max(0, Math.min(a, py));
          const hi = Math.min(H - 1, Math.max(a, py));
          for (let y = lo; y <= hi; y += 1) counts[y * W + px]! += 1;
          prev = py;
        }
      }
      let max = 0;
      for (let i = 0; i < counts.length; i += 1) if (counts[i]! > max) max = counts[i]!;
      if (max === 0 || typeof document === "undefined") return;
      const image = new ImageData(W, H);
      const logMax = Math.log1p(max);
      const lut = Array.from({ length: 256 }, (_, i) => {
        const css = rampAt(DENSITY_STOPS, i / 255);
        const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(css);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [13, 148, 136];
      });
      for (let i = 0; i < counts.length; i += 1) {
        const count = counts[i]!;
        if (count === 0) continue;
        const t = Math.log1p(count) / logMax;
        const rgb = lut[Math.min(255, Math.round(t * 255))]!;
        image.data[i * 4] = rgb[0]!;
        image.data[i * 4 + 1] = rgb[1]!;
        image.data[i * 4 + 2] = rgb[2]!;
        image.data[i * 4 + 3] = Math.round((0.25 + 0.75 * t) * (hasSelection ? 140 : 255));
      }
      const off = document.createElement("canvas");
      off.width = W;
      off.height = H;
      off.getContext("2d")?.putImageData(image, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, geo.left, geo.top, W, H);
    },
    [regions, ghost, ghostStats, wavelengths, mode, universe, hasSelection, groups, palette, matrix, bands],
  );

  const drawHighlight = useCallback(
    (ctx: CanvasRenderingContext2D, geo: PlotGeometry) => {
      const [c0, c1] = columnWindow(wavelengths, geo.x.domain);
      const local = decimationIndices(Math.max(2, c1 - c0), geo.width * 1.5);
      const columns = new Uint32Array(local.length);
      for (let i = 0; i < local.length; i += 1) columns[i] = local[i]! + c0;
      if (selectionEnvelope) {
        const lo = new Float32Array(matrix.cols);
        const hi = new Float32Array(matrix.cols);
        for (let c = 0; c < matrix.cols; c += 1) {
          lo[c] = selectionEnvelope.mean[c]! - selectionEnvelope.std[c]!;
          hi[c] = selectionEnvelope.mean[c]! + selectionEnvelope.std[c]!;
        }
        ctx.fillStyle = "rgba(15,23,42,0.10)";
        bandPath(ctx, wavelengths, lo, hi, geo);
        ctx.fill();
        ctx.setLineDash([5, 3]);
        ctx.strokeStyle = "rgba(15,23,42,0.75)";
        ctx.lineWidth = 1.1;
        linePath(ctx, wavelengths, lo, geo);
        ctx.stroke();
        linePath(ctx, wavelengths, hi, geo);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        linePath(ctx, wavelengths, selectionEnvelope.mean, geo);
        ctx.stroke();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = "#0f172a";
        linePath(ctx, wavelengths, selectionEnvelope.mean, geo);
        ctx.stroke();
      } else if (hasSelection) {
        const byColor = new Map<string, number[]>();
        for (const row of selected) {
          if (row >= matrix.rows) continue;
          const color = colors[row] ?? "#0d9488";
          const bucket = byColor.get(color);
          if (bucket) bucket.push(row);
          else byColor.set(color, [row]);
        }
        ctx.lineWidth = selected.length > 500 ? 0.9 : 1.4;
        const alpha = Math.max(0.35, lineAlpha(selected.length));
        for (const [color, groupRows] of byColor) {
          ctx.strokeStyle = rgba(color, alpha);
          strokeRows(ctx, matrix, wavelengths, groupRows, columns, geo);
        }
      }
      if (hoverRow !== null && hoverRow < matrix.rows) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        strokeRows(ctx, matrix, wavelengths, [hoverRow], columns, geo);
        ctx.lineWidth = 2;
        ctx.strokeStyle = colors[hoverRow] ?? "#0f172a";
        strokeRows(ctx, matrix, wavelengths, [hoverRow], columns, geo);
      }
    },
    [wavelengths, hasSelection, selected, matrix, colors, hoverRow, selectionEnvelope],
  );

  const hitTest = useCallback(
    (px: number, py: number, geo: PlotGeometry): number | null => {
      if (mode !== "lines" && !hasSelection) return null;
      const c = nearestAxisIndex(wavelengths, geo.x.invert(px));
      if (c < 0) return null;
      const target = geo.y.invert(py);
      const tolerance = Math.abs(geo.y.invert(py + 6) - target);
      let best: number | null = null;
      let bestDistance = tolerance;
      const candidates = mode === "lines" ? universe : selected;
      for (const row of candidates) {
        if (hasSelection && mode === "lines" && !selectedSet.has(row) && best !== null) continue;
        const value = matrix.data[row * matrix.cols + c]!;
        const distance = Math.abs(value - target);
        if (distance <= bestDistance) {
          bestDistance = distance;
          best = row;
        }
      }
      return best;
    },
    [mode, hasSelection, wavelengths, universe, selected, selectedSet, matrix],
  );

  const rowsCrossing = useCallback(
    (rect: PixelRect, geo: PlotGeometry): number[] => {
      const r = normalizeRect(rect);
      const wA = geo.x.invert(r.x0);
      const wB = geo.x.invert(r.x1);
      const yHi = geo.y.invert(r.y0);
      const yLo = geo.y.invert(r.y1);
      const [c0, c1] = columnWindow(wavelengths, [Math.min(wA, wB), Math.max(wA, wB)]);
      const out: number[] = [];
      for (const row of universe) {
        const offset = row * matrix.cols;
        for (let c = c0; c < c1; c += 1) {
          const w = wavelengths[c]!;
          if (w < Math.min(wA, wB) || w > Math.max(wA, wB)) continue;
          const value = matrix.data[offset + c]!;
          if (value >= yLo && value <= yHi) {
            out.push(row);
            break;
          }
        }
      }
      return out;
    },
    [wavelengths, universe, matrix],
  );

  const emit = (hits: readonly number[], mods: ModifierState) => {
    if (!onSelectionChange) return;
    const modeKey = selectionModeFromModifiers(mods);
    onSelectionChange(combineSelection(selected, hits, modeKey), modeKey);
  };

  const tools: PlotTool[] = ["select", "zoom", "pan"];
  return (
    <CanvasPlot
      className={className}
      xDomain={xDomain}
      yDomain={yDomain}
      xLabel={xLabel ?? `Wavelength (${unit})`}
      yLabel={yLabel}
      formatX={(v) => formatValue(v, 1)}
      invertX={invertX}
      zoomAxes="x"
      tools={tools}
      drawBase={drawBase}
      drawHighlight={drawHighlight}
      hitTest={hitTest}
      hoverRow={hoverRow}
      onHover={onHover}
      onClickRow={(row, mods) => {
        const next = clickSelection(selected, row, mods);
        if (next && onSelectionChange) onSelectionChange(next, selectionModeFromModifiers(mods));
      }}
      onSelectRect={(rect, geo, mods) => emit(rowsCrossing(rect, geo), mods)}
      {...(renderTooltip ? { renderTooltip } : {})}
      crosshair
      ariaLabel={ariaLabel}
      description={`${universe.length} spectra over ${wavelengths.length} wavelengths, ${mode} mode${hasSelection ? `, ${selected.length} selected` : ""}.`}
      icons={icons}
      toolExtras={toolExtras}
    />
  );
}
