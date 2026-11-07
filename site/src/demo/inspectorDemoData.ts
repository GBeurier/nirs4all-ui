/**
 * DEMO-ONLY result source for the Inspector showroom: synthetic trained chains
 * with plausible score structure and on-demand per-sample predictions. Real
 * hosts read chains from a nirs4all workspace / dag-ml run and predictions from
 * the prediction store.
 */

import type { ChainStep } from "../../../src/chains/types.js";
import type { ChainPredictions, InspectorChain, ScoreRef } from "../../../src/inspector/index.js";
import { mulberry32 } from "./mockEngine.js";

export const DEMO_SCORE_REFS: ScoreRef[] = [
  { key: "rmse_cv", label: "RMSE · CV", metric: "rmse", partition: "validation", protocol: "cv", lowerIsBetter: true },
  { key: "rmse_test", label: "RMSE · test", metric: "rmse", partition: "test", protocol: "final", lowerIsBetter: true },
  { key: "rmse_train", label: "RMSE · train", metric: "rmse", partition: "train", protocol: "final", lowerIsBetter: true },
  { key: "r2_cv", label: "R² · CV", metric: "r2", partition: "validation", protocol: "cv", lowerIsBetter: false },
  { key: "r2_test", label: "R² · test", metric: "r2", partition: "test", protocol: "final", lowerIsBetter: false },
  { key: "acc_cv", label: "Accuracy · CV", metric: "accuracy", partition: "validation", protocol: "cv", lowerIsBetter: false },
  { key: "acc_test", label: "Accuracy · test", metric: "accuracy", partition: "test", protocol: "final", lowerIsBetter: false },
];

interface DatasetSpec {
  name: string;
  task: "regression" | "classification";
  target: string;
  base: number;
  sd: number;
  mean: number;
  n: number;
  classes?: string[];
}

const DATASETS: DatasetSpec[] = [
  { name: "wheat_protein", task: "regression", target: "protein %", base: 0.62, sd: 1.45, mean: 12.1, n: 480 },
  { name: "soil_carbon", task: "regression", target: "SOC g/kg", base: 3.4, sd: 6.2, mean: 18.5, n: 360 },
  { name: "olive_origin", task: "classification", target: "origin", base: 0.18, sd: 1, mean: 0, n: 300, classes: ["Andalusia", "Apulia", "Crete", "Tuscany"] },
];

const PREPROCESSINGS: Array<{ steps: ChainStep[]; effect: number }> = [
  { steps: [], effect: 0.22 },
  { steps: [{ token: "snv", label: "SNV", role: "preprocess" }], effect: 0.05 },
  { steps: [{ token: "msc", label: "MSC", role: "preprocess" }], effect: 0.06 },
  { steps: [{ token: "savgol_d1", label: "SG d1", role: "preprocess" }], effect: 0.03 },
  { steps: [{ token: "snv", label: "SNV", role: "preprocess" }, { token: "savgol_d1", label: "SG d1", role: "preprocess" }], effect: -0.06 },
  { steps: [{ token: "msc", label: "MSC", role: "preprocess" }, { token: "savgol_d1", label: "SG d1", role: "preprocess" }], effect: -0.04 },
  { steps: [{ token: "snv", label: "SNV", role: "preprocess" }, { token: "savgol_d2", label: "SG d2", role: "preprocess" }], effect: 0.01 },
  { steps: [{ token: "detrend", label: "Detrend", role: "preprocess" }, { token: "snv", label: "SNV", role: "preprocess" }], effect: 0.02 },
  { steps: [{ token: "snv", label: "SNV", role: "preprocess" }, { token: "savgol_d1", label: "SG d1", role: "preprocess" }, { token: "crop", label: "Crop 1100–2400", role: "feature" }], effect: -0.08 },
  { steps: [{ token: "savgol_s", label: "SG smooth", role: "preprocess" }, { token: "msc", label: "MSC", role: "preprocess" }], effect: 0.04 },
];

interface ModelSpec {
  model: string;
  family: string;
  effect: number;
  overfit: number;
  params: (rand: () => number) => { params: Record<string, number | string>; penalty: number };
}

const MODELS: ModelSpec[] = [
  {
    model: "PLSRegression",
    family: "PLS",
    effect: 0,
    overfit: 0.05,
    params: (rand) => {
      const n = 2 + Math.floor(rand() * 22);
      return { params: { n_components: n }, penalty: 0.0028 * (n - 11) ** 2 };
    },
  },
  {
    model: "AOM-PLS",
    family: "PLS",
    effect: -0.07,
    overfit: 0.06,
    params: (rand) => {
      const n = 3 + Math.floor(rand() * 18);
      return { params: { n_components: n, operators: rand() < 0.5 ? "auto" : "sg+snv" }, penalty: 0.002 * (n - 10) ** 2 };
    },
  },
  {
    model: "Ridge",
    family: "Linear",
    effect: 0.08,
    overfit: 0.03,
    params: (rand) => {
      const alpha = 10 ** (-4 + rand() * 6);
      return { params: { alpha: Number(alpha.toPrecision(3)) }, penalty: 0.02 * (Math.log10(alpha) + 1) ** 2 };
    },
  },
  {
    model: "RandomForest",
    family: "Tree ensemble",
    effect: 0.2,
    overfit: 0.55,
    params: (rand) => {
      const trees = [100, 200, 500][Math.floor(rand() * 3)]!;
      const depth = [6, 10, 20, 30][Math.floor(rand() * 4)]!;
      return { params: { n_estimators: trees, max_depth: depth }, penalty: depth > 15 ? 0.04 : 0 };
    },
  },
  {
    model: "SVR",
    family: "Kernel",
    effect: 0.04,
    overfit: 0.12,
    params: (rand) => {
      const c = 10 ** (-1 + rand() * 4);
      return { params: { C: Number(c.toPrecision(3)), kernel: rand() < 0.7 ? "rbf" : "linear" }, penalty: 0.015 * (Math.log10(c) - 1.5) ** 2 };
    },
  },
  {
    model: "CNN1D",
    family: "Neural",
    effect: 0.03,
    overfit: 0.3,
    params: (rand) => {
      const lr = 10 ** (-4 + rand() * 2);
      return { params: { learning_rate: Number(lr.toPrecision(2)), epochs: 200 + Math.floor(rand() * 4) * 100 }, penalty: 0.03 * (Math.log10(lr) + 3) ** 2 };
    },
  },
];

const CLASSIFIERS: Array<{ model: string; family: string; effect: number }> = [
  { model: "PLS-DA", family: "PLS", effect: 0 },
  { model: "RandomForestClassifier", family: "Tree ensemble", effect: 0.03 },
  { model: "SVC", family: "Kernel", effect: -0.02 },
];

function gaussian(rand: () => number): number {
  const u = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function makeDemoChains(): InspectorChain[] {
  const rand = mulberry32(2026);
  const chains: InspectorChain[] = [];
  let id = 0;
  for (const dataset of DATASETS) {
    if (dataset.task === "classification") {
      for (const pp of PREPROCESSINGS.slice(0, 6))
        for (const clf of CLASSIFIERS) {
          id += 1;
          const err = Math.max(0.02, dataset.base + pp.effect * 0.4 + clf.effect + gaussian(rand) * 0.02);
          const accCv = 1 - err;
          const accTest = 1 - err * (1.05 + rand() * 0.25);
          chains.push({
            id: `c${String(id).padStart(4, "0")}`,
            runId: "run-0921",
            runLabel: "0921 · sweep",
            dataset: dataset.name,
            task: "classification",
            target: dataset.target,
            model: clf.model,
            modelFamily: clf.family,
            steps: [...pp.steps, { token: clf.model.toLowerCase(), label: clf.model, role: "model" }],
            params: {},
            scores: { acc_cv: accCv, acc_test: accTest, rmse_cv: null, rmse_test: null },
            foldScores: { acc_cv: Array.from({ length: 5 }, () => Math.min(1, accCv + gaussian(rand) * 0.025)) },
            fitTimeMs: 300 + rand() * 4000,
            status: "ok",
          });
        }
      continue;
    }
    for (const pp of PREPROCESSINGS)
      for (const spec of MODELS) {
        const variants = spec.family === "PLS" ? 3 : 1;
        for (let v = 0; v < variants; v += 1) {
          id += 1;
          const { params, penalty } = spec.params(rand);
          const rel = Math.max(0.35, 1 + pp.effect + spec.effect + penalty + gaussian(rand) * 0.03);
          const cv = dataset.base * rel;
          const test = cv * (1 + spec.overfit * 0.25 + gaussian(rand) * 0.04);
          const train = cv * Math.max(0.2, 1 - spec.overfit);
          const r2 = (rmse: number) => 1 - (rmse / dataset.sd) ** 2;
          const run = rand() < 0.4 ? { runId: "run-0917", runLabel: "0917 · baseline" } : { runId: "run-0921", runLabel: "0921 · sweep" };
          chains.push({
            id: `c${String(id).padStart(4, "0")}`,
            ...run,
            dataset: dataset.name,
            task: "regression",
            target: dataset.target,
            model: spec.model,
            modelFamily: spec.family,
            steps: [...pp.steps, { token: spec.model.toLowerCase(), label: spec.model, role: "model" }],
            params,
            scores: { rmse_cv: cv, rmse_test: test, rmse_train: train, r2_cv: r2(cv), r2_test: r2(test) },
            foldScores: {
              rmse_cv: Array.from({ length: 5 }, () => cv * (1 + gaussian(rand) * (spec.family === "Neural" ? 0.14 : 0.06))),
              r2_cv: Array.from({ length: 5 }, () => r2(cv * (1 + gaussian(rand) * 0.06))),
            },
            fitTimeMs: (spec.family === "Neural" ? 40_000 : spec.family === "Tree ensemble" ? 6000 : 400) * (0.6 + rand()),
            status: rand() < 0.02 ? "partial" : "ok",
          });
        }
      }
  }
  return chains;
}

/** Deterministic per-sample predictions for a chain (shared "hard" samples across chains). */
export function makeDemoPredictions(chain: InspectorChain): ChainPredictions {
  const dataset = DATASETS.find((d) => d.name === chain.dataset)!;
  const rand = mulberry32(hash(chain.id));
  const sampleRand = mulberry32(hash(dataset.name));
  const keys: string[] = [];
  const yTrue: Array<number | string> = [];
  const yPred: Array<number | string> = [];
  const partition: string[] = [];
  const fold: Array<number | null> = [];
  const nTest = Math.round(dataset.n * 0.25);
  for (let i = 0; i < dataset.n; i += 1) {
    const isTest = i >= dataset.n - nTest;
    keys.push(`${dataset.name.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(4, "0")}`);
    partition.push(isTest ? "test" : "validation");
    fold.push(isTest ? null : (i % 5) + 1);
    // Per-sample truth and difficulty are shared by every chain on the dataset.
    const truthNoise = gaussian(sampleRand);
    const hard = sampleRand() < 0.04 ? gaussian(sampleRand) * 3.2 : gaussian(sampleRand) * 0.35;
    if (dataset.task === "classification") {
      const classes = dataset.classes!;
      const truth = classes[Math.floor(Math.abs(truthNoise * 997) % classes.length)]!;
      const acc = chain.scores.acc_test ?? 0.8;
      const wrong = rand() > acc - Math.abs(hard) * 0.05;
      yTrue.push(truth);
      yPred.push(wrong ? classes[(classes.indexOf(truth) + 1 + Math.floor(rand() * (classes.length - 1))) % classes.length]! : truth);
      continue;
    }
    const truth = dataset.mean + truthNoise * dataset.sd;
    const rmse = Number((isTest ? chain.scores.rmse_test : chain.scores.rmse_cv) ?? dataset.base);
    // Mild regression to the mean (classic NIR bias) + shared hard-sample offsets.
    const shrink = 0.06 * (truth - dataset.mean);
    yTrue.push(Number(truth.toFixed(3)));
    yPred.push(Number((truth - shrink + (hard * 0.55 + gaussian(rand) * 0.85) * rmse).toFixed(3)));
  }
  const out: ChainPredictions = { chainId: chain.id, sampleKeys: keys, yTrue, yPred, partition, fold };
  if (dataset.classes) out.classes = dataset.classes;
  return out;
}
