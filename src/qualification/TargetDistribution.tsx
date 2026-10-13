import { useId, useState } from 'react';
import { loc, type Locale } from '../lab/locale.js';
import { extentOf, makeScale, niceExtent, ticks } from '../viz/geometry.js';
import { ChartTooltip, fmt, TipRow } from './_chart.js';
import { cx } from './_cx.js';
import { CHART_TEXT as C } from './locale.js';
import type { ContinuousSummary } from './extract.js';

export type TargetPointStatus = 'exact' | 'censored' | 'composite';

/** One raw reference value, as declared in the host input (never a computed value). */
export interface TargetPoint {
  id: string;
  value: number;
  status: TargetPointStatus;
}

export interface TargetDistributionProps {
  /** engine (Methods) summary of the eligible exact values */
  summary: ContinuousSummary | null;
  /** raw declared values shown as a strip under the box (host decides the population) */
  points?: readonly TargetPoint[];
  unit?: string | null;
  title: string;
  locale?: Locale;
  width?: number;
  className?: string;
}

const STATUS_COLOR: Record<TargetPointStatus, string> = { exact: '#0d9488', censored: '#d97706', composite: '#7c3aed' };
const BOX = '#0d9488';
const MEAN = '#4f46e5';
const PAD = { left: 16, right: 16 };

/** Deterministic 0..1 jitter from an id (stable across renders, no randomness). */
function jitter(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Continuous target: the engine's quartile box (min–max whiskers, Q1–Q3 box, median,
 * mean) above a strip of the raw declared values, censored/composite ones hollow.
 */
export function TargetDistribution({ summary, points = [], unit, title, locale = 'fr', width = 1000, className }: TargetDistributionProps) {
  const id = useId();
  const [hover, setHover] = useState<number | 'box' | null>(null);
  const t = (k: keyof typeof C) => loc(C[k], locale);
  const height = points.length ? 196 : 112;
  const x0 = PAD.left;
  const x1 = width - PAD.right;
  const all = [...points.map((p) => p.value), ...(summary ? [summary.min, summary.max] : [])];
  const xd = niceExtent(all.length ? all : [0, 1], 0.04);
  const xs = makeScale(xd, x0, x1);
  const boxY = 18;
  const boxH = 34;
  const mid = boxY + boxH / 2;
  const stripY = 76;
  const stripH = 72;
  const axisY = height - 10;
  const u = unit ? ` ${unit}` : '';
  const desc = summary
    ? `${t('min')} ${fmt(summary.min)}, ${t('q25')} ${fmt(summary.q25)}, ${t('median')} ${fmt(summary.median)}, ${t('q75')} ${fmt(summary.q75)}, ${t('max')} ${fmt(summary.max)}, ${t('mean')} ${fmt(summary.mean)}${u}; n=${summary.count}`
    : `${points.length}`;
  const hp = typeof hover === 'number' ? points[hover] : undefined;
  // hollow (excluded) values are drawn last so they are never hidden under exact ones
  const order = points.map((p, i) => i).sort((a, b) => Number(points[a]!.status !== 'exact') - Number(points[b]!.status !== 'exact'));
  const counts = { exact: 0, censored: 0, composite: 0 };
  for (const p of points) counts[p.status] += 1;

  return (
    <figure className={cx('n4q-chart', 'n4q-target', className)}>
      <div className="n4q-chart-plot">
        <svg viewBox={`0 0 ${width} ${height}`} className="n4q-svg" role="img" aria-labelledby={`${id}-t ${id}-d`} onMouseLeave={() => setHover(null)}>
          <title id={`${id}-t`}>{title}</title>
          <desc id={`${id}-d`}>{desc}</desc>
          {ticks(xd, Math.max(3, Math.min(8, Math.floor((x1 - x0) / 80)))).map((v) => (
            <g key={v}>
              <line className="n4q-grid" x1={xs(v)} x2={xs(v)} y1={8} y2={axisY - 12} />
              <text className="n4q-tick" x={xs(v)} y={axisY} textAnchor="middle">{fmt(v)}</text>
            </g>
          ))}
          {summary ? (
            <g
              tabIndex={0}
              role="img"
              aria-label={desc}
              className="n4q-hit"
              onMouseEnter={() => setHover('box')}
              onFocus={() => setHover('box')}
              onBlur={() => setHover(null)}
            >
              <rect x={xs(summary.min) - 6} y={boxY - 6} width={xs(summary.max) - xs(summary.min) + 12} height={boxH + 12} fill="transparent" />
              <line className="n4q-whisker" x1={xs(summary.min)} x2={xs(summary.q25)} y1={mid} y2={mid} />
              <line className="n4q-whisker" x1={xs(summary.q75)} x2={xs(summary.max)} y1={mid} y2={mid} />
              <line className="n4q-whisker" x1={xs(summary.min)} x2={xs(summary.min)} y1={mid - 8} y2={mid + 8} />
              <line className="n4q-whisker" x1={xs(summary.max)} x2={xs(summary.max)} y1={mid - 8} y2={mid + 8} />
              <rect x={xs(summary.q25)} y={boxY} width={Math.max(2, xs(summary.q75) - xs(summary.q25))} height={boxH} rx={4} fill={BOX} fillOpacity={hover === 'box' ? 0.3 : 0.18} />
              <line x1={xs(summary.median)} x2={xs(summary.median)} y1={boxY} y2={boxY + boxH} stroke={BOX} strokeWidth={3} strokeLinecap="round" />
              <path d={`M${xs(summary.mean)},${mid - 6}l6,6l-6,6l-6,-6Z`} fill={MEAN} className="n4q-marker" />
            </g>
          ) : null}
          {order.map((i) => {
            const p = points[i]!;
            const cx0 = xs(p.value);
            const cy = stripY + 6 + jitter(p.id) * (stripH - 12);
            const hollow = p.status !== 'exact';
            return (
              <g key={`${p.id}:${i}`} onMouseEnter={() => setHover(i)} className="n4q-hit">
                <circle cx={cx0} cy={cy} r={11} fill="transparent" />
                <circle
                  className="n4q-dot"
                  cx={cx0}
                  cy={cy}
                  r={hover === i ? 6 : 4.5}
                  fill={STATUS_COLOR[p.status]}
                  fillOpacity={0.85}
                  style={hollow ? { fill: 'var(--n4q-surface, #fff)', fillOpacity: 1, stroke: STATUS_COLOR[p.status], strokeWidth: 2 } : undefined}
                />
              </g>
            );
          })}
        </svg>
        {hover === 'box' && summary ? (
          <ChartTooltip x={xs(summary.median)} y={boxY} width={width} height={height}>
            <div className="n4q-tip-head">{t('count')} {summary.count}</div>
            <TipRow label={t('max')} value={`${fmt(summary.max)}${u}`} />
            <TipRow label={t('q75')} value={fmt(summary.q75)} />
            <TipRow color={BOX} label={t('median')} value={fmt(summary.median)} />
            <TipRow label={t('q25')} value={fmt(summary.q25)} />
            <TipRow label={t('min')} value={fmt(summary.min)} />
            <TipRow color={MEAN} label={t('mean')} value={fmt(summary.mean)} />
            <TipRow label={t('sd')} value={fmt(summary.sampleSd)} />
          </ChartTooltip>
        ) : null}
        {hp ? (
          <ChartTooltip x={xs(hp.value)} y={stripY} width={width} height={height}>
            <TipRow color={STATUS_COLOR[hp.status]} label={hp.id} value={`${fmt(hp.value)}${u}`} />
            <div className="n4q-tip-sub">{t(hp.status)}</div>
          </ChartTooltip>
        ) : null}
      </div>
      <figcaption>
        <ul className="n4q-legend">
          {summary ? <li><span className="n4q-key-box" aria-hidden="true" />{t('q25')}–{t('q75')} · {t('median')}</li> : null}
          {summary ? <li><span className="n4q-key-diamond" style={{ background: MEAN }} aria-hidden="true" />{t('mean')}</li> : null}
          {(Object.keys(counts) as TargetPointStatus[]).filter((s) => counts[s] > 0).map((s) => (
            <li key={s}>
              <span className={s === 'exact' ? 'n4q-key-dot' : 'n4q-key-dot n4q-key-hollow'} style={s === 'exact' ? { background: STATUS_COLOR[s] } : { borderColor: STATUS_COLOR[s] }} aria-hidden="true" />
              {t(s)} <strong>{counts[s]}</strong>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

export interface ClassCountBarsProps {
  counts: Readonly<Record<string, number>>;
  title: string;
  width?: number;
  className?: string;
}

/** Categorical target: horizontal bars of engine class counts, largest first, value at the tip. */
export function ClassCountBars({ counts, title, width = 640, className }: ClassCountBarsProps) {
  const id = useId();
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const labelW = Math.min(180, Math.max(60, ...rows.map(([k]) => k.length * 7 + 12)));
  const rowH = 30;
  const height = rows.length * rowH + 8;
  const max = extentOf([0, ...rows.map(([, v]) => v)]).max;
  const xs = makeScale({ min: 0, max }, labelW, width - 48);
  return (
    <figure className={cx('n4q-chart', 'n4q-classes', className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="n4q-svg" role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{rows.map(([k, v]) => `${k} ${v}`).join(', ')}</desc>
        {rows.map(([k, v], i) => {
          const y = 4 + i * rowH;
          const w = Math.max(2, xs(v) - labelW);
          return (
            <g key={k}>
              <text className="n4q-cat-label" x={labelW - 8} y={y + 16} textAnchor="end">{k}</text>
              <path d={`M${labelW},${y + 5}h${w - 4}q4,0 4,4v${rowH - 18}q0,4 -4,4h${-(w - 4)}Z`} fill={BOX} />
              <text className="n4q-cat-value" x={labelW + w + 6} y={y + 16}>{v}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
