/**
 * Pure read-model helpers of the Inspector: labels, facets, filtering,
 * direction-aware ranking, pivots and descriptive prediction diagnostics for
 * display. Authoritative scores always come from the host; the metrics below
 * only summarize the predictions currently on screen.
 */

import type { ChainStep, ScoredChain } from "../chains/types.js";
import type { RowColumn } from "../workbench/colorBy.js";
import type { ChainFacet, ChainPredictions, InspectorChain, ScoreRef } from "./types.js";

export function preprocessingSteps(chain: InspectorChain): ChainStep[] {
  return chain.steps.filter((step) => step.role !== "model" && step.role !== "split");
}

export function preprocessingLabel(chain: InspectorChain): string {
  const steps = preprocessingSteps(chain);
  return steps.length ? steps.map((s) => s.label ?? s.token).join(" › ") : "raw";
}

export function chainLabel(chain: InspectorChain): string {
  return chain.label ?? `${chain.model} · ${preprocessingLabel(chain)}`;
}

export function facetValue(chain: InspectorChain, facet: ChainFacet): string | null {
  switch (facet) {
    case "model":
      return chain.model;
    case "modelFamily":
      return chain.modelFamily ?? chain.model;
    case "dataset":
      return chain.dataset ?? null;
    case "run":
      return chain.runLabel ?? chain.runId ?? null;
    case "preprocessing":
      return preprocessingLabel(chain);
    case "firstStep": {
      const first = preprocessingSteps(chain)[0];
      return first ? first.label ?? first.token : "raw";
    }
    case "task":
      return chain.task;
    case "status":
      return chain.status ?? "ok";
    default: {
      const value = chain.attributes?.[facet.slice("attr:".length)];
      return value === undefined || value === null ? null : String(value);
    }
  }
}

export const FACET_LABELS: Readonly<Record<string, string>> = {
  model: "Model",
  modelFamily: "Model family",
  dataset: "Dataset",
  run: "Run",
  preprocessing: "Preprocessing",
  firstStep: "First step",
  task: "Task",
  status: "Status",
};

export function facetLabel(facet: ChainFacet): string {
  return FACET_LABELS[facet] ?? facet.slice("attr:".length);
}

/** Facets with at least two distinct values in `chains`. */
export function usefulFacets(chains: readonly InspectorChain[]): ChainFacet[] {
  const attributeKeys = new Set<string>();
  for (const chain of chains) for (const key of Object.keys(chain.attributes ?? {})) attributeKeys.add(key);
  const candidates: ChainFacet[] = ["modelFamily", "model", "dataset", "run", "firstStep", "preprocessing", "task", "status", ...[...attributeKeys].map((k) => `attr:${k}` as ChainFacet)];
  return candidates.filter((facet) => new Set(chains.map((c) => facetValue(c, facet))).size > 1);
}

export function facetCounts(chains: readonly InspectorChain[], facet: ChainFacet): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const chain of chains) {
    const value = facetValue(chain, facet) ?? "—";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export interface ChainFilter {
  search: string;
  /** facet → allowed values (absent facet = no constraint). */
  facets: Readonly<Partial<Record<ChainFacet, ReadonlySet<string>>>>;
  /** Hide chains without a score for the active reference. */
  scoredOnly: boolean;
}

export const EMPTY_CHAIN_FILTER: ChainFilter = { search: "", facets: {}, scoredOnly: false };

export function filterChains(chains: readonly InspectorChain[], filter: ChainFilter, ref: ScoreRef | undefined): InspectorChain[] {
  const terms = filter.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const facets = Object.entries(filter.facets) as Array<[ChainFacet, ReadonlySet<string> | undefined]>;
  return chains.filter((chain) => {
    if (filter.scoredOnly && ref && !Number.isFinite(chain.scores[ref.key] ?? Number.NaN)) return false;
    for (const [facet, allowed] of facets) {
      if (!allowed || allowed.size === 0) continue;
      if (!allowed.has(facetValue(chain, facet) ?? "—")) return false;
    }
    if (terms.length === 0) return true;
    const hay = [chainLabel(chain), chain.model, chain.dataset ?? "", chain.runLabel ?? chain.runId ?? "", chain.id, ...chain.steps.map((s) => s.token)].join(" ").toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

export function scoreOf(chain: InspectorChain, ref: ScoreRef | undefined): number {
  if (!ref) return Number.NaN;
  const value = chain.scores[ref.key];
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

/** Chains sorted best-first for `ref` (unscored last) with 1-based ranks. */
export function rankChains(chains: readonly InspectorChain[], ref: ScoreRef | undefined): Array<{ chain: InspectorChain; rank: number | null; score: number }> {
  const scored = chains.map((chain) => ({ chain, score: scoreOf(chain, ref) }));
  scored.sort((a, b) => {
    const fa = Number.isFinite(a.score);
    const fb = Number.isFinite(b.score);
    if (fa !== fb) return fa ? -1 : 1;
    if (!fa) return chainLabel(a.chain).localeCompare(chainLabel(b.chain));
    return ref?.lowerIsBetter ? a.score - b.score : b.score - a.score;
  });
  let rank = 0;
  return scored.map((entry) => ({ ...entry, rank: Number.isFinite(entry.score) ? (rank += 1) : null }));
}

/** `true` when `a` is a better score than `b` under `ref`. */
export function isBetter(a: number, b: number, ref: ScoreRef | undefined): boolean {
  if (!Number.isFinite(a)) return false;
  if (!Number.isFinite(b)) return true;
  return ref?.lowerIsBetter ? a < b : a > b;
}

export type PivotAggregate = "best" | "median" | "mean";

export interface PivotCell {
  row: string;
  col: string;
  value: number;
  count: number;
  chainIds: string[];
}

export interface Pivot {
  rows: string[];
  cols: string[];
  cells: Map<string, PivotCell>;
  min: number;
  max: number;
}

export function pivotChains(chains: readonly InspectorChain[], rowFacet: ChainFacet, colFacet: ChainFacet, ref: ScoreRef | undefined, aggregate: PivotAggregate): Pivot {
  const buckets = new Map<string, { row: string; col: string; values: number[]; ids: string[] }>();
  for (const chain of chains) {
    const score = scoreOf(chain, ref);
    if (!Number.isFinite(score)) continue;
    const row = facetValue(chain, rowFacet) ?? "—";
    const col = facetValue(chain, colFacet) ?? "—";
    const key = `${row}\u0000${col}`;
    const bucket = buckets.get(key) ?? { row, col, values: [], ids: [] };
    bucket.values.push(score);
    bucket.ids.push(chain.id);
    buckets.set(key, bucket);
  }
  const cells = new Map<string, PivotCell>();
  let min = Infinity;
  let max = -Infinity;
  const rowBest = new Map<string, number>();
  const colBest = new Map<string, number>();
  for (const [key, bucket] of buckets) {
    const sorted = [...bucket.values].sort((a, b) => a - b);
    const value =
      aggregate === "mean"
        ? sorted.reduce((s, v) => s + v, 0) / sorted.length
        : aggregate === "median"
          ? sorted[Math.floor((sorted.length - 1) / 2)]! / 2 + sorted[Math.ceil((sorted.length - 1) / 2)]! / 2
          : ref?.lowerIsBetter
            ? sorted[0]!
            : sorted[sorted.length - 1]!;
    cells.set(key, { row: bucket.row, col: bucket.col, value, count: bucket.values.length, chainIds: bucket.ids });
    min = Math.min(min, value);
    max = Math.max(max, value);
    if (isBetter(value, rowBest.get(bucket.row) ?? Number.NaN, ref)) rowBest.set(bucket.row, value);
    if (isBetter(value, colBest.get(bucket.col) ?? Number.NaN, ref)) colBest.set(bucket.col, value);
  }
  const order = (best: Map<string, number>) => [...best.keys()].sort((a, b) => (isBetter(best.get(a)!, best.get(b)!, ref) ? -1 : 1));
  return { rows: order(rowBest), cols: order(colBest), cells, min, max };
}

export function pivotKey(row: string, col: string): string {
  return `${row}\u0000${col}`;
}

/** Color-by columns over chains (row = chain index in `chains`). */
export function chainColumns(chains: readonly InspectorChain[], ref: ScoreRef | undefined): RowColumn[] {
  const columns: RowColumn[] = usefulFacets(chains).map((facet) => ({
    key: facet,
    label: facetLabel(facet),
    kind: "categorical" as const,
    values: chains.map((chain) => facetValue(chain, facet)),
  }));
  if (ref) columns.push({ key: "score", label: ref.label, kind: "continuous", values: chains.map((chain) => Number.isFinite(scoreOf(chain, ref)) ? scoreOf(chain, ref) : null) });
  return columns;
}

/** Bridge to the `chains` domain (step-effect analysis) for one score reference. */
export function toScoredChains(chains: readonly InspectorChain[], ref: ScoreRef | undefined): ScoredChain[] {
  const out: ScoredChain[] = [];
  for (const chain of chains) {
    const score = scoreOf(chain, ref);
    if (!Number.isFinite(score)) continue;
    const scored: ScoredChain = { id: chain.id, steps: chain.steps, score };
    if (chain.dataset) scored.dataset = chain.dataset;
    out.push(scored);
  }
  return out;
}

/** Numeric hyper-parameters (≥ 2 distinct values) and categorical ones across chains. */
export function hyperparameterNames(chains: readonly InspectorChain[]): Array<{ name: string; kind: "numeric" | "categorical"; count: number }> {
  const values = new Map<string, Set<string>>();
  const numeric = new Map<string, boolean>();
  const counts = new Map<string, number>();
  for (const chain of chains) {
    for (const [name, value] of Object.entries(chain.params ?? {})) {
      if (value === null) continue;
      const set = values.get(name) ?? new Set<string>();
      set.add(String(value));
      values.set(name, set);
      numeric.set(name, (numeric.get(name) ?? true) && typeof value === "number");
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...values.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([name]) => ({ name, kind: numeric.get(name) ? ("numeric" as const) : ("categorical" as const), count: counts.get(name) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface RegressionSummary {
  n: number;
  r2: number;
  rmse: number;
  mae: number;
  bias: number;
  /** Standard error of prediction (bias-corrected). */
  sep: number;
  /** Ratio of performance to deviation (sd(y) / SEP). */
  rpd: number;
}

function numericPairs(pred: ChainPredictions, keep?: (i: number) => boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < pred.yTrue.length; i += 1) {
    if (keep && !keep(i)) continue;
    const t = pred.yTrue[i];
    const p = pred.yPred[i];
    if (typeof t === "number" && typeof p === "number" && Number.isFinite(t) && Number.isFinite(p)) out.push([t, p]);
  }
  return out;
}

/** Descriptive regression summary of the displayed predictions. */
export function regressionSummary(pred: ChainPredictions, keep?: (i: number) => boolean): RegressionSummary | null {
  const pairs = numericPairs(pred, keep);
  const n = pairs.length;
  if (n < 2) return null;
  let meanT = 0;
  let bias = 0;
  let sse = 0;
  let sae = 0;
  for (const [t, p] of pairs) {
    meanT += t;
    bias += p - t;
    sse += (p - t) ** 2;
    sae += Math.abs(p - t);
  }
  meanT /= n;
  bias /= n;
  let sst = 0;
  let sepSum = 0;
  for (const [t, p] of pairs) {
    sst += (t - meanT) ** 2;
    sepSum += (p - t - bias) ** 2;
  }
  const sep = Math.sqrt(sepSum / Math.max(1, n - 1));
  const sdY = Math.sqrt(sst / Math.max(1, n - 1));
  return { n, r2: sst > 0 ? 1 - sse / sst : Number.NaN, rmse: Math.sqrt(sse / n), mae: sae / n, bias, sep, rpd: sep > 0 ? sdY / sep : Number.NaN };
}

export function confusionCounts(pred: ChainPredictions, keep?: (i: number) => boolean): { labels: string[]; matrix: number[][]; accuracy: number } {
  const labels = pred.classes ? [...pred.classes] : [...new Set([...pred.yTrue, ...pred.yPred].map(String))].sort();
  const index = new Map(labels.map((l, i) => [l, i]));
  const matrix = labels.map(() => labels.map(() => 0));
  let correct = 0;
  let total = 0;
  for (let i = 0; i < pred.yTrue.length; i += 1) {
    if (keep && !keep(i)) continue;
    const t = index.get(String(pred.yTrue[i]));
    const p = index.get(String(pred.yPred[i]));
    if (t === undefined || p === undefined) continue;
    matrix[t]![p]! += 1;
    total += 1;
    if (t === p) correct += 1;
  }
  return { labels, matrix, accuracy: total ? correct / total : Number.NaN };
}

export interface HardSample {
  key: string;
  yTrue: number;
  /** Prediction per compared chain id (NaN when absent). */
  predictions: Map<string, number>;
  meanAbsResidual: number;
  /** Mean signed residual across chains (systematic bias on this sample). */
  meanResidual: number;
  chains: number;
}

/**
 * Samples ranked by their mean absolute residual across the compared chains —
 * the samples every model struggles with (labeling errors, out-of-domain).
 */
export function hardSamples(predictions: readonly ChainPredictions[], keep?: (pred: ChainPredictions, i: number) => boolean): HardSample[] {
  const bySample = new Map<string, HardSample & { sum: number; signed: number }>();
  for (const pred of predictions) {
    for (let i = 0; i < pred.sampleKeys.length; i += 1) {
      if (keep && !keep(pred, i)) continue;
      const t = pred.yTrue[i];
      const p = pred.yPred[i];
      if (typeof t !== "number" || typeof p !== "number" || !Number.isFinite(t) || !Number.isFinite(p)) continue;
      const key = pred.sampleKeys[i]!;
      const entry = bySample.get(key) ?? { key, yTrue: t, predictions: new Map(), meanAbsResidual: 0, meanResidual: 0, chains: 0, sum: 0, signed: 0 };
      entry.predictions.set(pred.chainId, p);
      entry.sum += Math.abs(p - t);
      entry.signed += p - t;
      entry.chains += 1;
      bySample.set(key, entry);
    }
  }
  return [...bySample.values()]
    .map(({ sum, signed, ...entry }) => ({ ...entry, meanAbsResidual: sum / entry.chains, meanResidual: signed / entry.chains }))
    .sort((a, b) => b.meanAbsResidual - a.meanAbsResidual);
}
