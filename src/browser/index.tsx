// SPDX-License-Identifier: CeCILL-2.1 OR AGPL-3.0-or-later
/**
 * Optional self-contained browser entry for vanilla (non-React) hosts.
 *
 * Exactly three runtime functions mount existing presentational components into a
 * host element. Each call owns one React root in its own closure: no registry, global
 * bus, store, fetch, owner import, WASM, parser, inference or scientific computation.
 * `update` replaces the complete props; `unmount` releases the root. Hosts keep data
 * loading, storage, execution and the meaning of every id they pass in.
 *
 * Built by `vite.browser.config.ts` into `dist/browser/nirs4all-ui-browser.mjs` (ESM,
 * no global assignment), `nirs4all-ui-browser.iife.js` (global `Nirs4allUIBrowser`)
 * and `browser.css`. Pure view-model/SSR entries never import this module.
 */
import { createElement, type Attributes, type FunctionComponent } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { DatasetPreviewCard, type DatasetPreviewCardProps } from "../components/DatasetPreviewCard.js";
import { OwnerProposalList, type OwnerProposalListProps } from "../datasetBuilder/OwnerProposalList.js";
import { SpectraExplorer, type SpectraExplorerProps } from "../qualification/SpectraExplorer.js";
import "./browser.css";

export type { DatasetPreviewView } from "../dataset/datasetPreview.js";
export type { ExplorerSeries, SpectraExplorerProps } from "../qualification/SpectraExplorer.js";
export type {
  OwnerProposalAlternative,
  OwnerProposalDisplay,
  OwnerProposalListProps,
  OwnerProposalOverrideChoice,
} from "../datasetBuilder/OwnerProposalList.js";

/** Handle returned by every mount function. */
export interface Mounted<P> {
  /** Re-render with complete replacement props (never merged with the previous ones). */
  update(next: P): void;
  /** Release the React root; call before the host clears or replaces the element. */
  unmount(): void;
}

/** Data-only preview props: hosts pass a projected `view` (or a `dataset` input), never React nodes. */
export type BrowserDatasetPreviewProps = Pick<DatasetPreviewCardProps, "dataset" | "view" | "className">;

const ROOT_CLASS = "n4ui-b-root";

function withClass(base: string, extra: string | undefined): string {
  return extra ? `${base} ${extra}` : base;
}

function BrowserDatasetPreview({ dataset, view, className }: BrowserDatasetPreviewProps) {
  // Forward only the three public fields so plain-JS callers cannot inject render hooks.
  const card: DatasetPreviewCardProps = {
    className: withClass("n4ui-b-card", className),
    headerClassName: "n4ui-b-card-header",
    titleClassName: "n4ui-b-card-title",
    descriptionClassName: "n4ui-b-card-description",
    badgeListClassName: "n4ui-b-card-badges",
    badgeClassName: (badge) => `n4ui-b-badge n4ui-b-tone-${badge.tone}`,
    statListClassName: "n4ui-b-card-stats",
    statClassName: (stat) => `n4ui-b-stat n4ui-b-tone-${stat.tone}`,
    statLabelClassName: "n4ui-b-stat-label",
    statValueClassName: "n4ui-b-stat-value",
    statDetailClassName: "n4ui-b-stat-detail",
  };
  if (dataset !== undefined) card.dataset = dataset;
  if (view !== undefined) card.view = view;
  return <DatasetPreviewCard {...card} />;
}

/**
 * The existing spectra explorer, English by default. `SpectraExplorer` owns the only
 * accessible band-data table (non-finite cells read "not available"); the browser entry
 * adds no table, control or prop of its own.
 */
function BrowserSpectraExplorer(props: SpectraExplorerProps) {
  return <SpectraExplorer {...props} locale={props.locale ?? "en"} />;
}

function mountComponent<P extends object>(host: HTMLElement, component: FunctionComponent<P>, props: P): Mounted<P> {
  if (!host || host.nodeType !== 1) {
    throw new TypeError("nirs4all-ui browser: the mount host must be an HTML element");
  }
  const root = createRoot(host);
  let active = true;
  // Synchronous render so vanilla hosts can read the DOM right after mount/update.
  const render = (next: P) => {
    flushSync(() => root.render(<div className={ROOT_CLASS}>{createElement(component, next as Attributes & P)}</div>));
  };
  render(props);
  return {
    update(next: P) {
      if (!active) throw new Error("nirs4all-ui browser: update() called after unmount()");
      render(next);
    },
    unmount() {
      if (!active) return;
      active = false;
      root.unmount();
    },
  };
}

/** Mount a dataset preview card. Formats/IO hosts pass a truthful projected `view`. */
export function mountDatasetPreview(
  host: HTMLElement,
  props: BrowserDatasetPreviewProps,
): Mounted<BrowserDatasetPreviewProps> {
  return mountComponent(host, BrowserDatasetPreview, props);
}

/**
 * Mount the spectra explorer and its own band-data table (English by default). Remount when the
 * axis, signal or series group changes; `update` is for selection and title changes.
 */
export function mountSpectraExplorer(host: HTMLElement, props: SpectraExplorerProps): Mounted<SpectraExplorerProps> {
  return mountComponent(host, BrowserSpectraExplorer, props);
}

/** Mount the controlled owner proposal list; callbacks stay host-owned. */
export function mountOwnerProposals(host: HTMLElement, props: OwnerProposalListProps): Mounted<OwnerProposalListProps> {
  return mountComponent(host, OwnerProposalList, props);
}
