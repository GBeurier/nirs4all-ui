/**
 * Color mapping for the chain-effect explorer.
 *
 * Reuses the canonical nirs4all `viz` teal system as the single source of truth
 * (same hues as {@link file://../viz/PipelineFlow.tsx PipelineFlow} and the DAG
 * viewer), so the explorer sits inside the existing design language. Two color
 * jobs only:
 * - **role identity** → the categorical brand hues (small chips beside a text
 *   label, so identity is never color-alone);
 * - **effect polarity** → the brand diverging ramp pivoted on the analysis
 *   baseline (better = cool/blue, worse = warm/red, gray at the baseline). The
 *   diverging ramp is CVD-safe and every cell also prints its value.
 */

import { clamp } from "../viz/geometry.js";
import { divergingColor, N4_VIZ_COLORS } from "../viz/theme.js";
import type { ChainStepRole } from "./types.js";

export const CHAIN_ROLE_COLORS: Readonly<Record<ChainStepRole, string>> = {
  split: N4_VIZ_COLORS.indigo,
  preprocess: N4_VIZ_COLORS.cyan,
  feature: N4_VIZ_COLORS.violet,
  augmentation: N4_VIZ_COLORS.green,
  model: N4_VIZ_COLORS.teal,
  target: N4_VIZ_COLORS.slate,
  other: N4_VIZ_COLORS.slate,
};

/** Resolve a role color, honoring per-host overrides. */
export function roleColor(role: ChainStepRole, overrides?: Partial<Record<ChainStepRole, string>>): string {
  return overrides?.[role] ?? CHAIN_ROLE_COLORS[role];
}

/**
 * Diverging color for a goodness value relative to the baseline.
 * `value > baseline` (better) → cool/blue; `value < baseline` (worse) → warm/red;
 * `≈ baseline` → neutral gray. `halfRange` sets the saturation span.
 */
export function effectColor(value: number, baseline: number, halfRange: number): string {
  if (!Number.isFinite(value)) return "transparent";
  const span = halfRange > 0 ? halfRange : 1;
  const delta = value - baseline;
  // divergingColor: t=0 → blue (better), t=0.5 → gray, t=1 → red (worse)
  const t = clamp(0.5 - (0.5 * delta) / span, 0, 1);
  return divergingColor(t);
}

/** Ink for text drawn on top of an {@link effectColor} fill. */
export function effectTextColor(value: number, baseline: number, halfRange: number): string {
  if (!Number.isFinite(value)) return "var(--n4-color-muted, #64748b)";
  const span = halfRange > 0 ? halfRange : 1;
  // strong fills (far from baseline) get light ink; near-baseline grays get dark ink
  return Math.abs(value - baseline) > span * 0.45 ? "#f8fafc" : "#0f172a";
}
