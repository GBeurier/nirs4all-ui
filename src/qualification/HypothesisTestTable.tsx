import type { ReactNode } from 'react';
import { loc, type Locale } from '../lab/locale.js';
import { fmt } from './_chart.js';
import { cx } from './_cx.js';
import { AvailabilityBadge } from './Badges.js';
import { CHART_TEXT as C, QUALIFICATION_TEXT as Q } from './locale.js';
import type { AvailabilityStatus } from './types.js';

/** One engine hypothesis test (permutation PERMANOVA, PERMDISP, energy, association…). */
export interface HypothesisTestRow {
  id: string;
  /** tested effect (factor, metadata column, domain pair) */
  effect: string;
  /** test family / variant name (marginal, conditional, Freedman–Lane…) */
  test: string;
  status: AvailabilityStatus;
  reasonCode?: string | null | undefined;
  /** test statistic (pseudo-F, energy…) with its name */
  statistic?: { label: string; value: number | null } | null | undefined;
  /** effect size (R², eta², Cramér V…) with its name */
  effectSize?: { label: string; value: number | null } | null | undefined;
  pValue?: number | null | undefined;
  /** multiplicity-adjusted p-value (Holm), null when multiplicity is unavailable */
  pAdjusted?: number | null | undefined;
  /** engine decision at the family level; null = no decision published */
  rejects?: boolean | null | undefined;
  /** extra context (permutations executed, resolution…) */
  note?: ReactNode | undefined;
}

export interface HypothesisTestTableProps {
  rows: readonly HypothesisTestRow[];
  caption: string;
  /** family alpha, shown in the decision column header when given */
  alpha?: number | null | undefined;
  adjustedLabel?: string | undefined;
  locale?: Locale | undefined;
  className?: string | undefined;
}

/** p-values keep their resolution: never rounded to 0, small ones in exponent form. */
export function formatPValue(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  if (p < 1e-3) return p.toExponential(1);
  return String(Number(p.toPrecision(2)));
}

/**
 * Table of engine hypothesis tests: statistic, effect size, raw and adjusted p-values
 * and the published decision, in text (never colour alone). Non-computed tests keep
 * their availability status and reason.
 */
export function HypothesisTestTable({ rows, caption, alpha = null, adjustedLabel, locale = 'fr', className }: HypothesisTestTableProps) {
  const t = (k: keyof typeof C) => loc(C[k], locale);
  return (
    <div className={cx('n4q-table-wrap', 'n4q-tests', className)} role="region" tabIndex={0} aria-label={caption}>
      <table className="n4q-table n4q-table-compact">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t('effect')}</th>
            <th scope="col">{t('test')}</th>
            <th scope="col">{t('statistic')}</th>
            <th scope="col">{t('effectSize')}</th>
            <th scope="col" className="n4q-num">p</th>
            <th scope="col" className="n4q-num">{adjustedLabel ?? t('pHolm')}</th>
            <th scope="col">{t('decision')}{alpha !== null ? <span className="n4q-nocase"> (α = {alpha})</span> : null}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-availability={r.status} data-rejects={r.rejects === true ? 'true' : r.rejects === false ? 'false' : undefined}>
              <th scope="row">{r.effect}</th>
              <td>{r.test}{r.note ? <span className="n4q-sub">{r.note}</span> : null}</td>
              {r.status === 'computed' ? (
                <>
                  <td className="n4q-num">{r.statistic ? <>{fmt(r.statistic.value)}<span className="n4q-sub">{r.statistic.label}</span></> : '—'}</td>
                  <td className="n4q-num">{r.effectSize ? <>{fmt(r.effectSize.value)}<span className="n4q-sub">{r.effectSize.label}</span></> : '—'}</td>
                  <td className="n4q-num">{formatPValue(r.pValue)}</td>
                  <td className="n4q-num">{formatPValue(r.pAdjusted)}</td>
                  <td>
                    {r.rejects === null || r.rejects === undefined
                      ? <span className="n4q-null">{t('noDecision')}</span>
                      : <span className="n4q-decision" data-rejects={String(r.rejects)}><span aria-hidden="true">{r.rejects ? '● ' : '○ '}</span>{t(r.rejects ? 'rejected' : 'notRejected')}</span>}
                  </td>
                </>
              ) : (
                <td colSpan={5}><AvailabilityBadge status={r.status} reason={r.reasonCode ?? null} locale={locale} /></td>
              )}
            </tr>
          ))}
          {rows.length === 0 ? <tr><td colSpan={7} className="n4q-null">{loc(Q.notAvailable, locale)}</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}
