import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ShapBeeswarm } from "./ShapBeeswarm.js";

describe("ShapBeeswarm", () => {
  it("renders the same finite SHAP contributions that the description counts", () => {
    const markup = renderToStaticMarkup(<ShapBeeswarm features={[{ label: "feature", points: [
      { shap: NaN, featureValue: 0 }, { shap: Infinity, featureValue: 1 }, { shap: 0.5, featureValue: 2 },
    ] }]} />);
    expect(markup).toContain("feature: 1 contribution, mean 0.5, range 0.5 to 0.5");
    expect(markup.match(/class="n4viz-dot"/g)).toHaveLength(1);
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("preserves known SHAP values without inventing a missing feature-value color", () => {
    const markup = renderToStaticMarkup(<ShapBeeswarm features={[{ label: "feature", points: [
      { shap: 0, featureValue: NaN }, { shap: 0.5, featureValue: 2 },
    ] }]} />);
    expect(markup).toContain("feature: 2 contributions, mean 0.25");
    expect(markup).toContain("Unavailable feature values use a neutral color.");
    expect(markup.match(/class="n4viz-dot"/g)).toHaveLength(2);
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

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

describe("ShapBeeswarm selection", () => {
  it("emphasizes selected samples, titles points and shows the feature-value legend", () => {
    const markup = renderToStaticMarkup(<ShapBeeswarm
      features={[{ label: "1400–1450", points: [
        { shap: 0.2, featureValue: 0.9, sampleId: 3 },
        { shap: -0.1, featureValue: 0.1, sampleId: 7 },
      ] }]}
      selectedSampleIds={[7]}
      sampleLabel={(id) => `Sample #${id}`}
    />);
    expect(markup.match(/n4viz-dot-selected/g)).toHaveLength(1);
    expect(markup).toContain("Sample #7 · 1400–1450: SHAP -0.100, feature value 0.100 (selected)");
    expect(markup).toContain("Sample #3 · 1400–1450: SHAP +0.200");
    expect(markup).toContain("Feature value: low");
    expect(markup).toContain("1 selected sample emphasized.");
    // the selected point is drawn last (on top of the others)
    expect(markup.indexOf("Sample #3")).toBeLessThan(markup.indexOf("Sample #7"));
  });
});
