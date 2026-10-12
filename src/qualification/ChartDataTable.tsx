import { loc, type Locale } from '../lab/locale.js';
import { cx } from './_cx.js';
import { QUALIFICATION_TEXT as T } from './locale.js';

export interface ChartDataTableProps {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly (string | number | null)[])[];
  locale?: Locale;
  /** open by default (otherwise collapsed in a native <details>) */
  open?: boolean;
  className?: string;
}

/** Text/table equivalent for any chart; null cells show an explicit "not available". */
export function ChartDataTable({ caption, columns, rows, locale = 'fr', open = false, className }: ChartDataTableProps) {
  return (
    <details className={cx('n4q-datatable', className)} open={open}>
      <summary>{loc(T.dataTable, locale)} — {caption}</summary>
      <div className="n4q-table-wrap" role="region" tabIndex={0} aria-label={caption}>
        <table className="n4q-table n4q-table-compact">
          <caption>{caption}</caption>
          <thead><tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>{row.map((cell, j) => <td key={j} className={typeof cell === 'number' ? 'n4q-num' : undefined}>{cell === null ? loc(T.notAvailable, locale) : cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
