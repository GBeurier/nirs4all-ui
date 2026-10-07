import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FeatureImportanceBar } from "./FeatureImportanceBar.js";

describe("FeatureImportanceBar", () => {
  it("filters unavailable importance before selecting the strongest feature", () => {
    const markup = renderToStaticMarkup(<FeatureImportanceBar items={[
      { label: "unknown", value: NaN }, { label: "infinite", value: Infinity }, { label: "strongest", value: 0.9 },
    ]} topN={1} />);
    expect(markup).toContain("1 shown feature of 3 supplied; strongest: 0.9");
    expect(markup.match(/class="n4viz-bar"/g)).toHaveLength(1);
    expect(markup).not.toMatch(/unknown|infinite|NaN|Infinity/);
  });

  it("renders ranked horizontal bars for the top features", () => {
    const markup = renderToStaticMarkup(
      <FeatureImportanceBar
        items={[
          { label: "1450 nm", value: 0.12 },
          { label: "1940 nm", value: 0.41 },
          { label: "2100 nm", value: 0.27 },
        ]}
        topN={2}
        className="vi-panel"
      />,
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain("n4viz-importance");
    expect(markup).toContain("vi-panel");
    expect(markup).toContain("Feature importance");
    expect(markup).toContain("n4viz-bar");
    // Highest-value feature is kept and labeled.
    expect(markup).toContain("1940 nm");
    expect(markup).toContain("0.41");
    // topN=2 drops the smallest importance.
    expect(markup).not.toContain("1450 nm");
    expect(markup).toContain("2 shown features of 3 supplied; 1940 nm: 0.41; 2100 nm: 0.27.");
  });

  it("describes an empty ranking", () => {
    const markup = renderToStaticMarkup(<FeatureImportanceBar items={[]} />);
    expect(markup).toContain("No finite feature importance values.");
  });
});
