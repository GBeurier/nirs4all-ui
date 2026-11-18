import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { stepLines } from "./ChainCanvas.js";
import { indexCatalog } from "./catalog.js";
import { parsePipeline } from "./model.js";
import { PipelineChainEditor } from "./PipelineChainEditor.js";
import { CATALOG, SNV, branchDocument, searchDocument } from "./__fixtures__/pipelines.js";
import type { PipelineChainDocument, StepNode } from "./types.js";

const render = (value: PipelineChainDocument, props: Partial<Parameters<typeof PipelineChainEditor>[0]> = {}) =>
  renderToStaticMarkup(<PipelineChainEditor value={value} onChange={() => undefined} catalog={CATALOG} {...props} />);
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("PipelineChainEditor", () => {
  it("renders every step as a labelled cell between the two terminals", () => {
    const html = render(branchDocument());
    for (const label of ["Splitter: K-fold. n_splits 5", "Preprocessing: SNV", "Preprocessing: Savitzky-Golay. window_length 15", "Preprocessing: MSC", "Merge: Merge. features", "Model: PLS-10. PLS regression, n_components 10"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(count(html, 'class="n4rack__cell"')).toBe(6);
    expect(count(html, 'class="n4rack__terminal"')).toBe(2);
    expect(html).toContain("Branches");
    expect(html).toContain("<strong>Branch</strong>");
    expect(html).toContain("3 lanes");
    expect(html).toContain("empty lane");
    // One tab stop into the rack; the rest is reached with the arrow keys.
    expect(count(html, 'tabindex="0"')).toBe(1);
  });

  it("shows generators and tuning on the cells and sizes the variants", () => {
    const html = render(searchDocument());
    expect(html).toContain("<strong>One of</strong>");
    expect(html).toContain("3 → 2");
    expect(html).toContain("2 → 30 step 4");
    expect(html).toContain("×8");
    expect(html).toContain("1 … 25");
    expect(html).toContain("≈ 16 variants");
    expect(count(html, "data-mini")).toBe(2);
  });

  it("marks bypassed cells and counts them", () => {
    const html = render({ pipeline: [{ _bypassed_: SNV }, SNV] });
    expect(count(html, "data-bypassed")).toBe(1);
    expect(html).toContain('aria-label="Preprocessing: SNV, bypassed"');
    // One static name per switch; the state is carried by aria-checked.
    expect(html).toMatch(/role="switch" aria-checked="false" aria-label="Active: SNV" title="Enable"/);
    expect(html).toMatch(/role="switch" aria-checked="true" aria-label="Active: SNV" title="Bypass"/);
    expect(html).toContain("<dt>bypassed</dt><dd>1</dd>");
  });

  it("offers no editing affordance when read-only", () => {
    const editable = render(branchDocument());
    const readOnly = render(branchDocument(), { readOnly: true });
    expect(editable).toContain("n4rack__slot");
    expect(editable).toContain("n4rack__led");
    expect(editable).toContain('draggable="true"');
    for (const marker of ["n4rack__slot", "n4rack__led", "n4rack__newlane", 'draggable="true"']) expect(readOnly).not.toContain(marker);
    expect(count(readOnly, 'class="n4rack__cell"')).toBe(6);
  });

  it("invites the first step on an empty pipeline and shows history controls only when the host provides them", () => {
    const empty = render({ pipeline: [] });
    expect(empty).toContain("Add the first step");
    expect(empty).toContain("Untitled pipeline");
    expect(empty).not.toContain('title="Undo"');
    const withHistory = render({ pipeline: [] }, { onUndo: () => undefined, onRedo: () => undefined, canUndo: false, canRedo: true });
    expect(withHistory).toMatch(/title="Undo"[^>]*disabled/);
    expect(withHistory).toMatch(/title="Redo"(?![^>]*disabled)/);
  });

  it("uses host labels, terminals and an authoritative variant count", () => {
    const html = render(searchDocument(), { labels: { output: "Scores", variants: "pipelines" }, inputLabel: "Wheat 2025", variantCount: 12 });
    expect(html).toContain("Wheat 2025");
    expect(html).toContain("Scores");
    expect(html).toContain("12 pipelines");
    expect(html).not.toContain("≈");
  });

  it("always keeps one tab stop, also when the pipeline has no cell", () => {
    for (const pipeline of [[], [{ _or_: [null] }], [{ branch: [[], []] }], [{ _cartesian_: [] }]]) {
      expect(count(render({ pipeline }), 'tabindex="0"')).toBe(1);
    }
  });

  it("lists generators first in the cell summary", () => {
    const model = parsePipeline(searchDocument(), indexCatalog(CATALOG));
    expect(stepLines(model.root.items[2] as StepNode)).toEqual([{ name: "n_components", text: "2 → 30 step 4", kind: "sweep" }]);
    expect(stepLines(model.root.items[3] as StepNode)).toEqual([
      { name: "n_components", text: "1 … 25", kind: "tune" },
      { name: "scale", text: "false", kind: "fixed" },
    ]);
  });
});
