import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ConformalIntervalStrip,
  conformalBandShade,
  conformalStripSamplesFromRows,
  type ConformalStripSample,
} from "./ConformalIntervalStrip.js";

const SAMPLES: ConformalStripSample[] = [
  {
    prediction: 10,
    actual: 10.4,
    label: "s0",
    bands: [
      { coverage: 0.5, lower: 9.5, upper: 10.5 },
      { coverage: 0.9, lower: 8.8, upper: 11.2 },
    ],
  },
  {
    prediction: 12,
    actual: 15.0, // outside the 90% band → missed
    label: "s1",
    bands: [
      { coverage: 0.5, lower: 11.4, upper: 12.6 },
      { coverage: 0.9, lower: 10.6, upper: 13.4 },
    ],
  },
];

describe("ConformalIntervalStrip", () => {
  it.each([
    { coverage: 0.9, lower: NaN, upper: NaN },
    { coverage: 0.9, lower: 2, upper: 0 },
    { coverage: Infinity, lower: 0, upper: 2 },
    { coverage: 1.1, lower: 0, upper: 2 },
  ])("excludes unusable bands from selection, marks and coverage: %j", (invalid) => {
    const markup = renderToStaticMarkup(<ConformalIntervalStrip samples={[{
      prediction: 1, actual: 1,
      bands: [invalid, { coverage: 0.5, lower: 0, upper: 2 }],
    }]} />);
    expect(markup).toContain("target interval 50%");
    expect(markup).toContain("observed coverage 100% (1 of 1 known actual values)");
    expect(markup.match(/class="n4viz-conf-band /g)).toHaveLength(1);
    expect(markup).not.toMatch(/NaN|Infinity|90%/);
  });

  it("excludes unavailable target intervals from the denominator without inventing missing actuals", () => {
    const markup = renderToStaticMarkup(<ConformalIntervalStrip samples={[
      { prediction: 1, bands: [{ coverage: 0.9, lower: 0, upper: 2 }] },
      { prediction: 1, actual: 1, bands: [{ coverage: 0.5, lower: 0, upper: 2 }] },
    ]} />);
    expect(markup).toContain("observed coverage unavailable without evaluable target intervals");
    expect(markup).not.toContain("without known actual values");
    expect(markup).not.toContain("obs 0%");
  });

  it("counts only known actuals paired with valid selected intervals", () => {
    const markup = renderToStaticMarkup(<ConformalIntervalStrip samples={[
      { prediction: 1, actual: 1, bands: [{ coverage: 0.9, lower: 0, upper: 2 }] },
      { prediction: 1, actual: 3, bands: [{ coverage: 0.9, lower: NaN, upper: NaN }, { coverage: 0.5, lower: 0, upper: 2 }] },
    ]} />);
    expect(markup).toContain("observed coverage 100% (1 of 1 known actual values)");
  });

  it("renders nested bands, a prediction tick, and covered/missed markers", () => {
    const markup = renderToStaticMarkup(
      <ConformalIntervalStrip samples={SAMPLES} unit="g/kg" title="Calibrated intervals" />,
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain("n4viz-conformal-strip");
    expect(markup).toContain("<title>Calibrated intervals</title>");
    expect(markup).toContain("n4viz-conf-band");
    expect(markup).toContain("n4viz-conf-band--target");
    expect(markup).toContain("n4viz-conf-point");
    expect(markup).toContain("n4viz-conf-actual");
    // legend + coverage vocabulary
    expect(markup).toContain("90%");
    expect(markup).toContain("covered");
    expect(markup).toContain("missed");
    expect(markup).toContain("2 valid predictions; 2 shown; target interval 90%");
    expect(markup).toContain("observed coverage 50% (1 of 2 known actual values)");
  });

  it("reports observed coverage against the target level", () => {
    // 1 of 2 covered at 90% → observed 50%
    const markup = renderToStaticMarkup(
      <ConformalIntervalStrip samples={SAMPLES} targetCoverage={0.9} />,
    );
    expect(markup).toContain("target 90%");
    expect(markup).toContain("obs 50%");
    expect(markup).toContain("(1/2)");
  });

  it("renders an empty state without ground truth or samples", () => {
    const markup = renderToStaticMarkup(<ConformalIntervalStrip samples={[]} />);
    expect(markup).toContain("<svg");
    expect(markup).toContain("No calibrated intervals");
    expect(markup).toContain("No valid prediction intervals.");
    expect(markup).not.toContain("covered");
  });

  it("reports when a large strip omits samples from the rendering", () => {
    const markup = renderToStaticMarkup(<ConformalIntervalStrip samples={SAMPLES} maxSamples={1} />);
    expect(markup).toContain("2 valid predictions; 1 shown, 1 omitted");
  });

  it("adapts conformal prediction rows and attaches aligned actuals", () => {
    const rows = [
      {
        index: 0,
        sampleId: "a",
        yPred: 5,
        yPredLabel: "5",
        intervals: [
          { coverage: 0.9, coverageLabel: "90%", lower: 4, lowerLabel: "4", upper: 6, upperLabel: "6", width: 2, widthLabel: "2" },
        ],
      },
    ];
    const samples = conformalStripSamplesFromRows(rows, [5.5]);
    expect(samples).toHaveLength(1);
    expect(samples[0]?.actual).toBe(5.5);
    expect(samples[0]?.bands[0]).toMatchObject({ coverage: 0.9, lower: 4, upper: 6 });
  });

  it("ramps widest → narrowest from pale to dark", () => {
    expect(conformalBandShade(0)).not.toBe(conformalBandShade(1));
  });
});
