/**
 * Accent colors and inline glyphs for cell families and group kinds.
 *
 * Hues are the canonical nirs4all `viz` teal system, with the same assignment
 * as `viz/PipelineFlow` and the `dag` explorer (split indigo, preprocess cyan,
 * model teal, merge green, branch amber, variant search violet). Identity is
 * never carried by color alone: every cell also shows its glyph and name.
 */

import type { ReactNode } from "react";

import { N4_VIZ_COLORS } from "../viz/theme.js";
import type { ChainRole, ForkMode, FrameMode } from "./types.js";

export type ChainGlyphKind = ChainRole | ForkMode | FrameMode | "sweep" | "tune";

export const CHAIN_ROLE_COLORS: Readonly<Record<ChainRole, string>> = {
  preprocessing: N4_VIZ_COLORS.cyan,
  model: N4_VIZ_COLORS.teal,
  splitting: N4_VIZ_COLORS.indigo,
  y_processing: "#db2777",
  augmentation: "#ea580c",
  filter: "#65a30d",
  merge: N4_VIZ_COLORS.green,
  note: N4_VIZ_COLORS.slate,
  chart: N4_VIZ_COLORS.slate,
  operator: N4_VIZ_COLORS.slate,
  raw: N4_VIZ_COLORS.slate,
};

export const CHAIN_GROUP_COLORS: Readonly<Record<ForkMode | FrameMode, string>> = {
  branch: N4_VIZ_COLORS.amber,
  choice: N4_VIZ_COLORS.violet,
  cartesian: N4_VIZ_COLORS.violet,
  concat: N4_VIZ_COLORS.cyan,
  augment: "#ea580c",
  sequence: N4_VIZ_COLORS.slate,
};

/** 16x16 stroke paths, drawn with `currentColor`. */
const PATHS: Readonly<Record<ChainGlyphKind, string>> = {
  preprocessing: "M1.5 8c1.6-5 3.2-5 4.8 0s3.2 5 4.8 0 2.2-3.4 3.4-3.4",
  model: "M2 13.5 14 3.5M3.2 9.6h.01M6.4 11.4h.01M8.2 6.2h.01M11.6 7.6h.01M12.4 3.2h.01",
  splitting: "M2 4h12M2 8h12M2 12h12M6 2.5v3M10 6.5v3M4.5 10.5v3",
  y_processing: "M4 3l4 5 4-5M8 8v5.5",
  augmentation: "M8 2v4M6 4h4M2 11c1.5-3 3-3 4.5 0s3 3 4.5 0 1.8-2 3-2",
  filter: "M2.5 3h11L9.5 8.2V13l-3-1.4V8.2z",
  merge: "M2 4h3.5c2.5 0 3 4 5.5 4h3M2 12h3.5c2.5 0 3-4 5.5-4",
  note: "M3 3h10v7.5H8L5 13.5v-3H3zM5.5 6h5M5.5 8h3",
  chart: "M2.5 13.5h11M4.5 13V8M8 13V4M11.5 13V6.5",
  operator: "M8 3.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6z",
  raw: "M6 2.5c-2 0-1.4 2.6-1.8 4C4 7.4 3 8 3 8s1 .6 1.2 1.5c.4 1.4-.2 4 1.8 4M10 2.5c2 0 1.4 2.6 1.8 4C12 7.4 13 8 13 8s-1 .6-1.2 1.5c-.4 1.4.2 4-1.8 4",
  branch: "M2 8h3c2.5 0 3-4 5.5-4H14M5 8c2.5 0 3 4 5.5 4H14",
  choice: "M2 8h3.2l5.2-4H14M10.4 8H14M10.4 12H14M5.2 8a1 1 0 1 0 0 .01",
  cartesian: "M4 4l8 8M12 4l-8 8",
  concat: "M2 4h12M2 8h12M2 12h12M12 2.5v11",
  augment: "M8 2v4M6 4h4M2 11c1.5-3 3-3 4.5 0s3 3 4.5 0 1.8-2 3-2",
  sequence: "M2 8h12M10.5 4.5 14 8l-3.5 3.5",
  sweep: "M2 12 5 8l3 2 3-6 3 2",
  tune: "M3 4.5h6M12 4.5h1M3 11.5h1M7 11.5h6M10.5 3v3M5.5 10v3",
};

export type ChainIconName =
  | "power" | "left" | "right" | "up" | "down" | "copy" | "trash" | "code" | "close" | "plus" | "undo" | "redo"
  | "wrap" | "keyboard" | "reset" | "search" | "zoomIn" | "zoomOut";

const ICONS: Readonly<Record<ChainIconName, string>> = {
  power: "M8 2.5v5M4.6 4.8a4.8 4.8 0 1 0 6.8 0",
  left: "M9.5 3.5 5 8l4.5 4.5",
  right: "M6.5 3.5 11 8l-4.5 4.5",
  up: "M3.5 9.5 8 5l4.5 4.5",
  down: "M3.5 6.5 8 11l4.5-4.5",
  copy: "M5.5 5.5h7v7h-7zM3.5 10.5v-7h7",
  trash: "M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v3.5M9 7v3.5",
  code: "M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5",
  close: "M4 4l8 8M12 4l-8 8",
  plus: "M8 3v10M3 8h10",
  undo: "M5.5 3.5 2.5 6.5l3 3M2.5 6.5h6.5a4 4 0 0 1 0 8H7",
  redo: "M10.5 3.5l3 3-3 3M13.5 6.5H7a4 4 0 0 0 0 8h2",
  wrap: "M2 4h11a2 2 0 0 1 0 4H4.5M6.5 6 4.5 8l2 2M2 12h6",
  keyboard: "M1.5 4.5h13v7h-13zM4 7h.01M6.5 7h.01M9 7h.01M11.5 7h.01M5 9.5h6",
  reset: "M3 8a5 5 0 1 0 1.6-3.7M3 3v3h3",
  search: "M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.4 10.4 13.5 13.5",
  zoomIn: "M8 3v10M3 8h10",
  zoomOut: "M3 8h10",
};

export function ChainIcon({ name, size = 14 }: { name: ChainIconName; size?: number }): ReactNode {
  return (
    <svg className="n4rack__icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function ChainGlyph({ kind, size = 14 }: { kind: ChainGlyphKind; size?: number }): ReactNode {
  return (
    <svg className="n4rack__glyph" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[kind]} />
    </svg>
  );
}
