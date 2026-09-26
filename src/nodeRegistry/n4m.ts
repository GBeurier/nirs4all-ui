export const N4M_OPERATOR_TOKEN_PREFIX = "n4m:" as const;

export type N4mRole =
  | "transformer"
  | "regressor"
  | "classifier"
  | "selector"
  | "sample_filter"
  | "splitter"
  | "augmenter"
  | "generic";

export type N4mFitInput =
  | "y"
  | "labels"
  | "sample_weight"
  | "groups"
  | "feature_groups"
  | "blocks"
  | "axis"
  | "target_domain"
  | "fold_ids";

export type N4mInputRequirement = "none" | "optional" | "required";
export type N4mParamType = "int" | "double" | "bool" | "enum" | "int_array" | "double_array";
export type N4mParamValue = number | boolean | string | number[];

export interface N4mManifestParam {
  name: string;
  type: N4mParamType;
  required: boolean;
  /** `null` means an unset optional value (the native default applies). */
  default: N4mParamValue | null;
  min: number | null;
  max: number | null;
  choices: readonly string[];
}

export interface N4mManifestMethod {
  method_id: string;
  fq_name: string;
  kind: "estimator" | "procedure";
  roles: readonly N4mRole[];
  node_kinds: readonly string[];
  capabilities: readonly string[];
  state_format?: string;
  inputs: Readonly<Record<N4mFitInput, N4mInputRequirement>>;
  params: readonly N4mManifestParam[];
}

/** The `n4m_cli --manifest-json` document. */
export interface N4mManifest {
  abi: string;
  methods: readonly N4mManifestMethod[];
}

export type NodeType = "preprocessing" | "model" | "filter" | "splitting" | "augmentation";
export type NodeParameterType = "int" | "float" | "bool" | "select" | "array";

export interface NodeParameterDefinition {
  name: string;
  label: string;
  type: NodeParameterType;
  required: boolean;
  /** Absent when the native default is an unset optional value. */
  default?: N4mParamValue;
  /** Numeric bounds; for arrays they bound each item. */
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  itemType?: "int" | "float";
}

export interface NodeFitInputRequirement {
  input: N4mFitInput;
  requirement: "optional" | "required";
  label: string;
}

/** A pipeline-editor node projected from one n4m method role. */
export interface NodeDefinition {
  /** `<type>.n4m_<method_id with "_" for ".">`. */
  id: string;
  name: string;
  type: NodeType;
  description: string;
  category: string;
  /** Portable operator token `n4m:<method_id>`, serialized as the step `class`. */
  classPath: string;
  source: "n4m";
  tags: string[];
  parameters: NodeParameterDefinition[];
  n4m: {
    methodId: string;
    kind: "estimator" | "procedure";
    role: Exclude<N4mRole, "generic">;
    capabilities: readonly string[];
    fitInputs: NodeFitInputRequirement[];
  };
}

const ROLE_NODE_TYPE: Record<Exclude<N4mRole, "generic">, NodeType> = {
  transformer: "preprocessing",
  selector: "preprocessing",
  regressor: "model",
  classifier: "model",
  sample_filter: "filter",
  splitter: "splitting",
  augmenter: "augmentation",
};

const ROLE_LABEL: Record<Exclude<N4mRole, "generic">, string> = {
  transformer: "transformer",
  selector: "feature selector",
  regressor: "regressor",
  classifier: "classifier",
  sample_filter: "sample filter",
  splitter: "splitter",
  augmenter: "augmenter",
};

const FIT_INPUT_LABEL: Record<N4mFitInput, string> = {
  y: "targets",
  labels: "class labels",
  sample_weight: "sample weights",
  groups: "sample groups",
  feature_groups: "feature groups",
  blocks: "multiblock",
  axis: "wavelengths",
  target_domain: "transfer target",
  fold_ids: "CV folds",
};

const ACRONYMS = new Set([
  "airpls", "aom", "arpls", "asls", "beads", "bipls", "bve", "cars", "cow", "cppls", "cv", "da", "di", "ds",
  "dtw", "ecr", "emcuve", "emsc", "epo", "fck", "g", "ga", "gpr", "hpo", "iasls", "ipw", "irf", "iriv", "l1",
  "lda", "lw", "mb", "mir", "msc", "nipals", "o2pls", "on", "osc", "pca", "pcr", "pds", "pls", "pop", "pso",
  "q", "qda", "rep", "rosa", "saps", "scars", "simpls", "sipls", "snip", "snv", "so", "spa", "spxy", "st",
  "svd", "t2", "uve", "vip", "vissa", "vsn", "wvc", "x", "y",
]);

function humanize(snake: string): string {
  return snake
    .split("_")
    .filter(Boolean)
    .map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
    .join(" ");
}

function methodGroup(methodId: string): string {
  const segments = methodId.split(".");
  return segments[segments.length - 2] ?? segments[0] ?? methodId;
}

const PARAM_TYPE: Record<N4mParamType, NodeParameterType> = {
  int: "int",
  double: "float",
  bool: "bool",
  enum: "select",
  int_array: "array",
  double_array: "array",
};

function projectParam(param: N4mManifestParam): NodeParameterDefinition {
  const view: NodeParameterDefinition = {
    name: param.name,
    label: humanize(param.name),
    type: PARAM_TYPE[param.type],
    required: param.required,
  };
  if (param.type === "enum") view.options = param.choices.map((choice) => ({ value: choice, label: choice }));
  if (param.type === "int_array") view.itemType = "int";
  if (param.type === "double_array") view.itemType = "float";
  if (param.default !== null) view.default = param.default;
  if (param.min !== null) view.min = param.min;
  if (param.max !== null) view.max = param.max;
  return view;
}

function fitInputRequirements(method: N4mManifestMethod): NodeFitInputRequirement[] {
  return (Object.keys(FIT_INPUT_LABEL) as N4mFitInput[])
    .map((input) => ({ input, requirement: method.inputs[input] }))
    .filter((entry): entry is { input: N4mFitInput; requirement: "optional" | "required" } => entry.requirement !== "none")
    .map(({ input, requirement }) => ({ input, requirement, label: FIT_INPUT_LABEL[input] }));
}

function describe(method: N4mManifestMethod, role: Exclude<N4mRole, "generic">, fitInputs: NodeFitInputRequirement[]): string {
  const required = fitInputs.filter((entry) => entry.requirement === "required" && entry.input !== "y");
  const needs = required.length > 0 ? ` Requires ${required.map((entry) => entry.label).join(", ")}.` : "";
  return `Native nirs4all-methods ${ROLE_LABEL[role]} (${method.method_id}).${needs}`;
}

/**
 * Project the n4m method manifest into pipeline-editor node definitions: one
 * node per distinct node type a method's roles map to. Generic procedures have
 * no pipeline node and are omitted.
 */
export function projectN4mManifest(manifest: N4mManifest): NodeDefinition[] {
  const nodes: NodeDefinition[] = [];
  for (const method of manifest.methods) {
    const group = methodGroup(method.method_id);
    const leaf = method.method_id.split(".").pop() ?? method.method_id;
    const fitInputs = fitInputRequirements(method);
    const parameters = method.params.map(projectParam);
    const seen = new Set<NodeType>();
    for (const role of method.roles) {
      if (role === "generic") continue;
      const type = ROLE_NODE_TYPE[role];
      if (seen.has(type)) continue;
      seen.add(type);
      nodes.push({
        id: `${type}.n4m_${method.method_id.replaceAll(".", "_")}`,
        name: humanize(leaf),
        type,
        description: describe(method, role, fitInputs),
        category: humanize(group),
        classPath: `${N4M_OPERATOR_TOKEN_PREFIX}${method.method_id}`,
        source: "n4m",
        tags: ["n4m", role, group],
        parameters,
        n4m: {
          methodId: method.method_id,
          kind: method.kind,
          role,
          capabilities: method.capabilities,
          fitInputs,
        },
      });
    }
  }
  return nodes;
}
