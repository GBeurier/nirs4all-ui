/** Catalogue lookup, search and step templates. Pure: no React, no IO. */

import { cloneJson } from "./json.js";
import type {
  ChainRole,
  PipelineCatalog,
  PipelineOperatorDefinition,
  PipelineStructureTemplate,
} from "./types.js";

export interface CatalogIndex {
  catalog: PipelineCatalog;
  /** Class path or alias -> operators declared for it (one per family). */
  byPath: ReadonlyMap<string, readonly PipelineOperatorDefinition[]>;
  /** Class leaf name -> operator, only where that leaf is unambiguous. */
  byLeaf: ReadonlyMap<string, readonly PipelineOperatorDefinition[]>;
}

export const EMPTY_CATALOG: PipelineCatalog = { operators: [] };

export function classLeaf(classPath: string): string {
  const trimmed = classPath.trim();
  return trimmed.split(".").pop() || trimmed;
}

export function indexCatalog(catalog: PipelineCatalog): CatalogIndex {
  const byPath = new Map<string, PipelineOperatorDefinition[]>();
  // A leaf is ambiguous only when two different class paths end with it.
  const leafPaths = new Map<string, string | null>();
  for (const operator of catalog.operators) {
    const paths = [operator.classPath, operator.functionPath, ...(operator.aliases ?? [])].filter(
      (path): path is string => typeof path === "string" && path.length > 0,
    );
    for (const path of paths) {
      const declared = byPath.get(path);
      if (declared) declared.push(operator);
      else byPath.set(path, [operator]);
      const leaf = classLeaf(path);
      const known = leafPaths.get(leaf);
      leafPaths.set(leaf, known === undefined || known === path ? path : null);
    }
  }
  const byLeaf = new Map<string, readonly PipelineOperatorDefinition[]>();
  for (const [leaf, path] of leafPaths) {
    const owners = path ? byPath.get(path) : undefined;
    if (owners) byLeaf.set(leaf, owners);
  }
  return { catalog, byPath, byLeaf };
}

/**
 * Resolve display metadata for a class path: exact path or alias first, then a
 * unique class-name match (private module segments differ between releases).
 * When one class is declared for several families (a scaler usable on features
 * and on targets), `type` picks the matching declaration. The document's own
 * class path is never rewritten.
 */
export function findOperator(index: CatalogIndex | null | undefined, classPath: string | null, type?: string | null): PipelineOperatorDefinition | null {
  if (!index || !classPath) return null;
  const declared = index.byPath.get(classPath) ?? index.byLeaf.get(classLeaf(classPath));
  if (!declared) return null;
  return (type ? declared.find((operator) => roleForType(operator.type) === type) : undefined) ?? declared[0] ?? null;
}

export function roleForType(type: string): ChainRole {
  switch (type) {
    case "preprocessing":
    case "model":
    case "y_processing":
    case "augmentation":
    case "filter":
      return type;
    case "splitting":
    case "splitter":
    case "split":
      return "splitting";
    default:
      return "operator";
  }
}

/** Canonical step JSON for a freshly inserted operator: no explicit parameters. */
export function operatorStep(operator: PipelineOperatorDefinition): unknown {
  const reference: unknown = operator.functionPath && !operator.classPath
    ? { function: operator.functionPath }
    : operator.classPath ?? operator.id;
  const keyword = operator.stepKeyword !== undefined
    ? operator.stepKeyword
    : operator.type === "model"
    ? "model"
    : operator.type === "y_processing"
    ? "y_processing"
    : null;
  return keyword ? { [keyword]: reference } : reference;
}

/** Operator families present in the catalogue, in first-seen order. */
export function catalogTypes(catalog: PipelineCatalog): string[] {
  return [...new Set(catalog.operators.map((operator) => operator.type))];
}

/** Case-insensitive search over name, class path, category and tags; all terms must match. */
export function searchOperators(
  catalog: PipelineCatalog,
  query: string,
  type?: string | null,
): PipelineOperatorDefinition[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored: Array<{ operator: PipelineOperatorDefinition; score: number; order: number }> = [];
  catalog.operators.forEach((operator, order) => {
    if (type && operator.type !== type) return;
    const name = operator.name.toLowerCase();
    const haystack = [name, operator.classPath, operator.functionPath, operator.category, operator.type, ...(operator.tags ?? []), ...(operator.aliases ?? [])]
      .filter((part): part is string => typeof part === "string")
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (!haystack.includes(term)) return;
      score += name.startsWith(term) ? 3 : name.includes(term) ? 2 : 1;
    }
    scored.push({ operator, score, order });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((entry) => entry.operator);
}

/**
 * Structural constructs of the nirs4all pipeline syntax offered by default.
 * Hosts replace them through `PipelineCatalog.structures`.
 */
export const DEFAULT_STRUCTURES: readonly PipelineStructureTemplate[] = [
  {
    id: "branch",
    label: "Branch",
    description: "Parallel lanes that all run on the same input.",
    value: { branch: [[], []] },
  },
  {
    id: "alternatives",
    label: "Alternatives",
    description: "One option per pipeline variant (_or_).",
    value: { _or_: [null] },
  },
  {
    id: "cartesian",
    label: "Cartesian product",
    description: "Successive stages whose options are combined (_cartesian_).",
    value: { _cartesian_: [{ _or_: [null] }] },
  },
  {
    id: "merge-features",
    label: "Merge features",
    description: "Join the branch outputs as features.",
    value: { merge: "features" },
  },
  {
    id: "merge-predictions",
    label: "Merge predictions",
    description: "Join the branch model predictions.",
    value: { merge: "predictions" },
  },
  {
    id: "note",
    label: "Note",
    description: "Authoring comment kept in the document (_comment).",
    value: { _comment: "" },
  },
];

export function catalogStructures(catalog: PipelineCatalog): readonly PipelineStructureTemplate[] {
  return catalog.structures ?? DEFAULT_STRUCTURES;
}

export function structureStep(template: PipelineStructureTemplate): unknown {
  return cloneJson(template.value);
}
