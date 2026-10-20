import { useId, useState } from 'react';
import { loc, type Locale } from '../lab/locale.js';
import { makeScale, ticks } from '../viz/geometry.js';
import { ChartTooltip, fmt, TipRow } from './_chart.js';
import { cx } from './_cx.js';
import { CHART_TEXT as C } from './locale.js';

export interface ReplicateHistogramProps {
  /** engine replicate values (null replicates are counted apart, never binned) */
  values: readonly (number | null)[];
  /** observed engine value, drawn as a vertical line */
  observed?: number | null | undefined;
  title: string;
  valueLabel: string;
  /** e.g. the engine tail fraction, shown next to the observed value */
  observedNote?: string | undefined;
  bins?: number | undefined;
  locale?: Locale | undefined;
  width?: number | undefined;
  height?: number | undefined;
  className?: string | undefined;
}

const BAR = '#94a3b8';
const OBS = '#e11d48';
const PAD = { left: 40, right: 14, top: 14, bottom: 34 };

/**
 * Distribution of engine replicates (null model, resampling) as an equal-width count
 * histogram, with the observed value as a line. Binning is presentation only: the
 * replicate values and the observed value are the engine's.
 */
export function ReplicateHistogram({ values, observed = null, title, valueLabel, observedNote, bins = 20, locale = 'fr', width = 560, height = 220, className }: ReplicateHistogramProps) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const t = (k: keyof typeof C) => loc(C[k], locale);
  const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const nNull = values.length - finite.length;
  const all = observed !== null && Number.isFinite(observed) ? [...finite, observed] : finite;
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const span = hi - lo || 1;
  const n = Math.max(1, Math.trunc(bins));
  const w = span / n;
  const counts = Array.from({ length: n }, () => 0);
  for (const v of finite) counts[Math.min(n - 1, Math.max(0, Math.floor((v - lo) / w)))]! += 1;
  const x0 = PAD.left;
  const x1 = width - PAD.right;
  const base = height - PAD.bottom;
  const xs = makeScale({ min: lo, max: lo + span }, x0, x1);
  const yMax = Math.max(1, ...counts);
  const ys = makeScale({ min: 0, max: yMax }, base, PAD.top);
  const bw = (x1 - x0) / n;
  const desc = `${finite.length} ${t('replicates')}${nNull ? ` (+${nNull} ${t('noValue')})` : ''}; ${valueLabel} ${fmt(lo)}…${fmt(hi)}${observed !== null ? `; ${t('observed')} ${fmt(observed)}` : ''}${observedNote ? `; ${observedNote}` : ''}`;

  return (
    <figure className={cx('n4q-chart', 'n4q-replicates', className)}>
      <div className="n4q-chart-plot">
        <svg viewBox={`0 0 ${width} ${height}`} className="n4q-svg" role="img" aria-labelledby={`${id}-t ${id}-d`} onMouseLeave={() => setHover(null)}>
          <title id={`${id}-t`}>{title}</title>
          <desc id={`${id}-d`}>{desc}</desc>
          {ticks({ min: 0, max: yMax }, 3).filter((v) => Number.isInteger(v)).map((v) => (
            <g key={`y${v}`}>
              <line className="n4q-grid" x1={x0} x2={x1} y1={ys(v)} y2={ys(v)} />
              <text className="n4q-tick" x={x0 - 6} y={ys(v) + 3} textAnchor="end">{v}</text>
            </g>
          ))}
          <line className="n4q-baseline" x1={x0} x2={x1} y1={base} y2={base} />
          {counts.map((c, i) => (
            <g key={i} className="n4q-hit" tabIndex={c ? 0 : -1} role="img" aria-label={`${fmt(lo + i * w)}–${fmt(lo + (i + 1) * w)}: ${c}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
              <rect x={x0 + i * bw} y={PAD.top} width={bw} height={base - PAD.top} fill="transparent" />
              {c ? <rect x={x0 + i * bw + 1} y={ys(c)} width={Math.max(1, bw - 2)} height={base - ys(c)} rx={2} fill={BAR} fillOpacity={hover === null || hover === i ? 0.9 : 0.5} /> : null}
            </g>
          ))}
          {ticks({ min: lo, max: lo + span }, 5).map((v) => <text key={`x${v}`} className="n4q-tick" x={xs(v)} y={base + 15} textAnchor="middle">{fmt(v)}</text>)}
          <text className="n4q-axis-title" x={(x0 + x1) / 2} y={height - 4} textAnchor="middle">{valueLabel}</text>
          {observed !== null && Number.isFinite(observed) ? (
            <g pointerEvents="none">
              <line x1={xs(observed)} x2={xs(observed)} y1={PAD.top - 4} y2={base} stroke={OBS} strokeWidth={2} />
              <text className="n4q-axis-title" x={xs(observed)} y={PAD.top - 4} textAnchor={xs(observed) > (x0 + x1) / 2 ? 'end' : 'start'} dx={xs(observed) > (x0 + x1) / 2 ? -4 : 4}>{t('observed')} {fmt(observed)}</text>
            </g>
          ) : null}
        </svg>
        {hover !== null ? (
          <ChartTooltip x={x0 + (hover + 0.5) * bw} y={ys(counts[hover] ?? 0)} width={width} height={height}>
            <div className="n4q-tip-head">{fmt(lo + hover * w)} – {fmt(lo + (hover + 1) * w)}</div>
            <TipRow color={BAR} label={t('replicates')} value={String(counts[hover] ?? 0)} />
          </ChartTooltip>
        ) : null}
      </div>
      <figcaption>
        <ul className="n4q-legend">
          <li><span className="n4q-key-dot" style={{ background: BAR, borderRadius: 2 }} aria-hidden="true" />{finite.length} {t('replicates')}{nNull ? <span className="n4q-legend-sub"> · {nNull} {t('noValue')}</span> : null}</li>
          {observed !== null ? <li><span className="n4q-key-line" style={{ background: OBS }} aria-hidden="true" />{t('observed')} <strong>{fmt(observed)}</strong>{observedNote ? <span className="n4q-legend-sub"> · {observedNote}</span> : null}</li> : null}
        </ul>
      </figcaption>
    </figure>
  );
}
