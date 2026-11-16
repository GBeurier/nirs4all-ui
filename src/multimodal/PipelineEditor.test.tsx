import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MultimodalPipelineEditor } from "./PipelineEditor.js";
import {
  MULTIMODAL_MODEL_CATALOG,
  MULTIMODAL_MODEL_IDS,
  addBranch,
  connectSource,
  disconnectSource,
  duplicateBranch,
  headForModel,
  insertStep,
  pipelineIssues,
  updateMerge,
  withParam,
} from "./pipelineModel.js";
import type { MultimodalPipelineDocument, MultimodalSource } from "./types.js";

const source = (id: string, label: string, representation: MultimodalSource["representation"], width: number): MultimodalSource => ({
  id,
  label,
  modality: representation === "tabular_numeric" ? "genetics" : "spectroscopy",
  representation,
  sampleIds: [],
  data: [],
  shape: [width],
  featureNames: [],
});

const SOURCES = [source("nir", "NIRS", "signal_1d", 100), source("snp", "Markers", "tabular_numeric", 20)];
const pls = (n: number) => ({ methodId: MULTIMODAL_MODEL_IDS.pls, params: { n_components: n, center_x: true, scale_x: false } });

const STACK: MultimodalPipelineDocument = {
  label: "Stacking",
  branches: [
    { id: "b-nir", label: "NIRS PLS", sourceIds: ["nir"], sourceChains: [{ sourceId: "nir", steps: [] }], head: pls(3) },
    { id: "b-snp", label: "Markers PLS", sourceIds: ["snp"], sourceChains: [{ sourceId: "snp", steps: [] }], head: pls(2) },
  ],
  merge: { kind: "model", head: { methodId: MULTIMODAL_MODEL_IDS.ridge, params: { alpha: 1 } }, sourceIds: [], sourceChains: [] },
};

describe("pipeline model edits", () => {
  it("connects in host order without dropping unknown inputs and declares an empty chain", () => {
    const doc = { ...STACK, branches: [{ ...STACK.branches[1]!, sourceIds: ["snp", "legacy"] }] };
    const next = connectSource(doc, "b-snp", "nir", ["nir", "snp"]);
    expect(next.branches[0]!.sourceIds).toEqual(["nir", "snp", "legacy"]);
    expect(next.branches[0]!.sourceChains.map((chain) => chain.sourceId)).toEqual(["snp", "nir"]);
    const back = disconnectSource(next, "b-snp", "nir");
    expect(back.branches[0]!.sourceIds).toEqual(["snp", "legacy"]);
  });

  it("reports merge/branch mismatches instead of discarding branches", () => {
    const none = updateMerge(STACK, { kind: "none" });
    expect(none.branches).toHaveLength(2);
    expect(pipelineIssues(none, SOURCES).some((issue) => issue.severity === "error" && issue.target.kind === "merge")).toBe(true);
    expect(pipelineIssues(STACK, SOURCES)).toEqual([]);
  });

  it("flags spectral steps on a marker table and unknown sources", () => {
    const withSnv = insertStep(STACK, "b-snp", "snp", { methodId: "preprocessing.scatter.snv", params: {} });
    const unknown = connectSource(withSnv, "b-nir", "ghost", ["nir", "snp"]);
    const messages = pipelineIssues(unknown, SOURCES).map((issue) => issue.message);
    expect(messages.some((message) => message.includes("SNV does not apply"))).toBe(true);
    expect(messages.some((message) => message.includes('"ghost" is not in the loaded dataset'))).toBe(true);
  });

  it("preserves head parameters on edits and carries shared parameters across models", () => {
    const head = withParam({ ...pls(3), params: { ...pls(3).params, host_only: "kept" } }, "n_components", 5);
    expect(head.params).toMatchObject({ n_components: 5, host_only: "kept", center_x: true });
    const mbpls = MULTIMODAL_MODEL_CATALOG.find((option) => option.methodId === MULTIMODAL_MODEL_IDS.mbpls)!;
    expect(headForModel(mbpls, head)).toEqual({ methodId: MULTIMODAL_MODEL_IDS.mbpls, params: { n_components: 5 } });
  });

  it("adds and duplicates branches with fresh unique IDs", () => {
    const added = addBranch(STACK, MULTIMODAL_MODEL_CATALOG[0]!, ["nir"]);
    const copy = duplicateBranch(added.document, "b-nir");
    const ids = copy.document.branches.map((branch) => branch.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[1]).toBe(copy.branchId);
  });
});

describe("MultimodalPipelineEditor", () => {
  it("renders presets, a selectable canvas, merge inputs and a text outline", () => {
    const html = renderToStaticMarkup(
      <MultimodalPipelineEditor
        sources={SOURCES}
        value={STACK}
        onChange={() => undefined}
        presets={[{ id: "stacking", label: "Stacking", description: "Ridge meta-model", strategy: "stacking", document: STACK }]}
        onLoadPreset={() => undefined}
        onExport={() => undefined}
        onImport={() => undefined}
      />,
    );
    expect(html).toContain("Presets (1)");
    expect(html).toContain('data-kind="model"');
    expect(html).toContain("Raw features into the meta-model");
    expect(html).toContain("meta-model fitted on nested out-of-fold predictions of NIRS PLS (PLS · 3 components)");
    expect(html).toContain("Pipeline as text");
    expect(html).toContain("Import JSON");
  });
});
