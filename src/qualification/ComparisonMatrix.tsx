import type { ReactNode } from 'react';
import { loc, type Locale } from '../lab/locale.js';
import { fmt, pct } from './_chart.js';
import { cx } from './_cx.js';
import { QUALIFICATION_TEXT as Q } from './locale.js';

export interface ComparisonColumn {
  id: string;
  label: string;
  /** short help shown under the header (unit, definition) */
  hint?: string;
  /** fraction: % in [0, 1]; number: bar from 0; signed: bar centred on 0; ratio: bar centred on `neutral` (default 1) */
  format?: 'fraction' | 'number' | 'signed' | 'ratio';
  /** neutral level of a ratio column (no change), default 1 */
  neutral?: number;
}

export interface ComparisonRow {
  id: string;
  label: string;
  sublabel?: string;
  /** one cell per column id; null = not computed */
  cells: Readonly<Record<string, number | null>>;
  /** optional trailing text (e.g. a test decision) */
  note?: ReactNode;
}

export interface ComparisonMatrixProps {
  columns: readonly ComparisonColumn[];
  rows: readonly ComparisonRow[];
  caption: string;
  rowHeader: string;
  noteHeader?: string;
  locale?: Locale;
  className?: string;
}

/**
 * Accessible table of engine measures per compared item (domains, clusters…), each
 * cell with an inline bar scaled to its own column (never across columns). Ratio
 * columns draw the deviation from their neutral level in both directions.
 */
export function ComparisonMatrix({ columns, rows, caption, rowHeader, noteHeader, locale = 'fr', className }: ComparisonMatrixProps) {
  const centred = (c: ComparisonColumn) => c.format === 'ratio' || c.format === 'signed';
  const neutralOf = (c: ComparisonColumn) => (c.format === 'ratio' ? (c.neutral ?? 1) : 0);
  const scale = new Map(columns.map((c) => {
    const values = rows.map((r) => r.cells[c.id]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const max = c.format === 'fraction' ? 1 : Math.max(1e-12, ...values.map((v) => Math.abs(v - neutralOf(c))));
    return [c.id, max];
  }));
  const hasNote = rows.some((r) => r.note !== undefined);
  return (
    <div className={cx('n4q-table-wrap', 'n4q-matrix', className)} role="region" tabIndex={0} aria-label={caption}>
      <table className="n4q-table n4q-table-compact">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{rowHeader}</th>
            {columns.map((c) => <th key={c.id} scope="col" className="n4q-num">{c.label}{c.hint ? <span className="n4q-sub">{c.hint}</span> : null}</th>)}
            {hasNote ? <th scope="col">{noteHeader ?? ''}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.label}{r.sublabel ? <span className="n4q-sub">{r.sublabel}</span> : null}</th>
              {columns.map((c) => {
                const v = r.cells[c.id];
                if (typeof v !== 'number' || !Number.isFinite(v)) return <td key={c.id} className="n4q-num"><span className="n4q-null">{loc(Q.notAvailable, locale)}</span></td>;
                const max = scale.get(c.id) ?? 1;
                const share = Math.min(1, Math.abs(v - neutralOf(c)) / max);
                const below = v < neutralOf(c);
                return (
                  <td key={c.id} className="n4q-num n4q-matrix-cell">
                    <span className="n4q-matrix-value">{c.format === 'fraction' ? pct(v) : fmt(v)}</span>
                    <span className="n4q-matrix-track" data-centred={centred(c) ? 'true' : undefined} aria-hidden="true">
                      <span className="n4q-matrix-bar" data-below={below ? 'true' : undefined} style={centred(c) ? { width: `${share * 50}%`, left: `${below ? 50 - share * 50 : 50}%` } : { width: `${share * 100}%` }} />
                    </span>
                  </td>
                );
              })}
              {hasNote ? <td>{r.note ?? null}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
