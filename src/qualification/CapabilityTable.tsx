import { loc, type Locale } from '../lab/locale.js';
import { cx } from './_cx.js';
import { QUALIFICATION_TEXT as T } from './locale.js';
import type { QualificationCapabilityView } from './types.js';

export interface CapabilityTableProps {
  capabilities: readonly QualificationCapabilityView[];
  locale?: Locale;
  className?: string;
}

export function CapabilityTable({ capabilities, locale = 'fr', className }: CapabilityTableProps) {
  const yn = (v: boolean) => loc(v ? T.yes : T.no, locale);
  return (
    <div className={cx('n4q-table-wrap', className)} role="region" tabIndex={0} aria-label={loc(T.capability, locale)}>
      <table className="n4q-table">
        <caption>{loc(T.capability, locale)}</caption>
        <thead>
          <tr>
            <th scope="col">{loc(T.capability, locale)}</th>
            <th scope="col">{loc(T.available, locale)}</th>
            <th scope="col">{loc(T.qualified, locale)}</th>
            <th scope="col">{loc(T.reason, locale)}</th>
          </tr>
        </thead>
        <tbody>
          {capabilities.map((c) => (
            <tr key={c.id} data-capability-id={c.id} data-available={c.available}>
              <th scope="row"><code>{c.id}</code></th>
              <td>{yn(c.available)}</td>
              <td>{yn(c.qualified)}</td>
              <td>{c.reason ? <code>{c.reason}</code> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
