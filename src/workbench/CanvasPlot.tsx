import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";

import { ticks } from "../viz/geometry.js";
import { cx } from "./_cx.js";
import { formatValue } from "./format.js";
import { useCanvasDraw, useElementSize, useRafCallback } from "./hooks.js";
import { resolveIcons, type WorkbenchIcons } from "./icons.js";
import type { ModifierState } from "./selection.js";
import { normalizeRect, type PixelPoint, type PixelRect } from "./spatial.js";

export type PlotTool = "select" | "lasso" | "zoom" | "pan";

export type Domain = readonly [number, number];

/** Linear data → pixel mapping with its inverse. */
export interface LinearScale {
  (value: number): number;
  invert(pixel: number): number;
  domain: Domain;
  range: Domain;
}

export function linearScale(domain: Domain, range: Domain): LinearScale {
  const span = domain[1] - domain[0] || 1;
  const slope = (range[1] - range[0]) / span;
  const scale = ((value: number) => range[0] + (value - domain[0]) * slope) as LinearScale;
  scale.invert = (pixel: number) => domain[0] + (pixel - range[0]) / slope;
  scale.domain = domain;
  scale.range = range;
  return scale;
}

/** Inner plotting frame + scales handed to every draw / hit-test callback. */
export interface PlotGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  outerWidth: number;
  outerHeight: number;
  x: LinearScale;
  y: LinearScale;
}

export interface PlotPaddingSpec {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CanvasPlotProps {
  /** Full data domains; the viewport starts here and resets here. */
  xDomain: Domain;
  yDomain: Domain;
  xLabel?: string | undefined;
  yLabel?: string | undefined;
  formatX?: ((value: number) => string) | undefined;
  formatY?: ((value: number) => string) | undefined;
  /** Explicit tick positions (categorical lanes, class indices). */
  xTickValues?: readonly number[] | undefined;
  yTickValues?: readonly number[] | undefined;
  /** Draw the x axis right-to-left (wavenumbers). */
  invertX?: boolean | undefined;
  /** Which axes wheel / box zoom act on. */
  zoomAxes?: "x" | "xy" | undefined;
  tools?: readonly PlotTool[] | undefined;
  defaultTool?: PlotTool | undefined;
  /** Heavy layer: every row. Redrawn on data / size / viewport change only. */
  drawBase: (ctx: CanvasRenderingContext2D, geo: PlotGeometry) => void;
  /** Light layer: selection, hover, focus. Redrawn on interaction. */
  drawHighlight?: ((ctx: CanvasRenderingContext2D, geo: PlotGeometry) => void) | undefined;
  /** Row under the pointer (pixel coordinates relative to the plot box). */
  hitTest?: ((px: number, py: number, geo: PlotGeometry) => number | null) | undefined;
  onHover?: ((row: number | null) => void) | undefined;
  onClickRow?: ((row: number | null, modifiers: ModifierState) => void) | undefined;
  onSelectRect?: ((rect: PixelRect, geo: PlotGeometry, modifiers: ModifierState) => void) | undefined;
  onSelectLasso?: ((polygon: PixelPoint[], geo: PlotGeometry, modifiers: ModifierState) => void) | undefined;
  /** Rich tooltip for the hovered row. */
  renderTooltip?: ((row: number) => ReactNode) | undefined;
  hoverRow?: number | null | undefined;
  /** Extra SVG drawn above the data in pixel space (reference lines, ellipses, labels). */
  overlay?: ((geo: PlotGeometry) => ReactNode) | undefined;
  /** Crosshair readout when nothing is hovered (e.g. wavelength · value). */
  crosshair?: boolean | undefined;
  padding?: Partial<PlotPaddingSpec> | undefined;
  minHeight?: number | undefined;
  ariaLabel: string;
  description?: string | undefined;
  icons?: WorkbenchIcons | undefined;
  className?: string | undefined;
  /** Extra controls rendered in the floating tool strip. */
  toolExtras?: ReactNode | undefined;
}

const DEFAULT_PADDING: PlotPaddingSpec = { top: 12, right: 14, bottom: 36, left: 54 };
const TOOL_LABELS: Record<PlotTool, string> = {
  select: "Box select (drag) · click to pick",
  lasso: "Lasso select",
  zoom: "Zoom to box · wheel to zoom · double-click to reset",
  pan: "Pan",
};

function modifiersOf(event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): ModifierState {
  return { shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey };
}

type Gesture =
  | { kind: "rect"; tool: "select" | "zoom"; start: PixelPoint; current: PixelPoint; mods: ModifierState }
  | { kind: "lasso"; points: PixelPoint[]; mods: ModifierState }
  | { kind: "pan"; start: PixelPoint; x: Domain; y: Domain };

/**
 * Layered, responsive plotting surface shared by every workbench view:
 * an SVG grid underlay, a heavy canvas for all rows, a light canvas for
 * selection/hover, and an SVG overlay for crisp axes, annotations and
 * gestures (box / lasso selection, box + wheel zoom, pan, double-click reset).
 * Fills its parent; data colors are drawn by the caller, structure is themed
 * by CSS tokens.
 */
export function CanvasPlot({
  xDomain,
  yDomain,
  xLabel,
  yLabel,
  formatX = formatValue,
  formatY = formatValue,
  xTickValues,
  yTickValues,
  invertX = false,
  zoomAxes = "xy",
  tools = ["select", "lasso", "zoom", "pan"],
  defaultTool,
  drawBase,
  drawHighlight,
  hitTest,
  onHover,
  onClickRow,
  onSelectRect,
  onSelectLasso,
  renderTooltip,
  hoverRow = null,
  overlay,
  crosshair = false,
  padding,
  minHeight = 160,
  ariaLabel,
  description,
  icons,
  className,
  toolExtras,
}: CanvasPlotProps) {
  const descriptionId = useId();
  const icon = resolveIcons(icons);
  const [boxRef, size] = useElementSize<HTMLDivElement>({ width: 640, height: 320 });
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const highlightRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<PlotTool>(defaultTool ?? tools[0] ?? "select");
  const [viewport, setViewport] = useState<{ x: Domain; y: Domain } | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [pointer, setPointer] = useState<PixelPoint | null>(null);

  const pad = { ...DEFAULT_PADDING, ...padding };
  const outerWidth = Math.max(80, size.width);
  const outerHeight = Math.max(minHeight, size.height);
  const innerWidth = Math.max(10, outerWidth - pad.left - pad.right);
  const innerHeight = Math.max(10, outerHeight - pad.top - pad.bottom);

  const domainKey = `${xDomain[0]}|${xDomain[1]}|${yDomain[0]}|${yDomain[1]}`;
  const [viewportKey, setViewportKey] = useState(domainKey);
  if (viewportKey !== domainKey) {
    // Data domain changed (new step, new dataset): drop a stale zoom.
    setViewportKey(domainKey);
    setViewport(null);
  }
  const vx = viewport?.x ?? xDomain;
  const vy = viewport?.y ?? yDomain;

  const geo: PlotGeometry = useMemo(
    () => ({
      left: pad.left,
      top: pad.top,
      width: innerWidth,
      height: innerHeight,
      outerWidth,
      outerHeight,
      x: linearScale(vx, invertX ? [pad.left + innerWidth, pad.left] : [pad.left, pad.left + innerWidth]),
      y: linearScale(vy, [pad.top + innerHeight, pad.top]),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pad.left, pad.top, innerWidth, innerHeight, outerWidth, outerHeight, vx[0], vx[1], vy[0], vy[1], invertX],
  );

  const drawBaseClipped = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(geo.left, geo.top, geo.width, geo.height);
      ctx.clip();
      drawBase(ctx, geo);
      ctx.restore();
    },
    [drawBase, geo],
  );
  const drawHighlightClipped = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!drawHighlight) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(geo.left, geo.top, geo.width, geo.height);
      ctx.clip();
      drawHighlight(ctx, geo);
      ctx.restore();
    },
    [drawHighlight, geo],
  );
  useCanvasDraw(baseRef, outerWidth, outerHeight, drawBaseClipped);
  useCanvasDraw(highlightRef, outerWidth, outerHeight, drawHighlightClipped);

  const local = (event: { clientX: number; clientY: number; currentTarget: Element }): PixelPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const inside = (p: PixelPoint) => p.x >= geo.left && p.x <= geo.left + geo.width && p.y >= geo.top && p.y <= geo.top + geo.height;

  const hover = useRafCallback((p: PixelPoint | null) => {
    setPointer(p);
    if (!onHover) return;
    if (!p || !hitTest || !inside(p)) {
      onHover(null);
      return;
    }
    onHover(hitTest(p.x, p.y, geo));
  });

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const p = local(event);
    if (!inside(p)) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; the gesture still works.
    }
    const mods = modifiersOf(event);
    const active: PlotTool = event.button === 1 ? "pan" : tool;
    if (active === "pan") setGesture({ kind: "pan", start: p, x: vx, y: vy });
    else if (active === "lasso") setGesture({ kind: "lasso", points: [p], mods });
    else setGesture({ kind: "rect", tool: active, start: p, current: p, mods });
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const p = local(event);
    if (!gesture) {
      hover(p);
      return;
    }
    if (gesture.kind === "rect") setGesture({ ...gesture, current: p });
    else if (gesture.kind === "lasso") {
      const last = gesture.points[gesture.points.length - 1]!;
      if (Math.hypot(last.x - p.x, last.y - p.y) > 3) setGesture({ ...gesture, points: [...gesture.points, p] });
    } else {
      const dx = geo.x.invert(gesture.start.x) - geo.x.invert(p.x);
      const dy = zoomAxes === "xy" ? geo.y.invert(gesture.start.y) - geo.y.invert(p.y) : 0;
      setViewport({ x: [gesture.x[0] + dx, gesture.x[1] + dx], y: [gesture.y[0] + dy, gesture.y[1] + dy] });
    }
  };

  const finish = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!gesture) return;
    const p = local(event);
    if (gesture.kind === "rect") {
      const rect = normalizeRect({ x0: gesture.start.x, y0: gesture.start.y, x1: p.x, y1: p.y });
      const tiny = rect.x1 - rect.x0 < 4 && rect.y1 - rect.y0 < 4;
      if (tiny) {
        onClickRow?.(hitTest ? hitTest(p.x, p.y, geo) : null, gesture.mods);
      } else if (gesture.tool === "select") {
        onSelectRect?.(rect, geo, gesture.mods);
      } else {
        const x0 = geo.x.invert(rect.x0);
        const x1 = geo.x.invert(rect.x1);
        const nextX: Domain = [Math.min(x0, x1), Math.max(x0, x1)];
        const nextY: Domain = zoomAxes === "xy" ? [geo.y.invert(rect.y1), geo.y.invert(rect.y0)] : vy;
        setViewport({ x: nextX, y: nextY });
      }
    } else if (gesture.kind === "lasso") {
      if (gesture.points.length >= 3) onSelectLasso?.(gesture.points, geo, gesture.mods);
      else onClickRow?.(hitTest ? hitTest(p.x, p.y, geo) : null, gesture.mods);
    }
    setGesture(null);
  };

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    if (!event.ctrlKey && !event.metaKey && !event.altKey && tool !== "zoom") return;
    const p = local(event);
    if (!inside(p)) return;
    const factor = Math.exp(Math.sign(event.deltaY) * 0.18);
    const cxv = geo.x.invert(p.x);
    const cyv = geo.y.invert(p.y);
    const nextX: Domain = [cxv + (vx[0] - cxv) * factor, cxv + (vx[1] - cxv) * factor];
    const nextY: Domain = zoomAxes === "xy" ? [cyv + (vy[0] - cyv) * factor, cyv + (vy[1] - cyv) * factor] : vy;
    setViewport({ x: nextX, y: nextY });
  };

  const inView = (lo: number, hi: number) => (t: number) => t >= Math.min(lo, hi) && t <= Math.max(lo, hi);
  const xTicks = xTickValues ? xTickValues.filter(inView(vx[0], vx[1])) : ticks({ min: Math.min(vx[0], vx[1]), max: Math.max(vx[0], vx[1]) }, Math.max(2, Math.floor(innerWidth / 90)));
  const yTicks = yTickValues ? yTickValues.filter(inView(vy[0], vy[1])) : ticks({ min: Math.min(vy[0], vy[1]), max: Math.max(vy[0], vy[1]) }, Math.max(2, Math.floor(innerHeight / 46)));
  const bottom = geo.top + geo.height;
  const showTooltip = hoverRow !== null && hoverRow !== undefined && renderTooltip && pointer && !gesture;
  const tooltipLeft = pointer && pointer.x > outerWidth * 0.6;

  return (
    <div className={cx("n4wb-plot", className)} ref={boxRef} style={{ minHeight }}>
      <svg className="n4wb-plot-layer n4wb-plot-grid" width={outerWidth} height={outerHeight} aria-hidden="true">
        {yTicks.map((t) => (
          <line key={`gy${t}`} x1={geo.left} x2={geo.left + geo.width} y1={geo.y(t)} y2={geo.y(t)} />
        ))}
        {xTicks.map((t) => (
          <line key={`gx${t}`} x1={geo.x(t)} x2={geo.x(t)} y1={geo.top} y2={bottom} />
        ))}
      </svg>
      <canvas ref={baseRef} className="n4wb-plot-layer" style={{ width: outerWidth, height: outerHeight }} aria-hidden="true" />
      <canvas ref={highlightRef} className="n4wb-plot-layer" style={{ width: outerWidth, height: outerHeight }} aria-hidden="true" />
      <svg
        className={cx("n4wb-plot-layer", "n4wb-plot-overlay", `n4wb-tool-${tool}`)}
        width={outerWidth}
        height={outerHeight}
        role="img"
        aria-label={ariaLabel}
        aria-describedby={description ? descriptionId : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={() => setGesture(null)}
        onPointerLeave={() => {
          if (!gesture) hover(null);
        }}
        onWheel={onWheel}
        onDoubleClick={() => setViewport(null)}
      >
        {description ? <desc id={descriptionId}>{description}</desc> : null}
        {overlay ? <g className="n4wb-plot-annotations">{overlay(geo)}</g> : null}
        <line className="n4wb-axis" x1={geo.left} x2={geo.left + geo.width} y1={bottom} y2={bottom} />
        <line className="n4wb-axis" x1={geo.left} x2={geo.left} y1={geo.top} y2={bottom} />
        {xTicks.map((t) => (
          <text key={`tx${t}`} className="n4wb-tick" x={geo.x(t)} y={bottom + 15} textAnchor="middle">
            {formatX(t)}
          </text>
        ))}
        {yTicks.map((t) => (
          <text key={`ty${t}`} className="n4wb-tick" x={geo.left - 6} y={geo.y(t) + 3} textAnchor="end">
            {formatY(t)}
          </text>
        ))}
        {xLabel ? (
          <text className="n4wb-axis-label" x={geo.left + geo.width / 2} y={outerHeight - 4} textAnchor="middle">
            {xLabel}
          </text>
        ) : null}
        {yLabel ? (
          <text className="n4wb-axis-label" transform={`translate(12 ${geo.top + geo.height / 2}) rotate(-90)`} textAnchor="middle">
            {yLabel}
          </text>
        ) : null}
        {crosshair && pointer && !gesture && inside(pointer) ? (
          <g className="n4wb-crosshair">
            <line x1={pointer.x} x2={pointer.x} y1={geo.top} y2={bottom} />
            <text x={pointer.x + 6} y={geo.top + 12}>
              {formatX(geo.x.invert(pointer.x))} · {formatY(geo.y.invert(pointer.y))}
            </text>
          </g>
        ) : null}
        {gesture?.kind === "rect" ? (
          <rect
            className={gesture.tool === "zoom" ? "n4wb-brush n4wb-brush-zoom" : "n4wb-brush"}
            {...(() => {
              const r = normalizeRect({ x0: gesture.start.x, y0: gesture.start.y, x1: gesture.current.x, y1: gesture.current.y });
              return zoomAxes === "x" && gesture.tool === "zoom"
                ? { x: r.x0, y: geo.top, width: r.x1 - r.x0, height: geo.height }
                : { x: r.x0, y: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0 };
            })()}
          />
        ) : null}
        {gesture?.kind === "lasso" ? (
          <polygon className="n4wb-brush" points={gesture.points.map((p) => `${p.x},${p.y}`).join(" ")} />
        ) : null}
      </svg>

      <div className="n4wb-plot-tools" role="toolbar" aria-label="Plot tools">
        {tools.map((t) => (
          <button
            key={t}
            type="button"
            className={cx("n4wb-icon-btn", tool === t && "is-active")}
            aria-pressed={tool === t}
            title={TOOL_LABELS[t]}
            aria-label={TOOL_LABELS[t]}
            onClick={() => setTool(t)}
          >
            {icon[t]}
          </button>
        ))}
        {viewport ? (
          <button type="button" className="n4wb-icon-btn" title="Reset zoom" aria-label="Reset zoom" onClick={() => setViewport(null)}>
            {icon.reset}
          </button>
        ) : null}
        {toolExtras}
      </div>

      {showTooltip ? (
        <div
          className="n4wb-tooltip"
          role="status"
          style={{
            left: tooltipLeft ? undefined : pointer.x + 14,
            right: tooltipLeft ? outerWidth - pointer.x + 14 : undefined,
            top: Math.min(pointer.y + 12, outerHeight - 40),
          }}
        >
          {renderTooltip(hoverRow)}
        </div>
      ) : null}
    </div>
  );
}
