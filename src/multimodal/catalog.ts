/**
 * Static teaching text and owner-operation descriptors for the multimodal
 * laboratory. Pure data and pure helpers: no numerics, no IO.
 */

import type {
  MultimodalCandidate,
  MultimodalCaseInfo,
  MultimodalDataset,
  MultimodalFusionLevel,
  MultimodalRepresentation,
  MultimodalSource,
  MultimodalStepOption,
  MultimodalStrategyId,
} from "./types.js";

export const MULTIMODAL_CASES: readonly MultimodalCaseInfo[] = [
  {
    id: "spectroscopy",
    title: "Three spectroscopies",
    modalities: "Raman · NIRS · MIR",
    goal:
      "Several windows on the same chemistry. Each technique has its own axis, unit, baseline and noise; compare one technique alone with concatenation, multiblock PLS, averaging and stacking.",
    prompts: [
      "Which single technique predicts best on its own, and why might that change on real samples?",
      "Concatenate without block scaling: which block has the most variables, and does it dominate?",
      "Why can a fixed mean of three predictions beat each one, and when can it not?",
      "Why must the stacking meta-learner be trained on out-of-fold predictions only?",
    ],
  },
  {
    id: "genetics",
    title: "Spectra and genetic markers",
    modalities: "NIRS · biallelic markers (0/1/2 dosage)",
    goal:
      "Two different modalities: a continuous spectrum and a small discrete dosage table. The simulated target has a spectral and a marker contribution; replicate groups must stay together in every split.",
    prompts: [
      "Why does spectral SNV make no sense for a dosage table?",
      "What would happen to the scores if replicates of one genotype were split across folds?",
      "Is a convolution along marker order meaningful? Why does the network use a dense marker branch?",
      "This is a teaching simulation: what would you need before claiming a biological effect?",
    ],
  },
  {
    id: "images",
    title: "Spectra and images",
    modalities: "NIRS · small grey or RGB images",
    goal:
      "A spectrum and a spatially structured image of each sample. Compare flattened pixels in early fusion with a trained 2-D convolutional branch that keeps the image layout.",
    prompts: [
      "What spatial information is lost when pixels are flattened into a feature vector?",
      "How many network parameters are trained compared with the number of samples?",
      "Why is a pretrained image backbone a different capability from this compact in-browser network?",
      "Does the jointly trained network beat PLS here? Report what you observe, not what you expected.",
    ],
  },
];

export interface MultimodalStrategyInfo {
  id: MultimodalStrategyId;
  name: string;
  level: MultimodalFusionLevel;
  /** One line: what is combined, where. */
  summary: string;
  /** What is actually fitted / learned. */
  learned: string;
  /** Paragraph explanation for the recipe panel. */
  explanation: string;
  /** Truth statement that must stay visible next to the result. */
  caveat: string;
}

export const MULTIMODAL_STRATEGIES: readonly MultimodalStrategyInfo[] = [
  {
    id: "single",
    name: "Single-source baseline",
    level: "none",
    summary: "One source, its own preprocessing, one PLS model.",
    learned: "PLS on one source.",
    explanation:
      "Start with the value of each measurement alone. A fusion method is only interesting if it is compared with these baselines on the same samples and the same folds.",
    caveat: "Uses one source only; the other sources are ignored.",
  },
  {
    id: "early",
    name: "Early fusion (concatenation)",
    level: "early",
    summary: "Preprocessed sources concatenated into one matrix → one PLS.",
    learned: "One PLS on all variables; optional train-fitted block RMS scaling.",
    explanation:
      "Variables from every source are placed side by side. Without block scaling, the source with the most variables or the largest magnitude tends to dominate the latent variables. Train-fitted block RMS scaling divides each source by one scale learned on the training samples only, so blocks contribute comparably.",
    caveat: "Concatenation is not multiblock modelling: block structure is lost after the merge.",
  },
  {
    id: "mbpls",
    name: "Multiblock PLS",
    level: "early",
    summary: "Preprocessed sources kept as separate blocks → native multiblock PLS.",
    learned: "Multiblock PLS with block widths passed to the owner model.",
    explanation:
      "The owner model receives the block widths and computes block scores and a consensus super score. The exact algorithm and block normalisation are reported by the owner and shown verbatim with the result.",
    caveat:
      "Read the exact owner algorithm label: some multiblock PLS variants are equivalent to PLS on concatenated blocks under matching scaling; this one is not claimed to be universally superior.",
  },
  {
    id: "late",
    name: "Late fusion (fixed mean)",
    level: "late",
    summary: "One PLS per source → unweighted mean of their predictions.",
    learned: "One PLS per source. Nothing is learned at the merge.",
    explanation:
      "Each source predicts the target on its own scale; the final prediction is the plain average. The weights are fixed (equal) a priori, so no out-of-fold training is needed for the merge.",
    caveat: "Fixed averaging is not stacking: the merge has no fitted weights.",
  },
  {
    id: "stacking",
    name: "Stacking (nested out-of-fold)",
    level: "late",
    summary: "Several base models per source → out-of-fold predictions → Ridge meta-learner.",
    learned: "PLS and/or Ridge per source, plus a Ridge meta-learner on out-of-fold predictions.",
    explanation:
      "Inside every outer training scope, inner folds produce out-of-fold base predictions; the meta-learner is fitted only on those. Base models are then refitted on the outer training scope to predict the outer validation fold. The final refit repeats the inner construction on the whole calibration set.",
    caveat: "The meta-learner never sees in-sample base predictions or the held-out samples.",
  },
  {
    id: "hybrid",
    name: "Hybrid (features + predictions)",
    level: "mixed",
    summary: "Transformed source features plus out-of-fold base predictions → Ridge meta-learner.",
    learned: "Base models, source preprocessing fitted on the exact meta-training identities, Ridge meta-learner.",
    explanation:
      "The meta-learner receives both preprocessed variables and legitimate out-of-fold predictions, aligned by sample identity. Preprocessing of the feature view is fitted on exactly the samples used to train the meta-learner.",
    caveat: "Only identity-aligned out-of-fold predictions enter the meta-learner.",
  },
  {
    id: "mid",
    name: "Intermediate fusion (trained network)",
    level: "intermediate",
    summary: "One trained branch per source → concatenated learned embeddings → trained regression head.",
    learned:
      "All branch filters/weights and the head, jointly by backpropagation (native multibranch regressor), with a fixed number of epochs.",
    explanation:
      "Spectra use 1-D convolution branches, marker tables a dense branch and images a 2-D convolution branch. Their learned embeddings are concatenated and a common head is trained jointly with the branches. Fitted scaling uses training samples only; there is no early stopping on test data.",
    caveat:
      "A compact network trained in the browser on few samples: it can overfit or lose to PLS. No pretrained backbone and no GPU-framework parity is implied.",
  },
  {
    id: "mid-stacking",
    name: "Stacking with a trained network",
    level: "mixed",
    summary: "Jointly trained network and PLS/Ridge base models → out-of-fold predictions → Ridge meta-learner.",
    learned: "The network, the base models and a Ridge meta-learner on nested out-of-fold predictions.",
    explanation:
      "Stacking can combine architectures as well as sources: the intermediate-fusion network becomes one more base model whose out-of-fold predictions feed the meta-learner.",
    caveat: "Most expensive recipe: every outer fold trains the network on each inner fold.",
  },
];

const STRATEGY_BY_ID: ReadonlyMap<MultimodalStrategyId, MultimodalStrategyInfo> = new Map(
  MULTIMODAL_STRATEGIES.map((info) => [info.id, info]),
);

export function strategyInfo(id: MultimodalStrategyId): MultimodalStrategyInfo {
  const info = STRATEGY_BY_ID.get(id);
  if (!info) throw new Error(`Unknown multimodal strategy: ${id}`);
  return info;
}

export const FUSION_LEVEL_LABEL: Readonly<Record<MultimodalFusionLevel, string>> = {
  none: "No fusion",
  early: "Early (variables)",
  intermediate: "Intermediate (learned features)",
  late: "Late (predictions)",
  mixed: "Mixed",
};

const SPECTRAL: readonly MultimodalRepresentation[] = ["signal_1d"];
const ALL: readonly MultimodalRepresentation[] = ["signal_1d", "tabular_numeric", "gray_image", "rgb_image"];

/** Default preprocessing editor catalogue. Method IDs are real Methods IDs. */
export const MULTIMODAL_STEP_CATALOG: readonly MultimodalStepOption[] = [
  {
    methodId: "preprocessing.scatter.snv",
    label: "SNV",
    description: "Standard normal variate: centres and scales each spectrum by its own mean and standard deviation.",
    fitScope: "per-sample",
    representations: SPECTRAL,
    params: [],
  },
  {
    methodId: "preprocessing.derivatives.savitzky_golay",
    label: "Savitzky–Golay",
    description: "Local polynomial smoothing or derivative along the spectral axis.",
    fitScope: "per-sample",
    representations: SPECTRAL,
    params: [
      { name: "window_length", label: "Window (points, odd)", kind: "int", default: 11, min: 3, max: 51, step: 2 },
      { name: "polyorder", label: "Polynomial order", kind: "int", default: 2, min: 0, max: 5, step: 1 },
      { name: "deriv", label: "Derivative order", kind: "int", default: 1, min: 0, max: 2, step: 1 },
    ],
  },
  {
    methodId: "preprocessing.scaling.standard_scale",
    label: "Standard scaling",
    description: "Per-variable centring and unit-variance scaling; means and deviations are fitted on the training scope only.",
    fitScope: "train-fitted",
    representations: ALL,
    params: [
      { name: "with_mean", label: "Centre", kind: "bool", default: true },
      { name: "with_std", label: "Scale to unit variance", kind: "bool", default: true },
    ],
  },
];

export function stepOptionsFor(
  representation: MultimodalRepresentation,
  catalog: readonly MultimodalStepOption[] = MULTIMODAL_STEP_CATALOG,
): readonly MultimodalStepOption[] {
  return catalog.filter((option) => option.representations.includes(representation));
}

export function findStepOption(
  methodId: string,
  catalog: readonly MultimodalStepOption[] = MULTIMODAL_STEP_CATALOG,
): MultimodalStepOption | undefined {
  return catalog.find((option) => option.methodId === methodId);
}

/** Stable candidate key: `"single:<sourceId>"` for baselines, the strategy ID otherwise. */
export function candidateKey(strategy: MultimodalStrategyId, singleSourceId?: string): string {
  return strategy === "single" ? `single:${singleSourceId ?? ""}` : strategy;
}

export function makeCandidate(strategy: MultimodalStrategyId, singleSourceId?: string): MultimodalCandidate {
  return strategy === "single" && singleSourceId !== undefined
    ? { id: candidateKey(strategy, singleSourceId), strategy, singleSourceId }
    : { id: candidateKey(strategy), strategy };
}

const FUSION_ORDER: readonly MultimodalStrategyId[] = [
  "early",
  "mbpls",
  "late",
  "stacking",
  "hybrid",
  "mid",
  "mid-stacking",
];

/** Every one-source baseline, then (with two or more sources) every fusion strategy, in teaching order. */
export function defaultCandidates(
  dataset: Pick<MultimodalDataset, "sources">,
  sourceIds?: readonly string[],
): MultimodalCandidate[] {
  const ids = sourceIds ?? dataset.sources.map((source) => source.id);
  const baselines = ids.map((id) => makeCandidate("single", id));
  return ids.length > 1 ? [...baselines, ...FUSION_ORDER.map((strategy) => makeCandidate(strategy))] : baselines;
}

/** Branch kind the C3 multibranch regressor uses for a representation. */
export function networkBranchKind(representation: MultimodalRepresentation): "conv1d" | "dense" | "conv2d" {
  if (representation === "signal_1d") return "conv1d";
  if (representation === "tabular_numeric") return "dense";
  return "conv2d";
}

export const NETWORK_BRANCH_LABEL: Readonly<Record<"conv1d" | "dense" | "conv2d", string>> = {
  conv1d: "1-D convolution branch",
  dense: "Dense branch",
  conv2d: "2-D convolution branch",
};

const MODALITY_LABEL: Readonly<Record<MultimodalSource["modality"], string>> = {
  spectroscopy: "Spectroscopy",
  genetics: "Genetic markers",
  image: "Image",
};

const REPRESENTATION_LABEL: Readonly<Record<MultimodalRepresentation, string>> = {
  signal_1d: "1-D signal",
  tabular_numeric: "Numeric table",
  gray_image: "Grey image",
  rgb_image: "RGB image",
};

export function modalityLabel(modality: MultimodalSource["modality"]): string {
  return MODALITY_LABEL[modality];
}

export function representationLabel(representation: MultimodalRepresentation): string {
  return REPRESENTATION_LABEL[representation];
}

/** Short, color-independent source tag: S1, S2, ... in recipe order. */
export function sourceTag(index: number): string {
  return `S${index + 1}`;
}
