import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WaterfallChart } from "./WaterfallChart.js";

describe("viz/WaterfallChart", () => {
  it.each([NaN, Infinity, -Infinity])("reports known contributions omitted when base %s cannot position bars", (baseValue) => {
    for (const predicted of [undefined, 7]) {
      const predictionProps = predicted === undefined ? {} : { predicted };
      const markup = renderToStaticMarkup(<WaterfallChart baseValue={baseValue} {...predictionProps} contributions={[{ label: "known", value: 2 }]} />);
      expect(markup).toContain("base value unavailable");
      expect(markup).toContain(`predicted value ${predicted === undefined ? "unavailable" : "7"}`);
      expect(markup).toContain("0 of 1 contribution shown; omitted contribution sum 2.");
      expect(markup).not.toContain("n4viz-bar");
      expect(markup).not.toMatch(/NaN|Infinity/);
    }
  });

  it("does not derive a prediction or zero contribution from unavailable values", () => {
    const markup = renderToStaticMarkup(<WaterfallChart baseValue={1} contributions={[{ label: "missing", value: NaN }]} />);
    expect(markup).toContain("base value 1; predicted value unavailable; 0 of 1 contribution shown");
    expect(markup).toContain("omitted contribution sum unavailable");
    expect(markup).not.toContain("n4viz-prediction");
    expect(markup).not.toContain("n4viz-bar");
    expect(markup).not.toMatch(/NaN|Infinity|missing: \+0/);
  });

  it("retains an explicitly supplied prediction while reporting an incomplete decomposition", () => {
    const markup = renderToStaticMarkup(<WaterfallChart baseValue={1} predicted={3} topN={1} contributions={[
      { label: "missing", value: NaN }, { label: "known", value: 2 },
    ]} />);
    expect(markup).toContain("predicted value 3; 1 of 2 contributions shown; known: +2");
    expect(markup).toContain("omitted contribution sum unavailable");
    expect(markup).toContain("n4viz-prediction");
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("renders floating contribution bars with base and prediction references", () => {
    const markup = renderToStaticMarkup(
      <WaterfallChart
        baseValue={4.2}
        contributions={[
          { label: "1450 nm", value: 0.8 },
          { label: "1940 nm", value: -0.45 },
          { label: "2100 nm", value: 0.2 },
        ]}
      />,
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain("n4viz-waterfall");
    expect(markup).toContain("<title>SHAP waterfall</title>");
    expect(markup).toContain("n4viz-bar");
    expect(markup).toContain("n4viz-base");
    expect(markup).toContain("n4viz-prediction");
    expect(markup).toContain("1450 nm");
    // Positive contributions are signed with a leading plus.
    expect(markup).toContain("+0.8");
    expect(markup).toContain("base value 4.2; predicted value 4.75; 3 of 3 contributions shown");
  });

  it("keeps only the largest |value| contributions for topN", () => {
    const markup = renderToStaticMarkup(
      <WaterfallChart
        baseValue={0}
        topN={1}
        contributions={[
          { label: "small", value: 0.01 },
          { label: "large", value: -0.9 },
        ]}
      />,
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain("large");
    expect(markup).not.toContain("small");
    expect(markup).toContain("1 of 2 contributions shown; large: -0.9; omitted contribution sum 0.01.");
  });
});

describe("viz/WaterfallChart references", () => {
  it("labels base and prediction values and colors contributions by sign", () => {
    const markup = renderToStaticMarkup(
      <WaterfallChart baseValue={2} contributions={[{ label: "up", value: 0.5 }, { label: "down", value: -0.2 }]} xLabel="Model output" />,
    );
    expect(markup).toContain("E[f(x)] 2.00");
    expect(markup).toContain("f(x) 2.30");
    expect(markup).toContain('data-sign="positive"');
    expect(markup).toContain('data-sign="negative"');
    expect(markup).toContain("up: +0.500 (2.00 → 2.50)");
    expect(markup).toContain("Model output");
  });
});

describe("viz/WaterfallChart ticks", () => {
  it("keeps axis tick labels distinct on a narrow span far from zero", () => {
    const markup = renderToStaticMarkup(
      <WaterfallChart baseValue={12.4} contributions={[{ label: "a", value: 0.004 }, { label: "b", value: 0.003 }]} />,
    );
    const ticks = [...markup.matchAll(/class="n4viz-tick" x="[^"]+" y="[^"]+" text-anchor="middle">([^<]+)</g)].map((m) => m[1]);
    expect(ticks.length).toBeGreaterThan(2);
    expect(new Set(ticks).size).toBe(ticks.length);
  });
});
