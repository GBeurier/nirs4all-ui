import { loc, type Locale } from '../lab/locale.js';
import { cx } from './_cx.js';
import { AvailabilityBadge } from './Badges.js';
import { metricLabel, QUALIFICATION_TEXT as T } from './locale.js';
import { formatDenominators, formatQualificationValue, formatScalarParameters } from './report.js';
import type { QualificationMetricView, QualificationProvenance } from './types.js';

export interface EvidenceTableProps {
  metrics: readonly QualificationMetricView[];
  provenance?: QualificationProvenance | null;
  locale?: Locale;
  caption?: string;
  className?: string;
}

/** Evidence availability table: every metric with status, reason, scope, denominators, provenance. Native table = keyboard/AT friendly. */
export function EvidenceTable({ metrics, provenance, locale = 'fr', caption, className }: EvidenceTableProps) {
  return (
    <div className={cx('n4q-table-wrap', className)} role="region" tabIndex={0} aria-label={caption ?? loc(T.evidence, locale)}>
      <table className="n4q-table">
        <caption>{caption ?? loc(T.evidence, locale)}</caption>
        <thead>
          <tr>
            <th scope="col">{loc(T.metric, locale)}</th>
            <th scope="col">{loc(T.status, locale)}</th>
            <th scope="col">{loc(T.value, locale)}</th>
            <th scope="col">{loc(T.scope, locale)}</th>
            <th scope="col">{loc(T.denominators, locale)}</th>
            <th scope="col">{loc(T.provenance, locale)}</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m, i) => (
            <tr key={`${m.id}:${m.sourceId ?? ''}:${m.targetId ?? ''}:${i}`} data-metric-id={m.id} data-availability={m.status}>
              <th scope="row">{metricLabel(m.id, locale) !== m.id ? <span className="n4q-metric-name">{metricLabel(m.id, locale)}</span> : null}<code>{m.id}</code></th>
              <td><AvailabilityBadge status={m.status} reason={m.reasonCode} locale={locale} /></td>
              <td className="n4q-num">
                {m.status === 'computed'
                  ? <>{formatQualificationValue(m.value, locale)}{m.unit ? <span className="n4q-unit"> {m.unit}</span> : null}</>
                  : <span className="n4q-null">{loc(T.notAvailable, locale)}</span>}
              </td>
              <td>
                {m.scope}
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
      </table>
    </div>
  );
}
