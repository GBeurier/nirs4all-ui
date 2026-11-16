/**
 * Structural branch-and-merge description of a teaching recipe, rendered with
 * the shared `dag` viewer. This only describes topology for explanation; the
 * executable recipe is built by the host execution lane and the native owners.
 */

import type { DagEdge, DagGraph, DagNode } from "../dag/types.js";
import { findStepOption, networkBranchKind, NETWORK_BRANCH_LABEL, sourceTag, strategyInfo } from "./catalog.js";
import { shapeText } from "./data.js";
import type {
  MultimodalBaseModel,
  MultimodalConfig,
  MultimodalSource,
  MultimodalStepOption,
  MultimodalStrategyId,
} from "./types.js";

export interface RecipeLine {
  /** Indentation level for the textual recipe. */
  depth: number;
  text: string;
}

export interface RecipeDescription {
  graph: DagGraph;
  /** The same recipe as an ordered text outline (screen-reader / exact route). */
  lines: readonly RecipeLine[];
}

const BASE_LABEL: Readonly<Record<MultimodalBaseModel, string>> = { pls: "PLS", ridge: "Ridge" };

interface ChainEnd {
  source: MultimodalSource;
  tag: string;
  endId: string;
}

export function describeRecipe(
  strategy: MultimodalStrategyId,
  config: MultimodalConfig,
  sources: readonly MultimodalSource[],
  catalog?: readonly MultimodalStepOption[],
  singleSourceId?: string,
): RecipeDescription {
  const nodes: DagNode[] = [];
  const edges: DagEdge[] = [];
  const lines: RecipeLine[] = [];
  const byId = new Map(sources.map((source) => [source.id, source]));
  const tagOf = new Map(sources.map((source, index) => [source.id, sourceTag(index)]));

  const baselineId = singleSourceId ?? config.singleSourceId;
  const selectedIds = strategy === "single" ? [baselineId] : config.sourceIds;
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((source): source is MultimodalSource => source !== undefined);

  const pls = `PLS (${config.nComponents} components)`;
  const ridge = `Ridge (alpha ${config.ridgeAlpha})`;

  const chains: ChainEnd[] = selected.map((source) => {
    const tag = tagOf.get(source.id) ?? "S?";
    const group = [`${tag} ${source.label}`];
    const sourceNode = `src:${source.id}`;
    nodes.push({
      id: sourceNode,
      kind: "source",
      label: `${tag} ${source.label}`,
      detail: `${source.modality} · ${shapeText(source.shape)}`,
      group,
    });
    lines.push({ depth: 0, text: `${tag} ${source.label} (${source.modality}, shape ${shapeText(source.shape)})` });
    const chain = config.sourceChains.find((candidate) => candidate.sourceId === source.id);
    let previous = sourceNode;
    (chain?.steps ?? []).forEach((step, index) => {
      const option = findStepOption(step.methodId, catalog);
      const id = `pp:${source.id}:${index}`;
      const params = Object.entries(step.params)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(", ");
      nodes.push({
        id,
        kind: "transform",
        label: option?.label ?? step.methodId,
        detail: option?.fitScope === "train-fitted" ? "fitted on training scope" : "per sample",
        group,
        meta: { methodId: step.methodId, ...step.params },
      });
      edges.push({ source: previous, target: id, kind: "data" });
      lines.push({
        depth: 1,
        text: `${option?.label ?? step.methodId}${params ? ` (${params})` : ""} — ${
          option?.fitScope === "train-fitted" ? "fitted on the training scope" : "per-sample, no fitted state"
        }`,
      });
      previous = id;
    });
    if (!chain || chain.steps.length === 0) lines.push({ depth: 1, text: "No preprocessing" });
    return { source, tag, endId: previous };
  });

  const addNode = (node: DagNode): string => {
    nodes.push(node);
    return node.id;
  };
  const link = (source: string, target: string, extra: Partial<DagEdge> = {}): void => {
    edges.push({ source, target, kind: "data", ...extra });
  };
  const output = (from: string): void => {
    const id = addNode({ id: "out", kind: "predict", label: "Prediction", detail: "scored OOF / held-out" });
    link(from, id, { kind: "prediction" });
  };

  const bases = config.baseModels.length > 0 ? config.baseModels : (["pls"] as const);
  const baseBranches = (group: string, oofTarget: string): void => {
    for (const chain of chains) {
      for (const model of bases) {
        const id = addNode({
          id: `base:${chain.source.id}:${model}`,
          kind: "model",
          label: `${chain.tag} ${BASE_LABEL[model]}`,
          detail: model === "pls" ? pls : ridge,
          group: [group],
        });
        link(chain.endId, id);
        link(id, oofTarget, { kind: "prediction", oof: true, label: "OOF" });
        lines.push({ depth: 1, text: `${chain.tag} → ${model === "pls" ? pls : ridge} → inner out-of-fold predictions` });
      }
    }
  };

  const network = (group: string): string => {
    const join = `net:join`;
    for (const chain of chains) {
      const kind = networkBranchKind(chain.source.representation);
      const id = addNode({
        id: `net:branch:${chain.source.id}`,
        kind: "model",
        label: `${chain.tag} ${NETWORK_BRANCH_LABEL[kind]}`,
        detail: `${kind} · shape ${shapeText(chain.source.shape)}`,
        group: [group],
      });
      link(chain.endId, id);
      link(id, join, { label: "embedding" });
      lines.push({
        depth: 1,
        text: `${chain.tag} → ${NETWORK_BRANCH_LABEL[kind]} (${config.cnn.filters} filters, kernel ${config.cnn.kernel_size}, embedding ${config.cnn.embedding_dim})`,
      });
    }
    addNode({ id: join, kind: "feature_join", label: "Concatenate embeddings", group: [group] });
    const head = addNode({
      id: "net:head",
      kind: "model",
      label: "Trained regression head",
      detail: `hidden ${config.cnn.head_hidden} · ${config.cnn.epochs} epochs`,
      group: [group],
    });
    link(join, head);
    lines.push({
      depth: 1,
      text: `Concatenate learned embeddings → dense head (${config.cnn.head_hidden} hidden); branches and head trained jointly by backpropagation for ${config.cnn.epochs} fixed epochs (batch ${config.cnn.batch_size}, learning rate ${config.cnn.learning_rate}, weight decay ${config.cnn.weight_decay})`,
    });
    return head;
  };

  switch (strategy) {
    case "single": {
      const chain = chains[0];
      if (chain) {
        const model = addNode({ id: "model", kind: "model", label: pls, detail: `${chain.tag} only` });
        link(chain.endId, model);
        lines.push({ depth: 1, text: `${chain.tag} → ${pls}` });
        output(model);
      }
      break;
    }
    case "early":
    case "mbpls": {
      const merge = addNode({
        id: "merge",
        kind: "feature_join",
        label: strategy === "early" ? "Concatenate variables" : "Keep blocks",
        detail:
          strategy === "early"
            ? config.blockScaling
              ? "train-fitted block RMS scaling"
              : "no block scaling"
            : "block widths passed to the model",
      });
      chains.forEach((chain) => link(chain.endId, merge, { label: chain.tag }));
      const model = addNode({
        id: "model",
        kind: "model",
        label: strategy === "early" ? pls : `Multiblock PLS (${config.nComponents} components)`,
      });
      link(merge, model);
      lines.push({
        depth: 1,
        text:
          strategy === "early"
            ? `Concatenate ${chains.map((chain) => chain.tag).join(" + ")}${config.blockScaling ? " after train-fitted block RMS scaling" : " without block scaling"} → ${pls}`
            : `Blocks ${chains.map((chain) => chain.tag).join(" | ")} → native multiblock PLS (${config.nComponents} components)`,
      });
      output(model);
      break;
    }
    case "late": {
      const mean = addNode({ id: "merge", kind: "prediction_join", label: "Fixed mean", detail: "equal weights, nothing learned" });
      for (const chain of chains) {
        const id = addNode({ id: `model:${chain.source.id}`, kind: "model", label: `${chain.tag} PLS`, detail: pls });
        link(chain.endId, id);
        link(id, mean, { kind: "prediction" });
        lines.push({ depth: 1, text: `${chain.tag} → ${pls} → prediction` });
      }
      lines.push({ depth: 1, text: "Unweighted mean of the per-source predictions (fixed, not fitted)" });
      output(mean);
      break;
    }
    case "stacking":
    case "hybrid": {
      const meta = "meta";
      baseBranches("Base models", meta);
      addNode({
        id: meta,
        kind: "model",
        label: "Ridge meta-learner",
        detail: strategy === "hybrid" ? `${ridge} · predictions + features` : `${ridge} · OOF predictions`,
      });
      if (strategy === "hybrid") {
        for (const chain of chains) link(chain.endId, meta, { label: `${chain.tag} features` });
        lines.push({
          depth: 1,
          text: `Transformed features of ${chains.map((chain) => chain.tag).join(", ")}, preprocessing fitted on the exact meta-training identities`,
        });
      }
      lines.push({ depth: 1, text: `Ridge meta-learner (alpha ${config.ridgeAlpha}) fitted on nested out-of-fold inputs only` });
      output(meta);
      break;
    }
    case "mid": {
      const head = network("Jointly trained network");
      output(head);
      break;
    }
    case "mid-stacking": {
      const meta = "meta";
      const head = network("Jointly trained network");
      baseBranches("Base models", meta);
      addNode({ id: meta, kind: "model", label: "Ridge meta-learner", detail: `${ridge} · OOF predictions` });
      link(head, meta, { kind: "prediction", oof: true, label: "OOF" });
      lines.push({ depth: 1, text: "Network → inner out-of-fold predictions" });
      lines.push({ depth: 1, text: `Ridge meta-learner (alpha ${config.ridgeAlpha}) fitted on nested out-of-fold inputs only` });
      output(meta);
      break;
    }
  }

  lines.unshift({ depth: 0, text: `Recipe: ${strategyInfo(strategy).name}` });
  return { graph: { nodes, edges, name: strategyInfo(strategy).name }, lines };
}
