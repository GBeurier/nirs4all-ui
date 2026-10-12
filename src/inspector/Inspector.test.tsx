import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Inspector } from "./Inspector.js";
import type { InspectorChain, ScoreRef } from "./types.js";

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
