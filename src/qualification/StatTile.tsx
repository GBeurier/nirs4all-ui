import type { ReactNode } from 'react';
import { cx } from './_cx.js';

export type StatTone = 'neutral' | 'good' | 'warning' | 'critical';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  /** small text after the value (unit, denominator) */
  suffix?: ReactNode;
  hint?: ReactNode;
  /** state tone; always paired with a text hint, never colour alone */
  tone?: StatTone;
  href?: string;
  className?: string;
}

/** Headline number tile (label · value · hint); links to its evidence when `href` is given. */
export function StatTile({ label, value, suffix, hint, tone = 'neutral', href, className }: StatTileProps) {
  const body = (
    <>
      <span className="n4q-stat-label">{label}</span>
      <span className="n4q-stat-value">{value}{suffix ? <span className="n4q-stat-suffix">{suffix}</span> : null}</span>
      {hint ? <span className="n4q-stat-hint">{hint}</span> : null}
    </>
  );
  return href
    ? <a className={cx('n4q-stat', className)} data-tone={tone} href={href}>{body}</a>
    : <div className={cx('n4q-stat', className)} data-tone={tone}>{body}</div>;
}
