import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { cx } from "./_cx.js";
import { formatValue } from "./format.js";
import { useCanvasDraw, useElementSize, useRafCallback } from "./hooks.js";
import { resolveIcons, type WorkbenchIcons } from "./icons.js";
import {
  CAMERA_PRESETS_3D,
  clampPitch,
  DEFAULT_CAMERA_3D,
  niceTicks,
  normalizeAxes,
  projectPoint,
  projectRows,
  rotate,
  type Camera3D,
  type CameraPreset3D,
} from "./projection3d.js";
import { clickSelection, combineSelection, selectionModeFromModifiers, type ModifierState, type Selection, type SelectionMode } from "./selection.js";
import { buildGridIndex, nearestPoint, normalizeRect, pointsInPolygon, pointsInRect, type PixelPoint } from "./spatial.js";

export type Scatter3DTool = "rotate" | "select" | "lasso";

export interface Scatter3DViewProps {
  /** One coordinate per row on each axis; rows with a NaN are not drawn. */
  xs: ArrayLike<number>;
  ys: ArrayLike<number>;
  zs: ArrayLike<number>;
  rows?: readonly number[] | undefined;
  colors: readonly string[];
  groups: Int32Array;
  palette: readonly string[];
  selected: Selection;
  hoverRow?: number | null | undefined;
  /** Axis titles (x, y, z). */
  labels?: readonly [string, string, string] | undefined;
  pointSize?: number | undefined;
  /** Share one scale across axes so relative spreads stay true (score plots). */
  isotropic?: boolean | undefined;
  /** Start spinning slowly around the vertical axis. */
  autoRotate?: boolean | undefined;
  onHover?: ((row: number | null) => void) | undefined;
  onSelectionChange?: ((next: Selection, mode: SelectionMode) => void) | undefined;
  renderTooltip?: ((row: number) => ReactNode) | undefined;
  toolExtras?: ReactNode | undefined;
  icons?: WorkbenchIcons | undefined;
  ariaLabel: string;
  className?: string | undefined;
}

type Gesture =
  | { kind: "orbit"; start: PixelPoint; camera: Camera3D; moved: boolean; mods: ModifierState }
  | { kind: "pan"; start: PixelPoint; camera: Camera3D }
  | { kind: "rect"; start: PixelPoint; current: PixelPoint; mods: ModifierState }
  | { kind: "lasso"; points: PixelPoint[]; mods: ModifierState };

const TOOL_LABELS: Record<Scatter3DTool, string> = {
  rotate: "Rotate (drag) · Shift-drag or middle button pans · wheel zooms · click picks",
  select: "Box select (drag) · click to pick",
  lasso: "Lasso select",
};

const PRESET_LABELS: Record<CameraPreset3D, string> = { iso: "3D", xy: "X·Y", xz: "X·Z", yz: "Z·Y" };

const DEPTH_LAYERS = 10;

function modifiersOf(event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): ModifierState {
  return { shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey };
}

/** The 8 cube corners indexed by bits (x = bit0, y = bit1, z = bit2). */
const CORNERS: ReadonlyArray<readonly [number, number, number]> = Array.from({ length: 8 }, (_, i) => [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1] as const);
/** The 12 cube edges as corner pairs, grouped by the axis they run along. */
const EDGES_BY_AXIS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [0, 1, 2].map((axis) => {
  const bit = 1 << axis;
  const out: Array<readonly [number, number]> = [];
  for (let i = 0; i < 8; i += 1) if (!(i & bit)) out.push([i, i | bit]);
  return out;
});

/**
 * Interactive 3D scatter (score spaces, UMAP embeddings) drawn on Canvas2D
 * with no WebGL dependency: an orbit camera with mild perspective, points
 * painted back to front with depth shading, back-face grids with ticks, axis
 * presets (X·Y / X·Z / Z·Y), auto-rotation, and the workbench selection model
 * (click, box, lasso with Shift / Alt / Ctrl) in screen space.
 */
export function Scatter3DView({
  xs,
  ys,
  zs,
  rows,
  colors,
  groups,
  palette,
  selected,
  hoverRow = null,
  labels = ["X", "Y", "Z"],
  pointSize,
  isotropic = false,
  autoRotate: autoRotateProp = false,
  onHover,
  onSelectionChange,
  renderTooltip,
  toolExtras,
  icons,
  ariaLabel,
  className,
}: Scatter3DViewProps) {
  const descriptionId = useId();
  const icon = resolveIcons(icons);
  const [boxRef, size] = useElementSize<HTMLDivElement>({ width: 640, height: 360 });
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const highlightRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const [camera, setCamera] = useState<Camera3D>(DEFAULT_CAMERA_3D);
  const [tool, setTool] = useState<Scatter3DTool>("rotate");
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [pointer, setPointer] = useState<PixelPoint | null>(null);
  const [spinning, setSpinning] = useState(autoRotateProp);

  const width = Math.max(80, size.width);
  const height = Math.max(160, size.height);
  const viewport = useMemo(() => ({ width, height }), [width, height]);
  const universe = useMemo(() => rows ?? Array.from({ length: xs.length }, (_, i) => i), [rows, xs.length]);
  const axes = useMemo(() => [xs, ys, zs] as const, [xs, ys, zs]);
  const norm = useMemo(() => normalizeAxes(axes, universe, isotropic), [axes, universe, isotropic]);
  const projected = useMemo(() => projectRows(axes, universe, norm, camera, viewport), [axes, universe, norm, camera, viewport]);
  const index = useMemo(() => buildGridIndex(projected.sx, projected.sy, width, height, 20), [projected, width, height]);
  const hasSelection = selected.length > 0;
  const radius = pointSize ?? (universe.length > 20000 ? 1.5 : universe.length > 4000 ? 2.1 : universe.length > 600 ? 3 : 3.8);

  // Slow spin around the vertical axis; paused while the user drags.
  useEffect(() => {
    if (!spinning || gesture || typeof requestAnimationFrame === "undefined") return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      setCamera((c) => ({ ...c, yaw: c.yaw + dt * 0.00035 }));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [spinning, gesture]);

  // Native non-passive wheel listener so zooming never scrolls the page.
  useEffect(() => {
    const element = overlayRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-Math.sign(event.deltaY) * 0.12);
      setCamera((c) => ({ ...c, zoom: Math.max(0.3, Math.min(10, c.zoom * factor)) }));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  // Cube frame: back faces get a tick grid, the axis titles follow the outer edges.
  const frame = useMemo(() => {
    const corners = CORNERS.map(([x, y, z]) => projectPoint(camera, viewport, x, y, z));
    const center = projectPoint(camera, viewport, 0, 0, 0);
    // A face is "back" when its outward normal points away from the viewer.
    const backSign = [0, 1, 2].map((axis) => {
      const n: [number, number, number] = [0, 0, 0];
      n[axis] = 1;
      return rotate(camera, n[0], n[1], n[2])[2] > 0 ? -1 : 1;
    });
    const grids: Array<{ a: PixelPoint; b: PixelPoint }> = [];
    const ticksByAxis = [0, 1, 2].map((axis) => {
      const lo = norm.center[axis]! - norm.half[axis]!;
      const hi = norm.center[axis]! + norm.half[axis]!;
      return niceTicks(lo, hi, 4).map((value) => ({ value, u: (value - norm.center[axis]!) / norm.half[axis]! }));
    });
    for (let face = 0; face < 3; face += 1) {
      const [p, q] = [0, 1, 2].filter((a) => a !== face) as [number, number];
      for (const [along, across] of [
        [p, q],
        [q, p],
      ] as const) {
        for (const tick of ticksByAxis[along]!) {
          const a: [number, number, number] = [0, 0, 0];
          const b: [number, number, number] = [0, 0, 0];
          a[face] = backSign[face]!;
          b[face] = backSign[face]!;
          a[along] = tick.u;
          b[along] = tick.u;
          a[across] = -1;
          b[across] = 1;
          const pa = projectPoint(camera, viewport, a[0], a[1], a[2]);
          const pb = projectPoint(camera, viewport, b[0], b[1], b[2]);
          grids.push({ a: { x: pa.sx, y: pa.sy }, b: { x: pb.sx, y: pb.sy } });
        }
      }
    }
    // Label each axis on the parallel edge that is lowest (x, z) or leftmost (y) on screen.
    const axisLabels = [0, 1, 2].map((axis) => {
      const edges = EDGES_BY_AXIS[axis]!;
      const score = (edge: readonly [number, number]) => {
        const m = { x: (corners[edge[0]]!.sx + corners[edge[1]]!.sx) / 2, y: (corners[edge[0]]!.sy + corners[edge[1]]!.sy) / 2 };
        return axis === 1 ? -m.x : m.y;
      };
      const edge = edges.reduce((best, e) => (score(e) > score(best) ? e : best), edges[0]!);
      const from = CORNERS[edge[0]]!;
      const outward = (pt: { sx: number; sy: number }) => {
        const dx = pt.sx - center.sx;
        const dy = pt.sy - center.sy;
        const len = Math.hypot(dx, dy) || 1;
        return { x: dx / len, y: dy / len };
      };
      const ticks = ticksByAxis[axis]!.map((tick) => {
        const point: [number, number, number] = [from[0], from[1], from[2]];
        point[axis] = tick.u;
        const p = projectPoint(camera, viewport, point[0], point[1], point[2]);
        const o = outward(p);
        return { x: p.sx + o.x * 14, y: p.sy + o.y * 14, label: formatValue(tick.value) };
      });
      const mid: [number, number, number] = [from[0], from[1], from[2]];
      mid[axis] = 0;
      const pm = projectPoint(camera, viewport, mid[0], mid[1], mid[2]);
      const o = outward(pm);
      return { ticks, title: { x: pm.sx + o.x * 34, y: pm.sy + o.y * 34 } };
    });
    const edges = EDGES_BY_AXIS.flat().map(([i, j]) => {
      const back = [0, 1, 2].some((axis) => CORNERS[i]![axis] === backSign[axis] && CORNERS[j]![axis] === backSign[axis]);
      return { a: { x: corners[i]!.sx, y: corners[i]!.sy }, b: { x: corners[j]!.sx, y: corners[j]!.sy }, back };
    });
    return { grids, edges, axisLabels };
  }, [camera, viewport, norm]);

  const drawBase = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const { sx, sy, depth, scale, order, depthRange } = projected;
      const span = depthRange[1] - depthRange[0] || 1;
      const baseAlpha = hasSelection ? 0.2 : universe.length > 5000 ? 0.6 : 0.88;
      const outline = universe.length <= 3000;
      // Points are batched per (depth layer, color) and layers painted back to front.
      const layers: Array<Map<number, number[]>> = Array.from({ length: DEPTH_LAYERS }, () => new Map());
      for (const row of order) {
        const t = (depth[row]! - depthRange[0]) / span;
        // Depths are stored as float32, so clamp both ends of the layer index.
        const layer = layers[Math.max(0, Math.min(DEPTH_LAYERS - 1, Math.floor(t * DEPTH_LAYERS)))]!;
        const group = groups[row] ?? 0;
        const bucket = layer.get(group);
        if (bucket) bucket.push(row);
        else layer.set(group, [row]);
      }
      layers.forEach((layer, l) => {
        const t = (l + 0.5) / DEPTH_LAYERS;
        ctx.globalAlpha = baseAlpha * (0.42 + 0.58 * t);
        for (const [group, groupRows] of layer) {
          ctx.fillStyle = palette[group] ?? "#0d9488";
          ctx.beginPath();
          for (const row of groupRows) {
            const r = radius * scale[row]!;
            ctx.moveTo(sx[row]! + r, sy[row]!);
            ctx.arc(sx[row]!, sy[row]!, r, 0, Math.PI * 2);
          }
          ctx.fill();
          if (outline) {
            ctx.strokeStyle = "rgba(15,23,42,0.22)";
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      });
      ctx.globalAlpha = 1;
    },
    [projected, hasSelection, universe.length, groups, palette, radius],
  );

  const drawHighlight = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const { sx, sy, depth, scale } = projected;
      const ring = (row: number, r: number, stroke: string, lineWidth: number) => {
        if (!Number.isFinite(sx[row]!)) return;
        ctx.beginPath();
        ctx.arc(sx[row]!, sy[row]!, r, 0, Math.PI * 2);
        ctx.fillStyle = colors[row] ?? "#0d9488";
        ctx.fill();
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      };
      if (hasSelection) {
        const ordered = selected.filter((row) => Number.isFinite(depth[row]!)).sort((a, b) => depth[a]! - depth[b]!);
        for (const row of ordered) ring(row, Math.max(2.4, radius * scale[row]! + 0.5), "rgba(255,255,255,0.92)", ordered.length > 2000 ? 0.5 : 1.1);
      }
      if (hoverRow !== null && Number.isFinite(sx[hoverRow]!)) {
        const r = radius * scale[hoverRow]!;
        ring(hoverRow, r + 3.5, "#ffffff", 2.5);
        ctx.beginPath();
        ctx.arc(sx[hoverRow]!, sy[hoverRow]!, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(15,23,42,0.6)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    },
    [projected, hasSelection, selected, hoverRow, radius, colors],
  );

  useCanvasDraw(baseRef, width, height, drawBase);
  useCanvasDraw(highlightRef, width, height, drawHighlight);

  const hitTest = useCallback((p: PixelPoint) => nearestPoint(index, p.x, p.y, Math.max(8, radius * 2.5)), [index, radius]);
  const hover = useRafCallback((p: PixelPoint | null) => {
    setPointer(p);
    onHover?.(p ? hitTest(p) : null);
  });

  const local = (event: { clientX: number; clientY: number; currentTarget: Element }): PixelPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const emit = (hits: readonly number[], mods: ModifierState) => {
    if (!onSelectionChange) return;
    const mode = selectionModeFromModifiers(mods);
    onSelectionChange(combineSelection(selected, hits, mode), mode);
  };
  const pick = (p: PixelPoint, mods: ModifierState) => {
    const next = clickSelection(selected, hitTest(p), mods);
    if (next && onSelectionChange) onSelectionChange(next, selectionModeFromModifiers(mods));
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const p = local(event);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers cannot be captured; the gesture still works.
    }
    const mods = modifiersOf(event);
    if (event.button === 1 || (tool === "rotate" && event.shiftKey)) setGesture({ kind: "pan", start: p, camera });
    else if (tool === "rotate") setGesture({ kind: "orbit", start: p, camera, moved: false, mods });
    else if (tool === "lasso") setGesture({ kind: "lasso", points: [p], mods });
    else setGesture({ kind: "rect", start: p, current: p, mods });
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const p = local(event);
    if (!gesture) {
      hover(p);
      return;
    }
    if (gesture.kind === "orbit") {
      const dx = p.x - gesture.start.x;
      const dy = p.y - gesture.start.y;
      if (!gesture.moved && Math.hypot(dx, dy) < 3) return;
      if (!gesture.moved) setGesture({ ...gesture, moved: true });
      setCamera({ ...gesture.camera, yaw: gesture.camera.yaw + dx * 0.009, pitch: clampPitch(gesture.camera.pitch + dy * 0.009) });
    } else if (gesture.kind === "pan") {
      setCamera({ ...gesture.camera, panX: gesture.camera.panX + p.x - gesture.start.x, panY: gesture.camera.panY + p.y - gesture.start.y });
    } else if (gesture.kind === "rect") {
      setGesture({ ...gesture, current: p });
    } else {
      const last = gesture.points[gesture.points.length - 1]!;
      if (Math.hypot(last.x - p.x, last.y - p.y) > 3) setGesture({ ...gesture, points: [...gesture.points, p] });
    }
  };

  const finish = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!gesture) return;
    const p = local(event);
    const accept = (row: number) => Number.isFinite(projected.sx[row]!);
    if (gesture.kind === "orbit" && !gesture.moved) pick(p, gesture.mods);
    else if (gesture.kind === "rect") {
      const rect = normalizeRect({ x0: gesture.start.x, y0: gesture.start.y, x1: p.x, y1: p.y });
      if (rect.x1 - rect.x0 < 4 && rect.y1 - rect.y0 < 4) pick(p, gesture.mods);
      else emit(pointsInRect(projected.sx, projected.sy, rect, accept), gesture.mods);
    } else if (gesture.kind === "lasso") {
      if (gesture.points.length >= 3) emit(pointsInPolygon(projected.sx, projected.sy, gesture.points, accept), gesture.mods);
      else pick(p, gesture.mods);
    }
    setGesture(null);
  };

  const applyPreset = (preset: CameraPreset3D) => {
    setSpinning(false);
    setCamera((c) => ({ ...c, ...CAMERA_PRESETS_3D[preset] }));
  };

  const showTooltip = hoverRow !== null && renderTooltip && pointer && !gesture;
  const tooltipLeft = pointer && pointer.x > width * 0.6;
  const cursorClass = gesture?.kind === "orbit" || gesture?.kind === "pan" ? "is-grabbing" : tool === "rotate" ? "is-grab" : undefined;

  return (
    <div className={cx("n4wb-plot", "n4wb-plot3d", className)} ref={boxRef}>
      <svg className="n4wb-plot-layer n4wb-plot3d-frame" width={width} height={height} aria-hidden="true">
        {frame.grids.map((g, i) => (
          <line key={`g${i}`} className="n4wb-plot3d-grid" x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} />
        ))}
        {frame.edges.map((e, i) =>
          e.back ? <line key={`e${i}`} className="n4wb-plot3d-edge" x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} /> : null,
        )}
      </svg>
      <canvas ref={baseRef} className="n4wb-plot-layer" style={{ width, height }} aria-hidden="true" />
      <canvas ref={highlightRef} className="n4wb-plot-layer" style={{ width, height }} aria-hidden="true" />
      <svg
        ref={overlayRef}
        className={cx("n4wb-plot-layer", "n4wb-plot-overlay", "n4wb-plot3d-overlay", cursorClass)}
        width={width}
        height={height}
        role="img"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-describedby={descriptionId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={() => setGesture(null)}
        onPointerLeave={() => {
          if (!gesture) hover(null);
        }}
        onDoubleClick={() => setCamera(DEFAULT_CAMERA_3D)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.26 : 0.087;
          if (event.key === "ArrowLeft") setCamera((c) => ({ ...c, yaw: c.yaw - step }));
          else if (event.key === "ArrowRight") setCamera((c) => ({ ...c, yaw: c.yaw + step }));
          else if (event.key === "ArrowUp") setCamera((c) => ({ ...c, pitch: clampPitch(c.pitch - step) }));
          else if (event.key === "ArrowDown") setCamera((c) => ({ ...c, pitch: clampPitch(c.pitch + step) }));
          else return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <desc id={descriptionId}>
          {`${universe.length} points in 3D${hasSelection ? `, ${selected.length} selected` : ""}. Drag to rotate, arrow keys rotate, wheel zooms, double-click resets.`}
        </desc>
        {frame.edges.map((e, i) =>
          e.back ? null : <line key={`f${i}`} className="n4wb-plot3d-edge is-front" x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} />,
        )}
        {frame.axisLabels.map((axis, a) => (
          <g key={a}>
            {axis.ticks.map((t, i) => (
              <text key={i} className="n4wb-tick" x={t.x} y={t.y + 3} textAnchor="middle">
                {t.label}
              </text>
            ))}
            <text className="n4wb-axis-label n4wb-plot3d-title" x={axis.title.x} y={axis.title.y + 4} textAnchor="middle">
              {labels[a]}
            </text>
          </g>
        ))}
        {gesture?.kind === "rect" ? (
          <rect
            className="n4wb-brush"
            {...(() => {
              const r = normalizeRect({ x0: gesture.start.x, y0: gesture.start.y, x1: gesture.current.x, y1: gesture.current.y });
              return { x: r.x0, y: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0 };
            })()}
          />
        ) : null}
        {gesture?.kind === "lasso" ? <polygon className="n4wb-brush" points={gesture.points.map((p) => `${p.x},${p.y}`).join(" ")} /> : null}
      </svg>

      <div className="n4wb-plot-tools" role="toolbar" aria-label="3D plot tools">
        {(["rotate", "select", "lasso"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={cx("n4wb-icon-btn", tool === t && "is-active")}
            aria-pressed={tool === t}
            title={TOOL_LABELS[t]}
            aria-label={TOOL_LABELS[t]}
            onClick={() => setTool(t)}
          >
            {t === "rotate" ? icon.rotate : icon[t]}
          </button>
        ))}
        <span className="n4wb-plot-tools-sep" aria-hidden="true" />
        {(Object.keys(PRESET_LABELS) as CameraPreset3D[]).map((preset) => (
          <button key={preset} type="button" className="n4wb-icon-btn n4wb-plot3d-preset" title={`View ${PRESET_LABELS[preset]}`} onClick={() => applyPreset(preset)}>
            {PRESET_LABELS[preset]}
          </button>
        ))}
        <span className="n4wb-plot-tools-sep" aria-hidden="true" />
        <button
          type="button"
          className={cx("n4wb-icon-btn", spinning && "is-active")}
          aria-pressed={spinning}
          title={spinning ? "Stop rotation" : "Auto-rotate"}
          aria-label={spinning ? "Stop rotation" : "Auto-rotate"}
          onClick={() => setSpinning((v) => !v)}
        >
          {spinning ? icon.pause : icon.play}
        </button>
        <button type="button" className="n4wb-icon-btn" title="Reset view (double-click)" aria-label="Reset view" onClick={() => setCamera(DEFAULT_CAMERA_3D)}>
          {icon.reset}
        </button>
        {toolExtras}
      </div>

      {showTooltip ? (
        <div
          className="n4wb-tooltip"
          role="status"
          style={{
            left: tooltipLeft ? undefined : pointer.x + 14,
            right: tooltipLeft ? width - pointer.x + 14 : undefined,
            top: Math.min(pointer.y + 12, height - 40),
          }}
        >
          {renderTooltip(hoverRow)}
        </div>
      ) : null}
    </div>
  );
}
