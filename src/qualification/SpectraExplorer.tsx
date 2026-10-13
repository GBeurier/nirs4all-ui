import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { loc, type Locale } from '../lab/locale.js';
import { extentOf, makeScale, niceExtent, ticks } from '../viz/geometry.js';
import { ChartTooltip, fmt, TipRow } from './_chart.js';
import { cx } from './_cx.js';
import { CHART_TEXT as C } from './locale.js';

/** One raw input spectrum; null cells are drawn as gaps and flagged on the axis. */
export interface ExplorerSeries {
  id: string;
  values: readonly (number | null)[];
  color: string;
  /** secondary text (sample id, group…) */
  label?: string;
}

export interface SpectraExplorerProps {
  axis: readonly number[];
  series: readonly ExplorerSeries[];
  axisUnit?: string;
  yLabel?: string;
  title: string;
  /** emphasised series ids (host-controlled selection) */
  selected?: readonly string[];
  /** called on click / keyboard selection; null clears */
  onSelect?: (id: string | null) => void;
  locale?: Locale;
  width?: number;
  height?: number;
  className?: string;
}

const PAD = { left: 54, right: 14, top: 12, bottom: 36 };
const MISSING = '#e11d48';

function path(values: readonly (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = '';
  let open = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      open = false;
      return;
    }
    d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    open = true;
  });
  return d;
}

/**
 * Raw spectra explorer: hover finds the nearest curve at the nearest band, click (or
 * ↑/↓) selects it, ←/→ moves along the axis. Missing cells leave gaps and get a mark
 * on the axis. Draws input values only.
 */
export function SpectraExplorer({ axis, series, axisUnit = '', yLabel = '', title, selected = [], onSelect, locale = 'fr', width = 900, height = 340, className }: SpectraExplorerProps) {
  const id = useId();
  const [hover, setHover] = useState<{ series: number | null; band: number } | null>(null);
  const t = (k: keyof typeof C) => loc(C[k], locale);
  const n = axis.length;
  const x0 = PAD.left;
  const x1 = width - PAD.right;
  const y0 = PAD.top;
  const y1 = height - PAD.bottom;
  const xd = extentOf(axis as number[]);
  const all: number[] = [];
  for (const s of series) for (const v of s.values) if (v !== null && Number.isFinite(v)) all.push(v);
  const yd = niceExtent(all.length ? all : [0, 1], 0.06);
  const xs = makeScale(xd, x0, x1);
  const ys = makeScale(yd, y1, y0);
  const xAt = (i: number) => xs(axis[i] as number);
  const chosen = new Set(selected);
  const selectedIdx = series.findIndex((s) => chosen.has(s.id));
  const focusIdx = hover?.series ?? (selectedIdx >= 0 ? selectedIdx : null);
  const emphasised = (k: number) => k === focusIdx || chosen.has(series[k]!.id);
  const u = axisUnit ? ` ${axisUnit}` : '';

  const nearestBand = (px: number) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xAt(i) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box || box.width === 0 || n === 0) return;
    const px = ((e.clientX - box.left) / box.width) * width;
    const py = ((e.clientY - box.top) / box.height) * height;
    const band = nearestBand(px);
    let best: number | null = null;
    let bestD = 18;
    series.forEach((s, k) => {
      const v = s.values[band];
      if (v === null || v === undefined || !Number.isFinite(v)) return;
      const d = Math.abs(ys(v) - py);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    setHover({ series: best, band });
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!n || !series.length) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = selectedIdx < 0 ? 0 : (selectedIdx + step + series.length) % series.length;
      onSelect?.(series[next]!.id);
      setHover((h) => ({ series: null, band: h?.band ?? Math.floor(n / 2) }));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      setHover((h) => ({ series: null, band: Math.min(n - 1, Math.max(0, (h?.band ?? Math.floor(n / 2)) + step)) }));
    } else if (e.key === 'Escape') {
      onSelect?.(null);
      setHover(null);
    }
  };

  const missing = series.flatMap((s, k) => s.values.flatMap((v, i) => (v === null || !Number.isFinite(v) ? [{ k, i }] : [])));
  const focus = focusIdx !== null ? series[focusIdx] : undefined;
  const band = hover?.band ?? null;
  const desc = `${series.length} ${t('spectra')}, ${n} ${t('band')}; ${fmt(xd.min)}–${fmt(xd.max)}${u}; ${missing.length} ${t('missingValue')}`;

  return (
    <figure className={cx('n4q-chart', 'n4q-explorer', className)}>
      <div className="n4q-chart-plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="n4q-svg"
          role="img"
          aria-labelledby={`${id}-t ${id}-d`}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          <title id={`${id}-t`}>{title}</title>
          <desc id={`${id}-d`}>{desc}</desc>
          {ticks(yd, 5).map((v) => (
            <g key={`y${v}`}>
              <line className="n4q-grid" x1={x0} x2={x1} y1={ys(v)} y2={ys(v)} />
              <text className="n4q-tick" x={x0 - 6} y={ys(v) + 3} textAnchor="end">{fmt(v)}</text>
            </g>
          ))}
          {ticks(xd, Math.max(3, Math.min(8, Math.floor((x1 - x0) / 90)))).map((v) => (
            <text key={`x${v}`} className="n4q-tick" x={xs(v)} y={y1 + 16} textAnchor="middle">{fmt(v)}</text>
          ))}
          <line className="n4q-baseline" x1={x0} x2={x1} y1={y1} y2={y1} />
          {axisUnit ? <text className="n4q-axis-title" x={(x0 + x1) / 2} y={height - 4} textAnchor="middle">{axisUnit}</text> : null}
          {yLabel ? <text className="n4q-axis-title" transform={`translate(12 ${(y0 + y1) / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text> : null}
          <g className="n4q-explorer-lines" data-dim={focusIdx !== null || chosen.size > 0 || undefined}>
            {series.map((s, k) => (emphasised(k) ? null : <path key={s.id} d={path(s.values, xAt, ys)} stroke={s.color} className="n4q-explorer-line" />))}
          </g>
          {series.map((s, k) => (emphasised(k) ? <path key={`f-${s.id}`} d={path(s.values, xAt, ys)} stroke={s.color} className="n4q-explorer-focus" /> : null))}
          {missing.map(({ k, i }) => (
            <path key={`m${k}-${i}`} d={`M${xAt(i)},${y1 - 1}l-4,-7h8Z`} fill={MISSING} className="n4q-explorer-missing" data-active={emphasised(k) || undefined} />
          ))}
          {band !== null ? <line className="n4q-crosshair" x1={xAt(band)} x2={xAt(band)} y1={y0} y2={y1} pointerEvents="none" /> : null}
          {band !== null && focus && focus.values[band] !== null && focus.values[band] !== undefined ? (
            <circle className="n4q-marker" cx={xAt(band)} cy={ys(focus.values[band] as number)} r={4.5} fill={focus.color} pointerEvents="none" />
          ) : null}
          <rect
            x={x0}
            y={y0}
            width={x1 - x0}
            height={y1 - y0}
            fill="transparent"
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onClick={() => onSelect?.(hover?.series !== null && hover?.series !== undefined ? series[hover.series]!.id : null)}
          />
        </svg>
        {band !== null ? (
          <ChartTooltip x={xAt(band)} y={focus && focus.values[band] != null ? ys(focus.values[band] as number) : y0 + 10} width={width} height={height}>
            <div className="n4q-tip-head">{t('band')} {fmt(axis[band] ?? null)}{u}</div>
            {focus ? (
              <>
                <TipRow line color={focus.color} label={focus.id} value={focus.values[band] == null ? '—' : fmt(focus.values[band] as number)} />
                {focus.label ? <div className="n4q-tip-sub">{focus.label}</div> : null}
                {focus.values[band] == null ? <div className="n4q-tip-sub n4q-tip-alert">{t('missingValue')}</div> : null}
              </>
            ) : <div className="n4q-tip-sub">{series.length} {t('spectra')}</div>}
          </ChartTooltip>
        ) : null}
      </div>
    </figure>
  );
}
