/**
 * View bodies of the Inspector capsule. Chain-level views (landscape, pivot,
 * generalization, hyper-parameters, step effects, leaderboard) share the chain
 * selection; sample-level views (parity, residuals, confusion, hard samples)
 * show the compared chains' predictions and share the sample selection.
 */

import { useMemo, useState, type ReactNode } from "react";

import { roleColor } from "../chains/colors.js";
import type { ChainEffectAnalysis, ScoreLens } from "../chains/types.js";
import { cx } from "../workbench/_cx.js";
import type { ColorMapping, RowColumn } from "../workbench/colorBy.js";
import { formatDuration, formatValue } from "../workbench/format.js";
import type { WorkbenchIcons } from "../workbench/icons.js";
import { ScatterView, type ScatterGuide } from "../workbench/ScatterView.js";
import { combineSelection, selectionModeFromModifiers, type Selection } from "../workbench/selection.js";
import { VirtualTable, type VirtualColumn } from "../workbench/VirtualTable.js";
import { ConfusionMatrix } from "../viz/ConfusionMatrix.js";
import { rampAt, N4_VIRIDIS_STOPS } from "../viz/theme.js";
import {
  chainLabel,
  confusionCounts,
  facetLabel,
  facetValue,
  hardSamples,
  isBetter,
  pivotChains,
  pivotKey,
  preprocessingLabel,
  regressionSummary,
  scoreOf,
  type PivotAggregate,
} from "./analysis.js";
import { foldStats, residualAgreement, trendLine, type FactorEffect, type Insight, type RankedEntry, type TieSummary } from "./insights.js";
import type { InspectorStrings } from "./locale.js";
import type { ChainFacet, ChainPredictions, InspectorChain, ScoreRef } from "./types.js";

export const COMPARE_COLORS = ["#0d9488", "#4f46e5", "#d97706", "#e11d48", "#7c3aed", "#0284c7"] as const;

export interface InspectorViewContext {
  /** Filtered chains; chain-level views index rows into this array. */
  chains: readonly InspectorChain[];
  ref: ScoreRef | undefined;
  refs: readonly ScoreRef[];
  colorColumn: RowColumn | null;
  mapping: ColorMapping;
  selected: Selection;
  setSelected: (rows: Selection) => void;
  hoverRow: number | null;
  setHoverRow: (row: number | null) => void;
  /** Compared chains with their assigned colors. */
  compare: ReadonlyArray<{ chain: InspectorChain; color: string; predictions: ChainPredictions | undefined }>;
  compareIds: ReadonlySet<string>;
  loadingPredictions: boolean;
  sampleSelection: ReadonlySet<string>;
  setSampleSelection: (keys: ReadonlySet<string>) => void;
  hoverSample: string | null;
  setHoverSample: (key: string | null) => void;
  strings: InspectorStrings;
  icons?: WorkbenchIcons | undefined;
  onToggleCompare: (chainId: string) => void;
  /** Scored chains best-first; `row` indexes `chains`. */
  ranked: ReadonlyArray<RankedEntry & { row: number }>;
  ties: TieSummary | null;
  factors: readonly FactorEffect[];
  insights: readonly Insight[];
  /** Every chain the host supplied, across datasets. */
  allChains: readonly InspectorChain[];
  onPickDataset: (dataset: string) => void;
  /** A driver was picked (facet id or `param:<name>`). */
  onFactor: (key: string) => void;
  onOpenChain?: ((chain: InspectorChain) => void) | undefined;
  /** Step-effect analysis of the scored chains under the active lens. */
  stepAnalysis: ChainEffectAnalysis | null;
  lens: ScoreLens;
  setLens: (lens: ScoreLens) => void;
  focusToken: string | null;
  setFocusToken: (token: string | null) => void;
}

export function shorten(text: string, max = 18): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Deterministic jitter in [-0.5, 0.5) from an id. */
export function jitter(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000 - 0.5;
}

export function ChainTooltip({ ctx, row }: { ctx: InspectorViewContext; row: number }) {
  const chain = ctx.chains[row];
  if (!chain) return null;
  return (
    <>
      <div className="n4wb-tip-title">
        <span className="n4wb-legend-swatch" style={{ background: ctx.mapping.colors[row] }} aria-hidden="true" />
        {chainLabel(chain)}
      </div>
      <dl className="n4wb-tip-grid">
        {ctx.ref ? (
          <>
            <dt>{ctx.ref.label}</dt>
            <dd>{formatValue(scoreOf(chain, ctx.ref))}</dd>
          </>
        ) : null}
        {chain.dataset ? (
          <>
            <dt>Dataset</dt>
            <dd>{chain.dataset}</dd>
          </>
        ) : null}
        {chain.runLabel ?? chain.runId ? (
          <>
            <dt>Run</dt>
            <dd>{chain.runLabel ?? chain.runId}</dd>
          </>
        ) : null}
      </dl>
    </>
  );
}

function emphasizedRows(ctx: InspectorViewContext): Set<number> {
  const out = new Set<number>();
  ctx.chains.forEach((chain, row) => {
    if (ctx.compareIds.has(chain.id)) out.add(row);
  });
  return out;
}

export function LandscapeBody({ ctx, groupFacet }: { ctx: InspectorViewContext; groupFacet: ChainFacet }) {
  const model = useMemo(() => {
    const best = new Map<string, number>();
    for (const chain of ctx.chains) {
      const lane = facetValue(chain, groupFacet) ?? "—";
      const score = scoreOf(chain, ctx.ref);
      if (!best.has(lane) || isBetter(score, best.get(lane)!, ctx.ref)) best.set(lane, score);
    }
    const lanes = [...best.keys()].sort((a, b) => (isBetter(best.get(a)!, best.get(b)!, ctx.ref) ? -1 : isBetter(best.get(b)!, best.get(a)!, ctx.ref) ? 1 : a.localeCompare(b)));
    const index = new Map(lanes.map((l, i) => [l, i]));
    const xs = Float64Array.from(ctx.chains, (chain) => scoreOf(chain, ctx.ref));
    const ys = Float64Array.from(ctx.chains, (chain) => (index.get(facetValue(chain, groupFacet) ?? "—") ?? 0) + jitter(chain.id) * 0.62);
    // Per-lane IQR box + median tick, and the overall best score.
    const guides: ScatterGuide[] = [];
    lanes.forEach((lane, i) => {
      const values = ctx.chains.filter((c) => (facetValue(c, groupFacet) ?? "—") === lane).map((c) => scoreOf(c, ctx.ref)).filter(Number.isFinite).sort((a, b) => a - b);
      if (values.length < 3) return;
      const q = (p: number) => values[Math.min(values.length - 1, Math.round(p * (values.length - 1)))]!;
      guides.push({ kind: "rect", x0: q(0.25), x1: q(0.75), y0: i - 0.36, y1: i + 0.36 });
      guides.push({ kind: "segment", x0: q(0.5), x1: q(0.5), y0: i - 0.42, y1: i + 0.42, tone: "danger" });
    });
    const overall = [...best.values()].reduce((b, v) => (isBetter(v, b, ctx.ref) ? v : b), Number.NaN);
    if (Number.isFinite(overall)) guides.push({ kind: "vline", x: overall, label: "best", tone: "accent" });
    return { lanes, xs, ys, guides };
  }, [ctx.chains, ctx.ref, groupFacet]);
  const emphasized = useMemo(() => emphasizedRows(ctx), [ctx]);
  return (
    <ScatterView
      xs={model.xs}
      ys={model.ys}
      colors={ctx.mapping.colors}
      groups={ctx.mapping.groups}
      palette={ctx.mapping.palette}
      selected={ctx.selected}
      hoverRow={ctx.hoverRow}
      emphasized={emphasized}
      xLabel={ctx.ref ? `${ctx.ref.label} ${ctx.ref.lowerIsBetter ? "(lower is better)" : "(higher is better)"}` : "Score"}
      yDomain={[model.lanes.length - 0.5, -0.5]}
      yTickValues={model.lanes.map((_, i) => i)}
      formatY={(v) => shorten(model.lanes[Math.round(v)] ?? "")}
      padding={{ left: 118 }}
      guides={model.guides}
      onHover={ctx.setHoverRow}
      onSelectionChange={ctx.setSelected}
      renderTooltip={(row) => <ChainTooltip ctx={ctx} row={row} />}
      icons={ctx.icons}
      ariaLabel={`Scores by ${facetLabel(groupFacet)}`}
    />
  );
}

export function HeatmapBody({ ctx, rowFacet, colFacet, aggregate }: { ctx: InspectorViewContext; rowFacet: ChainFacet; colFacet: ChainFacet; aggregate: PivotAggregate }) {
  const pivot = useMemo(() => pivotChains(ctx.chains, rowFacet, colFacet, ctx.ref, aggregate), [ctx.chains, rowFacet, colFacet, ctx.ref, aggregate]);
  const idToRow = useMemo(() => new Map(ctx.chains.map((c, i) => [c.id, i])), [ctx.chains]);
  const selected = useMemo(() => new Set(ctx.selected), [ctx.selected]);
  if (pivot.rows.length === 0) return null;
  const span = pivot.max - pivot.min || 1;
  const quality = (value: number) => {
    const t = (value - pivot.min) / span;
    return ctx.ref?.lowerIsBetter ? 1 - t : t;
  };
  return (
    <div className="n4ins-heatmap-wrap">
      <table className="n4ins-heatmap">
        <thead>
          <tr>
            <th className="n4ins-heat-corner">
              {facetLabel(rowFacet)} ↓ · {facetLabel(colFacet)} →
            </th>
            {pivot.cols.map((col) => (
              <th key={col} title={col}>
                <span>{shorten(col, 16)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pivot.rows.map((row) => (
            <tr key={row}>
              <th title={row}>{shorten(row, 22)}</th>
              {pivot.cols.map((col) => {
                const cell = pivot.cells.get(pivotKey(row, col));
                if (!cell) return <td key={col} className="n4ins-heat-empty" />;
                const q = quality(cell.value);
                const rows = cell.chainIds.map((id) => idToRow.get(id)!).filter((r) => r !== undefined);
                const isSelected = rows.length > 0 && rows.every((r) => selected.has(r));
                return (
                  <td key={col}>
                    <button
                      type="button"
                      className={cx("n4ins-heat-cell", isSelected && "is-selected")}
                      style={{ background: rampAt(N4_VIRIDIS_STOPS, q), color: q > 0.62 ? "#0f172a" : "#ffffff" }}
                      title={`${row} × ${col}: ${formatValue(cell.value)} (${cell.count} chains)`}
                      onClick={(event) => ctx.setSelected(combineSelection(ctx.selected, rows, selectionModeFromModifiers(event)))}
                    >
                      <strong>{formatValue(cell.value)}</strong>
                      {cell.count > 1 ? <small>n={cell.count}</small> : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GeneralizationBody({ ctx, xRef, yRef }: { ctx: InspectorViewContext; xRef: ScoreRef; yRef: ScoreRef }) {
  const xs = useMemo(() => Float64Array.from(ctx.chains, (chain) => scoreOf(chain, xRef)), [ctx.chains, xRef]);
  const ys = useMemo(() => Float64Array.from(ctx.chains, (chain) => scoreOf(chain, yRef)), [ctx.chains, yRef]);
  const emphasized = useMemo(() => emphasizedRows(ctx), [ctx]);
  const guides: ScatterGuide[] = [{ kind: "line", slope: 1, intercept: 0, label: "y = x", tone: "accent" }];
  return (
    <ScatterView
      xs={xs}
      ys={ys}
      colors={ctx.mapping.colors}
      groups={ctx.mapping.groups}
      palette={ctx.mapping.palette}
      selected={ctx.selected}
      hoverRow={ctx.hoverRow}
      emphasized={emphasized}
      equalAspect
      xLabel={xRef.label}
      yLabel={yRef.label}
      guides={guides}
      onHover={ctx.setHoverRow}
      onSelectionChange={ctx.setSelected}
      renderTooltip={(row) => (
        <>
          <ChainTooltip ctx={ctx} row={row} />
          <dl className="n4wb-tip-grid">
            <dt>{xRef.label}</dt>
            <dd>{formatValue(xs[row]!)}</dd>
            <dt>{yRef.label}</dt>
            <dd>{formatValue(ys[row]!)}</dd>
            <dt>Gap</dt>
            <dd>{formatValue(ys[row]! - xs[row]!)}</dd>
          </dl>
        </>
      )}
      icons={ctx.icons}
      ariaLabel="Generalization map"
    />
  );
}

export type PointColoring = "chain" | "partition" | "fold";
export type ResidualAxis = "observed" | "predicted";
export type PredictionLayout = "overlay" | "split";

type CompareEntry = InspectorViewContext["compare"][number];

interface PointCloud {
  xs: Float64Array;
  ys: Float64Array;
  keys: string[];
  chainOf: Int32Array;
  sampleIndex: Int32Array;
  colors: string[];
  groups: Int32Array;
  palette: string[];
}

const PARTITION_COLORS: Readonly<Record<string, string>> = { train: "#0d9488", validation: "#4f46e5", val: "#4f46e5", test: "#d97706" };

function buildCloud(ctx: InspectorViewContext, entries: readonly CompareEntry[], mode: "parity" | "residual", coloring: PointColoring, partition: string, xAxis: ResidualAxis): PointCloud {
  const xs: number[] = [];
  const ys: number[] = [];
  const keys: string[] = [];
  const chainOf: number[] = [];
  const sampleIndex: number[] = [];
  const colorKeys: string[] = [];
  for (const entry of entries) {
    const { predictions, chain } = entry;
    const ci = ctx.compare.indexOf(entry);
    if (!predictions || chain.task !== "regression") continue;
    for (let i = 0; i < predictions.sampleKeys.length; i += 1) {
      if (partition !== "all" && predictions.partition?.[i] !== partition) continue;
      const t = predictions.yTrue[i];
      const p = predictions.yPred[i];
      if (typeof t !== "number" || typeof p !== "number") continue;
      xs.push(mode === "residual" && xAxis === "predicted" ? p : t);
      ys.push(mode === "parity" ? p : p - t);
      keys.push(predictions.sampleKeys[i]!);
      chainOf.push(ci);
      sampleIndex.push(i);
      colorKeys.push(
        coloring === "chain" ? String(ci) : coloring === "partition" ? String(predictions.partition?.[i] ?? "—") : String(predictions.fold?.[i] ?? "—"),
      );
    }
  }
  const palette: string[] = [];
  const groupOf = new Map<string, number>();
  const groups = new Int32Array(colorKeys.length);
  const colors = colorKeys.map((key, i) => {
    let g = groupOf.get(key);
    if (g === undefined) {
      g = palette.length;
      groupOf.set(key, g);
      palette.push(
        coloring === "chain"
          ? ctx.compare[Number(key)]?.color ?? COMPARE_COLORS[0]
          : coloring === "partition"
            ? PARTITION_COLORS[key] ?? "#64748b"
            : COMPARE_COLORS[g % COMPARE_COLORS.length]!,
      );
    }
    groups[i] = g;
    return palette[g]!;
  });
  return { xs: Float64Array.from(xs), ys: Float64Array.from(ys), keys, chainOf: Int32Array.from(chainOf), sampleIndex: Int32Array.from(sampleIndex), colors, groups, palette };
}

function cloudSelection(cloud: PointCloud, keys: ReadonlySet<string>): number[] {
  if (keys.size === 0) return [];
  const out: number[] = [];
  cloud.keys.forEach((key, i) => {
    if (keys.has(key)) out.push(i);
  });
  return out;
}

function PointTooltip({ ctx, cloud, point, mode }: { ctx: InspectorViewContext; cloud: PointCloud; point: number; mode: "parity" | "residual" }) {
  const entry = ctx.compare[cloud.chainOf[point]!];
  const i = cloud.sampleIndex[point]!;
  const pred = entry?.predictions;
  const yTrue = Number(pred?.yTrue[i]);
  const yPred = Number(pred?.yPred[i]);
  return (
    <>
      <div className="n4wb-tip-title">
        <span className="n4wb-legend-swatch" style={{ background: entry?.color }} aria-hidden="true" />
        {cloud.keys[point]}
      </div>
      <dl className="n4wb-tip-grid">
        <dt>Chain</dt>
        <dd>{entry ? shorten(chainLabel(entry.chain), 26) : "—"}</dd>
        <dt>{ctx.strings.observed}</dt>
        <dd>{formatValue(yTrue)}</dd>
        <dt>{ctx.strings.predicted}</dt>
        <dd>{formatValue(yPred)}</dd>
        {mode === "residual" ? (
          <>
            <dt>Residual</dt>
            <dd>{formatValue(yPred - yTrue)}</dd>
          </>
        ) : null}
        {pred?.partition?.[i] ? (
          <>
            <dt>{ctx.strings.partition}</dt>
            <dd>{pred.partition[i]}</dd>
          </>
        ) : null}
        {pred?.fold?.[i] !== undefined && pred.fold[i] !== null ? (
          <>
            <dt>Fold</dt>
            <dd>{String(pred.fold[i])}</dd>
          </>
        ) : null}
      </dl>
    </>
  );
}

function MetricLine({ entry, partition, compact }: { entry: CompareEntry; partition: string; compact?: boolean }) {
  const { chain, color, predictions } = entry;
  if (!predictions || chain.task !== "regression") return null;
  const summary = regressionSummary(predictions, partition === "all" ? undefined : (i) => predictions.partition?.[i] === partition);
  return (
    <span className="n4ins-metric" title={chainLabel(chain)}>
      <span className="n4wb-legend-swatch" style={{ background: color }} aria-hidden="true" />
      {compact ? null : <span className="n4ins-metric-name">{shorten(chainLabel(chain), 22)}</span>}
      {summary ? (
        <span className="n4wb-mono">
          R² {formatValue(summary.r2, 2)} · RMSE {formatValue(summary.rmse)}
          {compact ? null : ` · RPD ${formatValue(summary.rpd, 2)} · bias ${formatValue(summary.bias, 2)}`}
        </span>
      ) : (
        <span className="n4wb-muted">—</span>
      )}
    </span>
  );
}

export function MetricStrip({ ctx, partition }: { ctx: InspectorViewContext; partition: string }) {
  return (
    <footer className="n4wb-view-foot n4ins-metrics">
      {ctx.compare.map((entry) => (
        <MetricLine key={entry.chain.id} entry={entry} partition={partition} />
      ))}
    </footer>
  );
}

function PredictionPlot({
  ctx,
  entries,
  mode,
  coloring,
  partition,
  xAxis,
}: {
  ctx: InspectorViewContext;
  entries: readonly CompareEntry[];
  mode: "parity" | "residual";
  coloring: PointColoring;
  partition: string;
  xAxis: ResidualAxis;
}) {
  const cloud = useMemo(() => buildCloud(ctx, entries, mode, coloring, partition, xAxis), [ctx, entries, mode, coloring, partition, xAxis]);
  const selected = useMemo(() => cloudSelection(cloud, ctx.sampleSelection), [cloud, ctx.sampleSelection]);
  const hovered = useMemo(() => (ctx.hoverSample ? new Set(cloudSelection(cloud, new Set([ctx.hoverSample]))) : undefined), [cloud, ctx.hoverSample]);
  const hoverPoint = hovered && hovered.size > 0 ? [...hovered][0]! : null;
  if (cloud.xs.length === 0) return null;
  let guides: ScatterGuide[];
  if (mode === "parity") guides = [{ kind: "line", slope: 1, intercept: 0, label: "y = x", tone: "accent" }];
  else {
    let sum = 0;
    for (const r of cloud.ys) sum += r * r;
    const sd = Math.sqrt(sum / Math.max(1, cloud.ys.length - 1));
    guides = [
      { kind: "band", y0: -2 * sd, y1: 2 * sd },
      { kind: "hline", y: 0, tone: "accent" },
      { kind: "hline", y: 2 * sd, label: "+2σ", tone: "warning" },
      { kind: "hline", y: -2 * sd, label: "−2σ", tone: "warning" },
      { kind: "path", points: trendLine(cloud.xs, cloud.ys, 10), tone: "danger" },
    ];
  }
  return (
    <ScatterView
      xs={cloud.xs}
      ys={cloud.ys}
      colors={cloud.colors}
      groups={cloud.groups}
      palette={cloud.palette}
      selected={selected}
      hoverRow={hoverPoint}
      {...(hovered && hovered.size > 1 ? { emphasized: hovered } : {})}
      equalAspect={mode === "parity"}
      xLabel={mode === "residual" && xAxis === "predicted" ? ctx.strings.predicted : ctx.strings.observed}
      yLabel={mode === "parity" ? ctx.strings.predicted : "Residual (pred − obs)"}
      guides={guides}
      onHover={(point) => ctx.setHoverSample(point === null ? null : cloud.keys[point] ?? null)}
      onSelectionChange={(next) => ctx.setSampleSelection(new Set(next.map((p) => cloud.keys[p]!)))}
      renderTooltip={(point) => <PointTooltip ctx={ctx} cloud={cloud} point={point} mode={mode} />}
      icons={ctx.icons}
      ariaLabel={mode === "parity" ? "Predicted versus observed" : "Residuals"}
    />
  );
}

export function PredictionBody({
  ctx,
  mode,
  coloring,
  partition,
  layout = "overlay",
  xAxis = "observed",
}: {
  ctx: InspectorViewContext;
  mode: "parity" | "residual";
  coloring: PointColoring;
  partition: string;
  layout?: PredictionLayout;
  xAxis?: ResidualAxis;
}) {
  const entries = ctx.compare.filter((c) => c.predictions && c.chain.task === "regression");
  if (entries.length === 0) return null;
  if (layout === "split" && entries.length > 1) {
    return (
      <div className="n4ins-multiples" data-count={entries.length}>
        {entries.map((entry) => (
          <figure key={entry.chain.id} className="n4ins-multiple">
            <figcaption>
              <span className="n4wb-legend-swatch" style={{ background: entry.color }} aria-hidden="true" />
              <strong title={chainLabel(entry.chain)}>{chainLabel(entry.chain)}</strong>
              <MetricLine entry={entry} partition={partition} compact />
            </figcaption>
            <div className="n4ins-multiple-plot">
              <PredictionPlot ctx={ctx} entries={[entry]} mode={mode} coloring={coloring} partition={partition} xAxis={xAxis} />
            </div>
          </figure>
        ))}
      </div>
    );
  }
  return (
    <>
      <PredictionPlot ctx={ctx} entries={entries} mode={mode} coloring={coloring} partition={partition} xAxis={xAxis} />
      <MetricStrip ctx={ctx} partition={partition} />
    </>
  );
}

export function AgreementBody({ ctx, partition, pair }: { ctx: InspectorViewContext; partition: string; pair: readonly [string | null, string | null] }) {
  const regression = ctx.compare.filter((c) => c.predictions && c.chain.task === "regression");
  const a = regression.find((c) => c.chain.id === pair[0]) ?? regression[0];
  const b = regression.find((c) => c.chain.id === pair[1] && c !== a) ?? regression.find((c) => c !== a);
  const agreement = useMemo(
    () => (a && b ? residualAgreement(a.predictions!, b.predictions!, partition === "all" ? undefined : (pred, i) => pred.partition?.[i] === partition) : null),
    [a, b, partition],
  );
  const selected = useMemo(() => (agreement ? agreement.keys.flatMap((k, i) => (ctx.sampleSelection.has(k) ? [i] : [])) : []), [agreement, ctx.sampleSelection]);
  if (!a || !b || !agreement) return null;
  const hoverPoint = ctx.hoverSample ? agreement.keys.indexOf(ctx.hoverSample) : -1;
  const n = agreement.n;
  const colors = new Array<string>(n).fill(a.color);
  const lim = Math.max(...Array.from(agreement.residualsA, Math.abs), ...Array.from(agreement.residualsB, Math.abs)) * 1.06 || 1;
  return (
    <>
      <ScatterView
        xs={agreement.residualsA}
        ys={agreement.residualsB}
        colors={colors}
        groups={new Int32Array(n)}
        palette={[a.color]}
        selected={selected}
        hoverRow={hoverPoint >= 0 ? hoverPoint : null}
        equalAspect
        xDomain={[-lim, lim]}
        yDomain={[-lim, lim]}
        xLabel={`Residual · ${shorten(chainLabel(a.chain), 26)}`}
        yLabel={`Residual · ${shorten(chainLabel(b.chain), 26)}`}
        guides={[
          { kind: "line", slope: 1, intercept: 0, label: "same error", tone: "accent" },
          { kind: "hline", y: 0 },
          { kind: "vline", x: 0 },
        ]}
        onHover={(point) => ctx.setHoverSample(point === null ? null : agreement.keys[point] ?? null)}
        onSelectionChange={(next) => ctx.setSampleSelection(new Set(next.map((p) => agreement.keys[p]!)))}
        renderTooltip={(point) => (
          <>
            <div className="n4wb-tip-title">{agreement.keys[point]}</div>
            <dl className="n4wb-tip-grid">
              <dt>A</dt>
              <dd>{formatValue(agreement.residualsA[point]!)}</dd>
              <dt>B</dt>
              <dd>{formatValue(agreement.residualsB[point]!)}</dd>
            </dl>
          </>
        )}
        icons={ctx.icons}
        ariaLabel={ctx.strings.viewAgreement}
      />
      <footer className="n4wb-view-foot n4ins-metrics">
        <span className="n4ins-metric">
          <strong className="n4wb-mono">
            {ctx.strings.residualCorr} = {formatValue(agreement.r, 2)}
          </strong>
          <span className="n4wb-muted">{ctx.strings.agreementHint(agreement.r)}</span>
        </span>
        <span className="n4ins-metric n4wb-mono">
          RMSE A {formatValue(agreement.rmseA)} · B {formatValue(agreement.rmseB)} · {ctx.strings.blend}{" "}
          <strong className={agreement.rmseBlend < Math.min(agreement.rmseA, agreement.rmseB) ? "n4ins-good" : undefined}>{formatValue(agreement.rmseBlend)}</strong>
        </span>
      </footer>
    </>
  );
}

export function FoldsBody({ ctx }: { ctx: InspectorViewContext }) {
  const ref = ctx.ref;
  const model = useMemo(() => {
    const entries = ctx.compare.filter(({ chain }) => (ref ? chain.foldScores?.[ref.key]?.length ?? 0 : 0) > 0);
    const xs: number[] = [];
    const ys: number[] = [];
    const owner: number[] = [];
    const guides: ScatterGuide[] = [];
    let maxFolds = 0;
    entries.forEach(({ chain, color }, ci) => {
      const values = chain.foldScores![ref!.key]!;
      const offset = entries.length > 1 ? (ci / (entries.length - 1) - 0.5) * 0.36 : 0;
      maxFolds = Math.max(maxFolds, values.length);
      const points: Array<[number, number]> = [];
      values.forEach((v, f) => {
        if (!Number.isFinite(v)) return;
        xs.push(f + 1 + offset);
        ys.push(v);
        owner.push(ci);
        points.push([f + 1 + offset, v]);
      });
      const stats = foldStats(chain, ref);
      guides.push({ kind: "path", points, color: color });
      if (stats) guides.push({ kind: "rect", x0: 0.6, x1: values.length + 0.4, y0: stats.mean - stats.sd, y1: stats.mean + stats.sd, color });
    });
    const palette = entries.map((e) => e.color);
    return { entries, xs: Float64Array.from(xs), ys: Float64Array.from(ys), owner, guides, maxFolds, palette, groups: Int32Array.from(owner), colors: owner.map((o) => palette[o]!) };
  }, [ctx.compare, ref]);
  if (model.entries.length === 0) return null;
  return (
    <>
      <ScatterView
        xs={model.xs}
        ys={model.ys}
        colors={model.colors}
        groups={model.groups}
        palette={model.palette}
        selected={[]}
        pointSize={4.5}
        xLabel="Fold"
        yLabel={ref?.label}
        xDomain={[0.5, model.maxFolds + 0.5]}
        xTickValues={Array.from({ length: model.maxFolds }, (_, i) => i + 1)}
        formatX={(v) => String(Math.round(v))}
        guides={model.guides}
        tools={["zoom", "pan"]}
        renderTooltip={(point) => {
          const entry = model.entries[model.owner[point]!]!;
          return (
            <>
              <div className="n4wb-tip-title">
                <span className="n4wb-legend-swatch" style={{ background: entry.color }} aria-hidden="true" />
                {shorten(chainLabel(entry.chain), 30)}
              </div>
              <dl className="n4wb-tip-grid">
                <dt>Fold</dt>
                <dd>{Math.round(model.xs[point]!)}</dd>
                <dt>{ref?.label}</dt>
                <dd>{formatValue(model.ys[point]!)}</dd>
              </dl>
            </>
          );
        }}
        icons={ctx.icons}
        ariaLabel="Per-fold scores"
      />
      <footer className="n4wb-view-foot n4ins-metrics">
        {model.entries.map(({ chain, color }) => {
          const stats = foldStats(chain, ref);
          return (
            <span key={chain.id} className="n4ins-metric">
              <span className="n4wb-legend-swatch" style={{ background: color }} aria-hidden="true" />
              <span className="n4ins-metric-name">{shorten(chainLabel(chain), 26)}</span>
              {stats ? (
                <span className="n4wb-mono">
                  {formatValue(stats.mean)} ± {formatValue(stats.sd)} (cv {formatValue(Math.abs(stats.sd / (stats.mean || 1)) * 100, 2)} %)
                </span>
              ) : null}
            </span>
          );
        })}
      </footer>
    </>
  );
}

export function HyperparamsBody({ ctx, param, kind, log }: { ctx: InspectorViewContext; param: string; kind: "numeric" | "categorical"; log: boolean }) {
  const model = useMemo(() => {
    const lanes: string[] = [];
    if (kind === "categorical") {
      for (const chain of ctx.chains) {
        const v = chain.params?.[param];
        if (v !== undefined && v !== null && !lanes.includes(String(v))) lanes.push(String(v));
      }
      lanes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }
    const xs = Float64Array.from(ctx.chains, (chain) => {
      const v = chain.params?.[param];
      if (v === undefined || v === null) return Number.NaN;
      if (kind === "categorical") return lanes.indexOf(String(v)) + jitter(chain.id) * 0.5;
      const n = Number(v);
      return log ? (n > 0 ? Math.log10(n) : Number.NaN) : n;
    });
    const ys = Float64Array.from(ctx.chains, (chain) => scoreOf(chain, ctx.ref));
    const guides: ScatterGuide[] = [];
    if (kind === "numeric") guides.push({ kind: "path", points: trendLine(xs, ys), label: "median", tone: "accent" });
    else
      lanes.forEach((lane, i) => {
        const values = ctx.chains.filter((c) => String(c.params?.[param]) === lane).map((c) => scoreOf(c, ctx.ref)).filter(Number.isFinite).sort((a, b) => a - b);
        if (values.length) guides.push({ kind: "segment", x0: i - 0.3, x1: i + 0.3, y0: values[Math.floor((values.length - 1) / 2)]!, y1: values[Math.floor((values.length - 1) / 2)]!, tone: "danger" });
      });
    return { xs, ys, lanes, guides };
  }, [ctx.chains, ctx.ref, param, kind, log]);
  const emphasized = useMemo(() => emphasizedRows(ctx), [ctx]);
  return (
    <ScatterView
      xs={model.xs}
      ys={model.ys}
      colors={ctx.mapping.colors}
      groups={ctx.mapping.groups}
      palette={ctx.mapping.palette}
      selected={ctx.selected}
      hoverRow={ctx.hoverRow}
      emphasized={emphasized}
      xLabel={kind === "numeric" && log ? `log₁₀ ${param}` : param}
      yLabel={ctx.ref?.label}
      guides={model.guides}
      {...(kind === "categorical"
        ? { xTickValues: model.lanes.map((_, i) => i), formatX: (v: number) => shorten(model.lanes[Math.round(v)] ?? "", 12), xDomain: [-0.6, model.lanes.length - 0.4] as const }
        : {})}
      onHover={ctx.setHoverRow}
      onSelectionChange={ctx.setSelected}
      renderTooltip={(row) => (
        <>
          <ChainTooltip ctx={ctx} row={row} />
          <dl className="n4wb-tip-grid">
            <dt>{param}</dt>
            <dd>{String(ctx.chains[row]?.params?.[param] ?? "—")}</dd>
          </dl>
        </>
      )}
      icons={ctx.icons}
      ariaLabel={`Score versus ${param}`}
    />
  );
}

export function ConfusionBody({ ctx, partition, normalize, chainId }: { ctx: InspectorViewContext; partition: string; normalize: boolean; chainId: string | null }) {
  const candidates = ctx.compare.filter((c) => c.chain.task === "classification" && c.predictions);
  const entry = candidates.find((c) => c.chain.id === chainId) ?? candidates[0];
  if (!entry || !entry.predictions) return null;
  const pred = entry.predictions;
  const counts = confusionCounts(pred, partition === "all" ? undefined : (i) => pred.partition?.[i] === partition);
  const size = Math.max(260, counts.labels.length * 64 + 120);
  return (
    <div className="n4ins-confusion">
      <div className="n4ins-confusion-head">
        <span className="n4wb-legend-swatch" style={{ background: entry.color }} aria-hidden="true" />
        <strong>{shorten(chainLabel(entry.chain), 40)}</strong>
        <span className="n4wb-muted">accuracy {formatValue(counts.accuracy * 100, 3)} %</span>
      </div>
      <div className="n4ins-confusion-plot">
        <ConfusionMatrix labels={counts.labels} matrix={counts.matrix} normalize={normalize} width={size} height={size} xLabel="Predicted" yLabel="Observed" title="Confusion matrix" />
      </div>
    </div>
  );
}

export function HardSamplesBody({ ctx, partition }: { ctx: InspectorViewContext; partition: string }) {
  const regression = ctx.compare.filter((c) => c.predictions && c.chain.task === "regression");
  const samples = useMemo(
    () => hardSamples(regression.map((c) => c.predictions!), partition === "all" ? undefined : (pred, i) => pred.partition?.[i] === partition),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.compare, partition],
  );
  if (regression.length === 0) return null;
  const columns: VirtualColumn<(typeof samples)[number]>[] = [
    { key: "key", header: "Sample", width: "minmax(110px, 1.2fr)", cell: (s) => <span className="n4wb-mono">{s.key}</span>, sortValue: (s) => s.key },
    { key: "obs", header: "Observed", width: "84px", align: "end", cell: (s) => formatValue(s.yTrue), sortValue: (s) => s.yTrue },
    { key: "mae", header: "mean |res|", width: "88px", align: "end", cell: (s) => <strong>{formatValue(s.meanAbsResidual)}</strong>, sortValue: (s) => s.meanAbsResidual },
    {
      key: "bias",
      header: "mean res",
      width: "84px",
      align: "end",
      cell: (s) => <span className={s.meanResidual > 0 ? "n4ins-pos" : "n4ins-neg"}>{formatValue(s.meanResidual)}</span>,
      sortValue: (s) => s.meanResidual,
    },
    ...regression.slice(0, 4).map(({ chain, color }) => ({
      key: chain.id,
      header: (
        <span className="n4ins-col-chain" title={chainLabel(chain)}>
          <span className="n4wb-legend-swatch" style={{ background: color }} aria-hidden="true" />
          pred
        </span>
      ),
      width: "80px",
      align: "end" as const,
      cell: (s: (typeof samples)[number]) => formatValue(s.predictions.get(chain.id) ?? Number.NaN),
      sortValue: (s: (typeof samples)[number]) => s.predictions.get(chain.id) ?? null,
    })),
  ];
  return (
    <VirtualTable
      rows={samples}
      columns={columns}
      rowKey={(s) => s.key}
      isSelected={(s) => ctx.sampleSelection.has(s.key)}
      isActive={(s) => s.key === ctx.hoverSample}
      onRowHover={(s) => ctx.setHoverSample(s?.key ?? null)}
      onRowClick={(s, event) => {
        const mode = selectionModeFromModifiers(event);
        const next = new Set(mode === "replace" ? [] : ctx.sampleSelection);
        if (mode === "subtract" || (mode === "toggle" && next.has(s.key))) next.delete(s.key);
        else next.add(s.key);
        ctx.setSampleSelection(next);
      }}
      ariaLabel="Hard samples"
    />
  );
}

export function LeaderboardBody({ ctx, ranks }: { ctx: InspectorViewContext; ranks: ReadonlyMap<string, number | null> }) {
  const rows = useMemo(() => ctx.chains.map((chain, row) => ({ chain, row })), [ctx.chains]);
  const selected = useMemo(() => new Set(ctx.selected), [ctx.selected]);
  const columns: VirtualColumn<{ chain: InspectorChain; row: number }>[] = [
    {
      key: "cmp",
      header: "☆",
      width: "34px",
      align: "center",
      cell: ({ chain }) => (
        <button
          type="button"
          className={cx("n4ins-star", ctx.compareIds.has(chain.id) && "is-on")}
          aria-pressed={ctx.compareIds.has(chain.id)}
          aria-label={ctx.compareIds.has(chain.id) ? ctx.strings.removeFromCompare : ctx.strings.addToCompare}
          onClick={(event) => {
            event.stopPropagation();
            ctx.onToggleCompare(chain.id);
          }}
        >
          {ctx.compareIds.has(chain.id) ? "★" : "☆"}
        </button>
      ),
    },
    { key: "rank", header: "#", width: "44px", align: "end", cell: ({ chain }) => ranks.get(chain.id) ?? "—", sortValue: ({ chain }) => ranks.get(chain.id) ?? null },
    {
      key: "model",
      header: "Model",
      width: "minmax(110px, 1fr)",
      cell: ({ chain, row }) => (
        <span className="n4ins-cell-model">
          <span className="n4wb-legend-swatch" style={{ background: ctx.mapping.colors[row] }} aria-hidden="true" />
          {chain.model}
        </span>
      ),
      sortValue: ({ chain }) => chain.model,
    },
    { key: "pp", header: "Preprocessing", width: "minmax(160px, 2fr)", cell: ({ chain }) => preprocessingLabel(chain), sortValue: ({ chain }) => preprocessingLabel(chain) },
    { key: "dataset", header: "Dataset", width: "minmax(90px, 1fr)", cell: ({ chain }) => chain.dataset ?? "—", sortValue: ({ chain }) => chain.dataset ?? null },
    ...ctx.refs.map((ref) => ({
      key: `s:${ref.key}`,
      header: <span title={ref.label}>{shorten(ref.label, 14)}</span>,
      width: "92px",
      align: "end" as const,
      cell: ({ chain }: { chain: InspectorChain }) => <span className={ref.key === ctx.ref?.key ? "n4ins-active-score" : undefined}>{formatValue(scoreOf(chain, ref))}</span>,
      sortValue: ({ chain }: { chain: InspectorChain }) => {
        const v = scoreOf(chain, ref);
        return Number.isFinite(v) ? (ref.lowerIsBetter ? v : -v) : null;
      },
    })),
    {
      key: "sd",
      header: ctx.strings.foldSd,
      width: "72px",
      align: "end",
      cell: ({ chain }) => <span className="n4wb-muted">{formatValue(foldStats(chain, ctx.ref)?.sd)}</span>,
      sortValue: ({ chain }) => foldStats(chain, ctx.ref)?.sd ?? null,
    },
    { key: "time", header: "Fit", width: "70px", align: "end", cell: ({ chain }) => formatDuration(chain.fitTimeMs), sortValue: ({ chain }) => chain.fitTimeMs ?? null },
  ];
  return (
    <VirtualTable
      rows={rows}
      columns={columns}
      rowKey={({ chain }) => chain.id}
      isSelected={({ row }) => selected.has(row)}
      isActive={({ row }) => row === ctx.hoverRow}
      onRowHover={(entry) => ctx.setHoverRow(entry?.row ?? null)}
      onRowClick={({ row }, event) => ctx.setSelected(combineSelection(ctx.selected, [row], selectionModeFromModifiers(event)))}
      defaultSort={{ key: "rank", dir: "asc" }}
      ariaLabel="Leaderboard"
    />
  );
}

/** Role-colored step chips (the chain's pipeline at a glance). */
export function StepChips({ chain, highlight }: { chain: InspectorChain; highlight?: ReadonlySet<string> | undefined }): ReactNode {
  return (
    <ol className="n4ins-steps">
      {chain.steps.map((step, i) => (
        <li key={`${step.token}-${i}`} className={cx("n4ins-step", highlight?.has(step.token) && "is-diff")} style={{ ["--role" as string]: roleColor(step.role) }}>
          <span className="n4ins-step-role">{step.role}</span>
          <span className="n4ins-step-token">{step.label ?? step.token}</span>
        </li>
      ))}
    </ol>
  );
}
