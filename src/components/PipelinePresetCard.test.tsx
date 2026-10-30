import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PipelinePresetCard } from "./PipelinePresetCard.js";
import type { PipelinePreset } from "../pipelines/index.js";

describe("PipelinePresetCard", () => {
  it("renders canonical recipe statistics, task actions, and escaped authored text", () => {
    const preset: PipelinePreset = {
      id: "simple_pls", name: "<PLS>", description: "<script>unsafe</script>",
      complexity: 1, steps_count: 2, default_variant: "regression",
      available_variants: ["regression", "classification"],
      variants: { regression: { pipeline: [
        "nirs4all.operators.transforms.StandardNormalVariate",
        { model: "sklearn.cross_decomposition.PLSRegression", _range_: [2, 6, 2], param: "n_components" },
      ] } },
    };
    const markup = renderToStaticMarkup(createElement(PipelinePresetCard, {
      preset,
      renderVariant: (variant) => createElement("a", { href: `/${variant}` }, variant),
    }));
    expect(markup).toContain("&lt;PLS&gt;");
    expect(markup).not.toContain("<script>");
    expect(markup).toContain('href="/classification"');
    expect(markup).toContain('href="/regression"');
    expect(markup).toContain("1/10");
    expect(markup).toContain('n4-preset-emphasize">3');
    expect(markup).toContain("StandardNormalVariate");
  });
});
