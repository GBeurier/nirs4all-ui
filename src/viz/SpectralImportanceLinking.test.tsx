import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SpectralImportanceChart } from "./SpectralImportanceChart.js";
import { errorBounds, normalizeSpectralRange, sameSpectralRange, spectralRangeAt } from "./spectralImportance.js";

const axis = [1000, 1100, 1200, 1300, 1400, 1500];
const importance = [0.001, 0.004, 0.02, 0.006, 0.002, 0.0005];

describe("spectral range helpers", () => {
  it("resolves the narrowest covering region, else the coordinate itself", () => {
    const regions = [
      { start: 1000, end: 1500 },
      { start: 1300, end: 1200 },
    ];
    expect(spectralRangeAt(regions, 1250)).toEqual({ start: 1200, end: 1300 });
    expect(spectralRangeAt(regions, 1450)).toEqual({ start: 1000, end: 1500 });
    expect(spectralRangeAt([], 1450)).toEqual({ start: 1450, end: 1450 });
    expect(spectralRangeAt(regions, NaN)).toBeNull();
  });

  it("normalizes and compares ranges", () => {
    expect(normalizeSpectralRange({ start: 9, end: 3 })).toEqual({ start: 3, end: 9 });
    expect(normalizeSpectralRange({ start: NaN, end: 3 })).toBeNull();
    expect(normalizeSpectralRange(null)).toBeNull();
    expect(sameSpectralRange({ start: 1, end: 2 }, { start: 1, end: 2 })).toBe(true);
    expect(sameSpectralRange({ start: 1, end: 2 }, null)).toBe(false);
    expect(sameSpectralRange(null, null)).toBe(true);
  });

  it("builds ± bounds with gaps where the value or the error is unusable", () => {
    const { lower, upper } = errorBounds([1, 2, NaN, 4], [0.5, NaN, 1, -1]);
    expect(lower).toEqual([0.5, NaN, NaN, NaN]);
    expect(upper).toEqual([1.5, NaN, NaN, NaN]);
  });
});

describe("SpectralImportanceChart linking props", () => {
  it("is unchanged when no uncertainty or highlight is supplied", () => {
    const markup = renderToStaticMarkup(<SpectralImportanceChart axis={axis} importance={importance} />);
    expect(markup).not.toContain("n4viz-error-band");
    expect(markup).not.toContain("n4viz-highlight-range");
    expect(markup).not.toContain("uncertainty");
  });

  it("draws the ± band, its legend entry and summary sentence", () => {
    const markup = renderToStaticMarkup(
      <SpectralImportanceChart
        axis={axis}
        importance={importance}
        importanceError={[0.0005, 0.001, NaN, 0.001, 0.0002, 0.0001]}
        importanceErrorLabel="± 1 SD over folds"
      />,
    );
    // the NaN error splits the band into two runs; the curve stays one run
    expect(markup.match(/n4viz-error-band/g)).toHaveLength(2);
    expect(markup.match(/n4viz-importance-line/g)).toHaveLength(1);
    expect(markup).toContain("± 1 SD over folds");
    expect(markup).toContain("A ± 1 SD over folds band is drawn around Mean |SHAP|.");
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("shades a host highlight range across both panels, on either axis direction", () => {
    const markup = renderToStaticMarkup(
      <SpectralImportanceChart
        axis={axis}
        importance={importance}
        regions={[{ start: 1000, end: 1200, value: 0.01 }]}
        highlightRange={{ start: 1300, end: 1200 }}
      />,
    );
    expect(markup.match(/n4viz-highlight-range/g)).toHaveLength(1);
    const match = /class="n4viz-highlight-range" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/.exec(markup);
    expect(match).not.toBeNull();
    expect(Number(match![2])).toBeGreaterThan(2);
  });

  it("ignores an unusable highlight range", () => {
    const markup = renderToStaticMarkup(
      <SpectralImportanceChart axis={axis} importance={importance} highlightRange={{ start: NaN, end: 1 }} />,
    );
    expect(markup).not.toContain("n4viz-highlight-range");
  });
});
