/**
 * Readable summaries of pipeline values: parameter text, generator (sweep)
 * descriptions, finetune search spaces and a variant-count estimate.
 *
 * The counts are read from generator payload sizes for display only. The
 * runtime's own expansion stays authoritative, and anything this module cannot
 * read is reported as unknown rather than guessed.
 */

import { isRecord } from "./json.js";
import type {
  ChainItem,
  ChainModel,
  SweepKind,
  SweepView,
  TunedParamView,
  TuningView,
} from "./types.js";

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value) && Math.abs(value) < 1e6) return String(value);
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-3)) {
    return value.toExponential(3).replace(/\.?0+e/, "e").replace("e+", "e");
  }
  return String(Number(value.toPrecision(6)));
}

/** Compact one-line text for any parameter value. */
export function formatValue(value: unknown, maxLength = 28): string {
  let text: string;
  if (value === null) text = "null";
  else if (value === undefined) text = "";
  else if (typeof value === "number") text = formatNumber(value);
  else if (typeof value === "boolean") text = value ? "true" : "false";
  else if (typeof value === "string") text = value;
  else if (Array.isArray(value)) text = `[${value.map((item) => formatValue(item, maxLength)).join(", ")}]`;
  else if (isRecord(value)) {
    const reference = value.class ?? value.function;
    text = typeof reference === "string" ? (reference.split(".").pop() ?? reference) : `{${Object.keys(value).join(", ")}}`;
  } else text = String(value);
  return text.length > maxLength ? `${text.slice(0, Math.max(1, maxLength - 1))}…` : text;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const GENERATOR_KINDS: ReadonlyArray<readonly [string, SweepKind]> = [
  ["_or_", "values"],
  ["_range_", "range"],
  ["_log_range_", "log_range"],
  ["_grid_", "grid"],
  ["_zip_", "zip"],
  ["_sample_", "sample"],
];

/** Generator keyword carried by a record, if any. */
export function generatorKey(value: unknown): string | null {
  if (!isRecord(value)) return null;
  for (const [key] of GENERATOR_KINDS) if (key in value) return key;
  return null;
}

function rangeTriple(spec: unknown, third: "step" | "num"): [number, number, number | undefined] | null {
  if (Array.isArray(spec) && spec.length >= 2 && spec.every((item) => typeof item === "number")) {
    return [spec[0] as number, spec[1] as number, spec[2] as number | undefined];
  }
  if (isRecord(spec) && typeof spec.from === "number" && typeof spec.to === "number") {
    const last = spec[third];
    return [spec.from, spec.to, typeof last === "number" ? last : undefined];
  }
  return null;
}

/** Number of values a generator payload yields, or `null` when it is not readable here. */
export function sweepCount(kind: SweepKind, spec: unknown): number | null {
  if (kind === "values") return Array.isArray(spec) ? spec.length : null;
  if (kind === "range") {
    const triple = rangeTriple(spec, "step");
    if (!triple) return null;
    const [from, to, step = 1] = triple;
    if (step <= 0 || to < from) return null;
    return Math.floor((to - from) / step + 1e-9) + 1;
  }
  if (kind === "log_range") {
    const triple = rangeTriple(spec, "num");
    return triple && typeof triple[2] === "number" && triple[2] > 0 ? Math.floor(triple[2]) : null;
  }
  if (kind === "grid" || kind === "zip") {
    if (!isRecord(spec)) return null;
    const sizes = Object.values(spec).map((values) => (Array.isArray(values) ? values.length : null));
    if (sizes.length === 0 || sizes.some((size) => size === null)) return null;
    const lengths = sizes as number[];
    return kind === "grid" ? lengths.reduce((product, size) => product * size, 1) : Math.min(...lengths);
  }
  if (kind === "sample") return isRecord(spec) && typeof spec.num === "number" ? spec.num : null;
  return null;
}

export function sweepText(kind: SweepKind, spec: unknown): string {
  if (kind === "values" && Array.isArray(spec)) return spec.map((item) => formatValue(item, 12)).join(" | ");
  if (kind === "range") {
    const triple = rangeTriple(spec, "step");
    if (triple) return `${formatNumber(triple[0])} → ${formatNumber(triple[1])}${triple[2] !== undefined && triple[2] !== 1 ? ` step ${formatNumber(triple[2])}` : ""}`;
  }
  if (kind === "log_range") {
    const triple = rangeTriple(spec, "num");
    if (triple) return `${formatNumber(triple[0])} → ${formatNumber(triple[1])} log${triple[2] !== undefined ? ` × ${formatNumber(triple[2])}` : ""}`;
  }
  if ((kind === "grid" || kind === "zip") && isRecord(spec)) return `${kind} ${Object.keys(spec).join(" × ")}`;
  if (kind === "sample" && isRecord(spec)) return `sample ${formatValue(spec.distribution ?? "", 12)}`.trim();
  return formatValue(spec);
}

/** Read the generator carried by `record`, as a sweep on `param`. */
export function readSweep(record: Record<string, unknown>, param: string | null, location: SweepView["location"]): SweepView | null {
  for (const [key, kind] of GENERATOR_KINDS) {
    if (!(key in record)) continue;
    const spec = record[key];
    return { param, kind, spec, location, count: sweepCount(kind, spec), text: sweepText(kind, spec) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Finetune search spaces
// ---------------------------------------------------------------------------

export function readTunedParam(name: string, spec: unknown): TunedParamView {
  if (Array.isArray(spec) && typeof spec[0] === "string" && ["int", "float", "log_float", "float_log"].includes(spec[0])
    && typeof spec[1] === "number" && typeof spec[2] === "number") {
    const type = spec[0] === "float_log" ? "log_float" : spec[0];
    return { name, type, low: spec[1], high: spec[2], spec, text: `${formatNumber(spec[1])} … ${formatNumber(spec[2])}${type === "log_float" ? " log" : ""}` };
  }
  if (Array.isArray(spec) && spec[0] === "categorical" && Array.isArray(spec[1])) {
    return { name, type: "categorical", choices: spec[1], spec, text: spec[1].map((item) => formatValue(item, 10)).join(" | ") };
  }
  if (Array.isArray(spec) && spec.every((item) => typeof item !== "object" || item === null)) {
    return { name, type: "categorical", choices: spec, spec, text: spec.map((item) => formatValue(item, 10)).join(" | ") };
  }
  if (isRecord(spec) && typeof spec.low === "number" && typeof spec.high === "number") {
    const type = typeof spec.type === "string" ? spec.type : spec.log === true ? "log_float" : "float";
    return { name, type: "raw", low: spec.low, high: spec.high, spec, text: `${type} ${formatNumber(spec.low)} … ${formatNumber(spec.high)}` };
  }
  return { name, type: "raw", spec, text: formatValue(spec) };
}

export function readTuning(finetune: unknown): TuningView | null {
  if (!isRecord(finetune)) return null;
  const space = isRecord(finetune.model_params) ? finetune.model_params : {};
  return {
    trials: typeof finetune.n_trials === "number" ? finetune.n_trials : null,
    sampler: typeof finetune.sampler === "string" ? finetune.sampler : null,
    params: Object.entries(space).map(([name, spec]) => readTunedParam(name, spec)),
  };
}

// ---------------------------------------------------------------------------
// Variant estimate
// ---------------------------------------------------------------------------

const SELECTION_MODIFIERS = ["pick", "arrange", "then_pick", "then_arrange"] as const;

function hasGeneratorKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasGeneratorKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => (/^_[a-z_]+_$/.test(key) && key !== "_comment") || hasGeneratorKey(child));
}

function product(counts: ReadonlyArray<number | null>): number | null {
  let total = 1;
  for (const count of counts) {
    if (count === null) return null;
    total *= count;
  }
  return total;
}

function capped(count: number | null, modifiers: Readonly<Record<string, unknown>>): number | null {
  if (SELECTION_MODIFIERS.some((key) => key in modifiers)) {
    return typeof modifiers.count === "number" ? modifiers.count : null;
  }
  if (count === null) return null;
  return typeof modifiers.count === "number" ? Math.min(count, modifiers.count) : count;
}

/**
 * Number of pipeline variants an item contributes (1 for a plain step), or
 * `null` when a generator cannot be sized from the document alone.
 */
export function itemVariants(item: ChainItem): number | null {
  if (item.bypassed) return 1;
  switch (item.kind) {
    case "step": {
      // A generator nested where it is not read as a sweep (inside an estimator, a list) is unknown, not 1.
      const read = new Set(item.sweeps.filter((sweep) => sweep.location === "param").map((sweep) => sweep.param));
      const unread = Object.entries(item.params).some(([name, value]) => !read.has(name) && hasGeneratorKey(value));
      return unread ? null : product(item.sweeps.map((sweep) => sweep.count));
    }
    case "merge":
    case "note":
      return 1;
    case "raw":
      return hasGeneratorKey(item.value) ? null : 1;
    case "frame":
      return capped(chainVariants(item.items), item.mode === "cartesian" ? item.modifiers : {});
    case "fork": {
      const lanes = item.lanes.filter((lane) => !lane.bypassed).map((lane) => chainVariants(lane.items));
      if (item.mode !== "choice") return product(lanes);
      if (lanes.some((count) => count === null)) return capped(null, item.modifiers);
      return capped((lanes as number[]).reduce((sum, count) => sum + count, 0), item.modifiers);
    }
  }
}

export function chainVariants(items: readonly ChainItem[]): number | null {
  return product(items.map(itemVariants));
}

export interface PipelineChainStats {
  steps: number;
  models: number;
  bypassed: number;
  /** Estimated variant count, `null` when not readable from the document. */
  variants: number | null;
}

export function pipelineChainStats(model: ChainModel): PipelineChainStats {
  let steps = 0;
  let models = 0;
  let bypassed = 0;
  for (const item of model.items.values()) {
    if (item.bypassed) bypassed += 1;
    if (item.kind === "step" || item.kind === "merge" || item.kind === "raw") steps += 1;
    if (item.kind === "step" && item.role === "model") models += 1;
  }
  for (const lane of model.lanes.values()) if (lane.bypassed) bypassed += 1;
  return { steps, models, bypassed, variants: chainVariants(model.root.items) };
}

/** `1 234` style grouping without locale dependence. */
export function formatCount(count: number): string {
  if (!Number.isFinite(count)) return "∞";
  if (count >= 1e9) return count.toExponential(1).replace("e+", "e");
  return String(Math.round(count)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
