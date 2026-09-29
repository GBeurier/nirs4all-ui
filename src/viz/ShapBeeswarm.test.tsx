import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ShapBeeswarm } from "./ShapBeeswarm.js";

describe("ShapBeeswarm", () => {
  it("renders a jittered dot row per feature with a zero reference line", () => {
    const markup = renderToStaticMarkup(
      <ShapBeeswarm
        features={[
          {
            label: "1450 nm",
            points: [
              { shap: -0.3, featureValue: 0.1 },
              { shap: 0.5, featureValue: 0.9 },
            ],
          },
          {
            label: "1940 nm",
            points: [
              { shap: 0.1, featureValue: 0.4 },
              { shap: -0.2, featureValue: 0.6 },
            ],
          },
        ]}
        className="shap-panel"
      />,
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain("n4viz-beeswarm");
    expect(markup).toContain("shap-panel");
    expect(markup).toContain("SHAP beeswarm");
    expect(markup).toContain("n4viz-zero");
    expect(markup).toContain("n4viz-dot");
    expect(markup).toContain("1940 nm");
    expect(markup).toContain("2 features; 1450 nm: 2 contributions, mean 0.1, range -0.3 to 0.5");
    expect(markup).toContain("Color encodes feature value.");
  });

  it("describes absent finite contributions", () => {
    const markup = renderToStaticMarkup(<ShapBeeswarm features={[]} />);
    expect(markup).toContain("No finite SHAP contributions.");
  });
});
