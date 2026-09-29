import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PcaScatter } from "./PcaScatter.js";

describe("PcaScatter", () => {
  it("renders a group-colored projection scatter with a legend", () => {
    const markup = renderToStaticMarkup(
      <PcaScatter
        points={[
          { x: -1.2, y: 0.4, group: "A" },
          { x: 0.8, y: -0.6, group: "B" },
          { x: 1.4, y: 1.1, group: "A" },
        ]}
        explained={[0.48, 0.21]}
        className="pca"
      />,
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain("n4viz-pca");
    expect(markup).toContain("n4viz-dot");
    expect(markup).toContain("PC1 (48%)");
    expect(markup).toContain("n4viz-legend-item");
    expect(markup).toContain("3 projected points");
    expect(markup).toContain("PC1 (48%) range -1.2 to 1.4");
    expect(markup).toContain("A: 2");
    expect(markup).toContain("B: 1");
  });

  it("colors continuously by value without a legend", () => {
    const markup = renderToStaticMarkup(
      <PcaScatter
        colorMode="value"
        points={[
          { x: 0, y: 0, value: 1 },
          { x: 1, y: 1, value: 9 },
        ]}
      />,
    );

    expect(markup).toContain("<svg");
    expect(markup).not.toContain("n4viz-legend-item");
    expect(markup).toContain("color value range 1 to 9");
  });

  it("describes an empty projection", () => {
    const markup = renderToStaticMarkup(<PcaScatter points={[]} />);
    expect(markup).toContain("No valid projected points.");
  });
});
