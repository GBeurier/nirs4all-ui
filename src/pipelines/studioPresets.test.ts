import { describe, expect, it } from "vitest";
import { getStudioPipelinePresets, STUDIO_PRESET_SOURCE } from "./studioPresets.js";
import { buildPresetCardModel } from "./presets.js";

describe("Studio preset catalogue", () => {
  it("shares all ten authored presets and twenty complete task recipes", () => {
    const presets = getStudioPipelinePresets();
    expect(presets).toHaveLength(10);
    expect(Object.keys(STUDIO_PRESET_SOURCE.files_sha256)).toHaveLength(10);
    for (const preset of presets) {
      expect(preset.available_variants).toEqual(["regression", "classification"]);
      expect(preset.variants?.regression?.pipeline.length).toBeGreaterThan(0);
      expect(preset.variants?.classification?.pipeline.length).toBeGreaterThan(0);
      expect(buildPresetCardModel(preset).operatorCount).toBeGreaterThan(0);
    }
    expect(presets.map((preset) => preset.complexity)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("isolates edits from the shared defaults", () => {
    const first = getStudioPipelinePresets();
    first[0]!.name = "Edited";
    first[0]!.variants!.regression!.pipeline.length = 0;
    const next = getStudioPipelinePresets();
    expect(next[0]!.name).toBe("Simple PLS");
    expect(next[0]!.variants!.regression!.pipeline.length).toBeGreaterThan(0);
  });
});
