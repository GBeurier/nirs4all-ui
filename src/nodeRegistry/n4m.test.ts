import { describe, expect, it } from "vitest";

import manifestFixture from "./__fixtures__/n4m_manifest_trimmed.json" with { type: "json" };
import { type N4mManifest, type NodeDefinition, projectN4mManifest } from "./n4m.js";

const manifest = manifestFixture as N4mManifest;
const nodes = projectN4mManifest(manifest);

function node(id: string): NodeDefinition {
  const found = nodes.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`missing node ${id}`);
  return found;
}

describe("projectN4mManifest", () => {
  it("projects one node per role node type and omits generic procedures", () => {
    expect(nodes.map((candidate) => candidate.id)).toEqual([
      "model.n4m_aom_pop_aom_chain_fixed_fit",
      "augmentation.n4m_augmentation_wavelength_wavelength_shift",
      "filter.n4m_filters_x_outlier",
      "model.n4m_models_classification_pls_lda",
      "model.n4m_models_multiblock_mb_pls",
      "preprocessing.n4m_models_pls_pls_regression",
      "model.n4m_models_pls_pls_regression",
      "model.n4m_models_transfer_di_pls",
      "preprocessing.n4m_preprocessing_derivatives_savitzky_golay",
      "preprocessing.n4m_preprocessing_scatter_snv",
      "preprocessing.n4m_selection_cars",
      "splitting.n4m_splitters_spxy_g_fold",
    ]);
    expect(nodes.some((candidate) => candidate.n4m.methodId === "diagnostics.regression_metrics")).toBe(false);
  });

  it("maps roles to node types and keeps the role", () => {
    expect(node("preprocessing.n4m_selection_cars")).toMatchObject({ type: "preprocessing", n4m: { role: "selector" } });
    expect(node("filter.n4m_filters_x_outlier").n4m.role).toBe("sample_filter");
    expect(node("splitting.n4m_splitters_spxy_g_fold").n4m.role).toBe("splitter");
    expect(node("augmentation.n4m_augmentation_wavelength_wavelength_shift").n4m.role).toBe("augmenter");
    expect(node("model.n4m_models_classification_pls_lda").n4m.role).toBe("classifier");
    expect(node("preprocessing.n4m_models_pls_pls_regression").n4m.role).toBe("transformer");
    expect(node("model.n4m_models_pls_pls_regression").n4m.role).toBe("regressor");
  });

  it("derives the operator token, label and group from the method id", () => {
    expect(node("preprocessing.n4m_preprocessing_scatter_snv")).toMatchObject({
      name: "SNV",
      category: "Scatter",
      classPath: "n4m:preprocessing.scatter.snv",
      source: "n4m",
      tags: ["n4m", "transformer", "scatter"],
    });
    expect(node("preprocessing.n4m_preprocessing_derivatives_savitzky_golay")).toMatchObject({
      name: "Savitzky Golay",
      category: "Derivatives",
    });
    expect(node("model.n4m_models_classification_pls_lda").name).toBe("PLS LDA");
    expect(node("model.n4m_aom_pop_aom_chain_fixed_fit").category).toBe("AOM POP");
  });

  it("maps parameter types, bounds, choices and defaults", () => {
    const params = node("preprocessing.n4m_preprocessing_derivatives_savitzky_golay").parameters;
    expect(params.find((param) => param.name === "window_length")).toEqual({
      name: "window_length",
      label: "Window Length",
      type: "int",
      required: false,
      default: 5,
      min: 1,
    });
    expect(params.find((param) => param.name === "delta")).toMatchObject({ type: "float", default: 1 });
    expect(params.find((param) => param.name === "mode")).toMatchObject({
      type: "select",
      default: "mirror",
      options: [
        { value: "mirror", label: "mirror" },
        { value: "constant", label: "constant" },
        { value: "nearest", label: "nearest" },
        { value: "wrap", label: "wrap" },
        { value: "interp", label: "interp" },
      ],
    });
    expect(node("preprocessing.n4m_preprocessing_scatter_snv").parameters[0]).toMatchObject({ type: "bool", default: true });
  });

  it("leaves a null default unset and maps arrays with their item type", () => {
    const params = node("model.n4m_aom_pop_aom_chain_fixed_fit").parameters;
    const opKinds = params.find((param) => param.name === "op_kinds");
    expect(opKinds).toEqual({ name: "op_kinds", label: "Op Kinds", type: "array", required: true, itemType: "int", min: 0, max: 18 });
    expect(opKinds && "default" in opKinds).toBe(false);
    expect(params.find((param) => param.name === "chain_params")).toMatchObject({ type: "array", itemType: "float", required: false, default: [] });
  });

  it("surfaces the fit inputs a method needs", () => {
    expect(node("model.n4m_models_multiblock_mb_pls").n4m.fitInputs).toEqual([
      { input: "y", requirement: "required", label: "targets" },
      { input: "blocks", requirement: "required", label: "multiblock" },
    ]);
    expect(node("model.n4m_models_transfer_di_pls").description).toBe(
      "Native nirs4all-methods regressor (models.transfer.di_pls). Requires transfer target.",
    );
    expect(node("augmentation.n4m_augmentation_wavelength_wavelength_shift").n4m.fitInputs).toEqual([
      { input: "axis", requirement: "optional", label: "wavelengths" },
    ]);
    expect(node("model.n4m_models_classification_pls_lda").n4m.fitInputs).toEqual([
      { input: "labels", requirement: "required", label: "class labels" },
    ]);
    expect(node("splitting.n4m_splitters_spxy_g_fold").description).toContain("Requires sample groups.");
  });
});
