import { useId } from 'react';
import { loc, type Locale } from '../lab/locale.js';
import { cx } from './_cx.js';
import { QUALIFICATION_TEXT as T, AVAILABILITY_LABEL } from './locale.js';
import { AVAILABILITY_STATUSES, type AvailabilityStatus } from './types.js';

export interface AvailabilitySummaryProps {
  counts: Readonly<Record<AvailabilityStatus, number>>;
  locale?: Locale;
  /** list only statuses with at least one metric in the table */
  hideEmpty?: boolean;
  className?: string;
}

/** Stacked bar of metric counts per availability status + the equivalent data table. */
export function AvailabilitySummary({ counts, locale = 'fr', hideEmpty = false, className }: AvailabilitySummaryProps) {
  const id = useId();
  const total = AVAILABILITY_STATUSES.reduce((n, s) => n + counts[s], 0);
  const present = AVAILABILITY_STATUSES.filter((s) => counts[s] > 0);
  const text = present.map((s) => `${loc(AVAILABILITY_LABEL[s], locale)} ${counts[s]}`).join(', ');
  return (
    <figure className={cx('n4q-summary', className)}>
      <svg role="img" aria-labelledby={`${id}-t ${id}-d`} viewBox="0 0 100 6" preserveAspectRatio="none" className="n4q-bar">
        <title id={`${id}-t`}>{loc(T.status, locale)}</title>
        <desc id={`${id}-d`}>{total === 0 ? loc(T.notAvailable, locale) : `${total}: ${text}`}</desc>
        {(() => {
          let x = 0;
          return present.map((s) => {
            const w = (counts[s] / total) * 100;
            const rect = <rect key={s} x={x} y={0} width={w} height={6} className={`n4q-fill-${s}`} />;
            x += w;
            return rect;
          });
        })()}
      </svg>
      <figcaption>
        <table className="n4q-table n4q-table-compact">
          <caption>{loc(T.dataTable, locale)}</caption>
          <thead>
            <tr><th scope="col">{loc(T.status, locale)}</th><th scope="col">{loc(T.count, locale)}</th></tr>
          </thead>
          <tbody>
            {(hideEmpty ? present : AVAILABILITY_STATUSES).map((s) => (
              <tr key={s}><th scope="row"><span className={`n4q-swatch n4q-fill-${s}`} aria-hidden="true" />{loc(AVAILABILITY_LABEL[s], locale)}</th><td className="n4q-num">{counts[s]}</td></tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
