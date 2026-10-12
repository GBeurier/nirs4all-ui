import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Playground } from "./Playground.js";
import type { OperatorDefinition, PlaygroundDataset, PlaygroundResult } from "./types.js";

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
