import { useEffect, useRef, useState } from "react";

import {
  MultimodalDatasetBuilder,
  builderIssues,
  type MultimodalBuilderColumn,
  type MultimodalBuilderDraft,
  type MultimodalBuilderFile,
  type MultimodalBuilderSource,
  type MultimodalBuilderValidation,
} from "../../../src/datasetBuilder/index.js";

/*
 * Showroom host for the controlled MultimodalDatasetBuilder. A real host
 * (nirs4all-web) describes tables with the IO owner and validates alignment
 * with IO.assembleMultimodalFiles. Here every description and validation
 * result is illustrative: nothing reads the picked files.
 */

const WAVELENGTHS = Array.from({ length: 48 }, (_, i) => String(1100 + i * 30));
const VARIANTS = Array.from({ length: 36 }, (_, i) => `chr${1 + (i % 5)}:${10_400 + i * 731}`);
const IMAGE_COUNT = 30;

function columns(entries: ReadonlyArray<[string, string | null, string]>): MultimodalBuilderColumn[] {
  return entries.map(([name, preview, kind]) => ({ name, preview, kind }));
}

function baseSource(partial: Partial<MultimodalBuilderSource> & Pick<MultimodalBuilderSource, "id" | "file">): MultimodalBuilderSource {
  return {
    label: partial.file.replace(/\.[^.]+$/, ""),
    role: "source",
    profile: "numeric_csv",
    modality: "spectroscopy",
    columns: [],
    rowCount: null,
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

const INITIAL_FILES: MultimodalBuilderFile[] = [
  { name: "nir_spectra.csv", size: 182_400, kind: "table" },
  { name: "samples.csv", size: 3_150, kind: "table" },
  { name: "genotypes.vcf", size: 41_870, kind: "vcf" },
  { name: "leaf_images.csv", size: 1_020, kind: "table" },
  ...Array.from({ length: IMAGE_COUNT }, (_, i) => ({
    name: `leaf_${String(i + 1).padStart(3, "0")}.png`,
    size: 2_300 + ((i * 97) % 400),
    kind: "image" as const,
  })),
];

const INITIAL_DRAFT: MultimodalBuilderDraft = {
  name: "wheat_multimodal_demo",
  sources: [
    baseSource({
      id: "nir",
      file: "nir_spectra.csv",
      label: "NIR spectra",
      modality: "spectroscopy",
      rowCount: 120,
      columns: columns([
        ["sample_id", "W-001", "string"],
        ...WAVELENGTHS.map((w, i): [string, string, string] => [w, (0.31 + i * 0.004).toFixed(4), "float"]),
      ]),
      sampleId: "sample_id",
      features: WAVELENGTHS,
      axisMode: "headers",
      axisKind: "wavelength",
      axisUnit: "nm",
    }),
    baseSource({
      id: "samples",
      file: "samples.csv",
      label: "Sample sheet",
      role: "metadata",
      rowCount: 120,
      columns: columns([
        ["sample_id", "W-001", "string"],
        ["protein", "12.84", "float"],
        ["field", "F07", "string"],
        ["split", "calibration", "string"],
        ["operator", "A. Martin", "string"],
      ]),
      sampleId: "sample_id",
      target: "protein",
      targetUnit: "%",
    }),
    baseSource({
      id: "vcf",
      file: "genotypes.vcf",
      label: "Genotypes",
      profile: "vcf_gt_dosage",
      modality: "genetics",
      rowCount: 120,
      features: VARIANTS,
      warnings: ["Showroom data: variant identities are illustrative."],
    }),
    baseSource({
      id: "img",
      file: "leaf_images.csv",
      label: "Leaf images",
      profile: "png_manifest",
      modality: "image",
      rowCount: IMAGE_COUNT,
      columns: columns([
        ["sample_id", "W-001", "string"],
        ["file", "leaf_001.png", "string"],
      ]),
      sampleId: "sample_id",
      shape: [32, 32, 1],
    }),
  ],
};

function fileKind(name: string): MultimodalBuilderFile["kind"] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image";
  if (lower.endsWith(".vcf")) return "vcf";
  if (lower.endsWith(".json")) return "manifest";
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) return "table";
  return "other";
}

const IDLE: MultimodalBuilderValidation = { status: "idle" };

export function MultimodalBuilderDemo() {
  const [files, setFiles] = useState<MultimodalBuilderFile[]>(INITIAL_FILES);
  const [draft, setDraft] = useState<MultimodalBuilderDraft>(INITIAL_DRAFT);
  const [validation, setValidation] = useState<MultimodalBuilderValidation>(IDLE);
  const [created, setCreated] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const invalidate = () => {
    if (timer.current) clearTimeout(timer.current);
    setValidation(IDLE);
    setCreated(null);
  };

  const onDraftChange = (next: MultimodalBuilderDraft) => {
    setDraft(next);
    invalidate();
  };

  const onAddFiles = (picked: readonly File[]) => {
    // Inventory only: a real host forwards the File objects to its owner adapters.
    const added = picked.map((file) => ({ name: file.name, size: file.size, kind: fileKind(file.name) }));
    const names = new Set(added.map((file) => file.name));
    setFiles((current) => [...current.filter((file) => !names.has(file.name)), ...added]);
    setDraft((current) => ({
      ...current,
      sources: [
        ...current.sources.filter((source) => !names.has(source.file)),
        ...added
          .filter((file) => file.kind === "table" || file.kind === "vcf")
          .map((file) =>
            baseSource({
              id: `added-${file.name}`,
              file: file.name,
              profile: file.kind === "vcf" ? "vcf_gt_dosage" : "numeric_csv",
              modality: file.kind === "vcf" ? "genetics" : "spectroscopy",
              role: "ignored",
              warnings: ["Showroom only: columns are described by the host IO owner in a real application."],
            }),
          ),
      ],
    }));
    invalidate();
  };

  const onRemoveFile = (name: string) => {
    setFiles((current) => current.filter((file) => file.name !== name));
    setDraft((current) => ({ ...current, sources: current.sources.filter((source) => source.file !== name) }));
    invalidate();
  };

  const onValidate = () => {
    setValidation({ status: "checking" });
    setCreated(null);
    const blocking = builderIssues(files, draft).filter((issue) => issue.blocking);
    const active = draft.sources.filter((source) => source.role !== "ignored");
    timer.current = setTimeout(() => {
      if (blocking.length > 0) {
        setValidation({ status: "error", message: `Illustrative refusal: ${blocking[0]?.message ?? "incomplete mapping"}` });
        return;
      }
      setValidation({
        status: "valid",
        message: "Illustrative result from the showroom host — no owner ran.",
        samples: 118,
        groups: 12,
        calibration: 94,
        holdout: 24,
        fingerprint: "demo-0000-illustrative",
        sources: active.map((source, index) => ({
          id: source.id,
          label: source.label || source.file,
          matched: 118,
          missing: index === 0 ? 2 : 0,
          refused: 0,
          missingCells: 0,
        })),
      });
    }, 700);
  };

  return (
    <div className="builder-demo">
      <div className="builder-demo__head">
        <h3>Controlled multimodal builder</h3>
        <p>
          <code>MultimodalDatasetBuilder</code> is fully controlled: the host keeps the file inventory, the draft and the owner
          validation, and receives picked or dropped <code>File</code> objects. In this showroom the table descriptions and the
          validation result are illustrative stand-ins for <code>IO.describeTables</code> and{" "}
          <code>IO.assembleMultimodalFiles</code>; editing anything clears the validation.
        </p>
      </div>
      <MultimodalDatasetBuilder
        files={files}
        draft={draft}
        onDraftChange={onDraftChange}
        onAddFiles={onAddFiles}
        onRemoveFile={onRemoveFile}
        validation={validation}
        onValidate={onValidate}
        onCreate={() => setCreated(draft.name)}
      />
      <p className="builder-demo__status" role="status">
        {created
          ? `Showroom host received onCreate for “${created}”. A real host would now assemble the dataset with the owner.`
          : "Host callbacks are illustrative here; no file is read and no dataset is created."}
      </p>
    </div>
  );
}
