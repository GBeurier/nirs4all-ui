import { useState } from "react";

import {
  MULTIMODAL_MODEL_IDS,
  MultimodalPipelineEditor,
  findModelOption,
  headForModel,
  type MultimodalPipelineBranch,
  type MultimodalPipelineDocument,
  type MultimodalPipelinePreset,
  type MultimodalSource,
  type MultimodalSourceChain,
} from "../../../src/multimodal/index.js";

// Metadata-only descriptors: this showroom loads no observations or target values.
const SOURCES: readonly MultimodalSource[] = [
  { id: "nirs", label: "NIR spectra", modality: "spectroscopy", representation: "signal_1d", shape: [48],
    sampleIds: [], data: [], featureNames: Array.from({ length: 48 }, (_, i) => `${1100 + i * 30} nm`) },
  { id: "markers", label: "Genetic markers", modality: "genetics", representation: "tabular_numeric", shape: [12],
    sampleIds: [], data: [], featureNames: Array.from({ length: 12 }, (_, i) => `variant-${i + 1}`) },
  { id: "images", label: "Leaf images", modality: "image", representation: "gray_image", shape: [8, 8, 1],
    sampleIds: [], data: [], featureNames: Array.from({ length: 64 }, (_, i) => `pixel-${i + 1}`) },
];
const SOURCE_IDS = SOURCES.map((source) => source.id);
const head = (methodId: string) => headForModel(findModelOption(methodId)!);
const chains = (ids: readonly string[]): MultimodalSourceChain[] => ids.map((sourceId) => ({ sourceId,
  steps: [{ methodId: "preprocessing.scaling.standard_scale", params: { with_mean: true, with_std: true, ddof: 0 } }] }));
const branch = (id: string, label: string, ids: readonly string[], methodId: string = MULTIMODAL_MODEL_IDS.pls): MultimodalPipelineBranch =>
  ({ id, label, sourceIds: [...ids], sourceChains: chains(ids), head: head(methodId) });
const sourceBranches = () => SOURCES.map((source) => branch(`${source.id}-pls`, `${source.label} PLS`, [source.id]));

function document(
  label: string,
  branches: readonly MultimodalPipelineBranch[],
  kind: MultimodalPipelineDocument["merge"]["kind"] = "none",
  rawSources: readonly string[] = [],
): MultimodalPipelineDocument {
  return { label, branches, merge: { kind, head: head(MULTIMODAL_MODEL_IDS.ridge),
    sourceIds: [...rawSources], sourceChains: chains(rawSources) } };
}

const PRESETS: readonly MultimodalPipelinePreset[] = [
  { id: "early", label: "Early feature fusion", strategy: "early", description: "All three source inputs in one PLS branch.",
    document: document("Early feature fusion", [branch("joint", "Joint PLS", SOURCE_IDS)]) },
  { id: "mbpls", label: "Multiblock PLS", strategy: "mbpls", description: "Centred source blocks with equal super weights.",
    document: document("Multiblock PLS", [branch("joint", "Joint MB-PLS", SOURCE_IDS, MULTIMODAL_MODEL_IDS.mbpls)]) },
  { id: "mid", label: "Learned intermediate fusion", strategy: "mid", description: "One jointly trained neural branch per source, inside a shared model.",
    document: document("Learned intermediate fusion", [branch("joint", "Joint network", SOURCE_IDS, MULTIMODAL_MODEL_IDS.neural)]) },
  { id: "late", label: "Fixed late mean", strategy: "late", description: "Separate source PLS predictions, combined with a fixed unweighted mean.",
    document: document("Fixed late mean", sourceBranches(), "mean") },
  { id: "stacking", label: "Learned prediction stacking", strategy: "stacking", description: "Source PLS predictions feed a Ridge meta-model using nested OOF training.",
    document: document("Learned prediction stacking", sourceBranches(), "model") },
  { id: "hybrid", label: "Hybrid raw features and predictions", strategy: "hybrid", description: "Ridge meta-model receives OOF predictions plus transformed NIR features.",
    document: document("Hybrid raw features and predictions", sourceBranches(), "model", ["nirs"]) },
  { id: "mid-stacking", label: "Network and source stacking", strategy: "mid-stacking", description: "Joint network and separate source PLS branches feed an OOF-trained meta-model.",
    document: document("Network and source stacking", [...sourceBranches(), branch("joint", "Joint network", SOURCE_IDS, MULTIMODAL_MODEL_IDS.neural)], "model") },
];

/** A real controlled editor host; no execution, score generation or mock engine. */
export function MultimodalPipelineDemo() {
  const [value, setValue] = useState<MultimodalPipelineDocument>(() => structuredClone(PRESETS[0]!.document));
  return (
    <div className="n4mm pipeline-editor-demo">
      <p className="pipeline-editor-demo__intro">
        Edit the source connections, preprocessing, branch models and merge. Presets replace this local document; every edit is
        reflected in the JSON below. These source descriptors contain shapes and feature names only. No measurements are loaded
        and no training, prediction or scoring runs in this example.
      </p>
      <MultimodalPipelineEditor
        sources={SOURCES}
        value={value}
        onChange={setValue}
        presets={PRESETS}
        onLoadPreset={(id) => {
          const preset = PRESETS.find((candidate) => candidate.id === id);
          if (preset) setValue(structuredClone(preset.document));
        }}
        actions={<a className="n4mm-button" href="https://web.nirs4all.org/nirs4all_multimodale/">Open the real WASM laboratory →</a>}
      />
      <p className="pipeline-editor-demo__intro">The laboratory link opens the actual application. Showroom edits are not transferred.</p>
      <details className="pipeline-editor-demo__document">
        <summary>Current editable document (JSON)</summary>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </div>
  );
}
