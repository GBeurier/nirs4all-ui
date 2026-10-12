/**
 * DEMO-ONLY host for the showroom. A synthetic NIR dataset and a tiny
 * in-browser "engine" so the Playground capsule can be exercised without a
 * backend. None of this ships in the package: real hosts execute pipelines
 * with nirs4all / nirs4all-methods and return `PlaygroundResult`s.
 */

import type {
  OperatorDefinition,
  PipelineStep,
  PlaygroundDataset,
  PlaygroundFold,
  PlaygroundResult,
  PlaygroundRunRequest,
  StepOutcome,
} from "../../../src/playground/index.js";
import type { SpectraMatrix } from "../../../src/workbench/index.js";

// ------------------------------------------------------------------ rng
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(1e-12, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ------------------------------------------------------------------ dataset
export function makeWheatDataset(groups = 320, reps = 3, seed = 7): PlaygroundDataset {
  const rand = mulberry32(seed);
  const wavelengths: number[] = [];
  for (let w = 1000; w <= 2500; w += 4) wavelengths.push(w);
  const p = wavelengths.length;
  const band = (center: number, width: number) => wavelengths.map((w) => Math.exp(-0.5 * ((w - center) / width) ** 2));
  const water = [band(1450, 45), band(1940, 55)];
  const protein = [band(1510, 30), band(2055, 40), band(2180, 35)];
  const starch = [band(1200, 60), band(2100, 50), band(2320, 45)];
  const oil = [band(1725, 25), band(2310, 20)];
  const cultivars = ["Arina", "Bologna", "Rubisko", "Tenor"];
  const sites = ["Montpellier", "Toulouse", "Rennes"];
  const n = groups * reps;
  const data = new Float32Array(n * p);
  const proteinPct: Array<number | null> = [];
  const moisture: Array<number | null> = [];
  const grade: Array<string | null> = [];
  const partition: Array<string | null> = [];
  const cultivar: Array<string | null> = [];
  const site: Array<string | null> = [];
  const instrument: Array<string | null> = [];
  const year: Array<number | null> = [];
  const bio: Array<string | null> = [];
  const ids: string[] = [];
  for (let g = 0; g < groups; g += 1) {
    const cv = Math.floor(rand() * cultivars.length);
    const st = Math.floor(rand() * sites.length);
    const prot = 10.5 + cv * 0.9 + gaussian(rand) * 1.2 + (st === 2 ? 0.6 : 0);
    const moist = 11 + gaussian(rand) * 1.1 + st * 0.4;
    const st_ = 62 - prot * 0.9 + gaussian(rand) * 1.5;
    const oi = 2 + gaussian(rand) * 0.3;
    const yr = 2021 + Math.floor(rand() * 4);
    const testGroup = rand() < 0.25;
    const outlierGroup = rand() < 0.02;
    for (let r = 0; r < reps; r += 1) {
      const row = g * reps + r;
      const inst = rand() < 0.5 ? 0 : 1;
      const offset = 0.18 + gaussian(rand) * 0.06 + inst * 0.05;
      const scale = 1 + gaussian(rand) * 0.09;
      const slope = gaussian(rand) * 0.00004 + 0.00002;
      for (let c = 0; c < p; c += 1) {
        let v = 0;
        v += 0.042 * moist * (water[0]![c]! + 1.6 * water[1]![c]!) / 11;
        v += 0.03 * prot * (protein[0]![c]! + protein[1]![c]! + 0.8 * protein[2]![c]!) / 11;
        v += 0.011 * st_ * (starch[0]![c]! + starch[1]![c]! + starch[2]![c]!) / 55;
        v += 0.05 * oi * (oil[0]![c]! + oil[1]![c]!);
        v = offset + scale * v + slope * (wavelengths[c]! - 1000) + gaussian(rand) * 0.0016;
        if (outlierGroup && r === 0) v += 0.12 * Math.sin(c / 9) + 0.05;
        data[row * p + c] = v;
      }
      ids.push(`W${String(g + 1).padStart(4, "0")}-r${r + 1}`);
      proteinPct.push(Number((prot + gaussian(rand) * 0.08).toFixed(2)));
      moisture.push(Number((moist + gaussian(rand) * 0.05).toFixed(2)));
      grade.push(prot > 13.5 ? "premium" : prot > 11.5 ? "standard" : "feed");
      partition.push(testGroup ? "test" : "train");
      cultivar.push(cultivars[cv]!);
      site.push(sites[st]!);
      instrument.push(inst === 0 ? "FOSS-DS2500" : "Bruker-MPA");
      year.push(yr);
      bio.push(`W${String(g + 1).padStart(4, "0")}`);
    }
  }
  return {
    id: "demo-wheat",
    name: "wheat_grain_nir · demo",
    spectra: { rows: n, cols: p, data },
    wavelengths,
    unit: "nm",
    signal: "log(1/R)",
    sampleIds: ids,
    targets: [
      { name: "protein", kind: "regression", values: proteinPct, unit: "%" },
      { name: "moisture", kind: "regression", values: moisture, unit: "%" },
      { name: "grade", kind: "classification", values: grade, classes: ["feed", "standard", "premium"] },
    ],
    partition,
    metadata: [
      { key: "cultivar", label: "Cultivar", kind: "categorical", values: cultivar },
      { key: "site", label: "Site", kind: "categorical", values: site },
      { key: "instrument", label: "Instrument", kind: "categorical", values: instrument },
      { key: "year", label: "Harvest year", kind: "categorical", values: year.map(String) },
      { key: "bio_sample", label: "Bio sample", kind: "categorical", values: bio },
    ],
    groupColumn: "bio_sample",
    description: "Synthetic wheat NIR (1000–2500 nm), 3 replicates per sample, two instruments.",
  };
}

// ------------------------------------------------------------------ operator catalog
export const DEMO_OPERATORS: OperatorDefinition[] = [
  { id: "snv", name: "SNV", kind: "preprocessing", category: "Scatter correction", tier: "core", description: "Standard normal variate: center and scale each spectrum." },
  { id: "msc", name: "MSC", kind: "preprocessing", category: "Scatter correction", tier: "core", description: "Multiplicative scatter correction against the mean spectrum." },
  {
    id: "savgol",
    name: "Savitzky–Golay",
    kind: "preprocessing",
    category: "Smoothing & derivatives",
    tier: "core",
    description: "Polynomial smoothing and derivatives over a sliding window.",
    params: [
      { name: "window", label: "window", type: "int", default: 11, min: 3, max: 51, step: 2 },
      { name: "polyorder", label: "order", type: "int", default: 2, min: 1, max: 4 },
      { name: "deriv", label: "deriv", type: "select", default: 1, options: [{ value: 0, label: "0 (smooth)" }, { value: 1, label: "1st" }, { value: 2, label: "2nd" }] },
    ],
  },
  {
    id: "detrend",
    name: "Detrend",
    kind: "preprocessing",
    category: "Baseline",
    description: "Remove a polynomial baseline fitted on each spectrum.",
    params: [{ name: "order", type: "int", default: 1, min: 0, max: 3 }],
  },
  {
    id: "normalize",
    name: "Normalize",
    kind: "preprocessing",
    category: "Scaling",
    description: "Scale each spectrum by a norm.",
    params: [{ name: "norm", type: "select", default: "l2", options: [{ value: "l2", label: "L2" }, { value: "max", label: "max" }, { value: "area", label: "area" }] }],
  },
  { id: "center", name: "Mean centering", kind: "preprocessing", category: "Scaling", description: "Subtract the mean spectrum (column-wise)." },
  {
    id: "crop",
    name: "Crop wavelengths",
    kind: "feature",
    category: "Wavelength selection",
    special: "crop",
    tier: "core",
    description: "Keep a wavelength window.",
    params: [
      { name: "min", type: "float", default: 1100, unit: "nm", step: 10 },
      { name: "max", type: "float", default: 2400, unit: "nm", step: 10 },
    ],
  },
  {
    id: "bin",
    name: "Binning",
    kind: "feature",
    category: "Wavelength selection",
    description: "Average adjacent wavelengths.",
    params: [{ name: "factor", type: "int", default: 4, min: 2, max: 16 }],
  },
  {
    id: "sample_filter",
    name: "Sample filter",
    kind: "filter",
    category: "Samples",
    special: "sampleFilter",
    description: "Keep or remove explicit samples (created from a selection).",
    params: [
      { name: "mode", type: "select", default: "remove", options: [{ value: "keep" }, { value: "remove" }] },
      { name: "rows", type: "string", default: [], advanced: true },
    ],
  },
  {
    id: "y_outlier",
    name: "Target outliers (IQR)",
    kind: "filter",
    category: "Outliers",
    description: "Flag or remove samples whose target lies outside k × IQR.",
    params: [
      { name: "k", type: "float", default: 1.5, min: 0.5, max: 4, step: 0.1 },
      { name: "mode", type: "select", default: "tag", options: [{ value: "tag", label: "flag" }, { value: "remove", label: "remove" }] },
    ],
  },
  {
    id: "x_outlier",
    name: "Spectral outliers (T²/Q)",
    kind: "filter",
    category: "Outliers",
    description: "Flag or remove samples beyond PCA T² or Q limits.",
    params: [
      { name: "components", type: "int", default: 5, min: 2, max: 10 },
      { name: "mode", type: "select", default: "tag", options: [{ value: "tag", label: "flag" }, { value: "remove", label: "remove" }] },
    ],
  },
  {
    id: "kfold",
    name: "K-Fold",
    kind: "splitting",
    category: "Cross-validation",
    singleton: true,
    tier: "core",
    description: "K folds, grouped by bio sample (replicates stay together).",
    params: [
      { name: "n_splits", label: "folds", type: "int", default: 5, min: 2, max: 10 },
      { name: "seed", type: "int", default: 42, advanced: true },
    ],
  },
  {
    id: "kennard_stone",
    name: "Kennard–Stone",
    kind: "splitting",
    category: "Hold-out",
    singleton: true,
    description: "Representative calibration / test split in PCA space.",
    params: [{ name: "test_size", type: "float", default: 0.25, min: 0.1, max: 0.5, step: 0.05 }],
  },
  {
    id: "noise",
    name: "Gaussian noise",
    kind: "augmentation",
    category: "Augmentation",
    description: "Append noisy copies of the training spectra.",
    params: [
      { name: "copies", type: "int", default: 1, min: 1, max: 3 },
      { name: "sigma", type: "float", default: 0.003, min: 0.0005, max: 0.02, step: 0.0005 },
    ],
  },
  {
    id: "baseline_shift",
    name: "Baseline shift",
    kind: "augmentation",
    category: "Augmentation",
    description: "Append copies with random additive offsets.",
    params: [{ name: "amplitude", type: "float", default: 0.03, min: 0.005, max: 0.2, step: 0.005 }],
  },
];

// ------------------------------------------------------------------ numerics (demo)
interface Frame {
  m: SpectraMatrix;
  w: number[];
  rows: number[];
}

function rowMean(d: Float32Array, off: number, p: number) {
  let s = 0;
  for (let c = 0; c < p; c += 1) s += d[off + c]!;
  return s / p;
}

function sgCoefficients(window: number, order: number, deriv: number): Float64Array {
  const m = (window - 1) / 2;
  const k = order + 1;
  const ata = Array.from({ length: k }, () => new Float64Array(k));
  for (let i = -m; i <= m; i += 1) for (let a = 0; a < k; a += 1) for (let b = 0; b < k; b += 1) ata[a]![b]! += i ** (a + b);
  // invert ata (Gauss-Jordan)
  const inv = Array.from({ length: k }, (_, i) => Float64Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
  for (let col = 0; col < k; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < k; r += 1) if (Math.abs(ata[r]![col]!) > Math.abs(ata[pivot]![col]!)) pivot = r;
    [ata[col], ata[pivot]] = [ata[pivot]!, ata[col]!];
    [inv[col], inv[pivot]] = [inv[pivot]!, inv[col]!];
    const div = ata[col]![col]!;
    for (let j = 0; j < k; j += 1) {
      ata[col]![j]! /= div;
      inv[col]![j]! /= div;
    }
    for (let r = 0; r < k; r += 1) {
      if (r === col) continue;
      const f = ata[r]![col]!;
      for (let j = 0; j < k; j += 1) {
        ata[r]![j]! -= f * ata[col]![j]!;
        inv[r]![j]! -= f * inv[col]![j]!;
      }
    }
  }
  const fact = deriv === 2 ? 2 : 1;
  const out = new Float64Array(window);
  for (let i = -m; i <= m; i += 1) {
    let v = 0;
    for (let b = 0; b < k; b += 1) v += inv[deriv]![b]! * i ** b;
    out[i + m] = v * fact;
  }
  return out;
}

function mapRows(f: Frame, fn: (src: Float32Array, dst: Float32Array) => void): Frame {
  const { rows, cols } = f.m;
  const data = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r += 1) fn(f.m.data.subarray(r * cols, (r + 1) * cols), data.subarray(r * cols, (r + 1) * cols));
  return { ...f, m: { rows, cols, data } };
}

function subsetRows(f: Frame, keep: number[]): Frame {
  const { cols } = f.m;
  const data = new Float32Array(keep.length * cols);
  keep.forEach((r, i) => data.set(f.m.data.subarray(r * cols, (r + 1) * cols), i * cols));
  return { m: { rows: keep.length, cols, data }, w: f.w, rows: keep.map((r) => f.rows[r]!) };
}

function meanSpectrum(f: Frame): Float64Array {
  const { rows, cols, data } = f.m;
  const mean = new Float64Array(cols);
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) mean[c]! += data[r * cols + c]!;
  for (let c = 0; c < cols; c += 1) mean[c]! /= Math.max(1, rows);
  return mean;
}

export interface Pca {
  scores: Float64Array[]; // n × k (per row)
  loadings: Float64Array[]; // k × p
  explained: number[];
  q: Float64Array;
  t2: Float64Array;
  t2Limit: number;
  qLimit: number;
}

function chi2Quantile95(df: number): number {
  const z = 1.6449;
  const a = 2 / (9 * df);
  return df * (1 - a + z * Math.sqrt(a)) ** 3;
}

/** NIPALS PCA on centered data (demo numerics). */
export function pca(m: SpectraMatrix, k: number): Pca {
  const { rows: n, cols: p } = m;
  const x = new Float64Array(n * p);
  const mean = new Float64Array(p);
  for (let r = 0; r < n; r += 1) for (let c = 0; c < p; c += 1) mean[c]! += m.data[r * p + c]!;
  for (let c = 0; c < p; c += 1) mean[c]! /= Math.max(1, n);
  let total = 0;
  for (let r = 0; r < n; r += 1)
    for (let c = 0; c < p; c += 1) {
      const v = m.data[r * p + c]! - mean[c]!;
      x[r * p + c] = v;
      total += v * v;
    }
  const comps = Math.min(k, n - 1, p);
  const scoresByComp: Float64Array[] = [];
  const loadings: Float64Array[] = [];
  const explained: number[] = [];
  for (let a = 0; a < comps; a += 1) {
    let t = new Float64Array(n);
    let best = 0;
    for (let c = 0; c < p; c += 1) {
      let s = 0;
      for (let r = 0; r < n; r += 1) s += x[r * p + c]! ** 2;
      if (s > best) {
        best = s;
        for (let r = 0; r < n; r += 1) t[r] = x[r * p + c]!;
      }
    }
    const load = new Float64Array(p);
    for (let iter = 0; iter < 60; iter += 1) {
      const tt = t.reduce((s, v) => s + v * v, 0) || 1;
      load.fill(0);
      for (let r = 0; r < n; r += 1) {
        const tr = t[r]!;
        for (let c = 0; c < p; c += 1) load[c]! += x[r * p + c]! * tr;
      }
      let norm = 0;
      for (let c = 0; c < p; c += 1) {
        load[c]! /= tt;
        norm += load[c]! ** 2;
      }
      norm = Math.sqrt(norm) || 1;
      for (let c = 0; c < p; c += 1) load[c]! /= norm;
      const next = new Float64Array(n);
      for (let r = 0; r < n; r += 1) {
        let s = 0;
        for (let c = 0; c < p; c += 1) s += x[r * p + c]! * load[c]!;
        next[r] = s;
      }
      let diff = 0;
      for (let r = 0; r < n; r += 1) diff += (next[r]! - t[r]!) ** 2;
      t = next;
      if (diff < 1e-12 * n) break;
    }
    let ss = 0;
    for (let r = 0; r < n; r += 1) {
      ss += t[r]! ** 2;
      for (let c = 0; c < p; c += 1) x[r * p + c]! -= t[r]! * load[c]!;
    }
    scoresByComp.push(t);
    loadings.push(load);
    explained.push(total > 0 ? ss / total : 0);
  }
  const q = new Float64Array(n);
  for (let r = 0; r < n; r += 1) {
    let s = 0;
    for (let c = 0; c < p; c += 1) s += x[r * p + c]! ** 2;
    q[r] = s;
  }
  const variances = scoresByComp.map((t) => t.reduce((s, v) => s + v * v, 0) / Math.max(1, n - 1) || 1);
  const t2 = new Float64Array(n);
  for (let r = 0; r < n; r += 1) {
    let s = 0;
    for (let a = 0; a < comps; a += 1) s += scoresByComp[a]![r]! ** 2 / variances[a]!;
    t2[r] = s;
  }
  const t2Limit = ((comps * (n - 1)) / Math.max(1, n - comps)) * (chi2Quantile95(comps) / comps) * 1.02;
  const qMean = q.reduce((s, v) => s + v, 0) / Math.max(1, n);
  const qVar = q.reduce((s, v) => s + (v - qMean) ** 2, 0) / Math.max(1, n - 1);
  const g = qVar / (2 * qMean || 1);
  const h = (2 * qMean * qMean) / (qVar || 1);
  const qLimit = g * chi2Quantile95(Math.max(1, h));
  const scores = Array.from({ length: n }, (_, r) => Float64Array.from({ length: comps }, (_, a) => scoresByComp[a]![r]!));
  return { scores, loadings, explained, q, t2, t2Limit, qLimit };
}

// ------------------------------------------------------------------ engine
interface EngineState {
  frame: Frame;
  folds: { kind: "cv" | "holdout"; splitter: string; folds: PlaygroundFold[] } | null;
  outcomes: StepOutcome[];
}

function groupKey(dataset: PlaygroundDataset, row: number): string {
  const column = dataset.metadata?.find((c) => c.key === dataset.groupColumn);
  return String(column?.values[row] ?? row);
}

function applyStep(dataset: PlaygroundDataset, state: EngineState, step: PipelineStep, targetName: string | undefined): void {
  const t0 = performance.now();
  const P = step.params;
  const f = state.frame;
  const p = f.m.cols;
  const outcome: StepOutcome = { stepId: step.id, status: "ok" };
  switch (step.operatorId) {
    case "snv":
      state.frame = mapRows(f, (s, d) => {
        const mean = rowMean(s, 0, p);
        let sd = 0;
        for (let c = 0; c < p; c += 1) sd += (s[c]! - mean) ** 2;
        sd = Math.sqrt(sd / Math.max(1, p - 1)) || 1;
        for (let c = 0; c < p; c += 1) d[c] = (s[c]! - mean) / sd;
      });
      break;
    case "msc": {
      const ref = meanSpectrum(f);
      const refMean = ref.reduce((s, v) => s + v, 0) / p;
      let refVar = 0;
      for (let c = 0; c < p; c += 1) refVar += (ref[c]! - refMean) ** 2;
      state.frame = mapRows(f, (s, d) => {
        const mean = rowMean(s, 0, p);
        let cov = 0;
        for (let c = 0; c < p; c += 1) cov += (ref[c]! - refMean) * (s[c]! - mean);
        const b = cov / (refVar || 1);
        const a = mean - b * refMean;
        for (let c = 0; c < p; c += 1) d[c] = (s[c]! - a) / (b || 1);
      });
      break;
    }
    case "savgol": {
      let window = Math.max(3, Math.round(Number(P.window ?? 11)));
      if (window % 2 === 0) window += 1;
      const order = Math.min(window - 1, Math.max(1, Math.round(Number(P.polyorder ?? 2))));
      const deriv = Math.min(order, Math.round(Number(P.deriv ?? 0)));
      const coef = sgCoefficients(window, order, deriv);
      const m = (window - 1) / 2;
      state.frame = mapRows(f, (s, d) => {
        for (let c = 0; c < p; c += 1) {
          let v = 0;
          for (let i = -m; i <= m; i += 1) v += coef[i + m]! * s[Math.min(p - 1, Math.max(0, c + i))]!;
          d[c] = v;
        }
      });
      break;
    }
    case "detrend": {
      const order = Math.max(0, Math.round(Number(P.order ?? 1)));
      const xs = f.w.map((w) => (w - f.w[0]!) / ((f.w[p - 1]! - f.w[0]!) || 1));
      state.frame = mapRows(f, (s, d) => {
        // least squares polynomial (small order) via normal equations
        const k = order + 1;
        const ata = Array.from({ length: k }, () => new Float64Array(k));
        const aty = new Float64Array(k);
        for (let c = 0; c < p; c += 1)
          for (let a = 0; a < k; a += 1) {
            aty[a]! += xs[c]! ** a * s[c]!;
            for (let b = 0; b < k; b += 1) ata[a]![b]! += xs[c]! ** (a + b);
          }
        for (let col = 0; col < k; col += 1) {
          const div = ata[col]![col]! || 1;
          for (let j = 0; j < k; j += 1) ata[col]![j]! /= div;
          aty[col]! /= div;
          for (let r = 0; r < k; r += 1) {
            if (r === col) continue;
            const fct = ata[r]![col]!;
            for (let j = 0; j < k; j += 1) ata[r]![j]! -= fct * ata[col]![j]!;
            aty[r]! -= fct * aty[col]!;
          }
        }
        for (let c = 0; c < p; c += 1) {
          let base = 0;
          for (let a = 0; a < k; a += 1) base += aty[a]! * xs[c]! ** a;
          d[c] = s[c]! - base;
        }
      });
      break;
    }
    case "normalize": {
      const norm = String(P.norm ?? "l2");
      state.frame = mapRows(f, (s, d) => {
        let z = 0;
        for (let c = 0; c < p; c += 1) z = norm === "max" ? Math.max(z, Math.abs(s[c]!)) : norm === "area" ? z + Math.abs(s[c]!) : z + s[c]! ** 2;
        z = norm === "l2" ? Math.sqrt(z) : z;
        for (let c = 0; c < p; c += 1) d[c] = s[c]! / (z || 1);
      });
      break;
    }
    case "center": {
      const mean = meanSpectrum(f);
      state.frame = mapRows(f, (s, d) => {
        for (let c = 0; c < p; c += 1) d[c] = s[c]! - mean[c]!;
      });
      break;
    }
    case "crop": {
      const lo = Number(P.min ?? -Infinity);
      const hi = Number(P.max ?? Infinity);
      const keep = f.w.map((w, c) => (w >= Math.min(lo, hi) && w <= Math.max(lo, hi) ? c : -1)).filter((c) => c >= 0);
      if (keep.length < 3) {
        outcome.status = "error";
        outcome.message = `Window ${lo}–${hi} keeps fewer than 3 wavelengths.`;
        break;
      }
      const data = new Float32Array(f.m.rows * keep.length);
      for (let r = 0; r < f.m.rows; r += 1) keep.forEach((c, i) => (data[r * keep.length + i] = f.m.data[r * p + c]!));
      state.frame = { m: { rows: f.m.rows, cols: keep.length, data }, w: keep.map((c) => f.w[c]!), rows: f.rows };
      break;
    }
    case "bin": {
      const factor = Math.max(2, Math.round(Number(P.factor ?? 4)));
      const cols = Math.floor(p / factor);
      const data = new Float32Array(f.m.rows * cols);
      for (let r = 0; r < f.m.rows; r += 1)
        for (let c = 0; c < cols; c += 1) {
          let s = 0;
          for (let i = 0; i < factor; i += 1) s += f.m.data[r * p + c * factor + i]!;
          data[r * cols + c] = s / factor;
        }
      state.frame = { m: { rows: f.m.rows, cols, data }, w: Array.from({ length: cols }, (_, c) => f.w[c * factor + Math.floor(factor / 2)]!), rows: f.rows };
      break;
    }
    case "sample_filter": {
      const targets = new Set((Array.isArray(P.rows) ? P.rows : []) as number[]);
      const keepMode = P.mode === "keep";
      const keep: number[] = [];
      const removed: number[] = [];
      f.rows.forEach((row, i) => {
        const hit = targets.has(row);
        if (hit === keepMode) keep.push(i);
        else removed.push(row);
      });
      state.frame = subsetRows(f, keep);
      outcome.removedRows = removed;
      break;
    }
    case "y_outlier": {
      const target = dataset.targets?.find((t) => t.name === targetName && t.kind === "regression") ?? dataset.targets?.find((t) => t.kind === "regression");
      if (!target) {
        outcome.status = "skipped";
        outcome.message = "Needs a numeric target.";
        break;
      }
      const values = f.rows.map((row) => Number(target.values[row]));
      const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)]!;
      const q3 = sorted[Math.floor(sorted.length * 0.75)]!;
      const k = Number(P.k ?? 1.5);
      const lo = q1 - k * (q3 - q1);
      const hi = q3 + k * (q3 - q1);
      const flagged = f.rows.filter((_, i) => values[i]! < lo || values[i]! > hi);
      if (P.mode === "remove") {
        const keep = f.rows.map((_, i) => i).filter((i) => values[i]! >= lo && values[i]! <= hi);
        state.frame = subsetRows(f, keep);
        outcome.removedRows = flagged;
      } else outcome.taggedRows = flagged;
      break;
    }
    case "x_outlier": {
      const model = pca(f.m, Math.max(2, Math.round(Number(P.components ?? 5))));
      const flagIdx = f.rows.map((_, i) => i).filter((i) => model.t2[i]! > model.t2Limit || model.q[i]! > model.qLimit * 1.5);
      const flagged = flagIdx.map((i) => f.rows[i]!);
      if (P.mode === "remove") {
        const bad = new Set(flagIdx);
        state.frame = subsetRows(f, f.rows.map((_, i) => i).filter((i) => !bad.has(i)));
        outcome.removedRows = flagged;
      } else outcome.taggedRows = flagged;
      break;
    }
    case "kfold": {
      const k = Math.max(2, Math.round(Number(P.n_splits ?? 5)));
      const rand = mulberry32(Number(P.seed ?? 42));
      const groups = [...new Set(f.rows.map((row) => groupKey(dataset, row)))];
      const foldOf = new Map(groups.map((g) => [g, Math.floor(rand() * k)]));
      const folds: PlaygroundFold[] = Array.from({ length: k }, (_, i) => ({ label: `fold ${i + 1}`, train: [], test: [] }));
      f.rows.forEach((row, o) => {
        const fi = foldOf.get(groupKey(dataset, row))!;
        folds.forEach((fold, j) => (j === fi ? (fold.test as number[]).push(o) : (fold.train as number[]).push(o)));
      });
      state.folds = { kind: "cv", splitter: `K-Fold (k=${k}, grouped)`, folds };
      break;
    }
    case "kennard_stone": {
      const frac = Number(P.test_size ?? 0.25);
      const model = pca(f.m, 3);
      const n = f.m.rows;
      const nCal = Math.round(n * (1 - frac));
      const dist = (a: number, b: number) => model.scores[a]!.reduce((s, v, i) => s + (v - model.scores[b]![i]!) ** 2, 0);
      // start from the two farthest points (approx via max norm), then greedy max-min
      let first = 0;
      let far = 0;
      for (let i = 0; i < n; i += 1) {
        const d = model.scores[i]!.reduce((s, v) => s + v * v, 0);
        if (d > far) {
          far = d;
          first = i;
        }
      }
      const chosen = new Uint8Array(n);
      chosen[first] = 1;
      const minD = new Float64Array(n).fill(Infinity);
      let last = first;
      for (let count = 1; count < nCal; count += 1) {
        let pick = -1;
        let best = -1;
        for (let i = 0; i < n; i += 1) {
          if (chosen[i]) continue;
          minD[i] = Math.min(minD[i]!, dist(i, last));
          if (minD[i]! > best) {
            best = minD[i]!;
            pick = i;
          }
        }
        if (pick < 0) break;
        chosen[pick] = 1;
        last = pick;
      }
      const train: number[] = [];
      const test: number[] = [];
      for (let i = 0; i < n; i += 1) (chosen[i] ? train : test).push(i);
      state.folds = { kind: "holdout", splitter: `Kennard–Stone (${Math.round(frac * 100)} % test)`, folds: [{ label: "hold-out", train, test }] };
      break;
    }
    case "noise":
    case "baseline_shift": {
      const copies = step.operatorId === "noise" ? Math.max(1, Math.round(Number(P.copies ?? 1))) : 1;
      const rand = mulberry32(11);
      const trainRows = f.rows.map((_, i) => i).filter((i) => dataset.partition?.[f.rows[i]!] !== "test");
      const extra = trainRows.length * copies;
      const data = new Float32Array((f.m.rows + extra) * p);
      data.set(f.m.data);
      const rows = [...f.rows];
      let at = f.m.rows;
      for (let copy = 0; copy < copies; copy += 1)
        for (const i of trainRows) {
          const shift = step.operatorId === "baseline_shift" ? gaussian(rand) * Number(P.amplitude ?? 0.03) : 0;
          for (let c = 0; c < p; c += 1)
            data[at * p + c] = f.m.data[i * p + c]! + (step.operatorId === "noise" ? gaussian(rand) * Number(P.sigma ?? 0.003) : shift);
          rows.push(f.rows[i]!);
          at += 1;
        }
      state.frame = { m: { rows: at, cols: p, data }, w: f.w, rows };
      break;
    }
    default:
      outcome.status = "error";
      outcome.message = `Unknown operator ${step.operatorId}`;
  }
  outcome.durationMs = performance.now() - t0;
  outcome.shape = [state.frame.m.rows, state.frame.m.cols];
  state.outcomes.push(outcome);
}

/** Execute a run request against the synthetic dataset (demo host). */
export function runDemoRequest(dataset: PlaygroundDataset, request: PlaygroundRunRequest): PlaygroundResult {
  const t0 = performance.now();
  const base = dataset.spectra as SpectraMatrix;
  const state: EngineState = {
    frame: { m: base, w: [...dataset.wavelengths], rows: Array.from({ length: base.rows }, (_, i) => i) },
    folds: null,
    outcomes: [],
  };
  for (const step of request.steps) {
    applyStep(dataset, state, step, request.target);
    if (state.outcomes[state.outcomes.length - 1]?.status === "error") break;
  }
  const { frame } = state;
  const result: PlaygroundResult = {
    requestId: request.id,
    spectra: frame.m,
    wavelengths: frame.w,
    rows: frame.rows,
    steps: state.outcomes,
    folds: state.folds,
    signal: request.steps.some((s) => s.operatorId === "savgol" && Number(s.params.deriv) > 0) ? "d log(1/R)" : request.steps.some((s) => s.operatorId === "snv" || s.operatorId === "msc") ? "corrected log(1/R)" : "log(1/R)",
  };
  const needs = request.needs;
  if (needs.projection || needs.outliers || needs.loadings) {
    const model = pca(frame.m, Math.max(needs.components, 5));
    if (needs.projection === "umap") {
      // Demo stand-in for UMAP: a non-linear warp of PCA scores (real hosts run umap-learn).
      result.projection = {
        method: "umap",
        coordinates: model.scores.map((s) => {
          const r = Math.hypot(s[0]!, s[1]!, s[2]! * 1.5) || 1;
          return [Math.tanh(s[0]! / 3) * 6 + s[2]! * 0.8, Math.tanh(s[1]! / 3) * 6 + Math.sin(r) * 0.8, Math.tanh(s[2]! / 2) * 4 + Math.cos(r) * 0.6];
        }),
      };
    } else if (needs.projection === "pca") {
      result.projection = { method: "pca", coordinates: model.scores, explained: model.explained };
    }
    if (needs.outliers) result.outliers = { t2: model.t2, q: model.q, t2Limit: model.t2Limit, qLimit: model.qLimit, confidence: 0.95, components: model.loadings.length };
    if (needs.loadings) result.loadings = { components: model.loadings, explained: model.explained };
  }
  if (needs.repetitions) {
    const spec = needs.repetitions;
    const column = dataset.metadata?.find((c) => c.key === spec.groupBy);
    const groups = frame.rows.map((row) => (column ? String(column.values[row] ?? row) : String(row)));
    const byGroup = new Map<string, number[]>();
    groups.forEach((g, o) => (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(o));
    // PCA / Mahalanobis distances run in the (whitened) score space of a 5-component PCA.
    const space = spec.metric === "pca" || spec.metric === "mahalanobis" ? pca(frame.m, 5) : null;
    const dims = space ? space.scores[0]?.length ?? 0 : frame.m.cols;
    const sd = space ? Array.from({ length: dims }, (_, a) => Math.sqrt(space.scores.reduce((s, v) => s + v[a]! ** 2, 0) / Math.max(1, frame.m.rows - 1)) || 1) : null;
    const vec = (o: number) => {
      const out = new Float64Array(dims);
      for (let c = 0; c < dims; c += 1) out[c] = space ? space.scores[o]![c]! / (spec.metric === "mahalanobis" ? sd![c]! : 1) : frame.m.data[o * dims + c]!;
      return out;
    };
    const reference = (rows: number[]) => {
      const out = new Float64Array(dims);
      if (spec.reference === "first") return vec(rows[0]!);
      if (spec.reference === "median") {
        const vs = rows.map(vec);
        for (let c = 0; c < dims; c += 1) {
          const col = vs.map((v) => v[c]!).sort((x, y) => x - y);
          out[c] = col[Math.floor((col.length - 1) / 2)]! / 2 + col[Math.ceil((col.length - 1) / 2)]! / 2;
        }
        return out;
      }
      for (const o of rows) {
        const v = vec(o);
        for (let c = 0; c < dims; c += 1) out[c]! += v[c]! / rows.length;
      }
      return out;
    };
    const dist = (a: Float64Array, b: Float64Array) => {
      let s = 0;
      let dot = 0;
      let na = 0;
      let nb = 0;
      let ma = 0;
      let mb = 0;
      for (let c = 0; c < dims; c += 1) {
        ma += a[c]! / dims;
        mb += b[c]! / dims;
      }
      let cov = 0;
      let va = 0;
      let vb = 0;
      for (let c = 0; c < dims; c += 1) {
        const d = a[c]! - b[c]!;
        s += spec.metric === "manhattan" ? Math.abs(d) : d * d;
        dot += a[c]! * b[c]!;
        na += a[c]! ** 2;
        nb += b[c]! ** 2;
        cov += (a[c]! - ma) * (b[c]! - mb);
        va += (a[c]! - ma) ** 2;
        vb += (b[c]! - mb) ** 2;
      }
      const cos = dot / (Math.sqrt(na * nb) || 1);
      switch (spec.metric) {
        case "manhattan":
          return s / dims;
        case "cosine":
          return 1 - cos;
        case "spectralAngle":
          return Math.acos(Math.max(-1, Math.min(1, cos)));
        case "correlation":
          return 1 - cov / (Math.sqrt(va * vb) || 1);
        case "euclidean":
          return Math.sqrt(s / dims);
        default:
          return Math.sqrt(s);
      }
    };
    const distance = new Float64Array(frame.m.rows);
    for (const rows of byGroup.values()) {
      const shared = spec.reference === "leaveOneOut" ? null : reference(rows);
      for (const o of rows) {
        const others = rows.filter((x) => x !== o);
        const ref = shared ?? (others.length > 0 ? reference(others) : vec(o));
        distance[o] = dist(vec(o), ref);
      }
    }
    const sorted = [...distance].sort((a, b) => a - b);
    const metricLabel: Record<typeof spec.metric, string> = {
      euclidean: "RMS euclidean",
      manhattan: "mean |Δ|",
      cosine: "cosine",
      spectralAngle: "spectral angle (rad)",
      correlation: "1 − r",
      mahalanobis: "Mahalanobis (5 PC)",
      pca: "PCA scores (5 PC)",
    };
    result.repetitions = { metric: metricLabel[spec.metric], groups, distance, threshold: sorted[Math.floor(sorted.length * 0.95)]! * 1.6 };
  }
  result.durationMs = performance.now() - t0;
  if (frame.m.rows < base.rows * 0.5) result.warnings = [`Only ${frame.m.rows} of ${base.rows} samples left after filtering.`];
  return result;
}

export const DEMO_STARTER_PIPELINE: PipelineStep[] = [
  { id: "demo-snv", operatorId: "snv", params: {}, enabled: true },
  { id: "demo-sg", operatorId: "savgol", params: { window: 15, polyorder: 2, deriv: 1 }, enabled: true },
  { id: "demo-kfold", operatorId: "kfold", params: { n_splits: 5, seed: 42 }, enabled: true },
];
