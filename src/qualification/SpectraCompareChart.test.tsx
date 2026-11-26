import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SpectraCompareChart, type CompareLayer } from './SpectraCompareChart.js';

const before: CompareLayer = {
  id: 'before',
  label: 'Original: reflectance',
  yLabel: 'Reflectance',
  axis: [1000, 1100, 1200, 1300],
  series: [
    { id: 'r1', values: [0.5, 0.4, null, 0.2], color: '#94a3b8' },
    { id: 'r2', values: [0.6, 0.5, 0.4, Number.NaN], color: '#94a3b8' },
  ],
  dashed: true,
};
const after: CompareLayer = {
  id: 'after',
  label: 'Converted: absorbance',
  yLabel: 'Absorbance',
  axis: [1000, 1050, 1100, 1150, 1200],
  series: [{ id: 'a1', values: [0.3, 0.35, 0.4, 0.5, 0.7], color: '#0d9488' }],
};

const render = (extra: Partial<Parameters<typeof SpectraCompareChart>[0]> = {}) =>
  renderToStaticMarkup(<SpectraCompareChart title="Before and after" before={before} after={after} axisUnit="nm" locale="en" {...extra} />);

describe('SpectraCompareChart', () => {
  it('draws both layers on one chart with a right axis when the y labels differ', () => {
    const html = render();
    expect(html.match(/<figure\b/g)).toHaveLength(1);
    expect(html.match(/<svg\b/g)).toHaveLength(1);
    expect(html).toContain('data-layer="before"');
    expect(html).toContain('data-layer="after"');
    // One path per series; the original is dashed.
    expect(html.match(/class="n4q-explorer-line"/g)).toHaveLength(3);
    expect(html.match(/stroke-dasharray="5 4"/g)).toHaveLength(2);
    expect(html).toContain('data-axis="right"');
    expect(html).toMatch(/data-axis="left"[^>]*>Reflectance</);
    expect(html).toMatch(/data-axis="right"[^>]*>Absorbance</);
    expect(html).toContain('left axis');
    expect(html).toContain('right axis');
  });

  it('shares one y-axis when the labels match or the host asks for it', () => {
    const same = render({ after: { ...after, yLabel: 'Reflectance' } });
    expect(same).not.toContain('data-axis="right"');
    expect(same).not.toContain('right axis');
    const forced = render({ sharedY: true });
    expect(forced).not.toContain('data-axis="right"');
    expect(forced).toContain('Reflectance / Absorbance');
  });

  it('leaves gaps for missing cells and counts them in the text alternative', () => {
    const html = render();
    const first = /<path d="([^"]*)" stroke="#94a3b8" stroke-dasharray="5 4"/.exec(html)![1]!;
    // Series r1: 0.5, 0.4, gap, 0.2 → two sub-paths.
    expect(first.match(/M/g)).toHaveLength(2);
    expect(html.match(/<table\b/g)).toHaveLength(1);
    expect(html).toContain('Original: reflectance');
    // Layer table: points, ranges and missing counts are read from the inputs.
    expect(html).toContain('data-value="2"'); // r1 null + r2 NaN in the original layer
    expect(html).toContain('1000–1300 nm');
    expect(html).toContain('1000–1200 nm');
    expect(html).toContain('0.2–0.6');
    expect(html).toContain('0.3–0.7');
    expect(html).not.toContain('NaN');
  });

  it('maps each layer on its own x values over the shared extent', () => {
    const html = render({ width: 900 });
    // x extent 1000..1300 over [58, 842]: 1200 of the converted layer sits at 58 + 784 * 2/3.
    const converted = /<path d="([^"]*)" stroke="#0d9488"/.exec(html)![1]!;
    const xs = [...converted.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
    expect(xs).toHaveLength(5);
    expect(xs[0]).toBeCloseTo(58, 0);
    expect(xs[4]).toBeCloseTo(58 + (784 * 2) / 3, 0);
  });

  it('draws high-to-low when the axis is descending', () => {
    const html = render({ xDescending: true, width: 900 });
    const converted = /<path d="([^"]*)" stroke="#0d9488"/.exec(html)![1]!;
    const xs = [...converted.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
    expect(xs[0]).toBeCloseTo(842, 0);
    expect(xs[0]!).toBeGreaterThan(xs[4]!);
  });
});
