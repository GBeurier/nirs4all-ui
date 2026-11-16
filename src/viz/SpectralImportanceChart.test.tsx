import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SpectralImportanceChart } from "./SpectralImportanceChart.js";
import { referenceBandsForAxis, spectralBandReadout, spectralBandsAt } from "./spectralBands.js";
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

describe("SpectralImportanceChart reference bands", () => {
  const nmAxis = Array.from({ length: 61 }, (_, index) => 1000 + index * 25);
  const nmImportance = nmAxis.map((x) => Math.exp(-(((x - 1450) / 60) ** 2)) + 0.4 * Math.exp(-(((x - 1940) / 50) ** 2)));
  const bandRects = (markup: string) =>
    [...markup.matchAll(/<rect class="n4viz-band"[^>]*?x="([^"]+)"[^>]*?width="([^"]+)"/g)].map((match) => ({
      x: Number(match[1]),
      width: Number(match[2]),
    }));

  it("leaves the chart untouched when no bands are supplied", () => {
    const props = { axis, importance, spectrum, regions: [{ start: 1000, end: 1200, value: 0.012 }], axisUnit: "nm" };
    const without = renderToStaticMarkup(<SpectralImportanceChart {...props} />);
    expect(renderToStaticMarkup(<SpectralImportanceChart {...props} bands={[]} />)).toBe(without);
    expect(without).not.toContain("n4viz-band");
    expect(without).not.toContain("Reference absorption bands");
  });

  it("draws labelled spans, a legend entry, a summary count and a band table", () => {
    const bands = referenceBandsForAxis("nm", 1000, 2500);
    const markup = renderToStaticMarkup(
      <SpectralImportanceChart axis={nmAxis} importance={nmImportance} axisLabel="Wavelength (nm)" axisUnit="nm" bands={bands} />,
    );
    const rects = bandRects(markup);
    expect(rects).toHaveLength(bands.length);
    for (const rect of rects) {
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.x).toBeGreaterThanOrEqual(64);
      expect(rect.x + rect.width).toBeLessThanOrEqual(740 + 1e-6);
    }
    // spans sit behind the importance curve
    expect(markup.indexOf("n4viz-band")).toBeLessThan(markup.indexOf("n4viz-importance-line"));
    expect(markup).toContain("<title>O–H 1st overtone: 1400–1460 nm — O–H stretch first overtone");
    expect(markup).toContain("n4viz-band-label");
    expect(markup).toContain("n4viz-band-swatch");
    expect(markup).toContain(`Reference absorption bands: ${bands.length} bands shown as annotations behind the curve.`);
    expect(markup).toContain(`Reference absorption bands (${bands.length} bands)`);
    expect(markup).toContain("Water O–H stretch + H–O–H bend combination (~1940 nm)");
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("keeps only bands within the displayed range and honours a custom caption", () => {
    const markup = renderToStaticMarkup(
      <SpectralImportanceChart
        axis={axis}
        importance={importance}
        axisUnit="nm"
        bandsLabel="Literature bands"
        bands={[
          { start: 1400, end: 1460, label: "O–H 1st overtone", assignment: "water" },
          { start: 2280, end: 2360, label: "C–H combination" },
        ]}
      />,
    );
    expect(bandRects(markup)).toHaveLength(1);
    expect(markup).toContain("Literature bands: 1 band shown as annotations behind the curve.");
    expect(markup).not.toContain("C–H combination");
  });

  it("reports when supplied bands fall outside the axis", () => {
    const markup = renderToStaticMarkup(
      <SpectralImportanceChart axis={axis} importance={importance} bands={[{ start: 2280, end: 2360, label: "C–H" }]} />,
    );
    expect(bandRects(markup)).toHaveLength(0);
    expect(markup).toContain("Reference absorption bands: none within the displayed axis range.");
  });

  it("places wavenumber bands correctly on a descending axis", () => {
    const wavenumbers = Array.from({ length: 61 }, (_, index) => 10000 - index * 100);
    const values = wavenumbers.map((x) => Math.exp(-(((x - 6900) / 300) ** 2)));
    const bands = referenceBandsForAxis("cm-1", 10000, 4000);
    const markup = renderToStaticMarkup(
      <SpectralImportanceChart axis={wavenumbers} importance={values} axisLabel="Wavenumber (cm-1)" axisUnit="cm-1" bands={bands} />,
    );
    const rects = bandRects(markup);
    expect(rects).toHaveLength(bands.length);
    for (const rect of rects) expect(rect.width).toBeGreaterThan(0);
    // the x scale grows with the wavenumber whatever the data order: the water combination (~5100–5260 cm-1)
    // lies left of the O–H first overtone (~6850–7140 cm-1); the 970 nm overtone (>10100 cm-1) is outside the axis
    const water = bands.findIndex((band) => band.label === "H₂O combination");
    const ohFirst = bands.findIndex((band) => band.label === "O–H 1st overtone");
    expect(water).toBeGreaterThanOrEqual(0);
    expect(rects[water]!.x).toBeLessThan(rects[ohFirst]!.x);
    expect(bands.some((band) => band.label === "O–H 2nd overtone")).toBe(false);
    expect(markup).toContain("Range (cm-1)");
  });

  it("composes the readout fragment for a cursor inside a band", () => {
    const bands = referenceBandsForAxis("nm", 1000, 2500);
    const readout = spectralBandReadout(spectralBandsAt(bands, 1940), "Reference absorption bands");
    expect(readout).toBe("Reference absorption bands: H₂O combination (Water O–H stretch + H–O–H bend combination (~1940 nm))");
    expect(spectralBandReadout(spectralBandsAt(bands, 1600), "Reference absorption bands")).toBeNull();
  });
});
