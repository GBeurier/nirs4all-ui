import { useMemo, useState, type MouseEvent } from "react";

import { cx } from "../workbench/_cx.js";
import { Popover, SearchInput, SelectField, Toggle } from "../workbench/controls.js";
import { formatValue } from "../workbench/format.js";
import { useElementSize } from "../workbench/hooks.js";
import { resolveIcons, type WorkbenchIcons } from "../workbench/icons.js";
import { chainLabel, facetCounts, facetLabel, facetValue, isBetter, preprocessingLabel, type ChainFilter } from "./analysis.js";
import type { InspectorStrings } from "./locale.js";
import type { ChainFacet, InspectorChain, ScoreRef } from "./types.js";

type Item =
  | { kind: "group"; label: string; count: number; best: number }
  | { kind: "chain"; chain: InspectorChain; row: number; rank: number | null; score: number };

const ROW_HEIGHT = 44;

/**
 * Ranked chain list: search, facet filters, grouping, a direction-aware score
 * bar per chain, and the ☆ compare toggle. Clicking a row selects it with the
 * shared modifier semantics.
 */
export function ChainList({
  allChains,
  ranked,
  filter,
  onFilterChange,
  facets,
  groupBy,
  onGroupByChange,
  scoreRef,
  colors,
  selected,
  hoverRow,
  compareIds,
  onSelectRow,
  onHoverRow,
  onToggleCompare,
  strings,
  icons,
}: {
  allChains: readonly InspectorChain[];
  /** Filtered chains in rank order, with their row in the filtered array. */
  ranked: ReadonlyArray<{ chain: InspectorChain; row: number; rank: number | null; score: number }>;
  filter: ChainFilter;
  onFilterChange: (filter: ChainFilter) => void;
  facets: readonly ChainFacet[];
  groupBy: ChainFacet | null;
  onGroupByChange: (facet: ChainFacet | null) => void;
  scoreRef: ScoreRef | undefined;
  colors: readonly string[];
  selected: ReadonlySet<number>;
  hoverRow: number | null;
  compareIds: ReadonlySet<string>;
  onSelectRow: (row: number, event: MouseEvent) => void;
  onHoverRow: (row: number | null) => void;
  onToggleCompare: (chainId: string) => void;
  strings: InspectorStrings;
  icons?: WorkbenchIcons | undefined;
}) {
  const icon = resolveIcons(icons);
  const [scrollTop, setScrollTop] = useState(0);
  const [boxRef, size] = useElementSize<HTMLDivElement>({ width: 300, height: 500 });

  const range = useMemo(() => {
    let best = Number.NaN;
    let worst = Number.NaN;
    for (const entry of ranked) {
      if (!Number.isFinite(entry.score)) continue;
      if (!Number.isFinite(best) || isBetter(entry.score, best, scoreRef)) best = entry.score;
      if (!Number.isFinite(worst) || isBetter(worst, entry.score, scoreRef)) worst = entry.score;
    }
    return { best, worst };
  }, [ranked, scoreRef]);

  const items: Item[] = useMemo(() => {
    if (!groupBy) return ranked.map((entry) => ({ kind: "chain" as const, ...entry }));
    const groups = new Map<string, typeof ranked[number][]>();
    for (const entry of ranked) {
      const key = facetValue(entry.chain, groupBy) ?? "—";
      const bucket = groups.get(key);
      if (bucket) bucket.push(entry);
      else groups.set(key, [entry]);
    }
    const out: Item[] = [];
    for (const [label, entries] of groups) {
      out.push({ kind: "group", label, count: entries.length, best: entries[0]?.score ?? Number.NaN });
      for (const entry of entries) out.push({ kind: "chain", ...entry });
    }
    return out;
  }, [ranked, groupBy]);

  const activeFacetCount = Object.values(filter.facets).filter((set) => set && set.size > 0).length + (filter.scoredOnly ? 1 : 0);
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
  const last = Math.min(items.length, Math.ceil((scrollTop + size.height) / ROW_HEIGHT) + 5);
  const quality = (score: number) => {
    if (!Number.isFinite(score) || !Number.isFinite(range.best)) return 0;
    const span = range.worst - range.best;
    return span === 0 ? 1 : (range.worst - score) / span;
  };

  return (
    <div className="n4ins-list">
      <div className="n4ins-list-tools">
        <SearchInput value={filter.search} onChange={(search) => onFilterChange({ ...filter, search })} placeholder={strings.searchChains} icon={icon.search} />
        <div className="n4ins-list-row">
          <Popover
            label={strings.filters}
            align="start"
            triggerClassName={cx("n4wb-btn", "n4wb-btn-outline", activeFacetCount > 0 && "is-open")}
            trigger={
              <>
                {icon.filter}
                <span>{strings.filters}</span>
                {activeFacetCount > 0 ? <span className="n4wb-count">{activeFacetCount}</span> : null}
              </>
            }
          >
            <div className="n4ins-filters">
              <Toggle checked={filter.scoredOnly} onChange={(scoredOnly) => onFilterChange({ ...filter, scoredOnly })} label={strings.scoredOnly} />
              {facets.map((facet) => {
                const allowed = filter.facets[facet];
                return (
                  <fieldset key={facet} className="n4ins-facet">
                    <legend>{facetLabel(facet)}</legend>
                    {facetCounts(allChains, facet)
                      .slice(0, 14)
                      .map(({ value, count }) => {
                        const on = allowed?.has(value) ?? false;
                        return (
                          <label key={value} className="n4ins-facet-option">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => {
                                const next = new Set(allowed ?? []);
                                if (on) next.delete(value);
                                else next.add(value);
                                onFilterChange({ ...filter, facets: { ...filter.facets, [facet]: next } });
                              }}
                            />
                            <span>{value}</span>
                            <span className="n4wb-legend-count">{count}</span>
                          </label>
                        );
                      })}
                  </fieldset>
                );
              })}
              <button type="button" className="n4pg-link" onClick={() => onFilterChange({ search: filter.search, facets: {}, scoredOnly: false })}>
                {strings.resetFilters}
              </button>
            </div>
          </Popover>
          <SelectField
            label={strings.groupBy}
            value={groupBy ?? ""}
            options={[{ value: "", label: strings.none }, ...facets.map((f) => ({ value: f, label: facetLabel(f) }))]}
            onChange={(v) => onGroupByChange(v === "" ? null : (v as ChainFacet))}
          />
        </div>
      </div>
      <div className="n4ins-list-scroll" ref={boxRef} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} onMouseLeave={() => onHoverRow(null)} role="listbox" aria-label={strings.chains} aria-multiselectable="true">
        <div style={{ height: items.length * ROW_HEIGHT, position: "relative" }}>
          {items.slice(first, last).map((item, i) => {
            const top = (first + i) * ROW_HEIGHT;
            if (item.kind === "group") {
              return (
                <div key={`g:${item.label}`} className="n4ins-group" style={{ transform: `translateY(${top}px)`, height: ROW_HEIGHT }}>
                  <span className="n4ins-group-label">{item.label}</span>
                  <span className="n4wb-count">{item.count}</span>
                  <span className="n4ins-group-best n4wb-mono">{strings.best} {formatValue(item.best)}</span>
                </div>
              );
            }
            const { chain, row, rank, score } = item;
            const isCompared = compareIds.has(chain.id);
            return (
              <div
                key={chain.id}
                role="option"
                aria-selected={selected.has(row)}
                className={cx("n4ins-chain", selected.has(row) && "is-selected", hoverRow === row && "is-hover", chain.status === "failed" && "is-failed")}
                style={{ transform: `translateY(${top}px)`, height: ROW_HEIGHT }}
                onClick={(event) => onSelectRow(row, event)}
                onMouseEnter={() => onHoverRow(row)}
              >
                <button
                  type="button"
                  className={cx("n4ins-star", isCompared && "is-on")}
                  aria-pressed={isCompared}
                  aria-label={isCompared ? strings.removeFromCompare : strings.addToCompare}
                  title={isCompared ? strings.removeFromCompare : strings.addToCompare}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleCompare(chain.id);
                  }}
                >
                  {isCompared ? "★" : "☆"}
                </button>
                <span className="n4ins-rank n4wb-mono">{rank ?? "—"}</span>
                <span className="n4wb-legend-swatch" style={{ background: colors[row] }} aria-hidden="true" />
                <span className="n4ins-chain-text">
                  <span className="n4ins-chain-model">
                    {chain.model}
                    {chain.dataset && !groupBy?.startsWith("dataset") ? <small> · {chain.dataset}</small> : null}
                  </span>
                  <span className="n4ins-chain-pp" title={chainLabel(chain)}>
                    {preprocessingLabel(chain)}
                  </span>
                </span>
                <span className="n4ins-chain-score">
                  <strong className="n4wb-mono">{formatValue(score)}</strong>
                  <span className="n4ins-scorebar">
                    <span style={{ width: `${Math.max(3, quality(score) * 100)}%` }} />
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
