import type { CategoricalLegend, ContinuousLegend } from "./colorBy.js";
import { cx } from "./_cx.js";
import { formatValue } from "./format.js";

/**
 * Legend for the active color-by. Categorical entries are buttons: clicking one
 * selects its rows (Shift adds, Alt subtracts), so the legend doubles as a
 * quick filter-by-group.
 */
export function ColorLegend({
  legend,
  title,
  onPickCategory,
  missingLabel = "missing",
  className,
  max = 14,
}: {
  legend: CategoricalLegend | ContinuousLegend | null;
  title?: string | undefined;
  onPickCategory?: ((value: string, event: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void) | undefined;
  missingLabel?: string | undefined;
  className?: string | undefined;
  max?: number | undefined;
}) {
  if (!legend) return null;
  if (legend.kind === "continuous") {
    const gradient = `linear-gradient(90deg, ${legend.stops.join(", ")})`;
    return (
      <div className={cx("n4wb-legend-bar", className)} aria-label={title ? `${title} color scale` : "Color scale"}>
        {title ? <span className="n4wb-legend-title">{title}</span> : null}
        <span className="n4wb-legend-value">{formatValue(legend.min)}</span>
        <span className="n4wb-legend-ramp" style={{ background: gradient }} aria-hidden="true" />
        <span className="n4wb-legend-value">
          {formatValue(legend.max)}
          {legend.unit ? ` ${legend.unit}` : ""}
        </span>
        {legend.missing > 0 ? <span className="n4wb-legend-missing">+{legend.missing} {missingLabel}</span> : null}
      </div>
    );
  }
  const entries = legend.entries.slice(0, max);
  const hidden = legend.entries.length - entries.length;
  return (
    <ul className={cx("n4wb-legend", className)} aria-label={title ? `${title} legend` : "Legend"}>
      {title ? <li className="n4wb-legend-title">{title}</li> : null}
      {entries.map((entry) => (
        <li key={entry.value}>
          {onPickCategory ? (
            <button
              type="button"
              className="n4wb-legend-item"
              title={`Select ${entry.value} (Shift add · Alt remove)`}
              onClick={(event) => onPickCategory(entry.value, event)}
            >
              <span className="n4wb-legend-swatch" style={{ background: entry.color }} aria-hidden="true" />
              <span>{entry.value}</span>
              <span className="n4wb-legend-count">{entry.count}</span>
            </button>
          ) : (
            <span className="n4wb-legend-item">
              <span className="n4wb-legend-swatch" style={{ background: entry.color }} aria-hidden="true" />
              <span>{entry.value}</span>
              <span className="n4wb-legend-count">{entry.count}</span>
            </span>
          )}
        </li>
      ))}
      {hidden > 0 ? <li className="n4wb-legend-more">+{hidden}</li> : null}
      {legend.missing > 0 ? <li className="n4wb-legend-missing">{legend.missing} {missingLabel}</li> : null}
    </ul>
  );
}
