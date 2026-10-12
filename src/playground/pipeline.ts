/**
 * Pure pipeline-editing helpers for the Playground: step creation with
 * operator defaults, reorder / toggle / remove, the effective (preview)
 * pipeline, compact parameter summaries and a stable fingerprint used to
 * debounce run requests.
 */

import type { OperatorDefinition, OperatorParam, PipelineStep } from "./types.js";

let stepCounter = 0;

export function newStepId(operatorId: string): string {
  stepCounter += 1;
  return `${operatorId.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${Date.now().toString(36)}-${stepCounter}`;
}

export function defaultParams(operator: OperatorDefinition): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const param of operator.params ?? []) {
    if (param.default !== undefined) params[param.name] = param.default;
  }
  return params;
}

export function createStep(operator: OperatorDefinition, params?: Record<string, unknown>): PipelineStep {
  return { id: newStepId(operator.id), operatorId: operator.id, params: { ...defaultParams(operator), ...params }, enabled: true };
}

/**
 * Insert a step after `afterStepId` (or at the end). Singleton operators
 * replace their previous occurrence instead of stacking.
 */
export function insertStep(steps: readonly PipelineStep[], step: PipelineStep, operator: OperatorDefinition | undefined, afterStepId?: string | null): PipelineStep[] {
  const base = operator?.singleton ? steps.filter((s) => s.operatorId !== step.operatorId) : [...steps];
  if (!afterStepId) return [...base, step];
  const index = base.findIndex((s) => s.id === afterStepId);
  if (index < 0) return [...base, step];
  return [...base.slice(0, index + 1), step, ...base.slice(index + 1)];
}

export function moveStep(steps: readonly PipelineStep[], stepId: string, toIndex: number): PipelineStep[] {
  const from = steps.findIndex((s) => s.id === stepId);
  if (from < 0) return [...steps];
  const next = [...steps];
  const [step] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, step!);
  return next;
}

export function updateStep(steps: readonly PipelineStep[], stepId: string, patch: Partial<Omit<PipelineStep, "id">>): PipelineStep[] {
  return steps.map((s) => (s.id === stepId ? { ...s, ...patch, params: patch.params ?? s.params } : s));
}

export function removeStep(steps: readonly PipelineStep[], stepId: string): PipelineStep[] {
  return steps.filter((s) => s.id !== stepId);
}

/** Preview cursor value meaning "raw data, no step applied". */
export const RAW_CURSOR = "__raw__";

/**
 * Enabled steps up to (and including) the cursor step; all when `cursor` is
 * null, none when it is {@link RAW_CURSOR}.
 */
export function effectiveSteps(steps: readonly PipelineStep[], cursorStepId: string | null): PipelineStep[] {
  if (cursorStepId === RAW_CURSOR) return [];
  const limit = cursorStepId ? steps.findIndex((s) => s.id === cursorStepId) : steps.length - 1;
  const end = limit < 0 ? steps.length - 1 : limit;
  return steps.slice(0, end + 1).filter((s) => s.enabled);
}

/** Order-sensitive fingerprint of what the host would execute. */
export function pipelineFingerprint(steps: readonly PipelineStep[]): string {
  return JSON.stringify(steps.map((s) => [s.operatorId, s.params]));
}

function formatParamValue(param: OperatorParam | undefined, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length > 3 ? `[${value.length}]` : `[${value.join(", ")}]`;
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "number") {
    const text = Number.isInteger(value) ? String(value) : Number(value.toPrecision(3)).toString();
    return param?.unit ? `${text} ${param.unit}` : text;
  }
  if (typeof value === "object") return "{…}";
  const option = param?.options?.find((o) => o.value === value);
  return option?.label ?? String(value);
}

/** Compact one-line parameter summary for collapsed step cards. */
export function summarizeParams(operator: OperatorDefinition | undefined, params: Record<string, unknown>, max = 3): string {
  const defined = operator?.params ?? [];
  const entries = Object.entries(params).filter(([name]) => {
    const spec = defined.find((p) => p.name === name);
    return !spec?.advanced;
  });
  const parts = entries.slice(0, max).map(([name, value]) => {
    const spec = defined.find((p) => p.name === name);
    return `${spec?.label ?? name} ${formatParamValue(spec, value)}`;
  });
  if (entries.length > max) parts.push(`+${entries.length - max}`);
  return parts.join(" · ");
}

/** Operators matching a free-text query (name, id, category, tags, description). */
export function searchOperators(operators: readonly OperatorDefinition[], query: string): OperatorDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...operators];
  const terms = q.split(/\s+/);
  const scored = operators
    .map((op) => {
      const hay = [op.name, op.id, op.category ?? "", op.kind, ...(op.tags ?? []), op.description ?? ""].join(" ").toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return null;
      const name = op.name.toLowerCase();
      const score = name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2;
      return { op, score };
    })
    .filter((x): x is { op: OperatorDefinition; score: number } => x !== null);
  scored.sort((a, b) => a.score - b.score || a.op.name.localeCompare(b.op.name));
  return scored.map((s) => s.op);
}

export const OPERATOR_KIND_ORDER = ["preprocessing", "feature", "filter", "augmentation", "splitting", "other"] as const;

/** Group operators by kind, then category, in a stable display order. */
export function groupOperators(operators: readonly OperatorDefinition[]): Array<{ kind: OperatorDefinition["kind"]; categories: Array<{ name: string; operators: OperatorDefinition[] }> }> {
  const tierRank = { core: 0, standard: 1, advanced: 2 } as const;
  return OPERATOR_KIND_ORDER.map((kind) => {
    const ofKind = operators.filter((op) => op.kind === kind);
    const categories = new Map<string, OperatorDefinition[]>();
    for (const op of ofKind) {
      const name = op.category ?? "";
      const bucket = categories.get(name);
      if (bucket) bucket.push(op);
      else categories.set(name, [op]);
    }
    return {
      kind,
      categories: [...categories.entries()].map(([name, ops]) => ({
        name,
        operators: ops.sort((a, b) => tierRank[a.tier ?? "standard"] - tierRank[b.tier ?? "standard"] || a.name.localeCompare(b.name)),
      })),
    };
  }).filter((group) => group.categories.length > 0);
}
