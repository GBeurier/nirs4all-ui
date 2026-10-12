import { useCallback, useMemo, type ReactNode } from "react";

import { CanvasPlot, type Domain, type PlotGeometry } from "./CanvasPlot.js";
import { formatValue } from "./format.js";
import type { WorkbenchIcons } from "./icons.js";
import { normalizeRect } from "./spatial.js";

/** One curve over a shared axis (loadings, r(λ), mean spectra, VIP…). */
export interface ProfileSeries {
  id: string;
  label: string;
  values: ArrayLike<number>;
  /** Own axis when it differs from the shared `x` (e.g. before a crop). */
  x?: ArrayLike<number>;
  color: string;
  width?: number;
  dashed?: boolean;
  /** Optional envelope drawn behind the curve. */
  band?: { lower: ArrayLike<number>; upper: ArrayLike<number> };
  /** Draw as filled area to zero (bars for spectra-like importance). */
  area?: boolean;
}

export interface ProfileViewProps {
  x: ArrayLike<number>;
  series: readonly ProfileSeries[];
  xLabel?: string | undefined;
  yLabel?: string | undefined;
  yDomain?: Domain | undefined;
  zeroLine?: boolean | undefined;
  invertX?: boolean | undefined;
  /** Highlighted x windows. */
  regions?: ReadonlyArray<{ from: number; to: number; label?: string }> | undefined;
  /** Range chosen with the select tool (drag along the axis). */
  onRangeSelect?: ((range: Domain) => void) | undefined;
  toolExtras?: ReactNode | undefined;
  icons?: WorkbenchIcons | undefined;
  ariaLabel: string;
  className?: string | undefined;
}

function rgbaFrom(color: string, alpha: number): string {
  if (!color.startsWith("#")) return color;
  const clean = color.slice(1);
  const full = clean.length === 3 ? clean.replace(/(.)/g, "$1$1") : clean;
  const n = Number.parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Few-curve line chart over a shared axis with legend, crosshair readout,
 * zero baseline, highlighted regions and an optional range pick. Used for PCA
 * loadings, wavelength–target correlation, per-group mean spectra and other
 * per-wavelength diagnostics.
 */
export function ProfileView({
  x,
  series,
  xLabel,
  yLabel,
  yDomain: yDomainProp,
  zeroLine = true,
  invertX = false,
  regions,
  onRangeSelect,
  toolExtras,
  icons,
  ariaLabel,
  className,
}: ProfileViewProps) {
  const xDomain: Domain = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const axis of [x, ...series.map((s) => s.x).filter((a): a is ArrayLike<number> => Boolean(a))]) {
      for (let i = 0; i < axis.length; i += 1) {
        lo = Math.min(lo, axis[i]!);
        hi = Math.max(hi, axis[i]!);
      }
    }
    return Number.isFinite(lo) && lo < hi ? [lo, hi] : [0, 1];
  }, [x, series]);

  const yDomain: Domain = useMemo(() => {
    if (yDomainProp) return yDomainProp;
    let lo = zeroLine ? 0 : Infinity;
    let hi = zeroLine ? 0 : -Infinity;
    for (const s of series) {
      const scan = (arr: ArrayLike<number>) => {
        for (let i = 0; i < arr.length; i += 1) {
          const v = arr[i]!;
          if (!Number.isFinite(v)) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      };
      scan(s.values);
      if (s.band) {
        scan(s.band.lower);
        scan(s.band.upper);
      }
    }
    if (!Number.isFinite(lo) || lo === hi) return [lo === Infinity ? 0 : lo - 1, hi === -Infinity ? 1 : hi + 1];
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
  }, [yDomainProp, series, zeroLine]);

  const sharedX = x;
  const drawBase = useCallback(
    (ctx: CanvasRenderingContext2D, geo: PlotGeometry) => {
      for (const region of regions ?? []) {
        const a = geo.x(region.from);
        const b = geo.x(region.to);
        ctx.fillStyle = "rgba(13,148,136,0.08)";
        ctx.fillRect(Math.min(a, b), geo.top, Math.abs(b - a), geo.height);
      }
      if (zeroLine && yDomain[0] < 0 && yDomain[1] > 0) {
        ctx.strokeStyle = "rgba(100,116,139,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(geo.left, geo.y(0));
        ctx.lineTo(geo.left + geo.width, geo.y(0));
        ctx.stroke();
      }
      for (const s of series) {
        const x = s.x ?? sharedX;
        if (s.band) {
          ctx.fillStyle = rgbaFrom(s.color, 0.14);
          ctx.beginPath();
          for (let i = 0; i < x.length; i += 1) {
            const px = geo.x(x[i]!);
            const py = geo.y(s.band.upper[i]!);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          for (let i = x.length - 1; i >= 0; i -= 1) ctx.lineTo(geo.x(x[i]!), geo.y(s.band.lower[i]!));
          ctx.closePath();
          ctx.fill();
        }
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i < x.length; i += 1) {
          const v = s.values[i]!;
          if (!Number.isFinite(v)) {
            pen = false;
            continue;
          }
          const px = geo.x(x[i]!);
          const py = geo.y(v);
          if (pen) ctx.lineTo(px, py);
          else {
            ctx.moveTo(px, py);
            pen = true;
          }
        }
        if (s.area) {
          ctx.lineTo(geo.x(x[x.length - 1]!), geo.y(0));
          ctx.lineTo(geo.x(x[0]!), geo.y(0));
          ctx.closePath();
          ctx.fillStyle = rgbaFrom(s.color, 0.25);
          ctx.fill();
        }
        ctx.setLineDash(s.dashed ? [5, 4] : []);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width ?? 1.6;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },
    [regions, zeroLine, yDomain, series, sharedX],
  );

  return (
    <div className="n4wb-profile">
      <CanvasPlot
        className={className}
        xDomain={xDomain}
        yDomain={yDomain}
        {...(xLabel ? { xLabel } : {})}
        {...(yLabel ? { yLabel } : {})}
        formatX={(v) => formatValue(v, 1)}
        invertX={invertX}
        zoomAxes="x"
        tools={onRangeSelect ? ["select", "zoom", "pan"] : ["zoom", "pan"]}
        drawBase={drawBase}
        {...(onRangeSelect
          ? {
              onSelectRect: (rect, geo) => {
                const r = normalizeRect(rect);
                const a = geo.x.invert(r.x0);
                const b = geo.x.invert(r.x1);
                onRangeSelect([Math.min(a, b), Math.max(a, b)]);
              },
            }
          : {})}
        crosshair
        ariaLabel={ariaLabel}
        description={`${series.length} curves over ${x.length} positions: ${series.map((s) => s.label).join(", ")}.`}
        {...(icons ? { icons } : {})}
        toolExtras={toolExtras}
      />
      {series.length > 1 ? (
        <ul className="n4wb-legend n4wb-legend-overlay" aria-label="Legend">
          {series.map((s) => (
            <li key={s.id}>
              <span className="n4wb-legend-swatch" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
