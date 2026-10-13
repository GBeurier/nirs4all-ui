import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { loc, type Locale } from '../lab/locale.js';
import { categoricalColor } from '../viz/theme.js';
import { extentOf, makeScale, ticks } from '../viz/geometry.js';
import { ChartTooltip, fmt, TipRow } from './_chart.js';
import { cx } from './_cx.js';
import { CHART_TEXT as C } from './locale.js';
import type { RepeatabilityContext } from './extract.js';

export interface RepeatabilityProfileProps {
  /** spectral axis of the source (same length as each context's band arrays) */
  axis: readonly number[];
  axisUnit?: string;
  contexts: readonly RepeatabilityContext[];
  title: string;
  locale?: Locale;
  width?: number;
  className?: string;
}

const PAD = { left: 58, right: 14, top: 10 };
const SD_H = 190;
const ICC_H = 120;
const GAP = 26;
const STRIP = 5;

/** Splits a nullable series into drawable runs (gaps where the engine reports null). */
function runs(values: readonly (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = '';
  let open = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      open = false;
      return;
    }
    d += `${open ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
    open = true;
  });
  return d;
}

const STATUS_TEXT = ['bandNotComputed', 'bandStatus1', 'bandStatus2', 'bandStatus3'] as const;

/**
 * Per-band technical repeatability: pooled SD (top) and ICC(1,1) (bottom) as two
 * aligned panels (never a dual axis), one line per repeat context, gaps where the
 * engine could not compute a band, plus a per-context band-status strip.
 */
export function RepeatabilityProfile({ axis, axisUnit = '', contexts, title, locale = 'fr', width = 1080, className }: RepeatabilityProfileProps) {
  const id = useId();
  const [index, setIndex] = useState<number | null>(null);
  const t = (k: keyof typeof C) => loc(C[k], locale);
  const n = axis.length;
  const hasIcc = contexts.some((c) => c.icc !== null);
  const stripTop = PAD.top + SD_H + GAP + (hasIcc ? ICC_H + GAP : 0);
  const height = stripTop + contexts.length * (STRIP + 2) + 26;
  const x0 = PAD.left;
  const x1 = width - PAD.right;

  const xDomain = extentOf(axis as number[]);
  const xs = makeScale(xDomain, x0, x1);
  const xAt = (i: number) => xs(axis[i] as number);
  const sdValues = contexts.flatMap((c) => c.pooledSd.filter((v): v is number => v !== null));
  const sdMax = sdValues.length ? Math.max(...sdValues) * 1.1 : 1;
  const sdY = makeScale({ min: 0, max: sdMax }, PAD.top + SD_H, PAD.top);
  const iccValues = contexts.flatMap((c) => (c.icc ?? []).filter((v): v is number => v !== null));
  const iccDomain = { min: Math.floor(Math.min(-0.25, ...iccValues) * 4) / 4, max: 1 };
  const iccTop = PAD.top + SD_H + GAP;
  const iccY = makeScale(iccDomain, iccTop + ICC_H, iccTop);
  const color = (i: number) => categoricalColor(i);

  const nearest = (vx: number) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xAt(i) - vx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setIndex(nearest(((e.clientX - box.left) / box.width) * width));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    setIndex((cur) => (e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : Math.min(n - 1, Math.max(0, (cur ?? -step) + step))));
  };

  const xTicks = ticks(xDomain, Math.max(3, Math.min(8, Math.floor((x1 - x0) / 110))));
  const unitSuffix = axisUnit ? ` ${axisUnit}` : '';
  const desc = contexts.map((c) => `${c.id}: ${c.pooledSd.filter((v) => v !== null).length}/${n} ${t('band')}`).join('; ');

  return (
    <figure className={cx('n4q-chart', 'n4q-repeat', className)}>
      <div className="n4q-chart-plot">
        <svg viewBox={`0 0 ${width} ${height}`} className="n4q-svg" role="img" aria-labelledby={`${id}-t ${id}-d`} tabIndex={0} onKeyDown={onKey} onBlur={() => setIndex(null)}>
          <title id={`${id}-t`}>{title}</title>
          <desc id={`${id}-d`}>{desc}</desc>

          {/* SD panel */}
          {ticks({ min: 0, max: sdMax }, 4).map((v) => (
            <g key={`sd${v}`}>
              <line className="n4q-grid" x1={x0} x2={x1} y1={sdY(v)} y2={sdY(v)} />
              <text className="n4q-tick" x={x0 - 6} y={sdY(v) + 3} textAnchor="end">{fmt(v)}</text>
            </g>
          ))}
          <text className="n4q-axis-title" x={x0} y={PAD.top - 0} dy={-1}>{t('pooledSd')}{contexts[0]?.unit ? ` (${contexts[0].unit})` : ''}</text>
          {contexts.map((c, i) => <path key={`sd-${c.id}`} d={runs(c.pooledSd, xAt, sdY)} className="n4q-line" stroke={color(i)} />)}

          {/* ICC panel */}
          {hasIcc ? (
            <>
              {[iccDomain.min, 0, 0.5, 1].filter((v, k, a) => a.indexOf(v) === k && v >= iccDomain.min).map((v) => (
                <g key={`icc${v}`}>
                  <line className={v === 0 ? 'n4q-zero' : 'n4q-grid'} x1={x0} x2={x1} y1={iccY(v)} y2={iccY(v)} />
                  <text className="n4q-tick" x={x0 - 6} y={iccY(v) + 3} textAnchor="end">{fmt(v)}</text>
                </g>
              ))}
              <text className="n4q-axis-title" x={x0} y={iccTop - 4}>{t('icc')}</text>
              {contexts.map((c, i) => (c.icc ? <path key={`icc-${c.id}`} d={runs(c.icc, xAt, iccY)} className="n4q-line" stroke={color(i)} /> : null))}
            </>
          ) : null}

          {/* band status strips */}
          {contexts.map((c, ci) => {
            const y = stripTop + ci * (STRIP + 2);
            const w = n > 1 ? Math.abs(xAt(n - 1) - xAt(0)) / (n - 1) : x1 - x0;
            return (
              <g key={`st-${c.id}`}>
                {c.bandStatus.map((s, i) => (
                  <rect key={i} x={xAt(i) - w / 2} y={y} width={w + 0.4} height={STRIP} fill={s === 0 ? color(ci) : 'var(--n4q-null-fill, #cbd5e1)'} fillOpacity={s === 0 ? 0.45 : 1} />
                ))}
              </g>
            );
          })}

          {/* x axis */}
          {xTicks.map((v) => (
            <text key={`x${v}`} className="n4q-tick" x={xs(v)} y={height - 8} textAnchor="middle">{fmt(v)}{unitSuffix}</text>
          ))}

          {index !== null ? (
            <g pointerEvents="none">
              <line className="n4q-crosshair" x1={xAt(index)} x2={xAt(index)} y1={PAD.top} y2={stripTop + contexts.length * (STRIP + 2)} />
              {contexts.map((c, i) => {
                const sd = c.pooledSd[index];
                const icc = c.icc?.[index];
                return (
                  <g key={`m-${c.id}`}>
                    {sd !== null && sd !== undefined ? <circle className="n4q-marker" cx={xAt(index)} cy={sdY(sd)} r={4} fill={color(i)} /> : null}
                    {icc !== null && icc !== undefined ? <circle className="n4q-marker" cx={xAt(index)} cy={iccY(icc)} r={4} fill={color(i)} /> : null}
                  </g>
                );
              })}
            </g>
          ) : null}
          <rect x={x0} y={PAD.top} width={x1 - x0} height={stripTop - PAD.top} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setIndex(null)} />
        </svg>
        {index !== null ? (
          <ChartTooltip x={xAt(index)} y={PAD.top + 8} width={width} height={height}>
            <div className="n4q-tip-head">{t('band')} {fmt(axis[index] ?? null)}{axisUnit ? ` ${axisUnit}` : ''}</div>
            {contexts.map((c, i) => {
              const s = c.bandStatus[index] ?? 0;
              return (
                <div key={c.id} className="n4q-tip-block">
                  <div className="n4q-tip-ctx"><span className="n4q-key-line" style={{ background: color(i) }} aria-hidden="true" />{c.id}</div>
                  <TipRow label={t('pooledSd')} value={fmt(c.pooledSd[index] ?? null)} />
                  {c.icc ? <TipRow label={t('icc')} value={fmt(c.icc[index] ?? null)} /> : null}
                  {s !== 0 ? <div className="n4q-tip-sub">{t(STATUS_TEXT[s] ?? 'bandNotComputed')}</div> : null}
                </div>
              );
            })}
          </ChartTooltip>
        ) : null}
      </div>
      <figcaption>
        <ul className="n4q-legend">
          {contexts.map((c, i) => (
            <li key={c.id}>
              <span className="n4q-key-line" style={{ background: color(i) }} aria-hidden="true" />
              {c.id}
              {c.physicalGroups !== null ? <span className="n4q-legend-sub"> · {c.physicalGroups} {t('groups')} · {c.observations ?? '—'} {t('observations')}</span> : null}
            </li>
          ))}
          <li><span className="n4q-key-dot n4q-key-null" aria-hidden="true" />{t('bandNotComputed')}</li>
        </ul>
      </figcaption>
    </figure>
  );
}
