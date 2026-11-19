import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { N4aExportSelection } from './N4aExportSelection.js';

describe('N4aExportSelection', () => {
  it('labels available sections and exposes checked and unavailable states', () => {
    const html = renderToStaticMarkup(<N4aExportSelection options={[
      { id: 'recipe', label: 'Pipeline recipe', description: 'The current configuration' },
      { id: 'model', label: 'Fitted model', disabled: true },
    ]} value={['recipe']} onChange={() => {}} />);
    expect(html).toContain('<fieldset');
    expect(html).toContain('<legend>Include in the .n4a export</legend>');
    expect(html).toContain('checked=""');
    expect(html).toContain('disabled=""');
    expect(html).toContain('The current configuration');
  });
});
