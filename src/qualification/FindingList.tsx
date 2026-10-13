import { loc, type Locale } from '../lab/locale.js';
import { cx } from './_cx.js';
import { ConfidenceBadge, SeverityBadge } from './Badges.js';
import { metricLabel, QUALIFICATION_TEXT as T } from './locale.js';
import type { QualificationFindingView } from './types.js';

export interface FindingListProps {
  findings: readonly QualificationFindingView[];
  locale?: Locale;
  /** link target for an evidence metric id (e.g. an in-page anchor) */
  evidenceHref?: (metricId: string) => string;
  className?: string;
}

/** Engine findings with severity, (possibly unknown) confidence, evidence ids and action. */
export function FindingList({ findings, locale = 'fr', evidenceHref, className }: FindingListProps) {
  if (findings.length === 0) return <p className={cx('n4q-empty', className)}>{loc(T.noFindings, locale)}</p>;
  return (
    <ul className={cx('n4q-findings', className)}>
      {findings.map((f, i) => (
        <li key={`${f.ruleId}:${i}`} className="n4q-finding" data-severity={f.severity} data-rule-id={f.ruleId}>
          <div className="n4q-finding-head">
            <SeverityBadge severity={f.severity} locale={locale} />
            <ConfidenceBadge confidence={f.confidence} locale={locale} />
            <code>{f.ruleId}</code>
          </div>
          <p>{f.message}</p>
          <p className="n4q-sub"><strong>{loc(T.action, locale)}:</strong> {f.action}</p>
          {f.evidence.length > 0 ? <p className="n4q-sub"><strong>{loc(T.evidence, locale)}:</strong> {f.evidence.map((e) => (evidenceHref
            ? <a key={e} href={evidenceHref(e)} className="n4q-evidence-link" title={e}>{metricLabel(e, locale)}</a>
            : <code key={e} title={metricLabel(e, locale)}>{e}</code>))}</p> : null}
        </li>
      ))}
    </ul>
  );
}
