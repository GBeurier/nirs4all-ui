/**
 * Display subsampling for dense curve views: draw a representative subset of
 * the rows instead of every curve. Deterministic for a given seed so the
 * picture does not flicker between renders.
 */

import type { SpectraMatrix } from "./matrix.js";

export type SamplingStrategy = "random" | "stratified" | "coverage";

/** Small, fast, seedable PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(rows: readonly number[], rand: () => number): number[] {
  const out = [...rows];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** One random row per equal-count stratum of `values` (rows without a value go last). */
function stratified(rows: readonly number[], count: number, values: ArrayLike<number>, rand: () => number): number[] {
  const valued = rows.filter((row) => Number.isFinite(values[row]!)).sort((a, b) => values[a]! - values[b]!);
  if (valued.length === 0) return shuffled(rows, rand).slice(0, count);
  const take = Math.min(count, valued.length);
  const out: number[] = [];
  for (let k = 0; k < take; k += 1) {
    const start = Math.floor((k * valued.length) / take);
    const end = Math.max(start + 1, Math.floor(((k + 1) * valued.length) / take));
    out.push(valued[start + Math.floor(rand() * (end - start))]!);
  }
  if (out.length < count) {
    const missing = rows.filter((row) => !Number.isFinite(values[row]!));
    out.push(...shuffled(missing, rand).slice(0, count - out.length));
  }
  return out;
}

/** Greedy farthest-point (maximin) subset on a decimated copy of the curves. */
function coverage(rows: readonly number[], count: number, matrix: SpectraMatrix): number[] {
  const features = Math.min(matrix.cols, 24);
  const stride = matrix.cols / features;
  const points = new Float32Array(rows.length * features);
  const mean = new Float64Array(features);
  rows.forEach((row, i) => {
    for (let f = 0; f < features; f += 1) {
      const v = matrix.data[row * matrix.cols + Math.floor(f * stride)]!;
      const value = Number.isFinite(v) ? v : 0;
      points[i * features + f] = value;
      mean[f]! += value / rows.length;
    }
  });
  const distance = (i: number, ref: ArrayLike<number>, offset: number) => {
    let s = 0;
    for (let f = 0; f < features; f += 1) {
      const d = points[i * features + f]! - ref[offset + f]!;
      s += d * d;
    }
    return s;
  };
  // Start from the curve closest to the mean, then always add the farthest one.
  let first = 0;
  let best = Infinity;
  for (let i = 0; i < rows.length; i += 1) {
    const d = distance(i, mean, 0);
    if (d < best) {
      best = d;
      first = i;
    }
  }
  const minDistance = new Float64Array(rows.length).fill(Infinity);
  const picked: number[] = [];
  let next = first;
  for (let k = 0; k < count; k += 1) {
    picked.push(rows[next]!);
    minDistance[next] = -1;
    let far = -1;
    let farDistance = -1;
    for (let i = 0; i < rows.length; i += 1) {
      if (minDistance[i]! < 0) continue;
      const d = distance(i, points, next * features);
      if (d < minDistance[i]!) minDistance[i] = d;
      if (minDistance[i]! > farDistance) {
        farDistance = minDistance[i]!;
        far = i;
      }
    }
    if (far < 0) break;
    next = far;
  }
  return picked;
}

/**
 * Pick at most `count` of `rows` for display, returned in ascending order.
 * `stratified` spreads the picks over the quantiles of `values` (e.g. the
 * target); `coverage` maximizes the spectral diversity of the subset.
 */
export function sampleRows(
  rows: readonly number[],
  count: number,
  strategy: SamplingStrategy,
  options: { seed?: number | undefined; values?: ArrayLike<number> | null | undefined; matrix?: SpectraMatrix | undefined } = {},
): number[] {
  if (count <= 0 || rows.length <= count) return [...rows];
  const rand = seededRandom(options.seed ?? 42);
  let picked: number[];
  if (strategy === "stratified" && options.values) picked = stratified(rows, count, options.values, rand);
  else if (strategy === "coverage" && options.matrix) picked = coverage(rows, count, options.matrix);
  else picked = shuffled(rows, rand).slice(0, count);
  return picked.sort((a, b) => a - b);
}
