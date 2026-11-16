/** Small, locale-neutral summaries for the data behind accessible SVG charts. */
export function summaryNumber(value: number): string {
  if (!Number.isFinite(value)) return "unavailable";
  return Number(value.toPrecision(4)).toString();
}

/**
 * Compact display format for small scientific magnitudes (SHAP values are often
 * far below 1e-3, where fixed decimals would print zero).
 */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1000) return value.toFixed(0);
  if (magnitude >= 1) return value.toFixed(2);
  if (magnitude >= 1e-3) return Number(value.toPrecision(3)).toString();
  return value.toExponential(2);
}

/** `compactNumber` with an explicit leading `+` for positive values. */
export function signedNumber(value: number, format: (v: number) => string = compactNumber): string {
  if (!Number.isFinite(value)) return "—";
  return value > 0 ? `+${format(value)}` : format(value);
}

/**
 * Tick labels must stay distinct: when `format` collapses neighbouring ticks
 * (a narrow span far from zero), fall back to fixed decimals derived from the
 * tick step.
 */
export function distinctTickLabels(values: readonly number[], format: (v: number) => string): string[] {
  const labels = values.map(format);
  if (new Set(labels).size === labels.length || values.length < 2) return labels;
  let step = Infinity;
  for (let index = 1; index < values.length; index += 1) {
    const delta = Math.abs(values[index]! - values[index - 1]!);
    if (delta > 0) step = Math.min(step, delta);
  }
  if (!Number.isFinite(step)) return labels;
  const decimals = Math.min(12, Math.max(0, Math.ceil(-Math.log10(step)) + 1));
  return values.map((value) => (Number.isFinite(value) ? value.toFixed(decimals) : "—"));
}

export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function finiteRange(values: readonly number[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return min === Infinity ? null : { min, max };
}

export function rangeText(values: readonly number[]): string | null {
  const range = finiteRange(values);
  return range ? `${summaryNumber(range.min)} to ${summaryNumber(range.max)}` : null;
}
