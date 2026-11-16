import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SpectralImportanceChart } from "./SpectralImportanceChart.js";
import {
  decimatedRuns,
  nearestAxisIndex,
  nextSpectralCursor,
  resolveRegionValueKind,
  resolveSpectralRegions,
} from "./spectralImportance.js";

const axis = [1000, 1100, 1200, 1300, 1400, 1500];
const importance = [0.001, 0.004, 0.02, 0.006, 0.002, 0.0005];
const spectrum = [0.4, 0.42, 0.5, 0.61, 0.58, 0.55];

describe("spectralImportance model", () => {
  it("orders regions along the axis and ranks them by magnitude, keeping the sign", () => {
    const regions = resolveSpectralRegions([
      { start: 1300, end: 1500, value: -0.03 },
      { start: 1000, end: 1200, value: 0.01 },
    ]);
    expect(regions.map((region) => region.label)).toEqual(["1000–1200", "1300–1500"]);
    expect(regions.map((region) => region.value)).toEqual([0.01, -0.03]);
    expect(regions.map((region) => region.rank)).toEqual([2, 1]);
    expect(regions[1]!.strength).toBe(1);
    expect(regions[0]!.strength).toBeCloseTo(1 / 3);
  });

  it("treats unavailable region values as unranked rather than zero", () => {
    const regions = resolveSpectralRegions([{ start: 1, end: 2, value: NaN }, { start: 3, end: 4, value: 0.2 }]);
    expect(regions[0]).toMatchObject({ rank: 0, strength: 0 });
    expect(regions[1]).toMatchObject({ rank: 1, strength: 1 });
  });

  it("infers signed semantics from negative values unless the host declares the kind", () => {
    expect(resolveRegionValueKind([{ start: 0, end: 1, value: -1 }])).toBe("signed");
    expect(resolveRegionValueKind([{ start: 0, end: 1, value: 1 }])).toBe("magnitude");
    expect(resolveRegionValueKind([{ start: 0, end: 1, value: 1 }], "signed")).toBe("signed");
  });

  it("keeps narrow peaks and gaps when decimating for display", () => {
    const xs = Array.from({ length: 1000 }, (_, index) => index);
    const ys = xs.map((x) => (x === 517 ? 9 : x === 600 ? NaN : 0));
    const runs = decimatedRuns(xs, ys, 100);
    expect(runs).toHaveLength(2);
    expect(runs.flat().length).toBeLessThanOrEqual(120);
    expect(runs.flat().some(([x, y]) => x === 517 && y === 9)).toBe(true);
    expect(runs.flat().some(([x]) => x === 600)).toBe(false);
  });

  it("steps the keyboard cursor through regions, then clears it", () => {
    expect(nextSpectralCursor(null, "ArrowRight", 3, 10)).toEqual({ kind: "region", index: 0 });
    expect(nextSpectralCursor({ kind: "region", index: 2 }, "ArrowRight", 3, 10)).toEqual({ kind: "region", index: 2 });
    expect(nextSpectralCursor({ kind: "region", index: 1 }, "Home", 3, 10)).toEqual({ kind: "region", index: 0 });
    expect(nextSpectralCursor({ kind: "region", index: 1 }, "End", 3, 10)).toEqual({ kind: "region", index: 2 });
    expect(nextSpectralCursor({ kind: "region", index: 1 }, "Escape", 3, 10)).toBeNull();
    expect(nextSpectralCursor(null, "a", 3, 10)).toBeUndefined();
    expect(nextSpectralCursor({ kind: "point", index: 0 }, "ArrowRight", 0, 400)).toEqual({ kind: "point", index: 4 });
  });

  it("finds the nearest finite axis coordinate", () => {
    expect(nearestAxisIndex([NaN, 10, 20, 30], 24)).toBe(2);
    expect(nearestAxisIndex([NaN], 1)).toBe(-1);
  });
});

describe("SpectralImportanceChart", () => {
  it("renders the curve, dashed spectrum, region shading/bars and a faithful summary", () => {
    const markup = renderToStaticMarkup(
      <SpectralImportanceChart
        axis={axis}
        importance={importance}
        spectrum={spectrum}
        regions={[
          { start: 1000, end: 1200, value: 0.012 },
          { start: 1200, end: 1400, value: 0.009 },
          { start: 1400, end: 1500, value: 0.001 },
        ]}
        axisLabel="Wavelength (nm)"
        axisUnit="nm"
        regionLabel="Binned mean |SHAP|"
        className="host-class"
      />,
    );
    expect(markup).toContain("n4viz-spectral-importance");
    expect(markup).toContain("host-class");
    expect(markup).toContain("n4viz-importance-line");
    expect(markup).toContain("n4viz-spectrum-line");
    expect(markup).toContain('stroke-dasharray="6 3"');
    expect(markup.match(/n4viz-region-bar/g)).toHaveLength(3);
    // the weakest region (strength < 0.2) is not shaded but still has a bar
    expect(markup.match(/n4viz-region-shade/g)).toHaveLength(2);
    expect(markup).toContain("Mean |SHAP| over 6 points from 1000 to 1500 nm; peak 0.02 at 1200 nm.");
    expect(markup).toContain("Binned mean |SHAP|: 3 regions, strongest 1000–1200 nm (0.012)");
    expect(markup).toContain("Mean spectrum is drawn on the right axis.");
    expect(markup).toContain("<figcaption");
    expect(markup).toContain("<table>");
    expect(markup).toContain("(magnitudes)");
    expect(markup).toContain('tabindex="0"');
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("keeps signed region values signed in bars, text and table", () => {
    const markup = renderToStaticMarkup(
      <SpectralImportanceChart
        axis={axis}
        importance={importance}
        regions={[
          { start: 1000, end: 1200, value: 0.004 },
          { start: 1300, end: 1500, value: -0.01 },
        ]}
        positiveLabel="Raises prediction"
        negativeLabel="Lowers prediction"
      />,
    );
    expect(markup).toContain('data-sign="negative"');
    expect(markup).toContain('data-sign="positive"');
    expect(markup).toContain("n4viz-zero");
    expect(markup).toContain("strongest 1300–1500 (-0.01), 1000–1200 (+0.004). 1 positive, 1 negative.");
    expect(markup).toContain("Raises prediction");
    expect(markup).toContain("Lowers prediction");
    expect(markup).toContain("(signed: positive raises, negative lowers the output)");
    expect(markup).not.toContain("n4viz-spectrum-line");
  });

  it("draws gaps instead of interpolating unavailable importance values", () => {
    const markup = renderToStaticMarkup(
      <SpectralImportanceChart axis={[1, 2, 3, 4, 5]} importance={[1, 2, NaN, 3, 4]} />,
    );
    expect(markup.match(/n4viz-importance-line/g)).toHaveLength(2);
    expect(markup).toContain("1 unavailable points are shown as gaps.");
    expect(markup).not.toContain("<table>");
  });

  it("uses a host description when supplied", () => {
    const markup = renderToStaticMarkup(
      <SpectralImportanceChart axis={axis} importance={importance} description="Host summary." showDataTable={false} />,
    );
    expect(markup).toContain("Host summary.");
  });
});
