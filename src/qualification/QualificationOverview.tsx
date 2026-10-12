import { loc, type Locale } from '../lab/locale.js';
import { cx } from './_cx.js';
import { ProfileStatusBadge } from './Badges.js';
import { AvailabilitySummary } from './AvailabilitySummary.js';
import { QUALIFICATION_TEXT as T, PROFILE_STATUS_HINT } from './locale.js';
import type { QualificationReportView } from './types.js';

export interface QualificationOverviewProps {
  view: QualificationReportView;
  locale?: Locale;
  className?: string;
}

/** Report header: profile status, provenance, validation issues, limitations and availability tally. */
export function QualificationOverview({ view, locale = 'fr', className }: QualificationOverviewProps) {
  const p = view.provenance;
  return (
    <section className={cx('n4q-overview', className)} data-profile-status={view.profileStatus}>
      <div className="n4q-overview-head">
        <ProfileStatusBadge status={view.profileStatus} locale={locale} />
        <p>{loc(PROFILE_STATUS_HINT[view.profileStatus], locale)}</p>
      </div>
      <dl className="n4q-provenance">
        <dt>{loc(T.engine, locale)}</dt><dd>{p.engineVersion}</dd>
        <dt>{loc(T.protocol, locale)}</dt><dd>{p.protocolBundleVersion}</dd>
        <dt>{loc(T.schema, locale)}</dt><dd>v{p.schemaVersion}</dd>
        {view.completion ? <><dt>{loc(T.status, locale)}</dt><dd>{view.completion}</dd></> : null}
      </dl>
      {view.issues.length > 0 ? (
        <div className="n4q-issues">
          <h3>{loc(T.issues, locale)}</h3>
          <ul>
            {view.issues.map((i, k) => (
              <li key={`${i.code}:${k}`} data-blocking={i.blocking}>
                <code>{i.code}</code> <span className="n4q-sub">{i.path}</span> — {i.message} ({loc(i.blocking ? T.blocking : T.nonBlocking, locale)})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {view.limitations.length > 0 ? (
        <div className="n4q-limitations">
          <h3>{loc(T.limitations, locale)}</h3>
          <ul>{view.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      ) : null}
      <AvailabilitySummary counts={view.availabilityCounts} locale={locale} />
    </section>
  );
}
