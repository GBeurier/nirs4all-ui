import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { loc, type Locale } from '../lab/locale.js';
import { categoricalColor, rampAt } from '../viz/theme.js';
import { extentOf, makeScale, niceExtent, ticks } from '../viz/geometry.js';
import { ChartTooltip, fmt, TipRow } from './_chart.js';
import { cx } from './_cx.js';
import { CHART_TEXT as C } from './locale.js';

export interface ScorePoint {
  id: string;
  x: number;
  y: number;
  group?: string | null;
  value?: number | null;
  /** extra tooltip lines (metadata) */
  details?: readonly string[];
}

export type ScoreColorMode = 'none' | 'group' | 'value';

export interface ScoreMapProps {
  points: readonly ScorePoint[];
  colorBy?: ScoreColorMode;
  xLabel: string;
  yLabel: string;
  /** legend title for group/value coloring */
  colorLabel?: string;
  title: string;
  locale?: Locale;
  width?: number;
  height?: number;
  className?: string;
}

/** One-hue sequential ramp (light → dark teal) for continuous coloring. */
export const SCORE_SEQUENTIAL = ['#99f6e4', '#2dd4bf', '#0d9488', '#0f766e', '#134e4a'] as const;
const BASE = '#0d9488';
const NULL = '#94a3b8';
const PAD = { left: 52, right: 14, top: 12, bottom: 40 };

/** Group → color in a fixed order (sorted names), so a color follows its group, never its rank. */
export function scoreGroupColors(points: readonly ScorePoint[]): Map<string, string> {
  const groups = [...new Set(points.flatMap((p) => (p.group ? [p.group] : [])))].sort((a, b) => a.localeCompare(b));
  return new Map(groups.map((g, i) => [g, categoricalColor(i)]));
}

/**
 * Engine score scatter with categorical or sequential coloring, nearest-point hover,
 * keyboard browsing (arrow keys) and a legend / colorbar. Axes scale independently.
 */
export function ScoreMap({ points, colorBy = 'none', xLabel, yLabel, colorLabel, title, locale = 'fr', width = 560, height = 400, className }: ScoreMapProps) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const x0 = PAD.left;
  const x1 = width - PAD.right;
  const y0 = PAD.top;
  const y1 = height - PAD.bottom;
  const xd = niceExtent(valid.map((p) => p.x), 0.08);
  const yd = niceExtent(valid.map((p) => p.y), 0.08);
  const xs = makeScale(xd, x0, x1);
  const ys = makeScale(yd, y1, y0);
  const groups = scoreGroupColors(valid);
  const values = valid.flatMap((p) => (typeof p.value === 'number' && Number.isFinite(p.value) ? [p.value] : []));
  const vd = extentOf(values.length ? values : [0, 1]);
  const colorOf = (p: ScorePoint): string => {
    if (colorBy === 'group') return p.group ? (groups.get(p.group) ?? NULL) : NULL;
    if (colorBy === 'value') return typeof p.value === 'number' && Number.isFinite(p.value) ? rampAt(SCORE_SEQUENTIAL, (p.value - vd.min) / (vd.max - vd.min || 1)) : NULL;
    return BASE;
  };
  const isNull = (p: ScorePoint) => (colorBy === 'group' && !p.group) || (colorBy === 'value' && !(typeof p.value === 'number' && Number.isFinite(p.value)));

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const px = ((e.clientX - box.left) / box.width) * width;
    const py = ((e.clientY - box.top) / box.height) * height;
    let best = -1;
    let bestD = 22 * 22;
    valid.forEach((p, i) => {
      const d = (xs(p.x) - px) ** 2 + (ys(p.y) - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best >= 0 ? best : null);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!valid.length) return;
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    setHover((cur) => (cur === null ? 0 : (cur + step + valid.length) % valid.length));
  };
  const hp = hover !== null ? valid[hover] : undefined;
  const desc = `${valid.length} points; ${xLabel} ${fmt(xd.min)}…${fmt(xd.max)}; ${yLabel} ${fmt(yd.min)}…${fmt(yd.max)}`;

  return (
    <figure className={cx('n4q-chart', 'n4q-scores', className)}>
      <div className="n4q-chart-plot">
        <svg viewBox={`0 0 ${width} ${height}`} className="n4q-svg" role="img" aria-labelledby={`${id}-t ${id}-d`} tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)}>
          <title id={`${id}-t`}>{title}</title>
          <desc id={`${id}-d`}>{desc}</desc>
          {ticks(xd, Math.max(3, Math.min(6, Math.floor((x1 - x0) / 80)))).map((v) => (
            <g key={`x${v}`}>
              <line className={v === 0 ? 'n4q-zero' : 'n4q-grid'} x1={xs(v)} x2={xs(v)} y1={y0} y2={y1} />
              <text className="n4q-tick" x={xs(v)} y={y1 + 15} textAnchor="middle">{fmt(v)}</text>
            </g>
          ))}
          {ticks(yd, 5).map((v) => (
            <g key={`y${v}`}>
              <line className={v === 0 ? 'n4q-zero' : 'n4q-grid'} x1={x0} x2={x1} y1={ys(v)} y2={ys(v)} />
              <text className="n4q-tick" x={x0 - 6} y={ys(v) + 3} textAnchor="end">{fmt(v)}</text>
            </g>
          ))}
          <text className="n4q-axis-title" x={(x0 + x1) / 2} y={height - 6} textAnchor="middle">{xLabel}</text>
          <text className="n4q-axis-title" transform={`translate(13 ${(y0 + y1) / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
          {valid.map((p, i) => (
            <circle
              key={`${p.id}:${i}`}
              className="n4q-dot"
              cx={xs(p.x)}
              cy={ys(p.y)}
              r={hover === i ? 7 : 5}
              fill={colorOf(p)}
              fillOpacity={hover === null || hover === i ? 0.92 : 0.45}
              style={isNull(p) ? { fill: 'var(--n4q-surface, #fff)', stroke: NULL, strokeWidth: 1.5 } : undefined}
            />
          ))}
          <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hp ? (
          <ChartTooltip x={xs(hp.x)} y={ys(hp.y)} width={width} height={height}>
            <div className="n4q-tip-head">{hp.id}</div>
            <TipRow label={xLabel} value={fmt(hp.x)} />
            <TipRow label={yLabel} value={fmt(hp.y)} />
            {colorBy === 'value' ? <TipRow color={colorOf(hp)} label={colorLabel ?? ''} value={hp.value === null || hp.value === undefined ? loc(C.noValue, locale) : fmt(hp.value)} /> : null}
            {colorBy === 'group' ? <TipRow color={colorOf(hp)} label={colorLabel ?? ''} value={hp.group ?? loc(C.noValue, locale)} /> : null}
            {(hp.details ?? []).map((d) => <div key={d} className="n4q-tip-sub">{d}</div>)}
          </ChartTooltip>
        ) : null}
      </div>
      {colorBy !== 'none' ? (
        <figcaption>
          {colorBy === 'group' ? (
            <ul className="n4q-legend" aria-label={colorLabel}>
              {colorLabel ? <li className="n4q-legend-title">{colorLabel}</li> : null}
              {[...groups].map(([g, c]) => <li key={g}><span className="n4q-key-dot" style={{ background: c }} aria-hidden="true" />{g}</li>)}
              {valid.some(isNull) ? <li><span className="n4q-key-dot n4q-key-null" aria-hidden="true" />{loc(C.noValue, locale)}</li> : null}
            </ul>
          ) : (
            <div className="n4q-colorbar" aria-label={colorLabel}>
              {colorLabel ? <span className="n4q-legend-title">{colorLabel}</span> : null}
              <span>{fmt(vd.min)}</span>
              <span className="n4q-colorbar-ramp" style={{ background: `linear-gradient(90deg, ${SCORE_SEQUENTIAL.join(', ')})` }} aria-hidden="true" />
              <span>{fmt(vd.max)}</span>
              {valid.some(isNull) ? <span><span className="n4q-key-dot n4q-key-null" aria-hidden="true" /> {loc(C.noValue, locale)}</span> : null}
            </div>
          )}
        </figcaption>
      ) : null}
    </figure>
  );
}
