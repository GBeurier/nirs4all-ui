import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SpectraPlot } from "./SpectraPlot.js";

describe("viz/SpectraPlot", () => {
  const wavelengths = [1000, 1100, 1200, 1300, 1400];

  it.each([{ mean: [] }, { mean: [0.1] }, { mean: [NaN, Infinity] }, { mean: [0.1, 0.2, 0.3] }])("does not invent a mean from unavailable or unaligned values %j", ({ mean }) => {
    const markup = renderToStaticMarkup(<SpectraPlot wavelengths={[1000, 1100]} mean={mean} />);
    expect(markup).toContain("No spectral curves available.");
    expect(markup).not.toContain("n4viz-line-mean");
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("counts and renders only complete finite aligned sample curves", () => {
    const markup = renderToStaticMarkup(<SpectraPlot wavelengths={[1000, 1100]} series={[
      { id: "unknown", values: [NaN, Infinity] },
      { id: "short", values: [0.1] },
      { id: "valid", values: [0.1, 0.2] },
    ]} band={{ lower: [0.2, 0.3], upper: [0.1, 0.4] }} />);
    expect(markup).toContain("1 sample spectrum across 2 axis positions");
    expect(markup.match(/class="n4viz-line"/g)).toHaveLength(1);
    expect(markup).not.toContain("range band shown");
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("renders overlaid series, a mean line, and a min/max band", () => {
    const markup = renderToStaticMarkup(
      <SpectraPlot
        wavelengths={wavelengths}
        series={[
          { id: "a", values: [0.1, 0.3, 0.25, 0.4, 0.35], partition: "train" },
          { id: "b", values: [0.12, 0.28, 0.27, 0.38, 0.33], partition: "test" },
        ]}
        mean={[0.11, 0.29, 0.26, 0.39, 0.34]}
        band={{ lower: [0.05, 0.2, 0.2, 0.3, 0.28], upper: [0.15, 0.35, 0.32, 0.45, 0.4] }}
      />,
    );
    expect(markup).toContain("<svg");
    expect(markup).toContain("n4viz-spectra");
    expect(markup).toContain("n4viz-band");
    expect(markup).toContain("n4viz-line-mean");
    expect(markup).toContain("Wavelength (nm)");
    expect(markup).toContain("2 sample spectra across 5 axis positions");
    expect(markup).toContain("axis range 1000 to 1400 nm");
    expect(markup).toContain("Absorbance range 0.05 to 0.45");
    expect(markup).toContain("mean curve shown");
  });

  it("renders without series or band", () => {
    const markup = renderToStaticMarkup(<SpectraPlot wavelengths={wavelengths} />);
    expect(markup).toContain("<svg");
    expect(markup).toContain("No spectral curves available.");
  });
});
