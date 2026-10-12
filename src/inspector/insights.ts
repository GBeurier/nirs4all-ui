/**
 * Decision helpers of the Inspector: uncertainty (fold spread, one-standard-
 * error ties), what drives the score (ω² per factor, step shifts), cost
 * trade-offs (Pareto front), what a selection shares, cross-dataset ranks,
 * error agreement between models, and the auto-generated insights built on
 * top of them. Pure and descriptive — they summarize the host's scores, never
 * replace them.
 */

import { chainLabel, facetLabel, facetValue, hyperparameterNames, isBetter, preprocessingSteps, scoreOf } from "./analysis.js";
import { formatValue } from "../workbench/format.js";
import type { ChainFacet, ChainPredictions, InspectorChain, ScoreRef } from "./types.js";

function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = (sorted.length - 1) / 2;
  return (sorted[Math.floor(mid)]! + sorted[Math.ceil(mid)]!) / 2;
}

/** Display a hyper-parameter value (integers stay integers). */
export function formatParam(value: number | string | boolean | null | undefined): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : formatValue(value);
  return String(value ?? "—");
}

/** Oriented relative change from `from` to `to` (> 0 = better under `ref`). */
export function relativeGain(from: number, to: number, ref: ScoreRef | undefined): number {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return Number.NaN;
  const change = (to - from) / Math.abs(from);
  return ref?.lowerIsBetter ? -change : change;
}

// ------------------------------------------------------------------ folds

export interface FoldStats {
  k: number;
  mean: number;
  sd: number;
  /** Standard error of the mean fold score. */
  se: number;
  min: number;
  max: number;
}

export function foldStats(chain: InspectorChain, ref: ScoreRef | undefined): FoldStats | null {
  const values = (ref ? chain.foldScores?.[ref.key] : undefined)?.filter(Number.isFinite) ?? [];
  if (values.length < 2) return null;
  const k = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / k;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (k - 1));
  return { k, mean, sd, se: sd / Math.sqrt(k), min: Math.min(...values), max: Math.max(...values) };
}

export interface RankedEntry {
  chain: InspectorChain;
  score: number;
  rank: number | null;
}

export interface TieSummary {
  best: InspectorChain;
  bestScore: number;
  /** Standard error of the best chain's folds (NaN without folds). */
  se: number;
  /** Chains within one standard error of the best (best included). */
  tied: InspectorChain[];
  /** Fastest tied chain when it is not the best — the one-SE rule pick. */
  simplest: InspectorChain | null;
  runnerUp: { chain: InspectorChain; score: number; gap: number } | null;
}

/**
 * Breiman's one-standard-error rule over a ranking: every chain whose score is
 * within one fold standard error of the best is statistically tied with it.
 */
export function oneSeTies(ranked: readonly RankedEntry[], ref: ScoreRef | undefined): TieSummary | null {
  const first = ranked[0];
  if (!first || first.rank === null) return null;
  const se = foldStats(first.chain, ref)?.se ?? Number.NaN;
  const tied = Number.isFinite(se) ? ranked.filter((r) => r.rank !== null && Math.abs(r.score - first.score) <= se).map((r) => r.chain) : [first.chain];
  const timed = tied.filter((c) => Number.isFinite(c.fitTimeMs ?? Number.NaN));
  const fastest = timed.reduce<InspectorChain | null>((best, c) => (!best || c.fitTimeMs! < best.fitTimeMs! ? c : best), null);
  const second = ranked[1];
  return {
    best: first.chain,
    bestScore: first.score,
    se,
    tied,
    simplest: fastest && fastest.id !== first.chain.id && (first.chain.fitTimeMs ?? Infinity) > fastest.fitTimeMs! ? fastest : null,
    runnerUp: second && second.rank !== null ? { chain: second.chain, score: second.score, gap: Math.abs(second.score - first.score) } : null,
  };
}

// ------------------------------------------------------------------ drivers

export interface FactorEffect {
  /** Facet id, or `param:<name>` for a hyper-parameter. */
  key: string;
  label: string;
  kind: "facet" | "param";
  /** Bias-corrected share of score variance explained (ω², 0..1). */
  omega2: number;
  levels: number;
  /** Chains entering the estimate. */
  n: number;
  /** Best level and its median score. */
  bestLevel: string;
  bestMedian: number;
}

function omegaSquared(groups: ReadonlyMap<string, number[]>): number {
  const all = [...groups.values()].flat();
  const n = all.length;
  const k = groups.size;
  if (k < 2 || n <= k) return Number.NaN;
  const grand = all.reduce((a, b) => a + b, 0) / n;
  let ssTotal = 0;
  for (const v of all) ssTotal += (v - grand) ** 2;
  let ssWithin = 0;
  for (const values of groups.values()) {
    const m = values.reduce((a, b) => a + b, 0) / values.length;
    for (const v of values) ssWithin += (v - m) ** 2;
  }
  if (ssTotal <= 0) return 0;
  const msWithin = ssWithin / (n - k);
  const omega = (ssTotal - ssWithin - (k - 1) * msWithin) / (ssTotal + msWithin);
  return Math.max(0, Math.min(1, omega));
}

function factorFrom(key: string, label: string, kind: FactorEffect["kind"], groups: Map<string, number[]>, ref: ScoreRef | undefined): FactorEffect | null {
  const omega2 = omegaSquared(groups);
  if (!Number.isFinite(omega2)) return null;
  let bestLevel = "";
  let bestMedian = Number.NaN;
  for (const [level, values] of groups) {
    const m = median(values);
    if (isBetter(m, bestMedian, ref)) {
      bestMedian = m;
      bestLevel = level;
    }
  }
  return { key, label, kind, omega2, levels: groups.size, n: [...groups.values()].reduce((s, v) => s + v.length, 0), bestLevel, bestMedian };
}

function quantileBins(values: readonly number[], bins: number): (v: number) => string {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  if (sorted.length <= bins) return (v) => String(v);
  const edges = Array.from({ length: bins - 1 }, (_, i) => sorted[Math.floor(((i + 1) * sorted.length) / bins)]!);
  return (v) => {
    const b = edges.findIndex((e) => v < e);
    const index = b < 0 ? bins - 1 : b;
    const lo = index === 0 ? sorted[0]! : edges[index - 1]!;
    const hi = index === bins - 1 ? sorted[sorted.length - 1]! : edges[index]!;
    return `${lo.toPrecision(3)}–${hi.toPrecision(3)}`;
  };
}

/**
 * Share of the score variance explained by each factor (chain facets and
 * hyper-parameters, numeric ones binned into quartiles), bias-corrected so
 * many-level factors are not favored. Hyper-parameters are estimated on the
 * chains that carry them. Sorted by ω² desc.
 */
export function factorImportance(chains: readonly InspectorChain[], ref: ScoreRef | undefined, facets: readonly ChainFacet[]): FactorEffect[] {
  const scored = chains.filter((c) => Number.isFinite(scoreOf(c, ref)));
  const out: FactorEffect[] = [];
  for (const facet of facets) {
    if (facet === "task" || facet === "status") continue;
    const groups = new Map<string, number[]>();
    for (const chain of scored) {
      const level = facetValue(chain, facet) ?? "—";
      groups.set(level, [...(groups.get(level) ?? []), scoreOf(chain, ref)]);
    }
    const effect = factorFrom(facet, facetLabel(facet), "facet", groups, ref);
    if (effect) out.push(effect);
  }
  for (const param of hyperparameterNames(scored)) {
    if (param.count < 6) continue;
    const carriers = scored.filter((c) => c.params?.[param.name] !== undefined && c.params?.[param.name] !== null);
    const bin = param.kind === "numeric" ? quantileBins(carriers.map((c) => Number(c.params![param.name])), 4) : (v: unknown) => String(v);
    const groups = new Map<string, number[]>();
    for (const chain of carriers) {
      const raw = chain.params![param.name]!;
      const level = param.kind === "numeric" ? (bin as (v: number) => string)(Number(raw)) : String(raw);
      groups.set(level, [...(groups.get(level) ?? []), scoreOf(chain, ref)]);
    }
    const models = [...new Set(carriers.map((c) => c.model))];
    const label = models.length <= 2 ? `${param.name} · ${models.join(", ")}` : param.name;
    const effect = factorFrom(`param:${param.name}`, label, "param", groups, ref);
    if (effect) out.push(effect);
  }
  return out.sort((a, b) => b.omega2 - a.omega2);
}

export interface StepShift {
  token: string;
  label: string;
  /** Chains with the step. */
  n: number;
  withMedian: number;
  withoutMedian: number;
  /** Oriented relative change of the median score (> 0 = the step helps). */
  gain: number;
}

/** Median score with vs without each preprocessing step, in score units. */
export function stepShifts(chains: readonly InspectorChain[], ref: ScoreRef | undefined, minCount = 4): StepShift[] {
  const scored = chains.filter((c) => Number.isFinite(scoreOf(c, ref)));
  const labels = new Map<string, string>();
  for (const chain of scored) for (const step of preprocessingSteps(chain)) labels.set(step.token, step.label ?? step.token);
  const out: StepShift[] = [];
  for (const [token, label] of labels) {
    const withScores: number[] = [];
    const withoutScores: number[] = [];
    for (const chain of scored) (chain.steps.some((s) => s.token === token) ? withScores : withoutScores).push(scoreOf(chain, ref));
    if (withScores.length < minCount || withoutScores.length < minCount) continue;
    const withMedian = median(withScores);
    const withoutMedian = median(withoutScores);
    out.push({ token, label, n: withScores.length, withMedian, withoutMedian, gain: relativeGain(withoutMedian, withMedian, ref) });
  }
  return out.sort((a, b) => b.gain - a.gain);
}

// ------------------------------------------------------------------ cost

/** Chains on the score × fit-time Pareto front, fastest first. */
export function paretoFront(chains: readonly InspectorChain[], ref: ScoreRef | undefined): InspectorChain[] {
  const candidates = chains
    .filter((c) => Number.isFinite(scoreOf(c, ref)) && Number.isFinite(c.fitTimeMs ?? Number.NaN))
    .sort((a, b) => a.fitTimeMs! - b.fitTimeMs! || (isBetter(scoreOf(a, ref), scoreOf(b, ref), ref) ? -1 : 1));
  const front: InspectorChain[] = [];
  let best = Number.NaN;
  for (const chain of candidates) {
    const score = scoreOf(chain, ref);
    if (isBetter(score, best, ref)) {
      front.push(chain);
      best = score;
    }
  }
  return front;
}

/** Binned running median `[x, y]` points (trend curve for a scatter). */
export function trendLine(xs: ArrayLike<number>, ys: ArrayLike<number>, bins = 8): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < xs.length; i += 1) if (Number.isFinite(xs[i]!) && Number.isFinite(ys[i]!)) pairs.push([xs[i]!, ys[i]!]);
  if (pairs.length < 6) return [];
  pairs.sort((a, b) => a[0] - b[0]);
  const count = Math.min(bins, Math.floor(pairs.length / 3));
  const out: Array<[number, number]> = [];
  for (let b = 0; b < count; b += 1) {
    const slice = pairs.slice(Math.floor((b * pairs.length) / count), Math.floor(((b + 1) * pairs.length) / count));
    if (slice.length) out.push([median(slice.map((p) => p[0])), median(slice.map((p) => p[1]))]);
  }
  return out;
}

// ------------------------------------------------------------------ selection profile

export interface ProfileItem {
  key: string;
  label: string;
  kind: "step" | "model" | "facet";
  /** Share of selected chains carrying the item. */
  inSelection: number;
  /** Share of all scoped chains carrying it. */
  overall: number;
}

/**
 * What a chain selection has in common compared with the whole scope: steps,
 * models and facet values over-represented in it (enriched) and frequent ones
 * it never uses (absent).
 */
export function selectionProfile(
  selected: readonly InspectorChain[],
  pool: readonly InspectorChain[],
  facets: readonly ChainFacet[] = ["modelFamily"],
): { enriched: ProfileItem[]; absent: ProfileItem[] } {
  if (selected.length === 0 || pool.length === 0) return { enriched: [], absent: [] };
  const items = new Map<string, { label: string; kind: ProfileItem["kind"]; test: (c: InspectorChain) => boolean }>();
  for (const chain of pool) {
    for (const step of chain.steps) {
      if (step.role === "split") continue;
      const key = `step:${step.token}`;
      if (!items.has(key)) items.set(key, { label: step.label ?? step.token, kind: step.role === "model" ? "model" : "step", test: (c) => c.steps.some((s) => s.token === step.token) });
    }
    for (const facet of facets) {
      const value = facetValue(chain, facet);
      const key = `${facet}:${value}`;
      if (value !== null && !items.has(key) && value !== chain.model) items.set(key, { label: `${facetLabel(facet)}: ${value}`, kind: "facet", test: (c) => facetValue(c, facet) === value });
    }
  }
  const all: ProfileItem[] = [];
  for (const [key, item] of items) {
    const inSelection = selected.filter(item.test).length / selected.length;
    const overall = pool.filter(item.test).length / pool.length;
    all.push({ key, label: item.label, kind: item.kind, inSelection, overall });
  }
  const enriched = all
    .filter((i) => i.inSelection >= 0.4 && i.inSelection >= i.overall * 1.25 && i.overall < 0.98)
    .sort((a, b) => b.inSelection - b.overall - (a.inSelection - a.overall))
    .slice(0, 6);
  const absent = all
    .filter((i) => i.inSelection === 0 && i.overall >= 0.25)
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 3);
  return { enriched, absent };
}

// ------------------------------------------------------------------ cross-dataset

export interface CrossDatasetCell {
  score: number;
  /** 1 = best group on this dataset. */
  rank: number;
  /** Rank mapped to 0..1 (1 = best). */
  quality: number;
  chainIds: string[];
}

export interface CrossDatasetTable {
  datasets: Array<{ name: string; ref: ScoreRef }>;
  rows: Array<{ value: string; cells: Map<string, CrossDatasetCell>; meanRank: number; wins: number }>;
}

/**
 * Best score of every facet level on every dataset, ranked within the dataset
 * (raw scores are not comparable across datasets; ranks are). Each dataset
 * uses `preferred` when it scores there, else the first reference that does.
 */
export function crossDatasetTable(chains: readonly InspectorChain[], facet: ChainFacet, refs: readonly ScoreRef[], preferred: ScoreRef | undefined): CrossDatasetTable {
  const names = [...new Set(chains.map((c) => c.dataset).filter((d): d is string => Boolean(d)))].sort();
  const datasets: CrossDatasetTable["datasets"] = [];
  const rows = new Map<string, Map<string, CrossDatasetCell>>();
  for (const name of names) {
    const subset = chains.filter((c) => c.dataset === name);
    const scores = (r: ScoreRef) => subset.some((c) => Number.isFinite(scoreOf(c, r)));
    const ref = preferred && scores(preferred) ? preferred : refs.find(scores);
    if (!ref) continue;
    datasets.push({ name, ref });
    const best = new Map<string, { score: number; ids: string[] }>();
    for (const chain of subset) {
      const score = scoreOf(chain, ref);
      if (!Number.isFinite(score)) continue;
      const level = facetValue(chain, facet) ?? "—";
      const entry = best.get(level) ?? { score: Number.NaN, ids: [] };
      entry.ids.push(chain.id);
      if (isBetter(score, entry.score, ref)) entry.score = score;
      best.set(level, entry);
    }
    const order = [...best.entries()].sort((a, b) => (isBetter(a[1].score, b[1].score, ref) ? -1 : 1));
    order.forEach(([level, entry], i) => {
      const row = rows.get(level) ?? new Map<string, CrossDatasetCell>();
      row.set(name, { score: entry.score, rank: i + 1, quality: order.length > 1 ? 1 - i / (order.length - 1) : 1, chainIds: entry.ids });
      rows.set(level, row);
    });
  }
  return {
    datasets,
    rows: [...rows.entries()]
      .map(([value, cells]) => {
        const ranks = [...cells.values()].map((c) => c.rank);
        return { value, cells, meanRank: ranks.reduce((a, b) => a + b, 0) / ranks.length, wins: ranks.filter((r) => r === 1).length };
      })
      .sort((a, b) => a.meanRank - b.meanRank || b.cells.size - a.cells.size),
  };
}

// ------------------------------------------------------------------ agreement

export interface ResidualAgreement {
  n: number;
  /** Pearson correlation of the two chains' residuals on shared samples. */
  r: number;
  rmseA: number;
  rmseB: number;
  /** RMSE of the averaged prediction — what a two-model blend would score. */
  rmseBlend: number;
  keys: string[];
  residualsA: Float64Array;
  residualsB: Float64Array;
}

/** Residual agreement of two regression chains on the samples they share. */
export function residualAgreement(a: ChainPredictions, b: ChainPredictions, keep?: (pred: ChainPredictions, i: number) => boolean): ResidualAgreement | null {
  const indexB = new Map<string, number>();
  b.sampleKeys.forEach((key, i) => {
    if (!keep || keep(b, i)) indexB.set(key, i);
  });
  const keys: string[] = [];
  const ra: number[] = [];
  const rb: number[] = [];
  let sa = 0;
  let sb = 0;
  let sm = 0;
  for (let i = 0; i < a.sampleKeys.length; i += 1) {
    if (keep && !keep(a, i)) continue;
    const j = indexB.get(a.sampleKeys[i]!);
    if (j === undefined) continue;
    const t = a.yTrue[i];
    const pa = a.yPred[i];
    const pb = b.yPred[j];
    if (typeof t !== "number" || typeof pa !== "number" || typeof pb !== "number" || !Number.isFinite(t + pa + pb)) continue;
    keys.push(a.sampleKeys[i]!);
    ra.push(pa - t);
    rb.push(pb - t);
    sa += (pa - t) ** 2;
    sb += (pb - t) ** 2;
    sm += ((pa + pb) / 2 - t) ** 2;
  }
  const n = keys.length;
  if (n < 3) return null;
  const ma = ra.reduce((s, v) => s + v, 0) / n;
  const mb = rb.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (ra[i]! - ma) * (rb[i]! - mb);
    va += (ra[i]! - ma) ** 2;
    vb += (rb[i]! - mb) ** 2;
  }
  return {
    n,
    r: va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : Number.NaN,
    rmseA: Math.sqrt(sa / n),
    rmseB: Math.sqrt(sb / n),
    rmseBlend: Math.sqrt(sm / n),
    keys,
    residualsA: Float64Array.from(ra),
    residualsB: Float64Array.from(rb),
  };
}

// ------------------------------------------------------------------ insights

export type Insight =
  /** `count` = chains other than the best within one standard error. */
  | { kind: "ties"; tone: "info"; count: number; simplest: string | null }
  | { kind: "clearWinner"; tone: "good"; gap: number; runnerUp: string }
  | { kind: "driver"; tone: "info"; factor: string; share: number; level: string }
  | { kind: "family"; tone: "info"; leader: string; score: number; next: string; gain: number }
  | { kind: "stepGain"; tone: "good"; step: string; gain: number; n: number }
  | { kind: "stepLoss"; tone: "warn"; step: string; gain: number; n: number }
  | { kind: "overfit"; tone: "warn"; family: string; gap: number; trainLabel: string }
  | { kind: "testDrift"; tone: "warn" | "good"; change: number; testLabel: string }
  | { kind: "foldNoise"; tone: "warn"; cv: number };

/** A short, ranked list of plain-language findings over the scoped chains. */
export function buildInsights(input: {
  chains: readonly InspectorChain[];
  ref: ScoreRef | undefined;
  refs: readonly ScoreRef[];
  ties: TieSummary | null;
  factors: readonly FactorEffect[];
  shifts: readonly StepShift[];
}): Insight[] {
  const { chains, ref, refs, ties, factors, shifts } = input;
  const out: Insight[] = [];
  if (!ref || !ties) return out;
  if (ties.tied.length > 1) out.push({ kind: "ties", tone: "info", count: ties.tied.length - 1, simplest: ties.simplest ? chainLabel(ties.simplest) : null });
  else if (ties.runnerUp && Number.isFinite(ties.se)) out.push({ kind: "clearWinner", tone: "good", gap: ties.runnerUp.gap / ties.se, runnerUp: ties.runnerUp.chain.model });

  const driver = factors[0];
  if (driver && driver.omega2 >= 0.15) out.push({ kind: "driver", tone: "info", factor: driver.label, share: driver.omega2, level: driver.bestLevel });

  const families = new Map<string, number>();
  for (const chain of chains) {
    const family = chain.modelFamily ?? chain.model;
    const score = scoreOf(chain, ref);
    if (isBetter(score, families.get(family) ?? Number.NaN, ref)) families.set(family, score);
  }
  const ordered = [...families.entries()].sort((a, b) => (isBetter(a[1], b[1], ref) ? -1 : 1));
  if (ordered.length >= 2) {
    const [leader, next] = ordered;
    out.push({ kind: "family", tone: "info", leader: leader![0], score: leader![1], next: next![0], gain: relativeGain(next![1], leader![1], ref) });
  }

  const gain = shifts[0];
  if (gain && gain.gain > 0.02) out.push({ kind: "stepGain", tone: "good", step: gain.label, gain: gain.gain, n: gain.n });
  const loss = shifts[shifts.length - 1];
  if (loss && loss !== gain && loss.gain < -0.02) out.push({ kind: "stepLoss", tone: "warn", step: loss.label, gain: loss.gain, n: loss.n });

  const trainRef = refs.find((r) => r.partition === "train" && r.metric === ref.metric);
  if (trainRef) {
    const gaps = new Map<string, number[]>();
    for (const chain of chains) {
      const g = relativeGain(scoreOf(chain, ref), scoreOf(chain, trainRef), ref);
      if (!Number.isFinite(g)) continue;
      const family = chain.modelFamily ?? chain.model;
      gaps.set(family, [...(gaps.get(family) ?? []), g]);
    }
    const worst = [...gaps.entries()].map(([family, values]) => ({ family, gap: median(values) })).sort((a, b) => b.gap - a.gap)[0];
    if (worst && worst.gap > 0.3) out.push({ kind: "overfit", tone: "warn", family: worst.family, gap: worst.gap, trainLabel: trainRef.label });
  }

  const testRef = refs.find((r) => r.partition === "test" && r.metric === ref.metric && r.key !== ref.key);
  if (testRef) {
    const change = relativeGain(ties.bestScore, scoreOf(ties.best, testRef), ref);
    if (Number.isFinite(change)) out.push({ kind: "testDrift", tone: change < -0.1 ? "warn" : "good", change, testLabel: testRef.label });
  }

  const folds = foldStats(ties.best, ref);
  if (folds && Math.abs(folds.sd / (folds.mean || 1)) > 0.1) out.push({ kind: "foldNoise", tone: "warn", cv: Math.abs(folds.sd / (folds.mean || 1)) });
  return out;
}
