import type { N4aArtifactView } from "nirs4all-ui/n4aInspector"

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

export interface PipelineSource {
  document: Json
  kind: "native" | "graph" | "sdk"
  fileName: string
  originalJson?: string
}

export interface PipelineDefinition extends PipelineSource {
  kind: "native" | "graph"
  steps?: { method_id: string; role: string; params?: Record<string, Json> }[]
  generation?: {
    strategy: string
    dimensions: { name: string; choices: { label: string; param_overrides?: { node_id: string; params: Json }[] }[] }[]
  }
  variantCount?: number
  foldCount?: number
}

export const DAG_GRAPH = "dagml.graph_spec"
export const DAG_PLAN = "dagml.execution_plan"

export function isPipeline(artifact: N4aArtifactView) {
  return artifact.owner === "dag-ml" && artifact.contentVersion === 1 &&
    (artifact.contentType === DAG_PLAN || artifact.contentType === DAG_GRAPH)
}

export function sourceText(source: PipelineSource, format: "json" | "yaml"): string {
  return format === "json"
    ? source.originalJson ?? JSON.stringify(source.document, null, 2) + "\n"
    : yamlLines(source.document).join("\n") + "\n"
}

// Quote every string and key so YAML readers retain the JSON types.
function yamlLines(value: Json, indent = ""): string[] {
  if (Array.isArray(value) && value.length) {
    return value.flatMap(item => {
      const [first, ...rest] = yamlLines(item, indent + "  ")
      return [indent + "- " + first!.slice(indent.length + 2), ...rest]
    })
  }
  if (value && typeof value === "object" && Object.keys(value).length) {
    return Object.entries(value).flatMap(([key, item]) => {
      const lines = yamlLines(item, indent + "  ")
      const head = indent + JSON.stringify(key) + ":"
      return item && typeof item === "object" && Object.keys(item).length
        ? [head, ...lines]
        : [head + " " + lines[0]!.trimStart()]
    })
  }
  const scalar = JSON.stringify(value)
  // PyYAML treats scientific notation without a decimal point as a string.
  const number = /^(-?\d+)e([+-]?)(\d+)$/i.exec(scalar)
  return [indent + (number ? `${number[1]}.0e${number[2] || "+"}${number[3]}` : scalar)]
}

const snv = { class: "nirs4all.operators.transforms.StandardNormalVariate" }
const msc = { class: "nirs4all.operators.transforms.MultiplicativeScatterCorrection" }
const scale = { class: "sklearn.preprocessing.StandardScaler" }
const minMax = { class: "sklearn.preprocessing.MinMaxScaler" }
const split = { class: "sklearn.model_selection.KFold", params: { n_splits: 3, shuffle: true, random_state: 42 } }
const pls = { model: { class: "sklearn.cross_decomposition.PLSRegression", params: { n_components: 4 } } }

export const GENERATOR_EXAMPLES = [
  {
    key: "_or_", title: "OR alternatives", description: "Choose SNV or MSC before fitting the same PLS model.",
    source: { kind: "sdk", fileName: "or-preprocessing", document: { pipeline: [{ _or_: [snv, msc] }, split, pls] } },
  },
  {
    key: "_cartesian_", title: "Cartesian product", description: "Combine each scatter correction with each scaler before PLS.",
    source: { kind: "sdk", fileName: "cartesian-preprocessing", document: { pipeline: [{ _cartesian_: [{ _or_: [snv, msc] }, { _or_: [scale, minMax] }] }, split, pls] } },
  },
  {
    key: "_grid_", title: "Parameter grid", description: "Combine the selected PLS component counts and scaling settings.",
    source: { kind: "sdk", fileName: "grid-pls", document: { pipeline: [snv, split, { model: { class: "sklearn.cross_decomposition.PLSRegression" }, _grid_: { n_components: [2, 4, 6], scale: [true, false] } }] } },
  },
] satisfies { key: string; title: string; description: string; source: PipelineSource }[]
