import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScatterViewProps } from "../workbench/ScatterView.js";
import { Playground } from "./Playground.js";
import type { OperatorDefinition, PlaygroundDataset, PlaygroundResult } from "./types.js";

// Observe what the capsule hands to the (closed-popover, canvas) children: the
// Views menu entries and the guides drawn on every scatter plot.
const seen = vi.hoisted(() => ({ menus: [] as string[][], guides: [] as Array<ReadonlyArray<{ kind: string }>> }));
vi.mock("../workbench/layout.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../workbench/layout.js")>()),
  ViewsMenu: (props: { views: ReadonlyArray<{ id: string }> }) => {
    seen.menus.push(props.views.map((view) => view.id));
    return null;
  },
}));
// The recorder forwards to the real ScatterView, so axis labels etc. still render.
vi.mock("../workbench/ScatterView.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../workbench/ScatterView.js")>();
  return {
    ...actual,
    ScatterView: (props: ScatterViewProps) => {
      seen.guides.push(props.guides ?? []);
      return <actual.ScatterView {...props} />;
    },
  };
});

const dataset: PlaygroundDataset = {
  id: "demo",
  name: "wheat demo",
  spectra: Array.from({ length: 6 }, (_, i) => [0.1 + i * 0.01, 0.2, 0.3 + i * 0.02]),
  wavelengths: [1000, 1500, 2000],
  targets: [{ name: "protein", kind: "regression", values: [10, 11, 12, 13, 14, 15], unit: "%" }],
  partition: ["train", "train", "train", "train", "test", "test"],
};
const operators: OperatorDefinition[] = [{ id: "snv", name: "SNV", kind: "preprocessing", tier: "core" }];
const result: PlaygroundResult = {
  spectra: dataset.spectra,
  wavelengths: dataset.wavelengths,
  steps: [{ stepId: "s1", status: "ok", durationMs: 3, shape: [6, 3] }],
  projection: { method: "pca", coordinates: Array.from({ length: 6 }, (_, i) => [i, -i, 0]), explained: [0.8, 0.15, 0.05] },
};

describe("Playground capsule", () => {
  it("renders the empty state without a dataset", () => {
    const html = renderToStaticMarkup(<Playground dataset={null} operators={operators} result={null} onRunRequest={() => undefined} />);
    expect(html).toContain("No dataset loaded");
  });

  it("renders pipeline, views and drawer for a dataset", () => {
    const html = renderToStaticMarkup(
      <Playground
        dataset={dataset}
        operators={operators}
        defaultPipeline={[{ id: "s1", operatorId: "snv", params: {}, enabled: true }]}
        result={result}
        onRunRequest={() => undefined}
      />,
    );
    for (const text of ["wheat demo", "Raw data", "SNV", "Spectra", "Scores", "Target · protein", "Outlier map", "Details", "Selection"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("PC1 (80.0%)".slice(0, 3));
  });

  it("localizes to French", () => {
    const html = renderToStaticMarkup(<Playground dataset={dataset} operators={operators} result={result} onRunRequest={() => undefined} locale="fr" />);
    expect(html).toContain("Spectres");
    expect(html).toContain("Données brutes");
  });
});

describe("Playground host restrictions", () => {
  beforeEach(() => {
    seen.menus.length = 0;
    seen.guides.length = 0;
  });
  const render = (props: Partial<Parameters<typeof Playground>[0]> = {}) =>
    renderToStaticMarkup(<Playground dataset={dataset} operators={operators} result={result} onRunRequest={() => undefined} {...props} />);
  const hasEllipse = () => seen.guides.some((guides) => guides.some((guide) => guide.kind === "ellipse"));

  it("keeps the default behavior: every view offered, ellipse drawn", () => {
    const html = render();
    expect(seen.menus.at(-1)).toEqual(
      expect.arrayContaining(["spectra", "scores", "target", "outliers", "loadings", "correlation", "folds", "repetitions", "variance", "groupMeans", "heatmap", "samples"]),
    );
    expect(html).toContain('aria-label="Correlation r(λ)"');
    expect(hasEllipse()).toBe(true);
  });

  it("availableViews filters the menu, a saved layout and the maximized view", () => {
    const html = render({
      availableViews: ["spectra", "scores", "samples"],
      layout: { preset: "focus", views: ["spectra", "correlation", "outliers", "scores"], maximized: "variance" },
    });
    expect(seen.menus.at(-1)).toEqual(["spectra", "scores", "samples"]);
    expect(html).toContain('aria-label="Spectra"');
    expect(html).toContain('aria-label="Scores"');
    for (const hidden of ["Correlation r(λ)", "Outlier map", "Variability"]) expect(html).not.toContain(`aria-label="${hidden}"`);
    // the forbidden maximized view does not hijack the grid
    expect(html).not.toContain("n4wb-grid-max");
  });

  it("keeps the table-like samples view when it is in the passed set", () => {
    const html = render({ availableViews: ["samples"], layout: { preset: "focus", views: ["samples", "spectra"], maximized: null } });
    expect(html).toContain('aria-label="Samples"');
    expect(html).not.toContain('aria-label="Spectra"');
  });

  it("localStatistics=false removes correlation, variance and group means and never draws the ellipse", () => {
    const html = render({ localStatistics: false });
    const menu = seen.menus.at(-1)!;
    for (const hidden of ["correlation", "variance", "groupMeans"]) expect(menu).not.toContain(hidden);
    // host-provided analyses stay
    for (const kept of ["spectra", "scores", "target", "outliers", "loadings", "samples"]) expect(menu).toContain(kept);
    expect(html).not.toContain('aria-label="Correlation r(λ)"');
    expect(html).toContain('aria-label="Scores"');
    expect(hasEllipse()).toBe(false);
  });

  it("localStatistics=false overrides a layout and availableViews that still name statistic views", () => {
    const html = render({
      localStatistics: false,
      availableViews: ["spectra", "correlation", "variance", "groupMeans"],
      layout: { preset: "focus", views: ["correlation", "variance", "groupMeans", "spectra"], maximized: "groupMeans" },
    });
    expect(seen.menus.at(-1)).toEqual(["spectra"]);
    expect(html).toContain('aria-label="Spectra"');
    expect(html).not.toContain("Group means");
    expect(html).not.toContain("Variability");
  });

  it("renders the empty, running and failed states", () => {
    expect(render({ dataset: null, availableViews: ["spectra"], localStatistics: false })).toContain("No dataset loaded");
    expect(render({ status: "running", result: null })).toContain("Running");
    const failed = render({ status: "error", error: "worker crashed" });
    expect(failed).toContain("Failed");
    expect(failed).toContain("worker crashed");
  });
});
