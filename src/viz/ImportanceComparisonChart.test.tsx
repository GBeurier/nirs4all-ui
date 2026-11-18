import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ImportanceComparisonChart } from "./ImportanceComparisonChart.js";
import { peakAxisValue, scaleImportanceSeries, summarizeImportanceComparison } from "./importanceComparisonModel.js";
import { N4_COLORBLIND_SERIES } from "./theme.js";

const axis = [1000, 1100, 1200, 1300, 1400];
const series = [
  { id: "shap", label: "Mean |SHAP|", values: [0.01, 0.02, 0.04, 0.02, 0.01] },
  { id: "coef", label: "PLS coefficients", values: [-3, 1, 6, -2, 0], signed: true },
  { id: "grad", label: "Mean local gradient", values: [0.1, 0.2, NaN, 0.3, 0.1], dashed: true, error: [0.01, 0.01, 0.02, 0.01, 0.01] },
];

describe("importance comparison model", () => {
  it("divides each profile by its own max |value| for display, error included", () => {
    const scaled = scaleImportanceSeries(series[1]!, "max_abs");
    expect(scaled.divisor).toBe(6);
    expect(scaled.values).toEqual([-0.5, 1 / 6, 1, -1 / 3, 0]);
    const withError = scaleImportanceSeries(series[2]!, "max_abs");
    expect(withError.upper![3]).toBeCloseTo((0.3 + 0.01) / 0.3);
    expect(withError.lower![2]).toBeNaN();
    expect(scaleImportanceSeries(series[1]!, "none").values).toEqual(series[1]!.values);
    expect(scaleImportanceSeries({ values: [0, NaN] }, "max_abs").divisor).toBe(1);
  });

  it("finds the peak by magnitude and summarizes visible profiles", () => {
    expect(peakAxisValue(axis, series[1]!.values)).toEqual({ x: 1200, value: 6 });
    expect(peakAxisValue(axis, [NaN])).toBeNull();
    const text = summarizeImportanceComparison({ axis, series, hiddenIds: new Set(["grad"]), scaling: "max_abs", axisUnit: "nm" });
    expect(text).toContain("2 of 3 importance profiles shown");
    expect(text).toContain("PLS coefficients peaks at 1200 nm (6.00, signed)");
    expect(text).toContain("divided by its own largest |value|");
    expect(text).toContain("Hidden: Mean local gradient.");
  });
});

describe("ImportanceComparisonChart", () => {
  it("overlays visible profiles with palette colors, dashes, ± bands and a zero line", () => {
    const markup = renderToStaticMarkup(
      <ImportanceComparisonChart axis={axis} series={series} axisLabel="Wavelength (nm)" axisUnit="nm" className="host" />,
    );
    expect(markup).toContain("n4viz-importance-compare");
    expect(markup).toContain("host");
    // grad has a gap -> two runs
    expect(markup.match(/n4viz-compare-line/g)).toHaveLength(4);
    expect(markup).toContain(`stroke="${N4_COLORBLIND_SERIES[0]}"`);
    expect(markup).toContain(`stroke="${N4_COLORBLIND_SERIES[1]}"`);
    expect(markup).toContain('stroke-dasharray="6 4"');
    expect(markup).toContain("n4viz-error-band");
    expect(markup).toContain("n4viz-zero");
    expect(markup).toContain("÷ max |value| per profile");
    expect(markup).toContain("3 of 3 importance profiles shown");
    expect(markup).toContain('tabindex="0"');
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("hides series and renders legend toggles when the host controls them", () => {
    const markup = renderToStaticMarkup(
      <ImportanceComparisonChart axis={axis} series={series} hiddenIds={["coef"]} onToggleSeries={() => undefined} scaling="none" />,
    );
    expect(markup).not.toContain('data-series="coef"');
    expect(markup.match(/<button/g)).toHaveLength(3);
    expect(markup).toContain('aria-pressed="false"');
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(markup).toContain("Hidden: PLS coefficients.");
    expect(markup).not.toContain("÷ max");
  });

  it("draws spectrum, bands and a linked highlight range", () => {
    const markup = renderToStaticMarkup(
      <ImportanceComparisonChart
        axis={axis}
        series={series.slice(0, 1)}
        spectrum={[0.3, 0.4, 0.5, 0.45, 0.4]}
        bands={[{ start: 1150, end: 1250, label: "C–H 2nd overtone" }]}
        highlightRange={{ start: 1100, end: 1200 }}
      />,
    );
    expect(markup).toContain("n4viz-spectrum-line");
    expect(markup).toContain("n4viz-band");
    expect(markup).toContain("n4viz-highlight-range");
    expect(markup).toContain("Mean spectrum is drawn on the right axis.");
    expect(markup).not.toContain("n4viz-zero");
  });

  it("reports empty and all-hidden states", () => {
    expect(renderToStaticMarkup(<ImportanceComparisonChart axis={axis} series={[]} />)).toContain("No importance profiles");
    expect(
      renderToStaticMarkup(<ImportanceComparisonChart axis={axis} series={series} hiddenIds={["shap", "coef", "grad"]} />),
    ).toContain("All profiles hidden");
  });
});
