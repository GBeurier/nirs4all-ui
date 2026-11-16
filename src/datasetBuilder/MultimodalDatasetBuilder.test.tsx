import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MultimodalDatasetBuilder } from "./MultimodalDatasetBuilder.js";
import {
  builderDraftKey,
  builderIssues,
  withFeatures,
  withFieldColumn,
  withProfile,
} from "./multimodalBuilderModel.js";
import type {
  MultimodalBuilderDraft,
  MultimodalBuilderFile,
  MultimodalBuilderSource,
  MultimodalBuilderValidation,
} from "./multimodalTypes.js";

function source(partial: Partial<MultimodalBuilderSource> & Pick<MultimodalBuilderSource, "id" | "file">): MultimodalBuilderSource {
  return {
    label: partial.id,
    role: "source",
    profile: "numeric_csv",
    modality: "spectroscopy",
    columns: [],
    rowCount: 3,
    sampleId: "",
    target: "",
    targetUnit: "",
    group: "",
    partition: "",
    features: [],
    axisMode: "none",
    axisKind: "",
    axisUnit: "",
    shape: [],
    warnings: [],
    ...partial,
  };
}

const FILES: MultimodalBuilderFile[] = [
  { name: "nir.csv", size: 2048, kind: "table" },
  { name: "meta.csv", size: 512, kind: "table" },
  { name: "a.png", size: 300, kind: "image" },
];

function completeDraft(): MultimodalBuilderDraft {
  return {
    name: "demo",
    sources: [
      source({
        id: "nir",
        file: "nir.csv",
        label: "NIR",
        columns: [
          { name: "sample_id", preview: "S1", kind: "string" },
          { name: "1100", preview: "0.31", kind: "float" },
          { name: "1102", preview: "0.32", kind: "float" },
        ],
        sampleId: "sample_id",
        features: ["1100", "1102"],
        axisMode: "headers",
        axisKind: "wavelength",
        axisUnit: "nm",
      }),
      source({
        id: "meta",
        file: "meta.csv",
        label: "Meta",
        role: "metadata",
        columns: [
          { name: "sample_id", preview: "S1", kind: "string" },
          { name: "protein", preview: "12.1", kind: "float" },
        ],
        sampleId: "sample_id",
        target: "protein",
      }),
    ],
  };
}

const IDLE: MultimodalBuilderValidation = { status: "idle" };
const noop = () => undefined;

function render(draft: MultimodalBuilderDraft, validation: MultimodalBuilderValidation = IDLE) {
  return renderToStaticMarkup(
    <MultimodalDatasetBuilder
      files={FILES}
      draft={draft}
      onDraftChange={noop}
      onAddFiles={noop}
      onRemoveFile={noop}
      validation={validation}
      onValidate={noop}
      onCreate={noop}
    />,
  );
}

describe("MultimodalDatasetBuilder", () => {
  it("opens on the Source step with the shared stepper and a separated image inventory", () => {
    const html = render(completeDraft());
    expect(html).toContain("dsb-stepper");
    expect(html).toContain("Step 1 of 4");
    expect(html).toContain("Add your files");
    expect(html).toContain('type="file"');
    expect(html).toContain("Mapping tables");
    expect(html).toContain("Image assets (PNG)");
    expect(html).toContain("nir.csv");
    expect(html).toContain("a.png");
    expect(html).toContain("Continue to Role");
    expect(html).toContain("Not validated");
  });

  it("shows a host validation present at mount and the host error", () => {
    const html = renderToStaticMarkup(
      <MultimodalDatasetBuilder
        files={FILES}
        draft={completeDraft()}
        onDraftChange={noop}
        onAddFiles={noop}
        onRemoveFile={noop}
        validation={{ status: "valid", samples: 3 }}
        onValidate={noop}
        onCreate={noop}
        error="Owner refused the VCF header."
      />,
    );
    expect(html).toContain("Validated");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Owner refused the VCF header.");
  });
});

describe("multimodal builder model", () => {
  it("guides spectral and genetic axes according to the owner import profiles", () => {
    const draft = completeDraft();
    const nir = draft.sources[0] as MultimodalBuilderSource;
    const issues = (updated: MultimodalBuilderSource) => builderIssues(FILES, { ...draft, sources: [updated, draft.sources[1]!] });
    expect(issues({ ...nir, axisMode: "none" }).some((issue) => issue.blocking && issue.message.includes("explicit axis"))).toBe(true);
    expect(issues({ ...nir, modality: "genetics" }).some((issue) => issue.blocking && issue.message.includes("no spectral axis"))).toBe(true);
    expect(issues({ ...nir, modality: "genetics", axisMode: "none" }).filter((issue) => issue.blocking)).toEqual([]);
  });
  it("reports no blocking field for a complete draft", () => {
    expect(builderIssues(FILES, completeDraft()).filter((issue) => issue.blocking)).toEqual([]);
  });

  it("blocks a missing sample identifier, target and declared coordinates", () => {
    const draft = completeDraft();
    const [nir, meta] = draft.sources as [MultimodalBuilderSource, MultimodalBuilderSource];
    const broken: MultimodalBuilderDraft = {
      ...draft,
      sources: [
        { ...nir, sampleId: "", axisMode: "declared", coordinates: { "1100": 1100 } },
        { ...meta, target: "" },
      ],
    };
    const messages = builderIssues(FILES, broken)
      .filter((issue) => issue.blocking)
      .map((issue) => issue.message);
    expect(messages).toContain("NIR: choose the sample identifier column.");
    expect(messages).toContain("Choose the target column.");
    expect(messages).toContain("NIR: declare the axis value of 1 feature.");
  });

  it("requires an explicit HWC shape and the fixed headers for PNG manifests", () => {
    const manifest = source({
      id: "img",
      file: "meta.csv",
      label: "Images",
      profile: "png_manifest",
      modality: "image",
      columns: [{ name: "id", preview: "S1", kind: "string" }],
    });
    const draft: MultimodalBuilderDraft = { ...completeDraft(), sources: [...completeDraft().sources, manifest] };
    const messages = builderIssues(FILES, draft).map((issue) => issue.message);
    expect(messages).toContain("Images: the manifest needs the exact headers sample_id and file.");
    expect(messages).toContain("Images: declare the image shape as height × width × channels.");
  });

  it("changes the validation key on mapping edits but not on host warnings", () => {
    const draft = completeDraft();
    const key = builderDraftKey(FILES, draft);
    const warned = { ...draft, sources: draft.sources.map((s) => ({ ...s, warnings: ["note"] })) };
    expect(builderDraftKey(FILES, warned)).toBe(key);
    const edited = { ...draft, sources: draft.sources.map((s) => ({ ...s, label: `${s.label}!` })) };
    expect(builderDraftKey(FILES, edited)).not.toBe(key);
    expect(builderDraftKey(FILES.slice(1), draft)).not.toBe(key);
  });

  it("keeps column order, refuses reserved columns and frees reassigned features", () => {
    const nir = completeDraft().sources[0] as MultimodalBuilderSource;
    const cleared = withFeatures(nir, ["1100", "1102"], false);
    expect(cleared.features).toEqual([]);
    expect(withFeatures(cleared, ["1102", "sample_id", "1100"], true).features).toEqual(["1100", "1102"]);
    expect(withFieldColumn(nir, "sampleId", "1100").features).toEqual(["1102"]);
  });

  it("aligns modality, role and axis with a profile change", () => {
    const meta = completeDraft().sources[1] as MultimodalBuilderSource;
    const image = withProfile({ ...meta, axisMode: "headers" }, "png_manifest");
    expect(image.modality).toBe("image");
    expect(image.role).toBe("source");
    expect(image.axisMode).toBe("none");
  });
});
