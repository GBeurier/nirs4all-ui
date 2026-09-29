import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConfusionMatrix } from "./ConfusionMatrix.js";

describe("viz/ConfusionMatrix", () => {
  const labels = ["healthy", "mild", "severe"];
  const matrix = [
    [42, 3, 1],
    [4, 38, 2],
    [0, 5, 33],
  ];

  it("renders labeled, intensity-shaded cells", () => {
    const markup = renderToStaticMarkup(<ConfusionMatrix labels={labels} matrix={matrix} />);
    expect(markup).toContain("<svg");
    expect(markup).toContain("n4viz-confusion");
    expect(markup).toContain("n4viz-cell");
    expect(markup).toContain("Predicted");
    expect(markup).toContain("healthy");
    expect(markup).toContain("128 classified observations");
    expect(markup).toContain("113 correct (88.28%)");
    expect(markup).toContain("mild: 38 of 44 correct");
  });

  it("supports row normalization", () => {
    const markup = renderToStaticMarkup(<ConfusionMatrix labels={labels} matrix={matrix} normalize />);
    expect(markup).toContain("<svg");
  });

  it("describes an empty classification without inventing an accuracy", () => {
    const markup = renderToStaticMarkup(<ConfusionMatrix labels={labels} matrix={[]} />);
    expect(markup).toContain("3 classes; no classified observations.");
    expect(markup).not.toContain("NaN");
  });
});
