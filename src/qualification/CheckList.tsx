import type { ReactNode } from 'react';
import { loc, type Locale } from '../lab/locale.js';
import { cx } from './_cx.js';
import { CHART_TEXT as C } from './locale.js';

export type CheckStatus = 'ok' | 'attention' | 'critical' | 'unavailable';

export interface CheckItem {
  id: string;
  status: CheckStatus;
  title: string;
  detail?: ReactNode;
  /** link to the supporting chart or evidence */
  href?: string;
}

export interface CheckListProps {
  items: readonly CheckItem[];
  locale?: Locale;
  className?: string;
}

const STATUS_TEXT = { ok: 'checkOk', attention: 'checkAttention', critical: 'checkCritical', unavailable: 'checkUnavailable' } as const;

function Icon({ status }: { status: CheckStatus }) {
  const d = status === 'ok' ? 'M7 12.5l3.2 3.2L17 9' : status === 'unavailable' ? 'M8 12h8' : status === 'critical' ? 'M9 9l6 6M15 9l-6 6' : 'M12 7.5v5.5M12 16.5v.01';
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="n4q-check-icon">
      <circle cx="12" cy="12" r="11" />
      <path d={d} />
    </svg>
  );
}

/** Control points with an icon and a text status (never colour alone), each linking to its evidence. */
export function CheckList({ items, locale = 'fr', className }: CheckListProps) {
  return (
    <ul className={cx('n4q-checks', className)}>
      {items.map((item) => (
        <li key={item.id} className="n4q-check" data-status={item.status}>
          <Icon status={item.status} />
          <div className="n4q-check-body">
            <div className="n4q-check-head">
              <strong>{item.title}</strong>
              <span className="n4q-check-status">{loc(C[STATUS_TEXT[item.status]], locale)}</span>
            </div>
            {item.detail ? <p>{item.detail}</p> : null}
          </div>
          {item.href ? <a className="n4q-check-link" href={item.href}>{loc(C.see, locale)} <span aria-hidden="true">→</span></a> : null}
        </li>
      ))}
    </ul>
  );
}
