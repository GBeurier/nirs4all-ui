// Internal chart helpers shared by the qualification charts (not exported from the barrel).
import type { ReactNode } from 'react';

/** Compact display of an engine number: 4 significant digits, exponent only outside [1e-4, 1e5). */
export function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e5 || abs < 1e-4) return value.toExponential(2);
  return String(Number(value.toPrecision(4)));
}

export function pct(fraction: number): string {
  if (!Number.isFinite(fraction)) return '—';
  const p = fraction * 100;
  return `${p >= 10 || p === 0 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p.toPrecision(2)} %`;
}

/** HTML tooltip anchored at a point of the SVG viewBox (percent placement, flips near edges). */
export function ChartTooltip({ x, y, width, height, children }: { x: number; y: number; width: number; height: number; children: ReactNode }) {
  const left = (x / width) * 100;
  const top = (y / height) * 100;
  const tx = left > 70 ? '-100%' : left < 30 ? '0%' : '-50%';
  const ty = top < 30 ? '12px' : 'calc(-100% - 12px)';
  return (
    <div className="n4q-tip" role="presentation" style={{ left: `${left}%`, top: `${top}%`, transform: `translate(${tx}, ${ty})` }}>
      {children}
    </div>
  );
}

export function TipRow({ color, label, value, line = false }: { color?: string; label: string; value: string; line?: boolean }) {
  return (
    <div className="n4q-tip-row">
      {color ? <span className={line ? 'n4q-key-line' : 'n4q-key-dot'} style={{ background: color }} aria-hidden="true" /> : null}
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
