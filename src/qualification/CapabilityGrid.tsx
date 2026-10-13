import { loc, type Locale } from '../lab/locale.js';
import { cx } from './_cx.js';
import { capabilityLabel, CHART_TEXT as C } from './locale.js';
import type { QualificationCapabilityView } from './types.js';

export interface CapabilityGridProps {
  capabilities: readonly QualificationCapabilityView[];
  locale?: Locale;
  className?: string;
}

type Group = 'qualified' | 'available' | 'unavailable';
const GROUPS: readonly Group[] = ['qualified', 'available', 'unavailable'];
const groupOf = (c: QualificationCapabilityView): Group => (c.qualified ? 'qualified' : c.available ? 'available' : 'unavailable');

/** Capabilities as three labelled groups of cards (qualified / available unqualified / unavailable + reason). */
export function CapabilityGrid({ capabilities, locale = 'fr', className }: CapabilityGridProps) {
  return (
    <div className={cx('n4q-capgrid', className)}>
      {GROUPS.map((g) => {
        const items = capabilities.filter((c) => groupOf(c) === g);
        if (items.length === 0) return null;
        return (
          <section key={g} className="n4q-capgroup" data-group={g} aria-label={loc(C[g], locale)}>
            <h4><span className="n4q-capdot" aria-hidden="true" />{loc(C[g], locale)} <span className="n4q-capcount">{items.length}</span></h4>
            <ul>
              {items.map((c) => (
                <li key={c.id} data-capability-id={c.id}>
                  <strong>{capabilityLabel(c.id, locale)}</strong>
                  <code>{c.id}</code>
                  {c.reason ? <span className="n4q-sub">{c.reason}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
