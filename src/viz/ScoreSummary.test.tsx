import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScoreSummary } from "./ScoreSummary.js";

describe("ScoreSummary", () => {
  it("renders a grid of toned stat tiles", () => {
    const markup = renderToStaticMarkup(
      <ScoreSummary
        stats={[
          { label: "R²", value: "0.94", delta: "+0.02", tone: "positive" },
          { label: "RMSE", value: "0.31", delta: "-0.01", tone: "negative" },
          { label: "Bias", value: "0.00", tone: "neutral" },
        ]}
        columns={2}
        className="scores"
      />,
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain("n4viz-scores");
    expect(markup).toContain("n4viz-stat-value");
    expect(markup).toContain("data-tone=\"positive\"");
    expect(markup).toContain("+0.02");
    expect(markup).toContain("3 scores; R²: 0.94, change +0.02; RMSE: 0.31, change -0.01; Bias: 0.00.");
  });

  it("describes the empty score grid", () => {
    const markup = renderToStaticMarkup(<ScoreSummary stats={[]} />);
    expect(markup).toContain("No scores available.");
  });
});
