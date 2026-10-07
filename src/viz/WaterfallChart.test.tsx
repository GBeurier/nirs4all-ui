import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WaterfallChart } from "./WaterfallChart.js";

describe("viz/WaterfallChart", () => {
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
