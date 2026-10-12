import { useCallback, useMemo, type ReactNode } from "react";

import { CanvasPlot, type Domain, type PlotGeometry, type PlotPaddingSpec, type PlotTool } from "./CanvasPlot.js";
import type { WorkbenchIcons } from "./icons.js";
import {
  clickSelection,
  combineSelection,
  selectionModeFromModifiers,
  type ModifierState,
  type Selection,
  type SelectionMode,
} from "./selection.js";
import { buildGridIndex, nearestPoint, pointsInPolygon, pointsInRect } from "./spatial.js";

/**
 * A reference mark in data space (`y = slope·x + intercept`, vertical /
 * horizontal lines, bands, boxes, polylines…). `color` overrides the tone's
 * stroke (and the fill of a `rect`), e.g. to match a series.
 */
export type ScatterGuide = { color?: string } & (
  | { kind: "line"; slope: number; intercept: number; label?: string; tone?: GuideTone }
  | { kind: "hline"; y: number; label?: string; tone?: GuideTone }
  | { kind: "vline"; x: number; label?: string; tone?: GuideTone }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; label?: string; tone?: GuideTone }
  | { kind: "band"; y0: number; y1: number; label?: string; tone?: GuideTone }
  | { kind: "segment"; x0: number; y0: number; x1: number; y1: number; label?: string; tone?: GuideTone }
  /** Polyline through data points (trend curves, Pareto fronts). */
  | { kind: "path"; points: ReadonlyArray<readonly [number, number]>; label?: string; tone?: GuideTone }
  /** Filled data-space rectangle (lane IQR boxes, tolerance zones). */
  | { kind: "rect"; x0: number; x1: number; y0: number; y1: number; label?: string; tone?: GuideTone }
);

export type GuideTone = "neutral" | "accent" | "warning" | "danger";

export interface ScatterViewProps {
  /** One coordinate per row; NaN rows are not drawn. */
  xs: ArrayLike<number>;
  ys: ArrayLike<number>;
  /** Rows to draw (defaults to all). */
  rows?: readonly number[] | undefined;
  colors: readonly string[];
  groups: Int32Array;
  palette: readonly string[];
  selected: Selection;
  hoverRow?: number | null | undefined;
  /** Rows drawn with a ring and on top (pinned / compared). */
  emphasized?: ReadonlySet<number> | undefined;
  xLabel?: string | undefined;
  yLabel?: string | undefined;
  formatX?: ((value: number) => string) | undefined;
  formatY?: ((value: number) => string) | undefined;
  xTickValues?: readonly number[] | undefined;
  yTickValues?: readonly number[] | undefined;
  xDomain?: Domain | undefined;
  yDomain?: Domain | undefined;
  /** Same unit per pixel on both axes (parity / score plots). */
  equalAspect?: boolean | undefined;
  pointSize?: number | undefined;
  guides?: readonly ScatterGuide[] | undefined;
  /** Plot padding override (e.g. room for long categorical lane labels). */
  padding?: Partial<PlotPaddingSpec> | undefined;
  onHover?: ((row: number | null) => void) | undefined;
  onSelectionChange?: ((next: Selection, mode: SelectionMode) => void) | undefined;
  renderTooltip?: ((row: number) => ReactNode) | undefined;
  tools?: readonly PlotTool[] | undefined;
  toolExtras?: ReactNode | undefined;
  icons?: WorkbenchIcons | undefined;
  ariaLabel: string;
  className?: string | undefined;
}

function paddedDomain(values: ArrayLike<number>, rows: readonly number[], pad = 0.06): Domain {
  let lo = Infinity;
  let hi = -Infinity;
  for (const row of rows) {
    const v = values[row]!;
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) return [0, 1];
  if (lo === hi) return [lo - 0.5, hi + 0.5];
  const p = (hi - lo) * pad;
  return [lo - p, hi + p];
}

const TONE_STROKE: Record<GuideTone, string> = {
  neutral: "n4wb-guide",
  accent: "n4wb-guide is-accent",
  warning: "n4wb-guide is-warning",
  danger: "n4wb-guide is-danger",
};

/**
 * Canvas scatter with grid-indexed hover / click, box and lasso selection,
 * wheel + box zoom, and SVG guides (identity line, limits, confidence
 * ellipses). Draw calls are batched per palette color so 50 000 points stay
 * fluid; selected rows are redrawn on a light layer.
 */
export function ScatterView({
  xs,
  ys,
  rows,
  colors,
  groups,
  palette,
  selected,
  hoverRow = null,
  emphasized,
  xLabel,
  yLabel,
  formatX,
  formatY,
  xTickValues,
  yTickValues,
  xDomain: xDomainProp,
  yDomain: yDomainProp,
  equalAspect = false,
  pointSize,
  guides,
  padding,
  onHover,
  onSelectionChange,
  renderTooltip,
  tools = ["select", "lasso", "zoom", "pan"],
  toolExtras,
  icons,
  ariaLabel,
  className,
}: ScatterViewProps) {
  const universe = useMemo(() => rows ?? Array.from({ length: xs.length }, (_, i) => i), [rows, xs.length]);
  const hasSelection = selected.length > 0;
  const radius = pointSize ?? (universe.length > 20000 ? 1.4 : universe.length > 4000 ? 2 : universe.length > 600 ? 2.8 : 3.6);

  const domains = useMemo(() => {
    let dx = xDomainProp ?? paddedDomain(xs, universe);
    let dy = yDomainProp ?? paddedDomain(ys, universe);
    if (equalAspect && !xDomainProp && !yDomainProp) {
      const lo = Math.min(dx[0], dy[0]);
      const hi = Math.max(dx[1], dy[1]);
      dx = [lo, hi];
      dy = [lo, hi];
    }
    return { x: dx, y: dy };
  }, [xDomainProp, yDomainProp, xs, ys, universe, equalAspect]);

  // Pixel positions are cached per geometry so hover/selection never re-project.
  const project = useCallback(
    (geo: PlotGeometry) => {
      const px = new Float32Array(xs.length).fill(Number.NaN);
      const py = new Float32Array(xs.length).fill(Number.NaN);
      for (const row of universe) {
        const x = xs[row]!;
        const y = ys[row]!;
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        px[row] = geo.x(x);
        py[row] = geo.y(y);
      }
      return { px, py };
    },
    [xs, ys, universe],
  );
  // A fresh cache per data identity; keyed inside by the plot geometry.
  const cache = useMemo(
    () => ({ key: "", px: new Float32Array(0), py: new Float32Array(0), index: null as ReturnType<typeof buildGridIndex> | null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project],
  );
  const positions = useCallback(
    (geo: PlotGeometry) => {
      const key = `${geo.x.domain.join()}|${geo.y.domain.join()}|${geo.x.range.join()}|${geo.y.range.join()}`;
      if (cache.key !== key || cache.px.length !== xs.length) {
        const { px, py } = project(geo);
        cache.key = key;
        cache.px = px;
        cache.py = py;
        cache.index = buildGridIndex(px, py, geo.outerWidth, geo.outerHeight, 20);
      }
      return cache;
    },
    [cache, project, xs.length],
  );
  const drawBase = useCallback(
    (ctx: CanvasRenderingContext2D, geo: PlotGeometry) => {
      const { px, py } = positions(geo);
      const alpha = hasSelection ? 0.22 : universe.length > 5000 ? 0.55 : 0.82;
      const byGroup = new Map<number, number[]>();
      for (const row of universe) {
        if (!Number.isFinite(px[row]!)) continue;
        const group = groups[row] ?? 0;
        const bucket = byGroup.get(group);
        if (bucket) bucket.push(row);
        else byGroup.set(group, [row]);
      }
      ctx.globalAlpha = alpha;
      const square = universe.length > 4000;
      for (const [group, groupRows] of byGroup) {
        ctx.fillStyle = palette[group] ?? "#0d9488";
        ctx.beginPath();
        for (const row of groupRows) {
          const x = px[row]!;
          const y = py[row]!;
          if (square) ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
          else {
            ctx.moveTo(x + radius, y);
            ctx.arc(x, y, radius, 0, Math.PI * 2);
          }
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    [positions, hasSelection, universe, groups, palette, radius],
  );

  const drawHighlight = useCallback(
    (ctx: CanvasRenderingContext2D, geo: PlotGeometry) => {
      const { px, py } = positions(geo);
      const ring = (row: number, r: number, stroke: string, width: number) => {
        const x = px[row]!;
        const y = py[row]!;
        if (!Number.isFinite(x)) return;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = colors[row] ?? "#0d9488";
        ctx.fill();
        ctx.lineWidth = width;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      };
      if (hasSelection) {
        const r = Math.max(2.2, radius + 0.4);
        for (const row of selected) ring(row, r, "rgba(255,255,255,0.9)", selected.length > 2000 ? 0.5 : 1);
      }
      if (emphasized) for (const row of emphasized) ring(row, radius + 2.5, "#0f172a", 1.6);
      if (hoverRow !== null) {
        ring(hoverRow, radius + 3.5, "#ffffff", 2.5);
        ctx.beginPath();
        ctx.arc(px[hoverRow]!, py[hoverRow]!, radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(15,23,42,0.6)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    },
    [positions, hasSelection, selected, emphasized, hoverRow, radius, colors],
  );

  const hitTest = useCallback(
    (x: number, y: number, geo: PlotGeometry) => {
      const { index } = positions(geo);
      return index ? nearestPoint(index, x, y, Math.max(8, radius * 2.5)) : null;
    },
    [positions, radius],
  );

  const emit = (hits: readonly number[], mods: ModifierState) => {
    if (!onSelectionChange) return;
    const mode = selectionModeFromModifiers(mods);
    onSelectionChange(combineSelection(selected, hits, mode), mode);
  };

  const overlay = guides?.length
    ? (geo: PlotGeometry) => {
        const [x0, x1] = geo.x.domain;
        const [y0, y1] = geo.y.domain;
        return guides.map((guide, index) => {
          const cls = TONE_STROKE[guide.tone ?? "neutral"];
          const paint = guide.color ? { stroke: guide.color, opacity: 1 } : undefined;
          switch (guide.kind) {
            case "line":
              return (
                <g key={index}>
                  <line className={cls} style={paint} x1={geo.x(x0)} y1={geo.y(guide.slope * x0 + guide.intercept)} x2={geo.x(x1)} y2={geo.y(guide.slope * x1 + guide.intercept)} />
                  {guide.label ? (
                    <text className="n4wb-guide-label" x={geo.left + geo.width - 4} y={geo.y(guide.slope * x1 + guide.intercept) + 12} textAnchor="end">
                      {guide.label}
                    </text>
                  ) : null}
                </g>
              );
            case "hline":
              return (
                <g key={index}>
                  <line className={cls} style={paint} x1={geo.left} x2={geo.left + geo.width} y1={geo.y(guide.y)} y2={geo.y(guide.y)} />
                  {guide.label ? (
                    <text className="n4wb-guide-label" x={geo.left + geo.width - 4} y={geo.y(guide.y) - 4} textAnchor="end">
                      {guide.label}
                    </text>
                  ) : null}
                </g>
              );
            case "vline":
              return (
                <g key={index}>
                  <line className={cls} style={paint} x1={geo.x(guide.x)} x2={geo.x(guide.x)} y1={geo.top} y2={geo.top + geo.height} />
                  {guide.label ? (
                    <text className="n4wb-guide-label" x={geo.x(guide.x) + 4} y={geo.top + 11}>
                      {guide.label}
                    </text>
                  ) : null}
                </g>
              );
            case "segment":
              return <line key={index} className={`${cls} is-segment`} style={paint} x1={geo.x(guide.x0)} y1={geo.y(guide.y0)} x2={geo.x(guide.x1)} y2={geo.y(guide.y1)} />;
            case "path": {
              const pts = guide.points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
              if (pts.length < 2) return null;
              const last = pts[pts.length - 1]!;
              return (
                <g key={index}>
                  <polyline className={`${cls} is-path`} style={paint} fill="none" points={pts.map(([x, y]) => `${geo.x(x)},${geo.y(y)}`).join(" ")} />
                  {guide.label ? (
                    <text className="n4wb-guide-label" x={geo.x(last[0]) - 4} y={geo.y(last[1]) - 6} textAnchor="end">
                      {guide.label}
                    </text>
                  ) : null}
                </g>
              );
            }
            case "rect":
              return (
                <rect
                  key={index}
                  className={`n4wb-guide-rect ${guide.tone ? `is-${guide.tone}` : ""}`}
                  style={guide.color ? { fill: guide.color, fillOpacity: 0.14, stroke: guide.color, strokeOpacity: 0.5 } : undefined}
                  x={Math.min(geo.x(guide.x0), geo.x(guide.x1))}
                  width={Math.abs(geo.x(guide.x1) - geo.x(guide.x0))}
                  y={Math.min(geo.y(guide.y0), geo.y(guide.y1))}
                  height={Math.abs(geo.y(guide.y0) - geo.y(guide.y1))}
                >
                  {guide.label ? <title>{guide.label}</title> : null}
                </rect>
              );
            case "band":
              return (
                <rect
                  key={index}
                  className={`n4wb-guide-band ${guide.tone ? `is-${guide.tone}` : ""}`}
                  x={geo.left}
                  width={geo.width}
                  y={Math.min(geo.y(guide.y0), geo.y(guide.y1))}
                  height={Math.abs(geo.y(guide.y0) - geo.y(guide.y1))}
                />
              );
            case "ellipse":
              return (
                <g key={index}>
                  <ellipse
                    className={cls}
                    cx={geo.x(guide.cx)}
                    cy={geo.y(guide.cy)}
                    rx={Math.abs(geo.x(guide.cx + guide.rx) - geo.x(guide.cx))}
                    ry={Math.abs(geo.y(guide.cy + guide.ry) - geo.y(guide.cy))}
                    fill="none"
                  />
                  {guide.label ? (
                    <text className="n4wb-guide-label" x={geo.x(guide.cx + guide.rx * 0.72) + 4} y={geo.y(guide.cy + guide.ry * 0.72) - 4}>
                      {guide.label}
                    </text>
                  ) : null}
                </g>
              );
          }
        });
      }
    : undefined;

  return (
    <CanvasPlot
      className={className}
      xDomain={domains.x}
      yDomain={domains.y}
      {...(xLabel ? { xLabel } : {})}
      {...(yLabel ? { yLabel } : {})}
      {...(formatX ? { formatX } : {})}
      {...(formatY ? { formatY } : {})}
      {...(xTickValues ? { xTickValues } : {})}
      {...(yTickValues ? { yTickValues } : {})}
      tools={tools}
      {...(padding ? { padding } : {})}
      drawBase={drawBase}
      drawHighlight={drawHighlight}
      hitTest={hitTest}
      hoverRow={hoverRow}
      {...(onHover ? { onHover } : {})}
      onClickRow={(row, mods) => {
        const next = clickSelection(selected, row, mods);
        if (next && onSelectionChange) onSelectionChange(next, selectionModeFromModifiers(mods));
      }}
      onSelectRect={(rect, geo, mods) => emit(pointsInRect(positions(geo).px, positions(geo).py, rect, (r) => Number.isFinite(positions(geo).px[r]!)), mods)}
      onSelectLasso={(polygon, geo, mods) => emit(pointsInPolygon(positions(geo).px, positions(geo).py, polygon), mods)}
      {...(renderTooltip ? { renderTooltip } : {})}
      {...(overlay ? { overlay } : {})}
      ariaLabel={ariaLabel}
      description={`${universe.length} points${hasSelection ? `, ${selected.length} selected` : ""}.`}
      {...(icons ? { icons } : {})}
      toolExtras={toolExtras}
    />
  );
}
