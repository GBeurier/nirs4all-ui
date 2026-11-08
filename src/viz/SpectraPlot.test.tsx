import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SpectraPlot, type SpectraPlotProps } from "./SpectraPlot.js";

const render = (props: SpectraPlotProps): string => renderToStaticMarkup(<SpectraPlot {...props} />);

/** `d` attributes of every `<path>` with exactly this class attribute. */
function pathData(markup: string, className: string): string[] {
  return [...markup.matchAll(new RegExp(`<path class="${className}" d="([^"]*)"`, "g"))].map((match) => match[1]!);
}

const count = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

describe("viz/SpectraPlot", () => {
  const wavelengths = [1000, 1100, 1200, 1300, 1400];

  it.each([{ mean: [] }, { mean: [0.1] }, { mean: [NaN, Infinity] }, { mean: [0.1, 0.2, 0.3] }])("does not invent a mean from unavailable or unaligned values %j", ({ mean }) => {
    const markup = render({ wavelengths: [1000, 1100], mean });
    expect(markup).toContain("No spectral curves available.");
    expect(markup).not.toContain("n4viz-line-mean");
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("counts a partially missing series, draws its finite runs and rejects all-missing or misaligned curves", () => {
    const axis = [1000, 1100, 1200, 1300, 1400, 1500];
    const markup = render({
      wavelengths: axis,
      series: [
        { id: "unknown", values: [NaN, NaN, NaN, NaN, NaN, NaN] },
        { id: "short", values: [0.1] },
        { id: "partial", values: [0.1, 0.2, NaN, 0.4, 0.5, 0.6] },
      ],
    });
    expect(markup).toContain("1 sample spectrum across 6 axis positions");
    const lines = pathData(markup, "n4viz-line");
    expect(lines).toHaveLength(1);
    expect(count(lines[0]!, /M/g)).toBe(2);
    expect(count(lines[0]!, /L/g)).toBe(3);
    expect(markup).toContain("missing or non-finite");
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("treats a non-finite axis entry as a gap and keeps it out of the domain", () => {
    const markup = render({
      wavelengths: [1000, NaN, 1200, 1300, 5000],
      series: [{ id: "a", values: [0.1, 0.2, 0.3, 0.4, NaN] }],
    });
    const lines = pathData(markup, "n4viz-line");
    expect(lines).toHaveLength(1);
    expect(count(lines[0]!, /M/g)).toBe(1);
    expect(markup).toContain("1 isolated finite value not drawn as lines");
    expect(markup).toContain("axis range 1200 to 1300 nm");
    expect(markup).toContain("Absorbance range 0.3 to 0.4");
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("draws only runs of at least two finite points and reports isolated values honestly", () => {
    const markup = render({
      wavelengths,
      series: [{ id: "isolated", values: [0.1, NaN, 0.3, NaN, 0.5] }],
    });
    expect(markup).toContain("No spectral curves available");
    expect(markup).toContain("3 isolated finite values not drawn as lines");
    expect(markup).not.toContain('class="n4viz-line"');
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("closes each finite band run independently and draws the median across missing bounds", () => {
    const markup = render({
      wavelengths,
      bands: [{
        label: "Project",
        lower: [0.1, 0.2, NaN, 0.2, 0.3],
        upper: [0.3, 0.4, 0.5, 0.5, 0.6],
        median: [0.2, NaN, 0.35, 0.35, 0.4],
      }],
    });
    const fills = pathData(markup, "n4viz-band");
    expect(fills).toHaveLength(1);
    expect(count(fills[0]!, /M/g)).toBe(2);
    expect(count(fills[0]!, /Z/g)).toBe(2);
    const medians = pathData(markup, "n4viz-line n4viz-band-median");
    expect(medians).toHaveLength(1);
    // Median run covers indices 2-4 (three points), independent of the missing bound at index 2.
    expect(count(medians[0]!, /M/g)).toBe(1);
    expect(count(medians[0]!, /L/g)).toBe(2);
    expect(markup).toContain("1 band shown: Project (bounds and median)");
    expect(markup).toContain("2 positions missing or non-finite");
    expect(markup).toContain("1 isolated finite value not drawn as lines");
    expect(markup).not.toContain("n4viz-line-mean");
    expect(markup).not.toContain("mean curve shown");
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("draws a median-only band when every bound is missing", () => {
    const markup = render({
      wavelengths,
      bands: [{ lower: [NaN, NaN, NaN, NaN, NaN], upper: [NaN, NaN, NaN, NaN, NaN], median: [0.2, 0.3, 0.25, 0.4, 0.35] }],
    });
    expect(markup).not.toContain('class="n4viz-band"');
    expect(markup).toContain("n4viz-band-median");
    expect(markup).toContain("1 band shown: band 1 (median only)");
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("rejects the whole band descriptor on any finite inverted pair, but not equal bounds or gap pairs", () => {
    const inverted = render({
      wavelengths: [1000, 1100, 1200],
      series: [{ id: "a", values: [0.1, 0.2, 0.3] }],
      bands: [{ lower: [0.1, 0.5, 0.2], upper: [0.3, 0.4, 0.5], median: [0.2, 0.2, 0.3] }],
    });
    expect(inverted).not.toContain("n4viz-band");
    expect(inverted).toContain("1 band rejected");
    expect(inverted).toContain("1 sample spectrum across 3 axis positions");

    const equal = render({
      wavelengths: [1000, 1100, 1200],
      bands: [{ lower: [0.2, 0.3, 0.4], upper: [0.2, 0.3, 0.4] }],
    });
    expect(equal).toContain('class="n4viz-band"');
    expect(equal).not.toContain("rejected");

    const gap = render({
      wavelengths: [1000, 1100, 1200, 1300],
      bands: [{ lower: [0.1, 0.2, NaN, 0.2], upper: [0.3, 0.4, 0.05, 0.5] }],
    });
    expect(pathData(gap, "n4viz-band")).toHaveLength(1);
    expect(gap).not.toContain("rejected");

    const misaligned = render({
      wavelengths: [1000, 1100, 1200],
      bands: [{ lower: [0.1, 0.2], upper: [0.3, 0.4] }],
    });
    expect(misaligned).not.toContain("n4viz-band");
    expect(misaligned).toContain("1 band rejected");
  });

  it("derives domains only from drawn coordinates", () => {
    const markup = render({
      wavelengths: [1000, 1100, 1200, 5000],
      series: [
        { id: "a", values: [0.2, 0.3, 0.4, NaN] },
        { id: "spike", values: [9, NaN, 0.5, NaN] },
      ],
      bands: [{ lower: [100, 100, 100, 100], upper: [1, 1, 1, 1] }],
    });
    expect(markup).toContain("axis range 1000 to 1200 nm");
    expect(markup).toContain("Absorbance range 0.2 to 0.4");
    expect(pathData(markup, "n4viz-line")).toHaveLength(1);
    expect(markup).not.toContain("n4viz-band\"");
  });

  it("renders several labelled bands with their own median dash and keeps the true mean separate", () => {
    const common = { lower: [0.05, 0.2, 0.2, 0.3, 0.28], upper: [0.15, 0.35, 0.32, 0.45, 0.4] };
    const markup = render({
      wavelengths,
      mean: [0.11, 0.29, 0.26, 0.39, 0.34],
      bands: [
        { ...common, label: "Project", median: [0.1, 0.27, 0.25, 0.38, 0.33], medianDash: "2 2", color: "#0891b2" },
        { ...common, label: "Session", median: [0.12, 0.28, 0.26, 0.39, 0.34], color: "#4f46e5" },
      ],
    });
    expect(pathData(markup, "n4viz-band")).toHaveLength(2);
    expect(pathData(markup, "n4viz-line n4viz-band-median")).toHaveLength(2);
    expect(markup).toContain('stroke-dasharray="2 2"');
    expect(markup).toContain('stroke-dasharray="4 3"');
    expect(count(markup, /n4viz-line-mean/g)).toBe(1);
    expect(markup).toContain("mean curve shown");
    expect(markup).toContain("2 bands shown: Project (bounds and median), Session (bounds and median)");
  });

  it("renders overlaid series, a mean line, and a min/max band from finite data without touching inputs", () => {
    const a = Object.freeze([0.1, 0.3, 0.25, 0.4, 0.35]);
    const b = Object.freeze([0.12, 0.28, 0.27, 0.38, 0.33]);
    const mean = Object.freeze([0.11, 0.29, 0.26, 0.39, 0.34]);
    const lower = Object.freeze([0.05, 0.2, 0.2, 0.3, 0.28]);
    const upper = Object.freeze([0.15, 0.35, 0.32, 0.45, 0.4]);
    const before = JSON.stringify([wavelengths, a, b, mean, lower, upper]);
    const markup = render({
      wavelengths,
      series: [
        { id: "a", values: a, partition: "train" },
        { id: "b", values: b, partition: "test" },
      ],
      mean,
      bands: [{ lower, upper }],
    });
    expect(JSON.stringify([wavelengths, a, b, mean, lower, upper])).toBe(before);
    expect(markup).toContain("<svg");
    expect(markup).toContain("n4viz-spectra");
    expect(markup).toContain("n4viz-band");
    expect(markup).toContain("n4viz-line-mean");
    expect(markup).toContain("Wavelength (nm)");
    expect(markup).toContain("2 sample spectra across 5 axis positions");
    expect(markup).toContain("axis range 1000 to 1400 nm");
    expect(markup).toContain("Absorbance range 0.05 to 0.45");
    expect(markup).toContain("mean curve shown");
    expect(markup).toContain("1 band shown: band 1 (bounds)");
    expect(markup).not.toContain("missing or non-finite");
  });

  it("keeps the opening sentence, appends truthful notes and uses the unpadded [0,1] domain when nothing is drawn", () => {
    const markup = render({
      wavelengths: [1000, 1100, 1200],
      series: [{ id: "none", values: [NaN, NaN, NaN] }],
      bands: [{ lower: [0.1, 0.2], upper: [0.3, 0.4] }],
    });
    expect(markup).toContain(
      "No spectral curves available. 3 positions missing or non-finite in the supplied curves; 1 band rejected (misaligned or inverted bounds).",
    );
    // Default frame: top 16, bottom 232; tick 0 and tick 1 sit exactly on the edges (no 8% padding).
    expect(markup).toContain('y1="232"');
    expect(markup).toContain('y1="16"');
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("renders without series or bands", () => {
    const markup = render({ wavelengths });
    expect(markup).toContain("<svg");
    expect(markup).toContain("No spectral curves available.");
  });
});
