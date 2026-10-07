import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BiasVarianceBars } from "./BiasVarianceBars.js";

describe("viz/BiasVarianceBars", () => {
  it("keeps unavailable estimates distinct from known zero and suppresses incomplete stacks", () => {
    const markup = renderToStaticMarkup(<BiasVarianceBars entries={[
      { label: "unknown", biasSquared: NaN, variance: Infinity },
      { label: "partial", biasSquared: 0, variance: NaN },
      { label: "zero", biasSquared: 0, variance: 0 },
    ]} />);
    expect(markup).toContain("unknown: bias squared unavailable, variance unavailable, total unavailable");
    expect(markup).toContain("partial: bias squared 0, variance unavailable, total unavailable");
    expect(markup).toContain("zero: bias squared 0, variance 0, total 0");
    expect(markup.match(/class="n4viz-bar"/g)).toHaveLength(2);
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("renders stacked bias²/variance bars per group with a legend", () => {
    const markup = renderToStaticMarkup(
      <BiasVarianceBars
        entries={[
          { label: "PLS", biasSquared: 0.04, variance: 0.02 },
          { label: "Ridge", biasSquared: 0.03, variance: 0.05 },
          { label: "RF", biasSquared: 0.01, variance: 0.08 },
        ]}
      />,
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain("n4viz-biasvariance");
    expect(markup).toContain("<title>Bias² / variance</title>");
    expect(markup).toContain("n4viz-bar");
    // Legend swatches label both components.
    expect(markup).toContain("Bias²");
    expect(markup).toContain("Variance");
    expect(markup).toContain("PLS");
    expect(markup).toContain("RF");
    expect(markup).toContain("PLS: bias squared 0.04, variance 0.02, total 0.06");
  });

  it("renders an empty svg gracefully with no entries", () => {
    const markup = renderToStaticMarkup(<BiasVarianceBars entries={[]} />);
    expect(markup).toContain("<svg");
    expect(markup).toContain("n4viz-biasvariance");
    expect(markup).toContain("No bias and variance estimates.");
  });
});
