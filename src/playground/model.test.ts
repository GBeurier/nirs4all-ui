import { describe, expect, it } from "vitest";

import { buildColumns, colorMappingFor, colorsForFrame, inverseRows, outputFrame, outputRowsInScope, outputToSelection, scopeRows, selectionToOutput } from "./model.js";
import type { PlaygroundDataset, PlaygroundResult } from "./types.js";

const dataset: PlaygroundDataset = {
  id: "d",
  name: "demo",
  spectra: [
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
  ],
  wavelengths: [1000, 1002],
  targets: [{ name: "protein", kind: "regression", values: [10, 11, 12, null] }],
  partition: ["train", "train", "test", "test"],
  metadata: [{ key: "site", label: "Site", kind: "categorical", values: ["a", "b", "a", "b"] }],
};

// Output after removing row 1 and augmenting row 0 once.
const result: PlaygroundResult = {
  spectra: [
    [0, 1],
    [0, 1],
    [0, 1],
    [0, 1],
  ],
  wavelengths: [1000, 1002],
  rows: [0, 2, 3, 0],
  steps: [{ stepId: "f", status: "ok", removedRows: [1], taggedRows: [3] }],
  folds: { kind: "cv", folds: [{ label: "fold 1", train: [0, 3], test: [1, 2] }] },
};

describe("playground model", () => {
  const frame = outputFrame(dataset, result);
  const inverse = inverseRows(frame.rows, 4);

  it("maps selections between dataset rows and output rows", () => {
    expect(Array.from(inverse[0]!)).toEqual([0, 3]);
    expect(inverse[1]!.length).toBe(0);
    expect(selectionToOutput([0, 3], inverse)).toEqual([0, 2, 3]);
    expect(outputToSelection([3, 1], frame)).toEqual([0, 2]);
  });

  it("builds color-by columns from dataset and result", () => {
    const columns = buildColumns(dataset, result, frame);
    expect(columns.map((c) => c.key)).toEqual(["target:protein", "partition", "fold", "flags", "site"]);
    const fold = columns.find((c) => c.key === "fold")!;
    expect(fold.values).toEqual([null, null, "fold 1", "fold 1"]);
    const flags = columns.find((c) => c.key === "flags")!;
    expect(flags.values[3]).toBe("flagged");
    const mapping = colorMappingFor(columns, "site", 4);
    const out = colorsForFrame(mapping, frame);
    expect(out.colors[0]).toBe(out.colors[3]);
  });

  it("scopes rows by partition and selection", () => {
    const scope = scopeRows("partition:test", 4, [], dataset.partition);
    expect([...scope!]).toEqual([2, 3]);
    expect(outputRowsInScope(frame, scope)).toEqual([1, 2]);
    expect(scopeRows("all", 4, [], dataset.partition)).toBeNull();
    expect([...scopeRows("selection", 4, [1], undefined)!]).toEqual([1]);
  });
});
