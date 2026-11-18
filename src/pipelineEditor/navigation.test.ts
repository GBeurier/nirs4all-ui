import { describe, expect, it } from "vitest";

import { layoutChain } from "./layout.js";
import { parsePipeline } from "./model.js";
import { childSelection, commandForKey, focusTargets, moveFocus, parentSelection, selectionKey } from "./navigation.js";
import { KFOLD, MSC, SNV, branchDocument, pls, searchDocument } from "./__fixtures__/pipelines.js";
import type { ChainItem, ChainSelection, ForkNode, PipelineChainDocument } from "./types.js";

function setup(document: PipelineChainDocument, wrapWidth?: number) {
  const model = parsePipeline(document);
  const targets = focusTargets(layoutChain(model, { wrapWidth }));
  const keyOf = (item: ChainItem) => selectionKey({ kind: "item", id: item.id });
  const go = (item: ChainItem, direction: "left" | "right" | "up" | "down") => moveFocus(targets, keyOf(item), direction)?.selection;
  return { model, targets, go };
}

describe("rack keyboard travel", () => {
  it("follows the chain with Left / Right and enters the lane on the wire", () => {
    const { model, go } = setup(branchDocument());
    const [split, fork, merge, head] = model.root.items as [ChainItem, ForkNode, ChainItem, ChainItem];
    const middle = fork.lanes[1]!.items[0]!;
    expect(go(split, "right")).toEqual({ kind: "item", id: middle.id });
    expect(go(middle, "left")).toEqual({ kind: "item", id: split.id });
    expect(go(merge, "right")).toEqual({ kind: "item", id: head.id });
    expect(go(head, "left")).toEqual({ kind: "item", id: merge.id });
  });

  it("changes lane with Up / Down and stays in the lane with Left / Right", () => {
    const { model, go } = setup(branchDocument());
    const fork = model.root.items[1] as ForkNode;
    const [first, second] = fork.lanes[0]!.items as [ChainItem, ChainItem];
    const middle = fork.lanes[1]!.items[0]!;
    expect(go(first, "right")).toEqual({ kind: "item", id: second.id });
    expect(go(first, "down")).toEqual({ kind: "item", id: middle.id });
    expect(go(middle, "up")).toEqual({ kind: "item", id: first.id });
  });

  it("continues onto the next wrapped row at the end of a row", () => {
    const document: PipelineChainDocument = { pipeline: [SNV, MSC, KFOLD, pls(2), pls(4), pls(6)] };
    const { model, go, targets } = setup(document, 900);
    const cells = model.root.items;
    const rowOf = (item: ChainItem) => targets.find((target) => target.key === selectionKey({ kind: "item", id: item.id }))!.rect.y;
    const lastOfFirstRow = [...cells].reverse().find((item) => rowOf(item) === rowOf(cells[0]!))!;
    const next = cells[cells.indexOf(lastOfFirstRow) + 1]!;
    expect(rowOf(next)).toBeGreaterThan(rowOf(lastOfFirstRow));
    expect(go(lastOfFirstRow, "right")).toEqual({ kind: "item", id: next.id });
    expect(go(next, "left")).toEqual({ kind: "item", id: lastOfFirstRow.id });
  });

  it("keeps the arrows on the signal path and reaches lanes and groups by level", () => {
    const { model, targets } = setup(branchDocument());
    const kinds = new Set(targets.map((target) => target.selection.kind));
    expect([...kinds].sort()).toEqual(["item", "lane", "newLane", "slot"]);
    expect(moveFocus(targets, "missing", "right")).toBe(targets[0]);
    for (const from of targets) {
      for (const direction of ["left", "right", "up", "down"] as const) expect(moveFocus(targets, from.key, direction)?.primary ?? true).toBe(true);
    }
    const fork = model.root.items[1] as ForkNode;
    const lane = fork.lanes[0]!;
    const cell: ChainSelection = { kind: "item", id: lane.items[1]!.id };
    expect(parentSelection(model, cell)).toEqual({ kind: "lane", id: lane.id });
    expect(parentSelection(model, { kind: "lane", id: lane.id })).toEqual({ kind: "item", id: fork.id });
    expect(parentSelection(model, { kind: "item", id: fork.id })).toBeNull();
    expect(childSelection(model, { kind: "item", id: fork.id })).toEqual({ kind: "item", id: lane.items[0]!.id });
    expect(childSelection(model, { kind: "lane", id: fork.lanes[2]!.id })).toEqual({ kind: "slot", chain: fork.lanes[2]!.chain, index: 0 });
    expect(childSelection(model, cell)).toBeNull();
  });

  it("treats the options of a selector bank as children of the group", () => {
    const model = parsePipeline(searchDocument());
    const bank = model.root.items[0] as ForkNode;
    expect(parentSelection(model, { kind: "item", id: bank.lanes[1]!.items[0]!.id })).toEqual({ kind: "item", id: bank.id });
    expect(childSelection(model, { kind: "item", id: bank.id })).toEqual({ kind: "lane", id: bank.lanes[0]!.id });
  });
});

describe("commandForKey", () => {
  it("maps rack keys to commands", () => {
    expect(commandForKey({ key: "ArrowRight" })).toEqual({ type: "focus", direction: "right" });
    expect(commandForKey({ key: "ArrowLeft", altKey: true })).toEqual({ type: "nudge", direction: -1 });
    expect(commandForKey({ key: "ArrowDown", altKey: true })).toEqual({ type: "lane", direction: 1 });
    expect(commandForKey({ key: "ArrowUp", shiftKey: true })).toEqual({ type: "level", direction: "out" });
    expect(commandForKey({ key: "ArrowDown", shiftKey: true })).toEqual({ type: "level", direction: "in" });
    expect(commandForKey({ key: "a" })).toEqual({ type: "add", where: "after" });
    expect(commandForKey({ key: "A", shiftKey: true })).toEqual({ type: "add", where: "before" });
    expect(commandForKey({ key: "b" })).toEqual({ type: "bypass" });
    expect(commandForKey({ key: "Delete" })).toEqual({ type: "remove" });
    expect(commandForKey({ key: "Enter" })).toEqual({ type: "activate" });
    expect(commandForKey({ key: "d" })).toEqual({ type: "duplicate" });
    expect(commandForKey({ key: "z", ctrlKey: true })).toEqual({ type: "undo" });
    expect(commandForKey({ key: "Z", metaKey: true, shiftKey: true })).toEqual({ type: "redo" });
    expect(commandForKey({ key: "Escape" })).toEqual({ type: "escape" });
  });

  it("leaves browser shortcuts and unrelated keys alone", () => {
    expect(commandForKey({ key: "a", ctrlKey: true })).toBeNull();
    expect(commandForKey({ key: "Tab" })).toBeNull();
    expect(commandForKey({ key: "x" })).toBeNull();
    expect(commandForKey({ key: "b", altKey: true })).toBeNull();
  });
});
