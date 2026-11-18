import { describe, expect, it } from "vitest";

import { DEFAULT_CHAIN_METRICS as M, layoutChain } from "./layout.js";
import { parsePipeline } from "./model.js";
import { KFOLD, MSC, SNV, branchDocument, pls, searchDocument } from "./__fixtures__/pipelines.js";
import type { PipelineChainDocument } from "./types.js";

const layoutOf = (document: PipelineChainDocument, wrapWidth?: number) => layoutChain(parsePipeline(document), { wrapWidth });

describe("layoutChain", () => {
  it("places a linear chain left to right on one wire, snapped to the grid", () => {
    const layout = layoutOf({ pipeline: [SNV, KFOLD, pls(5)] });
    const xs = layout.cells.map((cell) => cell.x);
    expect(xs).toEqual([168, 168 + M.cellW + M.gapX, 168 + 2 * (M.cellW + M.gapX)]);
    expect(new Set(layout.cells.map((cell) => cell.y + cell.h / 2)).size).toBe(1);
    for (const cell of layout.cells) expect([cell.x % 24, cell.y % 24, cell.w % 24, cell.h % 24]).toEqual([0, 0, 0, 0]);
    expect(layout.terminals.map((terminal) => terminal.kind)).toEqual(["in", "out"]);
    expect(layout.terminals[1]!.x).toBeGreaterThan(xs[2]! + M.cellW);
    expect(layout.rows).toBe(1);
  });

  it("offers an insert point before, between and after the steps of every chain", () => {
    const model = parsePipeline(branchDocument());
    const layout = layoutChain(model);
    for (const chain of model.chains.values()) {
      const indices = layout.slots.filter((slot) => slot.chain === chain.id).map((slot) => slot.index).sort((a, b) => a - b);
      expect(indices).toEqual(Array.from({ length: chain.items.length + 1 }, (_, index) => index));
    }
    // The end of each chain keeps a visible "+", like the last slot of a rack lane.
    expect(layout.slots.filter((slot) => slot.persistent).length).toBe(model.chains.size);
  });

  it("stacks branch lanes around the wire and aligns their cells in columns", () => {
    const layout = layoutOf(branchDocument());
    const fork = layout.forks[0]!;
    expect(layout.lanes.map((lane) => lane.empty)).toEqual([false, false, true]);
    const tops = layout.lanes.map((lane) => lane.y);
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    expect(layout.lanes[1]!.y - (layout.lanes[0]!.y + layout.lanes[0]!.h)).toBe(M.laneGap);
    // First cells of the first two lanes share a column; the merge sits after the fork on the main wire.
    const laneCells = layout.cells.filter((cell) => cell.item.chain !== parsePipeline(branchDocument()).root.id);
    expect(laneCells[0]!.x).toBe(laneCells[2]!.x);
    const merge = layout.cells.find((cell) => cell.item.kind === "merge")!;
    expect(merge.x).toBe(fork.x + fork.w + M.gapX);
    expect(merge.y + merge.h / 2).toBe(fork.wireY);
    expect(layout.lanes.every((lane) => lane.chip !== null)).toBe(true);
  });

  it("draws alternatives as a compact bank of half-height cells on dotted wires", () => {
    const layout = layoutOf(searchDocument());
    const bank = layout.forks[0]!;
    expect(bank.fork.stack).toBe(true);
    const options = layout.cells.filter((cell) => cell.mini);
    expect(options).toHaveLength(2);
    expect(options.every((cell) => cell.h === M.miniH)).toBe(true);
    expect(layout.wires.some((wire) => wire.kind === "choice")).toBe(true);
    expect(layout.lanes.every((lane) => lane.chip === null)).toBe(true);
  });

  it("wraps the top-level chain onto rows joined by a return wire", () => {
    const document: PipelineChainDocument = { pipeline: [SNV, MSC, KFOLD, pls(2), pls(4), pls(6), pls(8)] };
    const single = layoutOf(document);
    const wrapped = layoutOf(document, 900);
    expect(single.rows).toBe(1);
    expect(wrapped.rows).toBeGreaterThan(1);
    expect(wrapped.wires.filter((wire) => wire.kind === "return")).toHaveLength(wrapped.rows - 1);
    expect(wrapped.width).toBeLessThanOrEqual(900);
    expect(wrapped.height).toBeGreaterThan(single.height);
    // Rows start in the same column, and no step is lost or duplicated.
    expect(wrapped.cells.map((cell) => cell.id)).toEqual(single.cells.map((cell) => cell.id));
    expect(new Set(wrapped.cells.filter((cell) => cell.x === single.cells[0]!.x).map((cell) => cell.y)).size).toBe(wrapped.rows);
    expect(wrapped.terminals[1]!.y).toBeGreaterThan(wrapped.terminals[0]!.y);
  });

  it("dims everything inside a bypassed lane and keeps the wire under bypassed cells", () => {
    const layout = layoutOf({ pipeline: [{ _bypassed_: SNV }, { branch: [{ _bypassed_: [MSC, KFOLD] }, [SNV]] }] });
    expect(layout.cells.map((cell) => cell.dimmed)).toEqual([true, true, true, false]);
    expect(layout.lanes.map((lane) => lane.dimmed)).toEqual([true, false]);
    expect(layout.wires.filter((wire) => wire.kind === "through")).toHaveLength(4);
  });

  it("is deterministic and handles an empty pipeline", () => {
    expect(layoutOf(branchDocument(), 1000)).toEqual(layoutOf(branchDocument(), 1000));
    const empty = layoutOf({ pipeline: [] });
    expect(empty.cells).toEqual([]);
    expect(empty.slots).toEqual([expect.objectContaining({ index: 0, persistent: true })]);
    expect(empty.terminals).toHaveLength(2);
  });
});
