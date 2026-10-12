/**
 * Minimal inline-SVG icon set so the workbench capsules render complete with no
 * icon dependency. Hosts can override any glyph through the capsules' `icons`
 * prop (e.g. to inject their lucide icons).
 */

import type { ReactNode } from "react";

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export type WorkbenchIconKey =
  | "select"
  | "lasso"
  | "zoom"
  | "pan"
  | "reset"
  | "maximize"
  | "minimize"
  | "close"
  | "plus"
  | "minus"
  | "trash"
  | "eye"
  | "eyeOff"
  | "grip"
  | "chevronDown"
  | "chevronRight"
  | "search"
  | "settings"
  | "download"
  | "bookmark"
  | "layers"
  | "spark"
  | "warning"
  | "check"
  | "compare"
  | "invert"
  | "filter"
  | "target"
  | "info"
  | "keyboard"
  | "play"
  | "pin"
  | "undo"
  | "redo"
  | "crop"
  | "copy"
  | "arrowRight";

export type WorkbenchIcons = Partial<Record<WorkbenchIconKey, ReactNode>>;

export const DEFAULT_WORKBENCH_ICONS: Record<WorkbenchIconKey, ReactNode> = {
  select: (
    <svg {...base}>
      <path d="M4 4h5M4 4v5M20 4h-5M20 4v5M4 20h5M4 20v-5M20 20h-5M20 20v-5" />
    </svg>
  ),
  lasso: (
    <svg {...base}>
      <path d="M7 15.5C4.6 14.4 3 12.6 3 10.5 3 6.9 7 4 12 4s9 2.9 9 6.5S17 17 12 17c-1.2 0-2.3-.1-3.3-.4" />
      <circle cx="7" cy="17.5" r="1.8" />
      <path d="M7 19.3c0 1.2-.6 2-1.6 2.7" />
    </svg>
  ),
  zoom: (
    <svg {...base}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.6-4.6M10.5 7.5v6M7.5 10.5h6" />
    </svg>
  ),
  pan: (
    <svg {...base}>
      <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
    </svg>
  ),
  reset: (
    <svg {...base}>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4.5h4.5" />
    </svg>
  ),
  maximize: (
    <svg {...base}>
      <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
    </svg>
  ),
  minimize: (
    <svg {...base}>
      <path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7" />
    </svg>
  ),
  close: (
    <svg {...base}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  plus: (
    <svg {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  minus: (
    <svg {...base}>
      <path d="M5 12h14" />
    </svg>
  ),
  trash: (
    <svg {...base}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  ),
  eye: (
    <svg {...base}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  eyeOff: (
    <svg {...base}>
      <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1" />
    </svg>
  ),
  grip: (
    <svg {...base}>
      <circle cx="9" cy="6" r=".8" />
      <circle cx="15" cy="6" r=".8" />
      <circle cx="9" cy="12" r=".8" />
      <circle cx="15" cy="12" r=".8" />
      <circle cx="9" cy="18" r=".8" />
      <circle cx="15" cy="18" r=".8" />
    </svg>
  ),
  chevronDown: (
    <svg {...base}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  chevronRight: (
    <svg {...base}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  search: (
    <svg {...base}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  settings: (
    <svg {...base}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  ),
  download: (
    <svg {...base}>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  ),
  bookmark: (
    <svg {...base}>
      <path d="M6 4h12v17l-6-4-6 4z" />
    </svg>
  ),
  layers: (
    <svg {...base}>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  ),
  spark: (
    <svg {...base}>
      <path d="M3 13h3l2.5-7 4 13 3-9 1.5 3H21" />
    </svg>
  ),
  warning: (
    <svg {...base}>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17.5v.1" />
    </svg>
  ),
  check: (
    <svg {...base}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  ),
  compare: (
    <svg {...base}>
      <path d="M12 3v18M5 7h4v10H5zM15 5h4v14h-4z" />
    </svg>
  ),
  invert: (
    <svg {...base}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
    </svg>
  ),
  filter: (
    <svg {...base}>
      <path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" />
    </svg>
  ),
  target: (
    <svg {...base}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  info: (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.1" />
    </svg>
  ),
  keyboard: (
    <svg {...base}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.1M10 10h.1M14 10h.1M18 10h.1M7 14h10" />
    </svg>
  ),
  play: (
    <svg {...base}>
      <path d="M7 4.5v15l12-7.5z" />
    </svg>
  ),
  pin: (
    <svg {...base}>
      <path d="M9 3h6l-1 6 4 3v2H6v-2l4-3zM12 14v7" />
    </svg>
  ),
  undo: (
    <svg {...base}>
      <path d="M9 7L4 12l5 5" />
      <path d="M4 12h11a5 5 0 0 1 0 10h-2" />
    </svg>
  ),
  redo: (
    <svg {...base}>
      <path d="M15 7l5 5-5 5" />
      <path d="M20 12H9a5 5 0 0 0 0 10h2" />
    </svg>
  ),
  crop: (
    <svg {...base}>
      <path d="M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  ),
  copy: (
    <svg {...base}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </svg>
  ),
  arrowRight: (
    <svg {...base}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
};

export function resolveIcons(overrides?: WorkbenchIcons): Record<WorkbenchIconKey, ReactNode> {
  return overrides ? { ...DEFAULT_WORKBENCH_ICONS, ...overrides } : DEFAULT_WORKBENCH_ICONS;
}
