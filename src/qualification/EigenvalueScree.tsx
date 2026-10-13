import { useId, useState } from 'react';
import { loc, type Locale } from '../lab/locale.js';
import { makeScale, ticks } from '../viz/geometry.js';
import { ChartTooltip, fmt, pct, TipRow } from './_chart.js';
import { cx } from './_cx.js';
import { CHART_TEXT as C } from './locale.js';

export interface EigenvalueScreeProps {
  eigenvalues: readonly number[];
  /** trace of the full covariance (engine `sum_eigenvalues`); enables shares of trace + cumulative line */
  totalVariance?: number | null;
  title: string;
  locale?: Locale;
  width?: number;
  height?: number;
  className?: string;
}

const PAD = { left: 46, right: 12, top: 14, bottom: 28 };
const BAR_COLOR = '#0d9488';
const CUM_COLOR = '#4f46e5';

/** Rounded-top bar path anchored square on the baseline. */
function barPath(x: number, y: number, w: number, base: number): string {
  const r = Math.min(4, w / 2, Math.max(0, base - y));
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

/**
 * Scree of engine eigenvalues. With the reported trace, bars are each component's
 * share of the total variance and a line shows the cumulative share (same % axis).
 */
export function EigenvalueScree({ eigenvalues, totalVariance = null, title, locale = 'fr', width = 380, height = 240, className }: EigenvalueScreeProps) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const t = (k: keyof typeof C) => loc(C[k], locale);
  const share = totalVariance !== null && totalVariance > 0;
  const values = eigenvalues.map((v) => (share ? v / (totalVariance as number) : v));
  let acc = 0;
  const cumulative = values.map((v) => (acc += v));
  const yMax = share ? 1 : Math.max(...values, 0) * 1.1 || 1;
  const x0 = PAD.left;
  const x1 = width - PAD.right;
  const base = height - PAD.bottom;
  const y = makeScale({ min: 0, max: yMax }, base, PAD.top);
  const slot = (x1 - x0) / Math.max(1, values.length);
  const bw = Math.min(24, slot * 0.62);
  const cx0 = (i: number) => x0 + slot * i + slot / 2;
  const desc = values.map((v, i) => `PC${i + 1} ${share ? pct(v) : fmt(v)}`).join(', ');

  return (
    <figure className={cx('n4q-chart', 'n4q-scree', className)}>
      <div className="n4q-chart-plot">
        <svg viewBox={`0 0 ${width} ${height}`} className="n4q-svg" role="img" aria-labelledby={`${id}-t ${id}-d`} onMouseLeave={() => setHover(null)}>
          <title id={`${id}-t`}>{title}</title>
          <desc id={`${id}-d`}>{desc}</desc>
          {ticks({ min: 0, max: yMax }, 4).map((v) => (
            <g key={v}>
              <line className="n4q-grid" x1={x0} x2={x1} y1={y(v)} y2={y(v)} />
              <text className="n4q-tick" x={x0 - 6} y={y(v) + 3} textAnchor="end">{share ? `${Math.round(v * 100)}%` : fmt(v)}</text>
            </g>
          ))}
          <line className="n4q-baseline" x1={x0} x2={x1} y1={base} y2={base} />
          {values.map((v, i) => (
            <g
              key={i}
              tabIndex={0}
              role="img"
              aria-label={`PC${i + 1}: ${share ? pct(v) : fmt(v)}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="n4q-hit"
            >
              <rect x={cx0(i) - slot / 2} y={PAD.top} width={slot} height={base - PAD.top} fill="transparent" />
              <path d={barPath(cx0(i) - bw / 2, y(v), bw, base)} fill={BAR_COLOR} fillOpacity={hover === null || hover === i ? 1 : 0.55} />
              {values.length <= 12 || i % Math.ceil(values.length / 12) === 0 ? (
                <text className="n4q-tick" x={cx0(i)} y={base + 16} textAnchor="middle">{i + 1}</text>
              ) : null}
            </g>
          ))}
          {share ? (
            <g pointerEvents="none">
              <path className="n4q-line" stroke={CUM_COLOR} d={cumulative.map((v, i) => `${i ? 'L' : 'M'}${cx0(i)},${y(Math.min(1, v))}`).join('')} />
              {cumulative.map((v, i) => <circle key={i} className="n4q-marker" cx={cx0(i)} cy={y(Math.min(1, v))} r={hover === i ? 5 : 3.5} fill={CUM_COLOR} />)}
            </g>
          ) : null}
        </svg>
        {hover !== null ? (
          <ChartTooltip x={cx0(hover)} y={y(Math.max(values[hover] ?? 0, share ? (cumulative[hover] ?? 0) : 0))} width={width} height={height}>
            <div className="n4q-tip-head">PC{hover + 1}</div>
            <TipRow color={BAR_COLOR} label={t('eigenvalue')} value={fmt(eigenvalues[hover] ?? null)} />
            {share ? <TipRow color={BAR_COLOR} label={t('shareOfTrace')} value={pct(values[hover] ?? NaN)} /> : null}
            {share ? <TipRow line color={CUM_COLOR} label={t('cumulative')} value={pct(cumulative[hover] ?? NaN)} /> : null}
          </ChartTooltip>
        ) : null}
      </div>
      <figcaption>
        <ul className="n4q-legend">
          <li><span className="n4q-key-dot" style={{ background: BAR_COLOR, borderRadius: 2 }} aria-hidden="true" />{share ? t('shareOfTrace') : t('eigenvalue')}</li>
          {share ? <li><span className="n4q-key-line" style={{ background: CUM_COLOR }} aria-hidden="true" />{t('cumulative')}</li> : null}
          <li className="n4q-legend-sub">{t('component')} 1–{values.length}</li>
        </ul>
      </figcaption>
    </figure>
  );
}
