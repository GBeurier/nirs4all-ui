import { describe, expect, it } from "vitest";

import {
  NIR_REFERENCE_BANDS,
  layoutBandLabels,
  referenceBandsForAxis,
  spectralAxisUnitKind,
  spectralBandReadout,
  spectralBandsAt,
  visibleSpectralBands,
  type NirReferenceBand,
} from "./spectralBands.js";

const CATALOG: readonly NirReferenceBand[] = [
  { startNm: 950, endNm: 990, label: "O–H 2nd overtone", assignment: "water", family: "water" },
  { startNm: 1400, endNm: 1460, label: "O–H 1st overtone", assignment: "hydroxyl", family: "O–H" },
  { startNm: 1900, endNm: 1960, label: "H₂O combination", assignment: "water combination", family: "water" },
];

describe("spectralAxisUnitKind", () => {
  it("recognises wavelength and wavenumber spellings", () => {
    for (const unit of ["nm", "NM", " nanometer ", "nanometers", "nanometre"]) expect(spectralAxisUnitKind(unit)).toBe("nm");
    for (const unit of ["µm", "μm", "um", "micrometer", "micrometres", "micron"]) expect(spectralAxisUnitKind(unit)).toBe("um");
    for (const unit of ["cm-1", "cm^-1", "cm⁻¹", "1/cm", "cm−1", "cm -1", "wavenumber", "Wavenumbers"]) {
      expect(spectralAxisUnitKind(unit)).toBe("cm-1");
    }
  });

  it("never guesses a unit for indices, empty or unknown strings", () => {
    for (const unit of ["index", "", "  ", "feature", "feature_index", "s", "Hz", null, undefined]) {
      expect(spectralAxisUnitKind(unit)).toBe("unknown");
    }
  });
});

describe("referenceBandsForAxis", () => {
  it("keeps nanometre bands, clips them to the axis and drops bands outside it", () => {
    const bands = referenceBandsForAxis("nm", 1000, 1920, CATALOG);
    expect(bands.map((band) => band.label)).toEqual(["O–H 1st overtone", "H₂O combination"]);
    expect(bands[0]).toMatchObject({ start: 1400, end: 1460, assignment: "hydroxyl", family: "O–H" });
    expect(bands[1]).toMatchObject({ start: 1900, end: 1920 });
  });

  it("accepts the axis bounds in either order", () => {
    expect(referenceBandsForAxis("nm", 1920, 1000, CATALOG)).toEqual(referenceBandsForAxis("nm", 1000, 1920, CATALOG));
  });

  it("converts to wavenumbers (1e7 / nm) with start < end", () => {
    const bands = referenceBandsForAxis("cm-1", 4000, 12000, CATALOG);
    expect(bands).toHaveLength(3);
    for (const band of bands) expect(band.start).toBeLessThan(band.end);
    // ordered along the wavenumber axis: the 1900–1960 nm band has the lowest wavenumbers
    expect(bands.map((band) => band.label)).toEqual(["H₂O combination", "O–H 1st overtone", "O–H 2nd overtone"]);
    expect(bands[0]!.start).toBeCloseTo(1e7 / 1960, 6);
    expect(bands[0]!.end).toBeCloseTo(1e7 / 1900, 6);
    expect(bands[2]!.start).toBeCloseTo(1e7 / 990, 6);
    expect(bands[2]!.end).toBeCloseTo(1e7 / 950, 6);
  });

  it("clips converted wavenumber bands to a descending axis range", () => {
    const bands = referenceBandsForAxis("cm⁻¹", 10400, 5200, CATALOG);
    expect(bands.map((band) => band.label)).toEqual(["H₂O combination", "O–H 1st overtone", "O–H 2nd overtone"]);
    expect(bands[0]).toMatchObject({ start: 5200, end: 1e7 / 1900 });
    expect(bands[2]).toMatchObject({ start: 1e7 / 990, end: 10400 });
  });

  it("converts to micrometres", () => {
    const bands = referenceBandsForAxis("µm", 0.9, 2.5, CATALOG);
    expect(bands.map((band) => [band.start, band.end])).toEqual([
      [0.95, 0.99],
      [1.4, 1.46],
      [1.9, 1.96],
    ]);
  });

  it("returns no bands for unknown units or invalid ranges", () => {
    expect(referenceBandsForAxis("index", 0, 3000)).toEqual([]);
    expect(referenceBandsForAxis(null, 0, 3000)).toEqual([]);
    expect(referenceBandsForAxis("", 0, 3000)).toEqual([]);
    expect(referenceBandsForAxis("nm", NaN, 3000)).toEqual([]);
    expect(referenceBandsForAxis("nm", 3000, 4000)).toEqual([]);
  });

  it("maps the full default catalog onto a typical NIR range", () => {
    expect(referenceBandsForAxis("nm", 700, 2600)).toHaveLength(NIR_REFERENCE_BANDS.length);
  });
});

describe("NIR_REFERENCE_BANDS catalog", () => {
  it("contains ordered, NIR-range windows with labels, assignments and families", () => {
    expect(NIR_REFERENCE_BANDS.length).toBeGreaterThanOrEqual(10);
    let previousStart = -Infinity;
    for (const band of NIR_REFERENCE_BANDS) {
      expect(band.startNm).toBeLessThan(band.endNm);
      expect(band.startNm).toBeGreaterThanOrEqual(700);
      expect(band.endNm).toBeLessThanOrEqual(2600);
      expect(band.startNm).toBeGreaterThanOrEqual(previousStart);
      previousStart = band.startNm;
      expect(band.label.trim().length).toBeGreaterThan(0);
      expect(band.assignment.trim().length).toBeGreaterThan(0);
      expect(band.family.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(NIR_REFERENCE_BANDS.map((band) => band.label)).size).toBe(NIR_REFERENCE_BANDS.length);
  });

  it("includes the well-established water bands", () => {
    const covers = (nm: number) => NIR_REFERENCE_BANDS.filter((band) => nm >= band.startNm && nm <= band.endNm && band.family === "water");
    expect(covers(970)).toHaveLength(1);
    expect(covers(1940)).toHaveLength(1);
  });
});

describe("band display helpers", () => {
  it("normalizes, orders and filters bands overlapping the displayed range", () => {
    const visible = visibleSpectralBands(
      [
        { start: 8000, end: 7000, label: "b" },
        { start: 100, end: 200, label: "outside" },
        { start: 5000, end: NaN, label: "invalid" },
        { start: 4200, end: 4400, label: "a" },
      ],
      9000,
      4000,
    );
    expect(visible.map((band) => [band.label, band.start, band.end])).toEqual([
      ["a", 4200, 4400],
      ["b", 7000, 8000],
    ]);
  });

  it("finds every band covering a coordinate and composes the readout", () => {
    const bands = [
      { start: 1360, end: 1420, label: "C–H comb." },
      { start: 1400, end: 1460, label: "O–H 1st overtone", assignment: "water O–H stretch" },
    ];
    expect(spectralBandsAt(bands, 1410).map((band) => band.label)).toEqual(["C–H comb.", "O–H 1st overtone"]);
    expect(spectralBandsAt(bands, 1500)).toEqual([]);
    expect(spectralBandsAt(bands, NaN)).toEqual([]);
    expect(spectralBandReadout(spectralBandsAt(bands, 1450), "Bands")).toBe("Bands: O–H 1st overtone (water O–H stretch)");
    expect(spectralBandReadout([], "Bands")).toBeNull();
  });

  it("stacks colliding labels on rows and hides labels that do not fit", () => {
    const placements = layoutBandLabels(
      [
        { left: 100, right: 120, label: "first" },
        { left: 104, right: 124, label: "second" },
        { left: 108, right: 128, label: "third" },
        { left: 300, right: 302, label: "too narrow" },
        { left: 400, right: 420, label: "a label that is far too long for the chart" },
      ],
      { minX: 64, maxX: 740, rows: 2 },
    );
    expect(placements[0]).toMatchObject({ row: 0, text: "first" });
    expect(placements[1]).toMatchObject({ row: 1, text: "second" });
    expect(placements[2]).toBeNull();
    expect(placements[3]).toBeNull();
    expect(placements[4]?.text.endsWith("…")).toBe(true);
    expect(placements[4]?.text.length).toBe(18);
  });

  it("keeps labels inside the plot bounds", () => {
    const [placement] = layoutBandLabels([{ left: 64, right: 70, label: "edge label" }], { minX: 64, maxX: 300 });
    expect(placement).not.toBeNull();
    expect(placement!.x - (placement!.text.length * 5.2) / 2).toBeGreaterThanOrEqual(64 - 1e-9);
  });
});
