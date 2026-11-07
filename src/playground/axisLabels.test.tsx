import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SpectraView } from "../workbench/SpectraView.js";
import { toSpectraMatrix } from "../workbench/matrix.js";
import { Playground } from "./Playground.js";
import { outputFrame, rawFrame } from "./model.js";
import type { PlaygroundDataset, PlaygroundResult } from "./types.js";

const seen = vi.hoisted(() => [] as Array<{ ariaLabel: string; xLabel?: string; description?: string }>);
vi.mock("../workbench/CanvasPlot.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../workbench/CanvasPlot.js")>()),
  CanvasPlot: (props: { ariaLabel: string; xLabel?: string; description?: string }) => {
    seen.push(props);
    return <figure aria-label={props.ariaLabel}><figcaption>{props.xLabel} {props.description}</figcaption></figure>;
  },
}));

const dataset: PlaygroundDataset = {
  id: "axis-labels",
  name: "Axis labels",
  spectra: [[1, 2, 3], [2, 4, 5], [3, 5, 7], [4, 6, 9]],
  wavelengths: [0, 1, 2],
  targets: [{ name: "Target", kind: "regression", values: [1, 2, 3, 4] }],
  partition: ["train", "train", "test", "predict"],
};
const result: PlaygroundResult = {
  spectra: dataset.spectra,
  wavelengths: dataset.wavelengths,
  rows: [0, 1, 2, 3],
  loadings: { components: [[1, 0, 0], [0, 1, 0]] },
};
const unitCases = [
  ["nm", "Wavelength (nm)"],
  ["cm-1", "Wavenumber (cm-1)"],
  ["cm⁻¹", "Wavenumber (cm⁻¹)"],
  ["cm^-1", "Wavenumber (cm^-1)"],
  ["1/cm", "Wavenumber (1/cm)"],
  ["index", "Feature index (positional)"],
  ["Hz", "Spectral coordinate (Hz)"],
  ["", "Spectral coordinate"],
] as const;

beforeEach(() => { seen.length = 0; });

describe("spectral axis presentation", () => {
  it.each(unitCases)("labels %s consistently in spectra, profiles, heatmap and text", (unit, label) => {
    const html = renderToStaticMarkup(<Playground
      dataset={{ ...dataset, unit }}
      operators={[]}
      result={{ ...result, unit }}
      onRunRequest={() => undefined}
      selection={[0]}
      layout={{ preset: "grid", views: ["spectra", "loadings", "correlation", "variance", "groupMeans", "heatmap", "samples"], maximized: null }}
    />);
    for (const ariaLabel of ["Spectra", "PCA loadings", "Spectral coordinate correlation profile", "Per-feature variability", "Group mean spectra", "Spectral heat map"]) {
      const plot = seen.find((plot) => plot.ariaLabel === ariaLabel || plot.ariaLabel.startsWith(`${ariaLabel} · `));
      expect(plot?.xLabel).toBe(label);
      expect(`${plot?.ariaLabel} ${plot?.description ?? ""}`).toContain(label);
    }
    expect(seen.every((plot) => plot.xLabel === label)).toBe(true);
    expect(seen.find((plot) => plot.ariaLabel === "Spectra")?.description).toContain(label);
    expect(seen.find((plot) => plot.ariaLabel === "Spectral heat map")?.description).toContain(label);
    expect(html).toContain('role="grid" aria-label="Samples"');
    expect(html).toContain("predict");
  });

  it.each(unitCases)("uses %s for direct SpectraView callers without a custom label", (unit, label) => {
    renderToStaticMarkup(<SpectraView
      matrix={toSpectraMatrix(dataset.spectra)}
      wavelengths={dataset.wavelengths}
      unit={unit}
      colors={["#0d9488", "#0d9488", "#0d9488", "#0d9488"]}
      groups={new Int32Array(4)}
      palette={["#0d9488"]}
      selected={[]}
    />);
    expect(seen[0]?.xLabel).toBe(label);
    expect(seen[0]?.description).toContain(label);
  });

  it("retains an explicit host label and does not invent nanometres for an absent unit", () => {
    renderToStaticMarkup(<SpectraView
      matrix={toSpectraMatrix(dataset.spectra)}
      wavelengths={dataset.wavelengths}
      xLabel="Detector channel"
      colors={[]}
      groups={new Int32Array(4)}
      palette={[]}
      selected={[]}
    />);
    expect(seen[0]?.xLabel).toBe("Detector channel");
    expect(seen[0]?.description).toContain("Detector channel");
    expect(rawFrame(dataset).unit).toBe("");
    expect(outputFrame(dataset, result).unit).toBe("");
    expect(outputFrame({ ...dataset, unit: "cm-1" }, result).unit).toBe("cm-1");
    expect(outputFrame({ ...dataset, unit: "nm" }, { ...result, unit: "index" }).unit).toBe("index");
  });
});
