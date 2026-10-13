import { useId, useState } from 'react';
import { loc, type Locale } from '../lab/locale.js';
import { ChartTooltip, pct, TipRow } from './_chart.js';
import { cx } from './_cx.js';
import { CHART_TEXT as C, QUALIFICATION_TEXT as T } from './locale.js';
import type { ObservationFlow, SamplePopulations } from './extract.js';

export type FlowTone = 'primary' | 'secondary' | 'muted' | 'warning' | 'danger' | 'violet';

export const FLOW_TONE_COLOR: Record<FlowTone, string> = {
  primary: '#0d9488',
  secondary: '#0891b2',
  muted: '#94a3b8',
  warning: '#d97706',
  danger: '#e11d48',
  violet: '#7c3aed',
};

export interface FlowSegment {
  id: string;
  label: string;
  count: number;
  tone: FlowTone;
  /** explicit colour (e.g. a categorical group colour); overrides `tone` */
  color?: string;
}

const segColor = (s: FlowSegment) => s.color ?? FLOW_TONE_COLOR[s.tone];

export interface FlowStage {
  id: string;
  label: string;
  /** count noun shown after totals (e.g. "observations") */
  unit: string;
  segments: readonly FlowSegment[];
  /** id of the segment that feeds the next stage */
  next?: string;
}

export interface PopulationFlowProps {
  stages: readonly FlowStage[];
  title: string;
  locale?: Locale;
  width?: number;
  /** bar thickness; in-bar labels are drawn only from 24px */
  barHeight?: number;
  /** hide the per-segment legend (when the host renders its own) */
  legend?: boolean;
  className?: string;
}

const LABEL = 24;
const LINK = 44;
const GAP = 2;

/**
 * Stage-by-stage accounting funnel: each stage is a full-width stacked bar and the
 * segment that continues fans out into the next stage. Counts come from the engine.
 */
export function PopulationFlow({ stages, title, locale = 'fr', width = 1080, barHeight = 30, legend = true, className }: PopulationFlowProps) {
  const BAR = barHeight;
  const id = useId();
  const [hover, setHover] = useState<{ stage: number; seg: number } | null>(null);
  const L = 1;
  const R = width - 1;
  const stageTop = (i: number) => i * (LABEL + BAR + LINK);
  const height = stages.length * (LABEL + BAR) + Math.max(0, stages.length - 1) * LINK + 2;

  const layout = stages.map((stage) => {
    const total = stage.segments.reduce((n, s) => n + s.count, 0);
    const shown = stage.segments.filter((s) => s.count > 0);
    const usable = R - L - GAP * Math.max(0, shown.length - 1);
    let x = L;
    const rects = stage.segments.map((s) => {
      if (s.count <= 0 || total === 0) return null;
      const w = (s.count / total) * usable;
      const r = { x, w };
      x += w + GAP;
      return r;
    });
    return { total, rects };
  });

  const desc = stages.map((s, i) => `${s.label}: ${layout[i]!.total} ${s.unit} (${s.segments.map((g) => `${g.label} ${g.count}`).join(', ')})`).join('. ');
  const hovered = hover ? { stage: stages[hover.stage]!, seg: stages[hover.stage]!.segments[hover.seg]!, rect: layout[hover.stage]!.rects[hover.seg]!, total: layout[hover.stage]!.total, top: stageTop(hover.stage) } : null;

  return (
    <figure className={cx('n4q-chart', 'n4q-flow', className)}>
      <div className="n4q-chart-plot">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-t ${id}-d`} className="n4q-svg" onMouseLeave={() => setHover(null)}>
          <title id={`${id}-t`}>{title}</title>
          <desc id={`${id}-d`}>{desc}</desc>
          {stages.map((stage, i) => {
            const top = stageTop(i);
            const barY = top + LABEL;
            const { total, rects } = layout[i]!;
            const nextIdx = stage.next ? stage.segments.findIndex((s) => s.id === stage.next) : -1;
            const from = nextIdx >= 0 ? rects[nextIdx] : null;
            const yb = barY + BAR;
            const yt = yb + LINK;
            const mid = (yb + yt) / 2;
            return (
              <g key={stage.id}>
                <text x={L} y={top + 15} className="n4q-flow-label">
                  <tspan className="n4q-flow-total">{total}</tspan>
                  <tspan dx={6}>{stage.unit}</tspan>
                  <tspan dx={8} className="n4q-flow-stage">{stage.label}</tspan>
                </text>
                {total === 0 ? <rect x={L} y={barY} width={R - L} height={BAR} rx={6} className="n4q-flow-empty" /> : null}
                {from && i < stages.length - 1 ? (
                  <path
                    className="n4q-flow-link"
                    d={`M${from.x},${yb} C${from.x},${mid} ${L},${mid} ${L},${yt} L${R},${yt} C${R},${mid} ${from.x + from.w},${mid} ${from.x + from.w},${yb} Z`}
                    fill={segColor(stage.segments[nextIdx]!)}
                  />
                ) : null}
                {stage.segments.map((s, k) => {
                  const r = rects[k];
                  if (!r) return null;
                  const active = hover?.stage === i && hover.seg === k;
                  const label = `${s.count}`;
                  const fits = BAR >= 24 && r.w > label.length * 8 + 14;
                  const wide = r.w > (s.label.length + label.length) * 6.6 + 26;
                  return (
                    <g
                      key={s.id}
                      tabIndex={0}
                      role="img"
                      aria-label={`${s.label}: ${s.count} ${stage.unit} (${pct(s.count / total)})`}
                      className="n4q-flow-seg"
                      data-active={active || undefined}
                      onMouseEnter={() => setHover({ stage: i, seg: k })}
                      onFocus={() => setHover({ stage: i, seg: k })}
                      onBlur={() => setHover(null)}
                    >
                      <rect x={r.x} y={barY} width={Math.max(1, r.w)} height={BAR} rx={Math.min(6, r.w / 2)} fill={segColor(s)} />
                      {fits ? (
                        <text x={r.x + 10} y={barY + BAR / 2 + 4} className="n4q-flow-inbar">
                          <tspan fontWeight={700}>{label}</tspan>
                          {wide ? <tspan dx={6}>{s.label}</tspan> : null}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        {hovered ? (
          <ChartTooltip x={hovered.rect.x + hovered.rect.w / 2} y={hovered.top + LABEL} width={width} height={height}>
            <TipRow color={segColor(hovered.seg)} label={hovered.seg.label} value={`${hovered.seg.count}`} />
            <div className="n4q-tip-sub">{pct(hovered.seg.count / hovered.total)} · {hovered.stage.label}</div>
          </ChartTooltip>
        ) : null}
      </div>
      <figcaption>
        {legend ? <ul className="n4q-legend">
          {stages.flatMap((stage) => stage.segments.map((s) => (
            <li key={`${stage.id}:${s.id}`} data-zero={s.count === 0 || undefined}>
              <span className="n4q-key-dot" style={{ background: segColor(s) }} aria-hidden="true" />
              {s.label} <strong>{s.count}</strong>
            </li>
          )))}
        </ul> : null}
        <span className="n4q-visually-hidden">{loc(T.dataTable, locale)}: {desc}</span>
      </figcaption>
    </figure>
  );
}

/** Builds the observation funnel of one source (source → development → structure units). */
export function observationFlowStages(flow: ObservationFlow, locale: Locale = 'fr'): FlowStage[] {
  const t = (k: keyof typeof C) => loc(C[k], locale);
  const excluded = flow.excludedAmbiguousRepeat + flow.excludedIncomplete + flow.excludedMulticontext;
  const stages: FlowStage[] = [
    {
      id: 'source',
      label: t('stageSource'),
      unit: t('observations'),
      next: 'development',
      segments: [
        { id: 'development', label: t('segDevelopment'), count: flow.developmentObservations, tone: 'primary' },
        { id: 'other', label: t('segOther'), count: flow.sourceObservations - flow.developmentObservations, tone: 'muted' },
      ],
    },
    {
      id: 'development',
      label: t('stageDevelopment'),
      unit: t('observations'),
      ...(flow.structureUnits !== null ? { next: 'used' } : {}),
      segments: [
        { id: 'used', label: t('segUsed'), count: flow.developmentObservations - excluded, tone: 'primary' },
        { id: 'ambiguous', label: t('segAmbiguous'), count: flow.excludedAmbiguousRepeat, tone: 'warning' },
        { id: 'incomplete', label: t('segIncomplete'), count: flow.excludedIncomplete, tone: 'danger' },
        { id: 'multicontext', label: t('segMulticontext'), count: flow.excludedMulticontext, tone: 'violet' },
      ],
    },
  ];
  if (flow.structureUnits !== null) {
    stages.push({
      id: 'units',
      label: t('stageUnits'),
      unit: t('units'),
      segments: [{ id: 'units', label: t('segUnits'), count: flow.structureUnits, tone: 'secondary' }],
    });
  }
  return stages;
}

/** Sample-level partition stage (development / retained test / excluded augmented). */
export function samplePopulationStage(pop: SamplePopulations, locale: Locale = 'fr'): FlowStage | null {
  if (pop.developmentReal === null) return null;
  const t = (k: keyof typeof C) => loc(C[k], locale);
  return {
    id: 'samples',
    label: t('stageSamples'),
    unit: t('samples'),
    segments: [
      { id: 'development', label: t('segDevelopment'), count: pop.developmentReal, tone: 'primary' },
      { id: 'retained', label: t('segRetained'), count: pop.retainedTest ?? 0, tone: 'secondary' },
      { id: 'augmented', label: t('segAugmented'), count: pop.augmentedExcluded ?? 0, tone: 'muted' },
    ],
  };
}
