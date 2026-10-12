/**
 * Decision views of the Inspector: the verdict (best chain, ties, drivers,
 * findings), top chains with their fold uncertainty, score vs cost, the
 * side-by-side comparison and the cross-dataset ranking.
 */

import { useMemo, type ReactNode } from "react";

import { cx } from "../workbench/_cx.js";
import { Button, StatTile } from "../workbench/controls.js";
import { formatDuration, formatPercent, formatSigned, formatValue } from "../workbench/format.js";
import { ScatterView, type ScatterGuide } from "../workbench/ScatterView.js";
import { combineSelection, selectionModeFromModifiers } from "../workbench/selection.js";
import { N4_VIRIDIS_STOPS, rampAt } from "../viz/theme.js";
import { chainLabel, confusionCounts, facetLabel, preprocessingLabel, regressionSummary, scoreOf } from "./analysis.js";
import { crossDatasetTable, foldStats, formatParam, paretoFront, relativeGain } from "./insights.js";
import type { ChainFacet, ScoreRef } from "./types.js";
import { ChainTooltip, shorten, StepChips, type InspectorViewContext } from "./views.js";

const TONE_GLYPH: Record<"good" | "warn" | "info", string> = { good: "▲", warn: "!", info: "i" };

function refFor(refs: readonly ScoreRef[], ref: ScoreRef | undefined, partition: string): ScoreRef | undefined {
  return ref ? refs.find((r) => r.partition === partition && r.metric === ref.metric && r.key !== ref.key) : undefined;
}

// ------------------------------------------------------------------ verdict

export function OverviewBody({ ctx }: { ctx: InspectorViewContext }) {
  const { ties, ref, strings } = ctx;
  if (!ties || !ref) return null;
  const best = ties.best;
  const folds = foldStats(best, ref);
  const testRef = refFor(ctx.refs, ref, "test");
  const testScore = testRef ? scoreOf(best, testRef) : Number.NaN;
  const compared = ctx.compareIds.has(best.id);
  const factors = ctx.factors.slice(0, 6);
  const topShare = Math.max(0.05, ...factors.map((f) => f.omega2));
  return (
    <div className="n4ins-overview">
      <section className="n4ins-hero">
        <div className="n4ins-hero-head">
          <span className="n4ins-kicker">{strings.bestChain}</span>
          <span className="n4ins-hero-actions">
            <button type="button" className={cx("n4ins-star", compared && "is-on")} aria-pressed={compared} title={compared ? strings.removeFromCompare : strings.addToCompare} onClick={() => ctx.onToggleCompare(best.id)}>
              {compared ? "★" : "☆"}
            </button>
            {ctx.onOpenChain ? (
              <Button variant="outline" onClick={() => ctx.onOpenChain?.(best)}>
                {strings.open}
              </Button>
            ) : null}
          </span>
        </div>
        <h4 className="n4ins-hero-title">{chainLabel(best)}</h4>
        <StepChips chain={best} />
        <div className="n4wb-stats n4ins-hero-stats">
          <StatTile label={ref.label} value={formatValue(ties.bestScore)} tone="accent" hint={folds ? `${strings.foldSpread} ${formatValue(folds.sd)}` : undefined} />
          {testRef ? <StatTile label={testRef.label} value={formatValue(testScore)} hint={formatSigned(relativeGain(ties.bestScore, testScore, ref) * 100, 2) + " %"} tone={relativeGain(ties.bestScore, testScore, ref) < -0.1 ? "bad" : undefined} /> : null}
          {ties.runnerUp ? <StatTile label={strings.runnerUp} value={formatValue(ties.runnerUp.score)} hint={shorten(chainLabel(ties.runnerUp.chain), 22)} /> : null}
          {best.fitTimeMs !== undefined ? <StatTile label={strings.fitTime} value={formatDuration(best.fitTimeMs)} /> : null}
        </div>
        {Number.isFinite(ties.se) ? (
          <button
            type="button"
            className="n4ins-ties"
            onClick={(event) => {
              const rows = ties.tied.map((c) => ctx.chains.indexOf(c)).filter((r) => r >= 0);
              ctx.setSelected(combineSelection(ctx.selected, rows, selectionModeFromModifiers(event)));
            }}
            title={strings.tieRule}
          >
            <strong>{strings.tiedWithBest(ties.tied.length - 1)}</strong>
            <span className="n4wb-muted">± {formatValue(ties.se)} · {strings.tieRule}</span>
          </button>
        ) : null}
      </section>

      <div className="n4ins-overview-cards">
        {ctx.insights.length > 0 ? (
          <section className="n4ins-card">
            <h5 className="n4ins-sub">{strings.findings}</h5>
            <ul className="n4ins-insights">
              {ctx.insights.map((insight, i) => (
                <li key={`${insight.kind}-${i}`} className={cx("n4ins-insight", `is-${insight.tone}`)}>
                  <span className="n4ins-insight-glyph" aria-hidden="true">
                    {TONE_GLYPH[insight.tone]}
                  </span>
                  <span>{strings.insightText(insight)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {factors.length > 0 ? (
          <section className="n4ins-card">
            <h5 className="n4ins-sub" title={strings.driversHint}>
              {strings.drivers}
            </h5>
            <ul className="n4ins-drivers">
              {factors.map((factor) => (
                <li key={factor.key}>
                  <button type="button" className="n4ins-driver" onClick={() => ctx.onFactor(factor.key)} title={`${strings.driversHint} · n=${factor.n} · ${factor.levels} levels`}>
                    <span className="n4ins-driver-label" title={factor.label}>{factor.label}</span>
                    <span className="n4ins-driver-bar">
                      <span style={{ width: `${(factor.omega2 / topShare) * 100}%` }} />
                    </span>
                    <span className="n4ins-driver-share n4wb-mono">{formatPercent(factor.omega2, 0)}</span>
                    <span className="n4ins-driver-best">
                      {shorten(factor.bestLevel, 22)} <span className="n4wb-mono">{formatValue(factor.bestMedian)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="n4wb-muted n4ins-footnote">{strings.driversHint}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ top chains

export function TopChainsBody({ ctx, count }: { ctx: InspectorViewContext; count: number }) {
  const { ref, ties, strings } = ctx;
  const rows = ctx.ranked.filter((r) => r.rank !== null).slice(0, count);
  const selected = useMemo(() => new Set(ctx.selected), [ctx.selected]);
  const model = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    const stats = rows.map((r) => {
      const f = foldStats(r.chain, ref);
      for (const v of [r.score, f?.min, f?.max]) {
        if (v !== undefined && Number.isFinite(v)) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
      return f;
    });
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.06;
    return { stats, lo: lo - pad, hi: hi + pad };
  }, [rows, ref]);
  if (!ref || rows.length === 0) return null;
  const x = (v: number) => `${(((v - model.lo) / (model.hi - model.lo)) * 100).toFixed(2)}%`;
  const ticks = Array.from({ length: 5 }, (_, i) => model.lo + ((model.hi - model.lo) * (i + 0.5)) / 5);
  const tieLo = ties && Number.isFinite(ties.se) ? ties.bestScore - ties.se : Number.NaN;
  const tieHi = ties && Number.isFinite(ties.se) ? ties.bestScore + ties.se : Number.NaN;
  const tied = new Set(ties?.tied.map((c) => c.id) ?? []);
  return (
    <div className="n4ins-top">
      <div className="n4ins-top-axis">
        <span />
        <span className="n4ins-top-track">
          {ticks.map((t) => (
            <span key={t} className="n4ins-top-tick" style={{ left: x(t) }}>
              {formatValue(t)}
            </span>
          ))}
        </span>
        <span className="n4ins-top-dir">{ref.lowerIsBetter ? `← ${strings.better}` : `${strings.better} →`}</span>
      </div>
      <div className="n4ins-top-rows" role="list">
        {rows.map((entry, i) => {
          const f = model.stats[i];
          const compared = ctx.compareIds.has(entry.chain.id);
          return (
            <div
              key={entry.chain.id}
              role="listitem"
              className={cx("n4ins-top-row", selected.has(entry.row) && "is-selected", ctx.hoverRow === entry.row && "is-hover", tied.has(entry.chain.id) && "is-tied")}
              onMouseEnter={() => ctx.setHoverRow(entry.row)}
              onMouseLeave={() => ctx.setHoverRow(null)}
              onClick={(event) => ctx.setSelected(combineSelection(ctx.selected, [entry.row], selectionModeFromModifiers(event)))}
            >
              <span className="n4ins-top-label">
                <span className="n4ins-rank">{entry.rank}</span>
                <button
                  type="button"
                  className={cx("n4ins-star", compared && "is-on")}
                  aria-pressed={compared}
                  aria-label={compared ? strings.removeFromCompare : strings.addToCompare}
                  onClick={(event) => {
                    event.stopPropagation();
                    ctx.onToggleCompare(entry.chain.id);
                  }}
                >
                  {compared ? "★" : "☆"}
                </button>
                <span className="n4ins-chain-text">
                  <span className="n4ins-chain-model">{entry.chain.model}</span>
                  <span className="n4ins-chain-pp">{preprocessingLabel(entry.chain)}</span>
                </span>
              </span>
              <span className="n4ins-top-track">
                {Number.isFinite(tieLo) ? <span className="n4ins-top-tie" style={{ left: x(tieLo), width: `calc(${x(tieHi)} - ${x(tieLo)})` }} /> : null}
                {ties ? <span className="n4ins-top-best" style={{ left: x(ties.bestScore) }} /> : null}
                {f ? (
                  <>
                    <span className="n4ins-top-range" style={{ left: x(f.min), width: `calc(${x(f.max)} - ${x(f.min)})` }} />
                    <span className="n4ins-top-sd" style={{ left: x(f.mean - f.sd), width: `calc(${x(f.mean + f.sd)} - ${x(f.mean - f.sd)})`, background: ctx.mapping.colors[entry.row] }} />
                  </>
                ) : null}
                <span className="n4ins-top-dot" style={{ left: x(entry.score), background: ctx.mapping.colors[entry.row] }} title={`${formatValue(entry.score)}${f ? ` · ${strings.foldSpread} ${formatValue(f.sd)}` : ""}`} />
              </span>
              <span className="n4ins-top-value n4wb-mono">
                <strong>{formatValue(entry.score)}</strong>
                {f ? <small>±{formatValue(f.sd)}</small> : null}
              </span>
            </div>
          );
        })}
      </div>
      <footer className="n4wb-view-foot n4ins-top-legend">
        <span>
          <span className="n4ins-legend-tie" /> {strings.tieZone}
        </span>
        <span>
          <span className="n4ins-legend-range" /> {strings.foldRange}
        </span>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ score vs cost

export function ParetoBody({ ctx }: { ctx: InspectorViewContext }) {
  const { ref, strings } = ctx;
  const model = useMemo(() => {
    const xs = Float64Array.from(ctx.chains, (c) => (c.fitTimeMs && c.fitTimeMs > 0 ? Math.log10(c.fitTimeMs / 1000) : Number.NaN));
    const ys = Float64Array.from(ctx.chains, (c) => scoreOf(c, ref));
    const front = paretoFront(ctx.chains, ref);
    const rowOf = new Map(ctx.chains.map((c, i) => [c.id, i]));
    const frontRows = new Set(front.map((c) => rowOf.get(c.id)!));
    // Staircase: each faster-but-worse chain holds until a slower one improves on it.
    const points: Array<readonly [number, number]> = [];
    front.forEach((c, i) => {
      const x = Math.log10(c.fitTimeMs! / 1000);
      const y = scoreOf(c, ref);
      if (i > 0) points.push([x, points[points.length - 1]![1]]);
      points.push([x, y]);
    });
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of xs) if (Number.isFinite(v)) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
    const decades: number[] = [];
    for (let d = Math.floor(lo); d <= Math.ceil(hi); d += 1) decades.push(d);
    return { xs, ys, frontRows, points, decades };
  }, [ctx.chains, ref]);
  const guides: ScatterGuide[] = [{ kind: "path", points: model.points, label: strings.paretoFront, tone: "accent" }];
  return (
    <ScatterView
      xs={model.xs}
      ys={model.ys}
      colors={ctx.mapping.colors}
      groups={ctx.mapping.groups}
      palette={ctx.mapping.palette}
      selected={ctx.selected}
      hoverRow={ctx.hoverRow}
      emphasized={model.frontRows}
      xLabel={`${strings.fitTime} (log)`}
      yLabel={ref ? `${ref.label} ${ref.lowerIsBetter ? "↓" : "↑"}` : undefined}
      xTickValues={model.decades}
      formatX={(v) => formatDuration(10 ** v * 1000)}
      guides={guides}
      onHover={ctx.setHoverRow}
      onSelectionChange={ctx.setSelected}
      renderTooltip={(row) => (
        <>
          <ChainTooltip ctx={ctx} row={row} />
          <dl className="n4wb-tip-grid">
            <dt>{strings.fitTime}</dt>
            <dd>{formatDuration(ctx.chains[row]?.fitTimeMs)}</dd>
            {model.frontRows.has(row) ? (
              <>
                <dt>★</dt>
                <dd>{strings.paretoFront}</dd>
              </>
            ) : null}
          </dl>
        </>
      )}
      icons={ctx.icons}
      ariaLabel={strings.viewPareto}
    />
  );
}

// ------------------------------------------------------------------ side by side

export function CompareBody({ ctx }: { ctx: InspectorViewContext }) {
  const { strings, ref } = ctx;
  const cols = ctx.compare;
  if (cols.length === 0) return null;
  const reference = cols[0]!.chain;
  const rank = new Map(ctx.ranked.map((r) => [r.chain.id, r.rank]));
  const paramKeys = [...new Set(cols.flatMap((c) => Object.keys(c.chain.params ?? {})))].sort();
  const scoreRows = ctx.refs.filter((r) => cols.some((c) => Number.isFinite(scoreOf(c.chain, r))));
  const row = (key: string, label: ReactNode, cells: ReactNode[], className?: string) => (
    <tr key={key} className={className}>
      <th scope="row">{label}</th>
      {cells.map((cell, i) => (
        <td key={cols[i]!.chain.id}>{cell}</td>
      ))}
    </tr>
  );
  return (
    <div className="n4ins-compare">
      <table className="n4ins-compare-table">
        <thead>
          <tr>
            <th />
            {cols.map(({ chain, color }, i) => (
              <th key={chain.id} scope="col">
                <span className="n4ins-compare-head">
                  <span className="n4wb-legend-swatch" style={{ background: color }} aria-hidden="true" />
                  <span className="n4ins-compare-name" title={chainLabel(chain)}>
                    <strong>{chain.model}</strong>
                    <small>{i === 0 ? strings.reference : `#${rank.get(chain.id) ?? "—"}`}</small>
                  </span>
                  <button type="button" className="n4ins-star is-on" aria-label={strings.removeFromCompare} onClick={() => ctx.onToggleCompare(chain.id)}>
                    ★
                  </button>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row("rank", strings.rank, cols.map((c) => rank.get(c.chain.id) ?? "—"))}
          {scoreRows.map((r) => {
            const values = cols.map((c) => scoreOf(c.chain, r));
            const bestValue = values.reduce((b, v) => (Number.isFinite(v) && (!Number.isFinite(b) || (r.lowerIsBetter ? v < b : v > b)) ? v : b), Number.NaN);
            return row(
              `score:${r.key}`,
              <span className={r.key === ref?.key ? "n4ins-active-score" : undefined}>
                {r.label} {r.lowerIsBetter ? "↓" : "↑"}
              </span>,
              values.map((v, i) => {
                const gain = i > 0 ? relativeGain(values[0]!, v, r) : Number.NaN;
                return (
                  <span className="n4ins-compare-score">
                    <span className={cx("n4wb-mono", v === bestValue && "n4ins-compare-best")}>{formatValue(v)}</span>
                    {Number.isFinite(gain) ? <small className={gain >= 0 ? "is-good" : "is-bad"}>{formatSigned(gain * 100, 2)} %</small> : null}
                  </span>
                );
              }),
            );
          })}
          {ref
            ? row(
                "folds",
                `${ref.label} · ${strings.folds}`,
                cols.map((c) => {
                  const f = foldStats(c.chain, ref);
                  return f ? <span className="n4wb-mono">{formatValue(f.mean)} ± {formatValue(f.sd)}</span> : "—";
                }),
              )
            : null}
          {row("fit", strings.fitTime, cols.map((c) => <span className="n4wb-mono">{formatDuration(c.chain.fitTimeMs)}</span>))}
          {row("steps", strings.steps, cols.map((c) => <StepChips chain={c.chain} highlight={new Set(c.chain.steps.filter((s) => !reference.steps.some((r) => r.token === s.token)).map((s) => s.token))} />), "is-steps")}
          {paramKeys.map((key) => {
            const values = cols.map((c) => c.chain.params?.[key]);
            const differs = new Set(values.map((v) => String(v ?? "—"))).size > 1;
            return row(
              `param:${key}`,
              <span className="n4wb-mono">{key}</span>,
              values.map((v) => <span className={cx("n4wb-mono", differs && "n4ins-compare-diff")}>{formatParam(v)}</span>),
            );
          })}
          {cols.some((c) => c.predictions)
            ? row(
                "predictions",
                strings.samples,
                cols.map(({ chain, predictions }) => {
                  if (!predictions) return <span className="n4wb-muted">—</span>;
                  if (chain.task === "classification") return <span className="n4wb-mono">acc {formatPercent(confusionCounts(predictions).accuracy, 1)}</span>;
                  const s = regressionSummary(predictions);
                  return s ? (
                    <span className="n4ins-compare-pred n4wb-mono">
                      <span>R² {formatValue(s.r2, 3)}</span>
                      <span>RMSE {formatValue(s.rmse)}</span>
                      <span>RPD {formatValue(s.rpd, 2)}</span>
                      <span>bias {formatSigned(s.bias, 2)}</span>
                    </span>
                  ) : (
                    "—"
                  );
                }),
              )
            : null}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ across datasets

export function DatasetsBody({ ctx, facet }: { ctx: InspectorViewContext; facet: ChainFacet }) {
  const { strings } = ctx;
  const table = useMemo(() => crossDatasetTable(ctx.allChains, facet, ctx.refs, ctx.ref), [ctx.allChains, facet, ctx.refs, ctx.ref]);
  if (table.datasets.length < 2) return null;
  return (
    <div className="n4ins-heatmap-wrap">
      <table className="n4ins-heatmap n4ins-xds">
        <thead>
          <tr>
            <th className="n4ins-heat-corner">{facetLabel(facet)}</th>
            {table.datasets.map(({ name, ref }) => (
              <th key={name}>
                <button type="button" className="n4ins-xds-head" title={strings.showDataset} onClick={() => ctx.onPickDataset(name)}>
                  <span>{shorten(name, 16)}</span>
                  <small>
                    {ref.label} {ref.lowerIsBetter ? "↓" : "↑"}
                  </small>
                </button>
              </th>
            ))}
            <th>{strings.meanRank}</th>
            <th>{strings.wins}</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={r.value}>
              <th title={r.value}>{shorten(r.value, 22)}</th>
              {table.datasets.map(({ name }) => {
                const cell = r.cells.get(name);
                if (!cell) return <td key={name} className="n4ins-heat-empty" />;
                return (
                  <td key={name}>
                    <button
                      type="button"
                      className="n4ins-heat-cell"
                      style={{ background: rampAt(N4_VIRIDIS_STOPS, cell.quality), color: cell.quality > 0.62 ? "#0f172a" : "#ffffff" }}
                      title={`${r.value} · ${name}: ${formatValue(cell.score)} (#${cell.rank})`}
                      onClick={() => ctx.onPickDataset(name)}
                    >
                      <strong>{formatValue(cell.score)}</strong>
                      <small>#{cell.rank}</small>
                    </button>
                  </td>
                );
              })}
              <td className="n4ins-xds-num n4wb-mono">{formatValue(r.meanRank, 2)}</td>
              <td className="n4ins-xds-num n4wb-mono">{r.wins || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
