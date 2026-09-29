import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PredictionScatter } from "./PredictionScatter.js";

describe("viz/PredictionScatter", () => {
  const points = [
    { actual: 1, predicted: 1.1, partition: "train" as const },
    { actual: 2, predicted: 1.8, partition: "test" as const },
    { actual: 3, predicted: 3.2, partition: "train" as const },
  ];

  it("renders points, the identity line, and a metric badge", () => {
    const markup = renderToStaticMarkup(
      <PredictionScatter points={points} regressionLine metrics={{ r2: 0.94, rmse: 0.21 }} />,
    );
    expect(markup).toContain("<svg");
    expect(markup).toContain("n4viz-scatter");
    expect(markup).toContain("n4viz-identity");
    expect(markup).toContain("R²");
    expect(markup).toContain("Observed");
    expect(markup).toContain("3 valid observed and predicted pairs");
    expect(markup).toContain("mean absolute error 0.1667");
    expect(markup).toContain("train: 2");
    expect(markup).toMatch(/aria-describedby="([^"]+)"/);
    expect(markup).toContain("<desc id=");
  });

  it("renders with no points", () => {
    const markup = renderToStaticMarkup(<PredictionScatter points={[]} />);
    expect(markup).toContain("<svg");
    expect(markup).toContain("No valid observed and predicted pairs.");
  });

  it("accepts a host summary for a localized or domain-specific chart", () => {
    const markup = renderToStaticMarkup(<PredictionScatter points={points} description="Three calibration samples." />);
    expect(markup).toContain("<desc id=");
    expect(markup).toContain("Three calibration samples.");
    expect(markup).not.toContain("mean absolute error");
    const blank = renderToStaticMarkup(<PredictionScatter points={points} description="   " />);
    expect(blank).toContain("mean absolute error");
  });

  it("ignores non-finite pairs for fit, marks, and the text alternative", () => {
    const markup = renderToStaticMarkup(
      <PredictionScatter points={[...points, { actual: Number.NaN, predicted: 9 }]} regressionLine />,
    );
    expect(markup.match(/class="n4viz-dot"/g)).toHaveLength(3);
    expect(markup).toContain("3 valid observed and predicted pairs");
    expect(markup).not.toContain("NaN");
  });
});
