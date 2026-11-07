import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fromScoredChains } from "../chains/analysis.js";
import { hardSamples, regressionSummary } from "./analysis.js";
import { Inspector, predictionsToRequest } from "./Inspector.js";
import { buildInsights, factorImportance, oneSeTies, residualAgreement, stepShifts } from "./insights.js";
import type { ChainPredictions, InspectorChain, ScoreRef } from "./types.js";

// Observe what the capsule hands to its children (closed-popover menu, canvas
// plots) and which UI-side statistic helpers actually run.
const seen = vi.hoisted(() => ({
  menus: [] as string[][],
  plots: [] as Array<{ ariaLabel?: string | undefined; xs: ArrayLike<number>; ys: ArrayLike<number>; guides: ReadonlyArray<{ kind: string }> }>,
}));
vi.mock("../workbench/layout.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../workbench/layout.js")>()),
  ViewsMenu: (props: { views: ReadonlyArray<{ id: string }> }) => {
    seen.menus.push(props.views.map((view) => view.id));
    return null;
  },
}));
vi.mock("../workbench/ScatterView.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../workbench/ScatterView.js")>()),
  ScatterView: (props: { ariaLabel?: string; xs: ArrayLike<number>; ys: ArrayLike<number>; guides?: ReadonlyArray<{ kind: string }> }) => {
    seen.plots.push({ ariaLabel: props.ariaLabel, xs: props.xs, ys: props.ys, guides: props.guides ?? [] });
    return null;
  },
}));
vi.mock("../viz/ConfusionMatrix.js", () => ({ ConfusionMatrix: () => null }));
vi.mock("./insights.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./insights.js")>();
  return {
    ...actual,
    oneSeTies: vi.fn(actual.oneSeTies),
    factorImportance: vi.fn(actual.factorImportance),
    stepShifts: vi.fn(actual.stepShifts),
    buildInsights: vi.fn(actual.buildInsights),
    residualAgreement: vi.fn(actual.residualAgreement),
  };
});
vi.mock("./analysis.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./analysis.js")>();
  return { ...actual, regressionSummary: vi.fn(actual.regressionSummary), hardSamples: vi.fn(actual.hardSamples) };
});
vi.mock("../chains/analysis.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../chains/analysis.js")>();
  return { ...actual, fromScoredChains: vi.fn(actual.fromScoredChains) };
});

const refs: ScoreRef[] = [
  { key: "rmse_cv", label: "RMSE · CV", metric: "rmse", partition: "validation", lowerIsBetter: true },
  { key: "rmse_test", label: "RMSE · test", metric: "rmse", partition: "test", lowerIsBetter: true },
];
const chains: InspectorChain[] = ["PLS", "Ridge", "RF"].map((model, i) => ({
  id: `c${i}`,
  model,
  modelFamily: model === "RF" ? "Trees" : "Linear",
  task: "regression",
  dataset: "wheat",
  steps: [{ token: i % 2 ? "msc" : "snv", role: "preprocess" }, { token: model.toLowerCase(), role: "model" }],
  scores: { rmse_cv: 0.5 + i * 0.1, rmse_test: 0.55 + i * 0.1 },
}));

describe("Inspector capsule", () => {
  it("renders the empty state without chains", () => {
    expect(renderToStaticMarkup(<Inspector chains={[]} scoreRefs={refs} />)).toContain("No trained chains");
  });

  it("renders the ranked list, compare tray, perspectives and the verdict", () => {
    const html = renderToStaticMarkup(<Inspector chains={chains} scoreRefs={refs} />);
    for (const text of ["Chains", "PLS", "Ridge", "auto · best", "Verdict", "Top chains", "Step effects", "Predicted vs observed", "RMSE · CV", "Best chain", "Steps", "Tuning"]) {
      expect(html).toContain(text);
    }
    // best chain first in the ranked list (the list renders before the views)
    expect(html.indexOf("0.500")).toBeLessThan(html.indexOf("0.600"));
  });
});

describe("Inspector perspectives", () => {
  it("adapts curated view sets to the task and dataset count", async () => {
    const { perspectiveViews } = await import("./Inspector.js");
    expect(perspectiveViews("verdict", { classification: false, multiDataset: false })).toContain("parity");
    expect(perspectiveViews("verdict", { classification: true, multiDataset: false })).toContain("confusion");
    expect(perspectiveViews("landscape", { classification: false, multiDataset: true })).toContain("datasets");
  });

  it("renders every perspective without crashing", async () => {
    const { perspectiveViews } = await import("./Inspector.js");
    for (const perspective of ["verdict", "landscape", "steps", "predictions", "tuning", "compare"] as const) {
      const views = perspectiveViews(perspective, { classification: false, multiDataset: false });
      const html = renderToStaticMarkup(<Inspector chains={chains} scoreRefs={refs} defaultLayout={{ preset: "grid", views, maximized: null }} defaultCompare={["c0", "c1"]} />);
      expect(html).toContain("n4ins-persp is-active");
    }
  });
});

const predictionsOf = (chainId: string, offset: number): ChainPredictions => ({
  chainId,
  sampleKeys: ["s1", "s2", "s3", "s4"],
  yTrue: [1, 2, 3, 4],
  yPred: [1 + offset, 2.1, 2.8, 4.2],
  partition: ["validation", "validation", "test", "test"],
});
const loaded = { c0: predictionsOf("c0", 0.5), c1: predictionsOf("c1", -0.3) };
const layoutOf = (...views: string[]) => ({ preset: "grid" as const, views, maximized: null });
const render = (props: Partial<Parameters<typeof Inspector>[0]> = {}) =>
  renderToStaticMarkup(<Inspector chains={chains} scoreRefs={refs} {...props} />);
const plot = (label: string) => seen.plots.find((p) => p.ariaLabel === label);
const comparing = { predictions: loaded, defaultCompare: ["c0", "c1"], defaultLayout: layoutOf("overview", "top", "compare", "parity", "residuals", "agreement", "samples", "effects") };

describe("Inspector host restrictions", () => {
  beforeEach(() => {
    seen.menus.length = 0;
    seen.plots.length = 0;
    vi.clearAllMocks();
  });

  it("availableViews filters the menu, the layout, the maximized view and the perspectives", () => {
    const html = render({ availableViews: ["top", "parity", "table"], layout: layoutOf("effects", "flow", "top", "overview") });
    expect(seen.menus.at(-1)).toEqual(["top", "parity", "table"]);
    expect(html).toContain('aria-label="Top chains"');
    for (const hidden of ["Verdict", "Step effects", "Step flow"]) expect(html).not.toContain(`aria-label="${hidden}"`);
    // perspectives left without any allowed view disappear; the others keep working
    expect(html).toContain(">Verdict</button>");
    expect(html).toContain(">Landscape</button>");
    expect(html).not.toContain(">Steps</button>");
    expect(html).not.toContain(">Tuning</button>");
    // a forbidden maximized view cannot take over the grid
    const maximized = render({ availableViews: ["top"], layout: { preset: "grid", views: ["top", "effects"], maximized: "effects" } });
    expect(maximized).not.toContain("n4wb-grid-max");
    expect(maximized).toContain('aria-label="Top chains"');
  });

  it("restricts the default layout and keeps the table equivalent when it is passed", () => {
    const html = render({ availableViews: ["table", "top"] });
    expect(seen.menus.at(-1)).toEqual(["top", "table"]);
    expect(html).toContain('aria-label="Top chains"');
    expect(html).not.toContain('aria-label="Predicted vs observed"');
    expect(render({ availableViews: ["table"], layout: layoutOf("table") })).toContain('aria-label="Leaderboard"');
  });

  it("keeps every metric by default", () => {
    const html = render(comparing);
    for (const text of ["R² ", "RPD", "residual r", "Findings", "What drives the score"]) expect(html).toContain(text);
    expect(vi.mocked(oneSeTies)).toHaveBeenCalled();
    expect(vi.mocked(factorImportance)).toHaveBeenCalled();
    expect(vi.mocked(buildInsights)).toHaveBeenCalled();
    expect(vi.mocked(regressionSummary)).toHaveBeenCalled();
    expect(vi.mocked(residualAgreement)).toHaveBeenCalled();
    expect(plot("Residuals")!.guides.map((g) => g.kind)).toContain("band");
  });

  it("localStatistics=false computes and shows no prediction metric, tie, driver, insight or step shift", () => {
    const html = render({ ...comparing, localStatistics: false });
    for (const text of ["R² ", "RPD", " · bias ", "residual r", "blend of both", "Findings", "What drives the score", "standard error", "within 1 SE", "Mean rank"]) {
      expect(html).not.toContain(text);
    }
    for (const helper of [oneSeTies, factorImportance, stepShifts, buildInsights, residualAgreement, regressionSummary, hardSamples, fromScoredChains]) {
      expect(vi.mocked(helper)).not.toHaveBeenCalled();
    }
    // owner scores still rank: best first, verdict falls back to the top-ranked chain
    expect(html).toContain("Best chain");
    expect(html.indexOf("0.500")).toBeLessThan(html.indexOf("0.600"));
    // views whose content is a UI statistic explain why they are unavailable
    expect(html).toContain("Not available: this host supplies owner scores only");
  });

  it("localStatistics=false keeps chart coordinates from owner predictions and drops residual statistics", () => {
    render({ ...comparing, localStatistics: false });
    const residuals = plot("Residuals")!;
    // c0 residuals (pred − obs) come first, straight from the owner predictions
    expect(Array.from(residuals.ys).slice(0, 4)).toEqual([0.5, 2.1 - 2, 2.8 - 3, 4.2 - 4].map((v) => expect.closeTo(v, 12)));
    expect(residuals.guides.map((g) => g.kind)).toEqual(["hline"]);
    const agreement = plot("Error agreement")!;
    expect(agreement.xs.length).toBe(4);
    expect(agreement.xs[0]).toBeCloseTo(0.5, 12);
    expect(agreement.ys[0]).toBeCloseTo(-0.3, 12);
    expect(plot("Predicted versus observed")!.guides.map((g) => g.kind)).toEqual(["line"]);
  });

  it("localStatistics=false hides classification accuracy", () => {
    const classifier: InspectorChain = { id: "k0", model: "LDA", task: "classification", dataset: "wheat", steps: [{ token: "lda", role: "model" }], scores: { rmse_cv: 0.2, rmse_test: 0.3 } };
    const labels: ChainPredictions = { chainId: "k0", sampleKeys: ["a", "b", "c", "d"], yTrue: ["x", "y", "x", "y"], yPred: ["x", "y", "y", "y"], classes: ["x", "y"] };
    const props = { chains: [classifier], predictions: { k0: labels }, defaultCompare: ["k0"], defaultLayout: layoutOf("confusion") };
    expect(render(props)).toContain("accuracy ");
    expect(render({ ...props, localStatistics: false })).not.toContain("accuracy ");
  });
});

describe("Inspector unavailable predictions", () => {
  beforeEach(() => {
    seen.plots.length = 0;
  });
  const reason = "Predictions are only exported for the selected variant";

  it("never requests a chain declared unavailable, but still requests the others", () => {
    expect(predictionsToRequest(["a", "b", "c", "d", "e"], { a: loaded.c0 }, ["b"], { c: "n/a", d: "" })).toEqual(["e"]);
    expect(predictionsToRequest(["c0", "c1"], {}, [], {})).toEqual(["c0", "c1"]);
    // predictions that did arrive win over a stale unavailable entry
    expect(predictionsToRequest(["c0"], loaded, [], { c0: "stale" })).toEqual([]);
  });

  it("shows the textual reason instead of a loading state", () => {
    const html = render({
      predictions: { c0: loaded.c0 },
      defaultCompare: ["c0", "c1"],
      loadingPredictions: ["c1"],
      unavailablePredictions: { c1: reason },
      defaultLayout: layoutOf("parity", "table"),
    });
    expect(html).toContain(reason);
    expect(html).toContain("predictions unavailable");
    expect(html).not.toContain("Loading predictions");
    expect(html).not.toContain("n4ins-loading");
  });

  it("explains an empty prediction view with the host reasons", () => {
    const html = render({
      defaultCompare: ["c0", "c1"],
      loadingPredictions: ["c0", "c1"],
      unavailablePredictions: { c0: reason, c1: "The variant was not refit" },
      defaultLayout: layoutOf("parity"),
    });
    expect(html).toContain(reason);
    expect(html).toContain("The variant was not refit");
    expect(html).not.toContain("Loading predictions");
  });

  it("keeps the loading state for chains that are not declared unavailable", () => {
    const html = render({ defaultCompare: ["c0"], loadingPredictions: ["c0"], defaultLayout: layoutOf("parity") });
    expect(html).toContain("Loading predictions");
    expect(html).toContain("n4ins-loading");
    expect(html).not.toContain("predictions unavailable");
  });

  it("keeps the empty states", () => {
    expect(render({ chains: [], availableViews: ["table"], localStatistics: false })).toContain("No trained chains");
    expect(render({ defaultCompare: ["c0"], defaultLayout: layoutOf("parity") })).toContain("No predictions available for the compared chains.");
  });
});

describe("Inspector owner scores versus raw fold scores", () => {
  // The owner CV score is not the mean of the raw fold scores: here the fold means
  // contradict the owner ranking (owner: 0.4 < 0.5; fold means: 1.0 > 0.2).
  const contradicting: InspectorChain[] = [
    { id: "owner", label: "OWNER-WINNER", model: "PLS", task: "regression", dataset: "wheat", steps: [{ token: "pls", role: "model" }], scores: { rmse_cv: 0.4, rmse_test: 0.45 }, foldScores: { rmse_cv: [0.9, 1.1] } },
    { id: "folds", label: "FOLD-WINNER", model: "Ridge", task: "regression", dataset: "wheat", steps: [{ token: "ridge", role: "model" }], scores: { rmse_cv: 0.5, rmse_test: 0.55 }, foldScores: { rmse_cv: [0.1, 0.3] } },
  ];

  it.each([true, false])("ranks, defaults and selects on the owner score (localStatistics=%s)", (localStatistics) => {
    const html = render({ chains: contradicting, localStatistics, defaultLayout: layoutOf("overview", "top", "table") });
    // list order and the verdict follow the owner CV score, not the raw fold averages
    expect(html.indexOf("OWNER-WINNER")).toBeLessThan(html.indexOf("FOLD-WINNER"));
    expect(html).toContain('n4ins-hero-title">OWNER-WINNER');
    expect(html).toContain("0.400");
    // the automatic comparison is the owner's best chain too
    expect(html).toContain("auto · best");
  });
});
