import { loc, type Locale } from '../lab/locale.js';
import { cx } from './_cx.js';
import { isScaledEngineNumber } from './engineNumber.js';
import { AvailabilityBadge } from './Badges.js';
import { METRIC_FAMILY_LABEL, METRIC_FAMILY_QUESTION, metricLabel, QUALIFICATION_TEXT as T } from './locale.js';
import { formatDenominators, formatQualificationValue, formatScalarParameters, groupMetricsByFamily } from './report.js';
import type { QualificationMetricView, QualificationProvenance } from './types.js';

export interface EvidenceTableProps {
  metrics: readonly QualificationMetricView[];
  provenance?: QualificationProvenance | null;
  locale?: Locale;
  caption?: string;
  className?: string;
  /** Group rows under their metric family (default true). */
  grouped?: boolean;
  /** Host-owned selection keys; repeated metrics remain independently selectable. */
  selected?: ReadonlySet<string>;
  metricKey?: (metric: QualificationMetricView) => string;
  onToggle?: (key: string) => void;
}

const fullValue = (value: unknown) => {
  if (value === null || typeof value !== 'object') return undefined;
  const json = JSON.stringify(value);
  return json.length > 2000 ? `${json.slice(0, 1999)}…` : json;
};

/** Evidence availability table: every metric with status, reason, scope, denominators, provenance. Native table = keyboard/AT friendly. */
export function EvidenceTable({ metrics, provenance, locale = 'fr', caption, className, grouped = true, selected, metricKey, onToggle }: EvidenceTableProps) {
  const groups = grouped ? groupMetricsByFamily(metrics) : [{ family: null, metrics: [...metrics] }];
  return (
    <div className={cx('n4q-table-wrap', className)} role="region" tabIndex={0} aria-label={caption ?? loc(T.evidence, locale)}>
      <table className="n4q-table">
        <caption>{caption ?? loc(T.evidence, locale)}</caption>
        <thead>
          <tr>
            {onToggle ? <th scope="col">Export</th> : null}
            <th scope="col">{loc(T.metric, locale)}</th>
            <th scope="col">{loc(T.status, locale)}</th>
            <th scope="col">{loc(T.value, locale)}</th>
            <th scope="col">{loc(T.scope, locale)}</th>
            <th scope="col">{loc(T.denominators, locale)}</th>
            <th scope="col">{loc(T.provenance, locale)}</th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.family ?? 'all'} data-family={group.family ?? undefined}>
            {group.family ? (
              <tr className="n4q-family-row">
                <th scope="rowgroup" colSpan={onToggle ? 7 : 6}>
                  {loc(METRIC_FAMILY_LABEL[group.family], locale)}
                  <span className="n4q-family-count">{loc(T.nMetrics, locale).replace('{n}', String(group.metrics.length))}</span>
                  <span className="n4q-sub">{loc(METRIC_FAMILY_QUESTION[group.family], locale)}</span>
                </th>
              </tr>
            ) : null}
            {group.metrics.map((m, i) => (
              <tr key={`${m.id}:${m.sourceId ?? ''}:${m.targetId ?? ''}:${i}`} data-metric-id={m.id} data-availability={m.status}>
                {onToggle && metricKey ? <td><input type="checkbox" aria-label={`Export ${metricLabel(m.id, locale)} ${m.sourceId ?? ""} ${m.targetId ?? ""}`} checked={selected?.has(metricKey(m)) ?? false} onChange={() => onToggle(metricKey(m))} /></td> : null}
                <th scope="row">{metricLabel(m.id, locale) !== m.id ? <span className="n4q-metric-name">{metricLabel(m.id, locale)}</span> : null}<code>{m.id}</code></th>
                <td><AvailabilityBadge status={m.status} reason={m.reasonCode} locale={locale} /></td>
                <td className={m.value !== null && typeof m.value === 'object' && !isScaledEngineNumber(m.value) ? 'n4q-structured' : 'n4q-num'} title={m.status === 'computed' ? fullValue(m.value) : undefined}>
                  {m.status === 'computed'
                    ? <>{formatQualificationValue(m.value, locale)}{m.unit ? <span className="n4q-unit"> {m.unit}</span> : null}</>
                    : <span className="n4q-null">{loc(T.notAvailable, locale)}</span>}
                </td>
                <td>
                  <span className="n4q-sub">
                    {[m.sourceId && `${loc(T.source, locale)} ${m.sourceId}`, m.targetId && `${loc(T.target, locale)} ${m.targetId}`, `${loc(T.population, locale)} ${m.populationId}`, `${loc(T.view, locale)} ${m.viewId}`].filter(Boolean).join(' · ')}
                  </span>
                  {formatScalarParameters(m.parameters) ? <span className="n4q-sub">{loc(T.parameters, locale)}: {formatScalarParameters(m.parameters)}</span> : null}
                </td>
                <td>{formatDenominators(m.denominators) || '—'}</td>
                <td><code>{m.protocolVersion}</code>{provenance ? <span className="n4q-sub">{provenance.engineVersion}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
