import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { loc, type Locale } from '../lab/locale.js';
import { extentOf, makeScale, niceExtent, ticks, type Extent } from '../viz/geometry.js';
import { ChartDataTable } from './ChartDataTable.js';
import { ChartTooltip, fmt, TipRow } from './_chart.js';
import { cx } from './_cx.js';
import { CHART_TEXT as C } from './locale.js';
import type { ExplorerSeries } from './SpectraExplorer.js';

/** One set of spectra drawn on the compare chart: its own x values, y label and series. */
export interface CompareLayer {
  /** Host id of the layer, echoed in `data-layer` attributes. */
  id: string;
  /** Legend text, for example "Original: reflectance". */
  label: string;
  /** Y-axis title of the layer. */
  yLabel: string;
  /** X values of this layer, in the shared x unit; each series has one value per entry. */
  axis: readonly number[];
  series: readonly ExplorerSeries[];
  /** Dashed strokes (for example the original under the converted spectra). */
  dashed?: boolean;
}

export interface SpectraCompareChartProps {
  title: string;
  /** Drawn first, against the left y-axis. */
  before: CompareLayer;
  /** Drawn over `before`; against the right y-axis unless the scale is shared. */
  after: CompareLayer;
  /** Shared x-axis title (unit). */
  axisUnit?: string;
  /** One y scale for both layers. Default: when both layers have the same `yLabel`. */
  sharedY?: boolean;
  /** Draw the x-axis from high to low values (wavenumbers, frequencies). */
  xDescending?: boolean;
  locale?: Locale;
  width?: number;
  height?: number;
  className?: string;
}

const PAD = { left: 58, top: 12, bottom: 36 };
const DASH = '5 4';

function finite(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function path(values: readonly (number | null)[], x: (i: number) => number | null, y: (v: number) => number): string {
  let d = '';
  let open = false;
  values.forEach((v, i) => {
    const px = x(i);
    if (!finite(v) || px === null) {
      open = false;
      return;
    }
    d += `${open ? 'L' : 'M'}${px.toFixed(1)},${y(v).toFixed(1)}`;
    open = true;
  });
  return d;
}

function valuesOf(layer: CompareLayer): number[] {
  const out: number[] = [];
  for (const s of layer.series) for (const v of s.values) if (finite(v)) out.push(v);
  return out;
}

/** Actual finite min/max (no padding); null when there is none. */
function span(values: readonly number[]): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? [lo, hi] : null;
}

function missingOf(layer: CompareLayer): number {
  let n = 0;
  for (const s of layer.series) for (let i = 0; i < layer.axis.length; i++) if (!finite(s.values[i])) n++;
  return n;
}

/** Index of the axis entry closest to `x` (data units); -1 for an empty axis. */
function nearestIndex(axis: readonly number[], x: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < axis.length; i++) {
    const v = axis[i]!;
    if (!Number.isFinite(v)) continue;
    const d = Math.abs(v - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

const keyStyle = (color: string, dashed: boolean | undefined) =>
  dashed ? { background: `repeating-linear-gradient(90deg, ${color} 0 5px, transparent 5px 8px)` } : { background: color };

/**
 * Two sets of spectra overlaid on one shared x-axis, for example a signal before and after
 * a conversion. Each layer keeps its own x values (the host passes them already expressed
 * in the shared unit) and, when the y labels differ, its own y scale: `before` on the left
 * axis, `after` on the right. Missing cells leave gaps. Hover or ←/→ moves a crosshair whose
 * tooltip reads the nearest point of each layer. Draws input values only.
 */
export function SpectraCompareChart({
  title,
  before,
  after,
  axisUnit = '',
  sharedY,
  xDescending = false,
  locale = 'fr',
  width = 900,
  height = 360,
  className,
}: SpectraCompareChartProps) {
  const id = useId();
  const t = (k: keyof typeof C) => loc(C[k], locale);
  const shared = sharedY ?? before.yLabel === after.yLabel;
  const padRight = shared ? 16 : 58;
  const x0 = PAD.left;
  const x1 = width - padRight;
  const y0 = PAD.top;
  const y1 = height - PAD.bottom;
  const xd = extentOf([...before.axis, ...after.axis]);
  const xs = xDescending ? makeScale(xd, x1, x0) : makeScale(xd, x0, x1);
  const xInv = (px: number) => {
    const f = (px - x0) / Math.max(1, x1 - x0);
    return xDescending ? xd.max - f * (xd.max - xd.min) : xd.min + f * (xd.max - xd.min);
  };
  const vb = valuesOf(before);
  const va = valuesOf(after);
  const ydBefore: Extent = niceExtent(shared ? [...vb, ...va] : vb.length ? vb : [0, 1], 0.06);
  const ydAfter: Extent = shared ? ydBefore : niceExtent(va.length ? va : [0, 1], 0.06);
  const ysBefore = makeScale(ydBefore, y1, y0);
  const ysAfter = makeScale(ydAfter, y1, y0);
  const layers = [
    { layer: before, ys: ysBefore, side: 'left' as const },
    { layer: after, ys: ysAfter, side: shared ? ('left' as const) : ('right' as const) },
  ];
  const at = (axis: readonly number[]) => (i: number) => (finite(axis[i]) ? xs(axis[i]) : null);

  // Crosshair position in data units (x) and the curve the pointer is closest to.
  const [cursor, setCursor] = useState<{ x: number; layer: number | null; series: number | null } | null>(null);
  const keyAxis = after.axis.length ? after.axis : before.axis;

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const px = ((e.clientX - box.left) / box.width) * width;
    const py = ((e.clientY - box.top) / box.height) * height;
    const x = xInv(px);
    let best: { layer: number; series: number } | null = null;
    let bestD = 18;
    layers.forEach(({ layer, ys }, l) => {
      const i = nearestIndex(layer.axis, x);
      if (i < 0) return;
      layer.series.forEach((s, k) => {
        const v = s.values[i];
        if (!finite(v)) return;
        const d = Math.abs(ys(v) - py);
        if (d < bestD) {
          bestD = d;
          best = { layer: l, series: k };
        }
      });
    });
    const hit = best as { layer: number; series: number } | null;
    setCursor({ x, layer: hit ? hit.layer : null, series: hit ? hit.series : null });
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!keyAxis.length) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      // ←/→ move along the screen, whatever the axis direction.
      const forward = (e.key === 'ArrowRight') !== xDescending;
      const order = keyAxis.map((v, i) => [v, i] as const).filter(([v]) => Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
      if (!order.length) return;
      const current = cursor ? order.findIndex(([, i]) => i === nearestIndex(keyAxis, cursor.x)) : Math.floor(order.length / 2) - (forward ? 1 : -1);
      const next = Math.min(order.length - 1, Math.max(0, current + (forward ? 1 : -1)));
      setCursor({ x: order[next]![0], layer: null, series: null });
    } else if (e.key === 'Escape') {
      setCursor(null);
    }
  };

  const u = axisUnit ? ` ${axisUnit}` : '';
  const readings = cursor
    ? layers.map(({ layer }, l) => {
        const i = nearestIndex(layer.axis, cursor.x);
        const k = cursor.layer === l && cursor.series !== null ? cursor.series : 0;
        const s = layer.series[k];
        return { layer, i, s, value: i >= 0 && s ? s.values[i] : null };
      })
    : [];
  const focus = cursor && cursor.layer !== null && cursor.series !== null ? { layer: cursor.layer, series: cursor.series } : null;
  const tipY = (() => {
    if (!focus) return y0 + 10;
    const r = readings[focus.layer];
    return r && finite(r.value) ? layers[focus.layer]!.ys(r.value) : y0 + 10;
  })();
  const count = (n: number) => `${n} ${n === 1 ? t('spectrum') : t('spectra')}`;
  const sideLabel = (side: 'left' | 'right') => (shared ? null : side === 'left' ? t('leftAxis') : t('rightAxis'));
  const desc =
    `${before.series.length + after.series.length} ${t('spectra')} ${t('overlaid')}; ${fmt(xd.min)}–${fmt(xd.max)}${u}; ` +
    layers.map(({ layer, side }) => `${layer.label}: ${count(layer.series.length)}, ${layer.yLabel}${sideLabel(side) ? ` (${sideLabel(side)})` : ''}`).join('; ');

  const yTicks = (yd: Extent, ys: (v: number) => number, side: 'left' | 'right', grid: boolean) =>
    ticks(yd, 5).map((v) => (
      <g key={`${side}${v}`}>
        {grid ? <line className="n4q-grid" x1={x0} x2={x1} y1={ys(v)} y2={ys(v)} /> : null}
        <text className="n4q-tick" x={side === 'left' ? x0 - 6 : x1 + 6} y={ys(v) + 3} textAnchor={side === 'left' ? 'end' : 'start'} data-axis={side}>
          {fmt(v)}
        </text>
      </g>
    ));

  return (
    <figure className={cx('n4q-chart', 'n4q-explorer', 'n4q-compare', className)}>
      <div className="n4q-chart-plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="n4q-svg"
          role="img"
          aria-labelledby={`${id}-t ${id}-d`}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setCursor(null)}
        >
          <title id={`${id}-t`}>{title}</title>
          <desc id={`${id}-d`}>{desc}</desc>
          {yTicks(ydBefore, ysBefore, 'left', true)}
          {shared ? null : yTicks(ydAfter, ysAfter, 'right', false)}
          {ticks(xd, Math.max(3, Math.min(8, Math.floor((x1 - x0) / 90)))).map((v) => (
            <text key={`x${v}`} className="n4q-tick" x={xs(v)} y={y1 + 16} textAnchor="middle">{fmt(v)}</text>
          ))}
          <line className="n4q-baseline" x1={x0} x2={x1} y1={y1} y2={y1} />
          {axisUnit ? <text className="n4q-axis-title" x={(x0 + x1) / 2} y={height - 4} textAnchor="middle">{axisUnit}</text> : null}
          {shared ? (
            <text className="n4q-axis-title" transform={`translate(12 ${(y0 + y1) / 2}) rotate(-90)`} textAnchor="middle" data-axis="left">
              {before.yLabel === after.yLabel ? before.yLabel : `${before.yLabel} / ${after.yLabel}`}
            </text>
          ) : (
            <>
              <text className="n4q-axis-title" transform={`translate(12 ${(y0 + y1) / 2}) rotate(-90)`} textAnchor="middle" data-axis="left">{before.yLabel}</text>
              <text className="n4q-axis-title" transform={`translate(${width - 10} ${(y0 + y1) / 2}) rotate(90)`} textAnchor="middle" data-axis="right">{after.yLabel}</text>
            </>
          )}
          {layers.map(({ layer, ys }, l) => (
            <g key={layer.id} className="n4q-explorer-lines" data-layer={layer.id} data-dim={(focus !== null && focus.layer !== l) || undefined}>
              {layer.series.map((s, k) =>
                focus && focus.layer === l && focus.series === k ? null : (
                  <path key={s.id} d={path(s.values, at(layer.axis), ys)} stroke={s.color} strokeDasharray={layer.dashed ? DASH : undefined} className="n4q-explorer-line" />
                ),
              )}
            </g>
          ))}
          {focus ? (() => {
            const { layer, ys } = layers[focus.layer]!;
            const s = layer.series[focus.series]!;
            return <path d={path(s.values, at(layer.axis), ys)} stroke={s.color} strokeDasharray={layer.dashed ? DASH : undefined} className="n4q-explorer-focus" />;
          })() : null}
          {cursor ? <line className="n4q-crosshair" x1={xs(cursor.x)} x2={xs(cursor.x)} y1={y0} y2={y1} pointerEvents="none" /> : null}
          {readings.map((r, l) =>
            r.s && r.i >= 0 && finite(r.value) && finite(r.layer.axis[r.i]) ? (
              <circle key={`m${l}`} className="n4q-marker" cx={xs(r.layer.axis[r.i]!)} cy={layers[l]!.ys(r.value)} r={4} fill={r.s.color} pointerEvents="none" />
            ) : null,
          )}
          <rect
            x={x0}
            y={y0}
            width={Math.max(0, x1 - x0)}
            height={Math.max(0, y1 - y0)}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setCursor(null)}
          />
        </svg>
        {cursor ? (
          <ChartTooltip x={xs(cursor.x)} y={tipY} width={width} height={height}>
            <div className="n4q-tip-head">{fmt(cursor.x)}{u}</div>
            {readings.map((r, l) => (
              <div key={l} data-layer={r.layer.id}>
                <div className="n4q-tip-sub">{r.layer.label}{r.i >= 0 ? ` · ${fmt(r.layer.axis[r.i] ?? null)}${u}` : ''}</div>
                {r.s ? <TipRow line color={r.s.color} label={r.s.label ?? r.s.id} value={finite(r.value) ? fmt(r.value) : '—'} /> : null}
              </div>
            ))}
          </ChartTooltip>
        ) : null}
      </div>
      <ul className="n4q-legend">
        {layers.map(({ layer, side }) => (
          <li key={layer.id} data-layer={layer.id}>
            <span className="n4q-key-line" style={keyStyle(layer.series[0]?.color ?? '#64748b', layer.dashed)} aria-hidden="true" />
            <span className="n4q-legend-title">{layer.label}</span>
            <span className="n4q-legend-sub">
              {count(layer.series.length)} · {layer.yLabel}{sideLabel(side) ? ` · ${sideLabel(side)}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <ChartDataTable
        caption={title}
        locale={locale}
        columns={[t('layer'), t('yAxis'), t('spectra'), t('points'), t('xRange'), t('yRange'), t('missingCount')]}
        rows={layers.map(({ layer, side }) => {
          const ax = span(layer.axis);
          const yd = span(valuesOf(layer));
          return [
            layer.label,
            `${layer.yLabel}${sideLabel(side) ? ` (${sideLabel(side)})` : ''}`,
            layer.series.length,
            layer.axis.length,
            ax ? `${fmt(ax[0])}–${fmt(ax[1])}${u}` : null,
            yd ? `${fmt(yd[0])}–${fmt(yd[1])}` : null,
            missingOf(layer),
          ];
        })}
      />
    </figure>
  );
}
