/** Small, locale-neutral summaries for the data behind accessible SVG charts. */
export function summaryNumber(value: number): string {
  if (!Number.isFinite(value)) return "unavailable";
  return Number(value.toPrecision(4)).toString();
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
