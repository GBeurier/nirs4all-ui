import { useId, useState } from 'react';
import { loc, type Locale } from '../lab/locale.js';
import { makeScale, ticks } from '../viz/geometry.js';
import { ChartTooltip, fmt, pct, TipRow } from './_chart.js';
import { cx } from './_cx.js';
import { CHART_TEXT as C } from './locale.js';

/** One labelled engine value, with an optional engine interval and comparison value. */
export interface MeasureRow {
  id: string;
  label: string;
  /** null = not computed for this row (shown as an explicit gap, never 0) */
  value: number | null;
  /** engine interval or spread (e.g. quartiles, confidence bounds) */
  low?: number | null;
  high?: number | null;
  /** comparison value drawn as a hollow marker (e.g. a baseline) */
  compare?: number | null;
  /** short text after the label (counts, denominators, status) */
  note?: string;
}

export interface MeasureBarsProps {
  rows: readonly MeasureRow[];
  title: string;
  /** legend names of the bar value, interval and comparison marker */
  valueLabel: string;
  intervalLabel?: string;
  compareLabel?: string;
  /** fraction: [0, 1] axis shown in % ; number: axis from 0 (or the lowest value) to the largest value */
  format?: 'fraction' | 'number';
  /** fixed axis domain; defaults to [0, 1] for fractions */
  domain?: { min: number; max: number };
  /** vertical reference line (declared threshold or neutral level) */
  reference?: { value: number; label: string } | null;
  locale?: Locale;
  width?: number;
  className?: string;
}

const BAR = '#0d9488';
const COMPARE = '#4f46e5';
const ROW_H = 30;
const PAD = { right: 56, top: 6, bottom: 26 };

/**
 * Horizontal bars of engine values (fractions or magnitudes) with optional interval
 * whiskers, a comparison marker per row and a reference line. Rows are keyboard
 * focusable; null values are labelled "not available", never drawn as zero.
 */
export function MeasureBars({ rows, title, valueLabel, intervalLabel, compareLabel, format = 'number', domain, reference = null, locale = 'fr', width = 640, className }: MeasureBarsProps) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const t = (k: keyof typeof C) => loc(C[k], locale);
  const show = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? t('noValue') : format === 'fraction' ? pct(v) : fmt(v));
  const finite = rows.flatMap((r) => [r.value, r.low, r.high, r.compare].filter((v): v is number => typeof v === 'number' && Number.isFinite(v)));
  const lo = domain?.min ?? (format === 'fraction' ? 0 : Math.min(0, ...finite, reference?.value ?? 0));
  const hi = domain?.max ?? (format === 'fraction' ? 1 : Math.max(...finite, reference?.value ?? 0, lo + 1e-12) * 1.08 || 1);
  const labelW = Math.min(220, Math.max(80, ...rows.map((r) => r.label.length * 6.6 + 14)));
  const height = PAD.top + rows.length * ROW_H + PAD.bottom;
  const x0 = labelW;
  const x1 = width - PAD.right;
  const xs = makeScale({ min: lo, max: hi }, x0, x1);
  const zero = xs(Math.max(lo, Math.min(hi, 0)));
  const hasInterval = rows.some((r) => typeof r.low === 'number' || typeof r.high === 'number');
  const hasCompare = rows.some((r) => typeof r.compare === 'number');
  const tickText = (v: number) => (format === 'fraction' ? `${Math.round(v * 100)}%` : fmt(v));
  const desc = rows.map((r) => `${r.label}: ${show(r.value)}${typeof r.compare === 'number' ? ` (${compareLabel ?? ''} ${show(r.compare)})` : ''}`).join('; ');

  return (
    <figure className={cx('n4q-chart', 'n4q-measure', className)}>
      <div className="n4q-chart-plot">
        <svg viewBox={`0 0 ${width} ${height}`} className="n4q-svg" role="img" aria-labelledby={`${id}-t ${id}-d`} onMouseLeave={() => setHover(null)}>
          <title id={`${id}-t`}>{title}</title>
          <desc id={`${id}-d`}>{desc}</desc>
          {ticks({ min: lo, max: hi }, 4).map((v) => (
            <g key={v}>
              <line className={v === 0 ? 'n4q-zero' : 'n4q-grid'} x1={xs(v)} x2={xs(v)} y1={PAD.top} y2={height - PAD.bottom} />
              <text className="n4q-tick" x={xs(v)} y={height - 8} textAnchor="middle">{tickText(v)}</text>
            </g>
          ))}
          {rows.map((r, i) => {
            const y = PAD.top + i * ROW_H;
            const mid = y + ROW_H / 2;
            const has = typeof r.value === 'number' && Number.isFinite(r.value);
            const v = has ? Math.max(lo, Math.min(hi, r.value as number)) : 0;
            const left = Math.min(zero, xs(v));
            const w = Math.max(has ? 2 : 0, Math.abs(xs(v) - zero));
            const low = typeof r.low === 'number' && Number.isFinite(r.low) ? xs(Math.max(lo, r.low)) : null;
            const high = typeof r.high === 'number' && Number.isFinite(r.high) ? xs(Math.min(hi, r.high)) : null;
            const cmp = typeof r.compare === 'number' && Number.isFinite(r.compare) ? xs(Math.max(lo, Math.min(hi, r.compare))) : null;
            return (
              <g
                key={r.id}
                className="n4q-hit"
                tabIndex={0}
                role="img"
                aria-label={`${r.label}: ${valueLabel} ${show(r.value)}${low !== null || high !== null ? `, ${intervalLabel ?? ''} ${show(r.low)}–${show(r.high)}` : ''}${cmp !== null ? `, ${compareLabel ?? ''} ${show(r.compare)}` : ''}${r.note ? `, ${r.note}` : ''}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                <rect x={0} y={y} width={width} height={ROW_H} fill="transparent" />
                <text className="n4q-cat-label" x={labelW - 8} y={mid + 4} textAnchor="end">{r.label}</text>
                {has
                  ? <rect x={left} y={y + 8} width={w} height={ROW_H - 16} rx={3} fill={BAR} fillOpacity={hover === null || hover === i ? 0.9 : 0.5} />
                  : <text className="n4q-tick" x={zero + 4} y={mid + 4}>{t('noValue')}</text>}
                {low !== null && high !== null ? (
                  <g className="n4q-whisker">
                    <line x1={low} x2={high} y1={mid} y2={mid} />
                    <line x1={low} x2={low} y1={mid - 5} y2={mid + 5} />
                    <line x1={high} x2={high} y1={mid - 5} y2={mid + 5} />
                  </g>
                ) : null}
                {cmp !== null ? <rect x={cmp - 4.5} y={mid - 4.5} width={9} height={9} transform={`rotate(45 ${cmp} ${mid})`} fill="var(--n4q-surface, var(--surface, #fff))" stroke={COMPARE} strokeWidth={2} /> : null}
                {has ? <text className="n4q-cat-value" x={Math.max(xs(v), zero, high ?? 0, cmp ?? 0) + 8} y={mid + 4}>{show(r.value)}</text> : null}
              </g>
            );
          })}
          {reference ? (
            <g pointerEvents="none">
              <line className="n4q-crosshair" strokeDasharray="4 3" x1={xs(reference.value)} x2={xs(reference.value)} y1={PAD.top} y2={height - PAD.bottom} />
            </g>
          ) : null}
        </svg>
        {hover !== null && rows[hover] ? (
          <ChartTooltip x={xs(Math.max(lo, Math.min(hi, rows[hover]!.value ?? lo)))} y={PAD.top + hover * ROW_H} width={width} height={height}>
            <div className="n4q-tip-head">{rows[hover]!.label}</div>
            <TipRow color={BAR} label={valueLabel} value={show(rows[hover]!.value)} />
            {typeof rows[hover]!.low === 'number' || typeof rows[hover]!.high === 'number' ? <TipRow label={intervalLabel ?? ''} value={`${show(rows[hover]!.low)} – ${show(rows[hover]!.high)}`} /> : null}
            {typeof rows[hover]!.compare === 'number' ? <TipRow color={COMPARE} label={compareLabel ?? ''} value={show(rows[hover]!.compare)} /> : null}
            {rows[hover]!.note ? <div className="n4q-tip-sub">{rows[hover]!.note}</div> : null}
          </ChartTooltip>
        ) : null}
      </div>
      <figcaption>
        <ul className="n4q-legend">
          <li><span className="n4q-key-dot" style={{ background: BAR, borderRadius: 2 }} aria-hidden="true" />{valueLabel}</li>
          {hasInterval && intervalLabel ? <li><span className="n4q-key-line" style={{ background: 'var(--teal-d, #0f766e)', height: 2 }} aria-hidden="true" />{intervalLabel}</li> : null}
          {hasCompare && compareLabel ? <li><span className="n4q-key-diamond" style={{ border: `2px solid ${COMPARE}` }} aria-hidden="true" />{compareLabel}</li> : null}
          {reference ? <li><span className="n4q-key-line" style={{ background: 'var(--text-2, #475569)', height: 2 }} aria-hidden="true" />{reference.label} ({tickText(reference.value)})</li> : null}
        </ul>
      </figcaption>
    </figure>
  );
}
