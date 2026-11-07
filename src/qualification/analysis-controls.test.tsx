import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AvailabilityBadge, EvidenceTable, ScoreMap, reasonLabel, type QualificationMetricView } from './index.js';

describe('qualification inspection controls', () => {
  it('labels both reference limits and exposes the plotted values as a table', () => {
    const html = renderToStaticMarkup(<ScoreMap title="Inspection" locale="en" points={[{ id: 'sample', x: 2, y: 3 }]} xLabel="T²" yLabel="Q" xReference={{ value: 1, label: 'T² limit' }} yReference={{ value: 2, label: 'Q limit' }} />);
    expect(html).toContain('data-reference="x"');
    expect(html).toContain('data-reference="y"');
    expect(html).toContain('stroke-dasharray="6 4"');
    expect(html).toContain('T² limit: 1');
    expect(html).toContain('<caption>Inspection</caption>');
    expect(html).toContain('sample');
  });

  it('keeps machine reasons in tooltips and uses explanations for visible content', () => {
    const html = renderToStaticMarkup(<AvailabilityBadge status="insufficient_data" reason="FEWER_THAN_20_RESAMPLING_UNITS" locale="en" />);
    expect(html).toContain('title="FEWER_THAN_20_RESAMPLING_UNITS"');
    expect(html).toContain('Fewer than 20 independent units');
    expect(reasonLabel('PERMUTATION_PLAN_NOT_QUALIFIED')).toContain('scientific qualification');
    expect(reasonLabel('NEW_ENGINE_REASON')).toBe('New engine reason');
  });

  it('renders host-owned indicator selection without raw scope enums', () => {
    const metric: QualificationMetricView = { id: 'structure.pca', status: 'computed', reasonCode: null, scope: 'source_target', sourceId: 'nir', targetId: 'protein', viewId: 'canonical', populationId: 'calibration', value: 1, unit: null, denominators: {}, parameters: {}, protocolVersion: 'v1' };
    const html = renderToStaticMarkup(<EvidenceTable locale="en" metrics={[metric]} metricKey={() => 'key'} selected={new Set(['key'])} onToggle={() => {}} />);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked=""');
    expect(html).toContain('Source nir');
    expect(html).not.toContain('source_target');
  });
});
