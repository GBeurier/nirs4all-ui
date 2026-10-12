/**
 * View bodies of the Playground capsule. Each view reads the shared
 * {@link PlaygroundViewContext} (frames, colors, selection, hover) so every
 * gesture in one view is reflected in all others.
 */

import { useMemo, useState } from "react";

import { cx } from "../workbench/_cx.js";
import type { ColorMapping, RowColumn } from "../workbench/colorBy.js";
import { Button, Chip, SearchInput } from "../workbench/controls.js";
import { DistributionView } from "../workbench/DistributionView.js";
import { formatPercent, formatValue } from "../workbench/format.js";
import { resolveIcons, type WorkbenchIcons } from "../workbench/icons.js";
import { columnCorrelation, type SpectraMatrix } from "../workbench/matrix.js";
import { ProfileView, type ProfileSeries } from "../workbench/ProfileView.js";
import { ScatterView, type ScatterGuide } from "../workbench/ScatterView.js";
import { selectionModeFromModifiers, combineSelection, type Selection } from "../workbench/selection.js";
import { SpectraView, type SpectraBandGroup, type SpectraBandKind, type SpectraDisplayMode } from "../workbench/SpectraView.js";
import { VirtualTable, type VirtualColumn } from "../workbench/VirtualTable.js";
import type { PlaygroundStrings } from "./locale.js";
import { outputToSelection, sampleLabel, type PlaygroundFrame } from "./model.js";
import type { PlaygroundDataset, PlaygroundResult, PlaygroundTarget } from "./types.js";

export type SpectraCompareMode = "off" | "split" | "overlay" | "diff";

export interface PlaygroundViewContext {
  dataset: PlaygroundDataset;
  result: PlaygroundResult | null;
  frame: PlaygroundFrame;
  raw: PlaygroundFrame;
  /** Dataset row → output rows. */
  inverse: readonly Int32Array[];
  /** Output rows in scope. */
  scopeOut: readonly number[];
  /** Dataset rows in scope (null = all). */
  scopeSet: Set<number> | null;
  colorColumn: RowColumn | null;
  mapping: ColorMapping;
  colorsOut: { colors: string[]; groups: Int32Array };
  selection: Selection;
  selectedOut: Selection;
  hoverRow: number | null;
  hoverOut: number | null;
  setHoverRow: (row: number | null) => void;
  setSelection: (rows: Selection) => void;
  target: PlaygroundTarget | undefined;
  targetOut: Float64Array;
  strings: PlaygroundStrings;
  icons?: WorkbenchIcons | undefined;
  onCropRange?: ((range: readonly [number, number]) => void) | undefined;
}

/** Tooltip body for one output row. */
export function SampleTooltip({ ctx, outputRow }: { ctx: PlaygroundViewContext; outputRow: number }) {
  const row = ctx.frame.rows[outputRow] ?? outputRow;
  const target = ctx.target?.values[row];
  const colorValue = ctx.colorColumn?.values[row];
  return (
    <>
      <div className="n4wb-tip-title">
        <span className="n4wb-legend-swatch" style={{ background: ctx.mapping.colors[row] }} aria-hidden="true" />
        {sampleLabel(ctx.dataset, row)}
      </div>
      <dl className="n4wb-tip-grid">
        {ctx.target ? (
          <>
            <dt>{ctx.target.name}</dt>
            <dd>{typeof target === "number" ? formatValue(target) : String(target ?? "—")}</dd>
          </>
        ) : null}
        {ctx.dataset.partition ? (
          <>
            <dt>Partition</dt>
            <dd>{ctx.dataset.partition[row] ?? "—"}</dd>
          </>
        ) : null}
        {ctx.colorColumn && !ctx.colorColumn.key.startsWith("target:") && ctx.colorColumn.key !== "partition" ? (
          <>
            <dt>{ctx.colorColumn.label}</dt>
            <dd>{typeof colorValue === "number" ? formatValue(colorValue) : String(colorValue ?? "—")}</dd>
          </>
        ) : null}
      </dl>
    </>
  );
}

function bandGroupsFor(ctx: PlaygroundViewContext, frame: PlaygroundFrame, scope: readonly number[]): SpectraBandGroup[] | undefined {
  const legend = ctx.mapping.legend;
  if (!legend || legend.kind !== "categorical") return undefined;
  const byGroup = new Map<number, number[]>();
  for (const o of scope) {
    const row = frame.rows[o]!;
    const g = ctx.mapping.groups[row] ?? 0;
    const bucket = byGroup.get(g);
    if (bucket) bucket.push(o);
    else byGroup.set(g, [o]);
  }
  return legend.entries
    .map((entry, index) => ({ key: entry.value, color: entry.color, rows: byGroup.get(index) ?? [] }))
    .filter((g) => g.rows.length > 0);
}

/** Map a dataset-row selection + hover into another frame's rows. */
function frameSelection(ctx: PlaygroundViewContext, frame: PlaygroundFrame) {
  if (frame === ctx.frame) return { selected: ctx.selectedOut, hover: ctx.hoverOut };
  // The raw frame uses identity rows.
  return { selected: ctx.selection, hover: ctx.hoverRow };
}

function scopeFor(ctx: PlaygroundViewContext, frame: PlaygroundFrame): number[] {
  if (frame === ctx.frame) return ctx.scopeOut as number[];
  const out: number[] = [];
  frame.rows.forEach((row, o) => {
    if (!ctx.scopeSet || ctx.scopeSet.has(row)) out.push(o);
  });
  return out;
}

function colorsFor(ctx: PlaygroundViewContext, frame: PlaygroundFrame) {
  if (frame === ctx.frame) return ctx.colorsOut;
  return { colors: ctx.mapping.colors, groups: ctx.mapping.groups };
}

function SpectraPane({
  ctx,
  frame,
  matrix,
  mode,
  bandKind,
  ghost,
  yLabel,
  label,
}: {
  ctx: PlaygroundViewContext;
  frame: PlaygroundFrame;
  matrix: SpectraMatrix;
  mode: SpectraDisplayMode;
  bandKind: SpectraBandKind;
  ghost?: PlaygroundFrame | null;
  yLabel: string;
  label?: string;
}) {
  const scope = useMemo(() => scopeFor(ctx, frame), [ctx, frame]);
  const { selected, hover } = frameSelection(ctx, frame);
  const colors = colorsFor(ctx, frame);
  const bandGroups = useMemo(() => (mode === "bands" ? bandGroupsFor(ctx, frame, scope) : undefined), [mode, ctx, frame, scope]);
  const toDataset = (rows: readonly number[]) => (frame === ctx.frame ? outputToSelection(rows, frame) : [...rows]);
  return (
    <div className="n4wb-rel">
      {label ? <span className="n4wb-split-label">{label}</span> : null}
      <SpectraView
        matrix={matrix}
        wavelengths={frame.wavelengths}
        rows={scope}
        colors={colors.colors}
        groups={colors.groups}
        palette={ctx.mapping.palette}
        selected={selected}
        hoverRow={hover}
        mode={mode}
        bandKind={bandKind}
        bandGroups={bandGroups}
        ghost={ghost ? { matrix: ghost.matrix, wavelengths: ghost.wavelengths } : null}
        unit={frame.unit}
        yLabel={yLabel}
        onHover={(o) => ctx.setHoverRow(o === null ? null : frame.rows[o] ?? null)}
        onSelectionChange={(next) => ctx.setSelection(toDataset(next))}
        renderTooltip={(o) => (frame === ctx.frame ? <SampleTooltip ctx={ctx} outputRow={o} /> : <SampleTooltip ctx={{ ...ctx, frame }} outputRow={o} />)}
        icons={ctx.icons}
        ariaLabel={label ?? "Spectra"}
      />
    </div>
  );
}

export function SpectraBody({
  ctx,
  mode,
  bandKind,
  compare,
}: {
  ctx: PlaygroundViewContext;
  mode: SpectraDisplayMode;
  bandKind: SpectraBandKind;
  compare: SpectraCompareMode;
}) {
  const { frame, raw, strings } = ctx;
  const sameShape =
    frame.matrix.cols === raw.matrix.cols &&
    frame.matrix.rows === raw.matrix.rows &&
    frame.rows.every((row, i) => row === i);
  const diff = useMemo(() => {
    if (compare !== "diff" || !sameShape) return null;
    const data = new Float32Array(frame.matrix.data.length);
    for (let i = 0; i < data.length; i += 1) data[i] = frame.matrix.data[i]! - raw.matrix.data[i]!;
    return { rows: frame.matrix.rows, cols: frame.matrix.cols, data } satisfies SpectraMatrix;
  }, [compare, sameShape, frame, raw]);

  if (compare === "split") {
    return (
      <div className="n4wb-view-split">
        <SpectraPane ctx={ctx} frame={raw} matrix={raw.matrix} mode={mode} bandKind={bandKind} yLabel={raw.signal} label={strings.input} />
        <SpectraPane ctx={ctx} frame={frame} matrix={frame.matrix} mode={mode} bandKind={bandKind} yLabel={frame.signal} label={strings.output} />
      </div>
    );
  }
  if (compare === "diff") {
    if (!diff) return <p className="n4wb-note is-warning n4pg-inline-note">{strings.differenceUnavailable}</p>;
    return <SpectraPane ctx={ctx} frame={frame} matrix={diff} mode={mode} bandKind={bandKind} yLabel={`Δ ${frame.signal}`} label={`${strings.output} − ${strings.input}`} />;
  }
  return (
    <SpectraPane
      ctx={ctx}
      frame={frame}
      matrix={frame.matrix}
      mode={mode}
      bandKind={bandKind}
      ghost={compare === "overlay" && raw !== frame ? raw : null}
      yLabel={frame.signal}
    />
  );
}

/** Variance of finite values. */
function variance(values: ArrayLike<number>, rows: readonly number[]): { mean: number; variance: number } {
  let n = 0;
  let mean = 0;
  let m2 = 0;
  for (const row of rows) {
    const v = values[row]!;
    if (!Number.isFinite(v)) continue;
    n += 1;
    const d = v - mean;
    mean += d / n;
    m2 += d * (v - mean);
  }
  return { mean, variance: n > 1 ? m2 / (n - 1) : 0 };
}

const CHI2_2DF_95 = 5.991;

export function ScoresBody({ ctx, axes, showEllipse }: { ctx: PlaygroundViewContext; axes: readonly [number, number]; showEllipse: boolean }) {
  const projection = ctx.result?.projection;
  const coords = projection?.coordinates;
  const { xs, ys } = useMemo(() => {
    const n = coords?.length ?? 0;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      xs[i] = coords![i]![axes[0]] ?? Number.NaN;
      ys[i] = coords![i]![axes[1]] ?? Number.NaN;
    }
    return { xs, ys };
  }, [coords, axes]);
  if (!projection || !coords || coords.length !== ctx.frame.rows.length) return null;
  const label = (axis: number) => {
    const ratio = projection.explained?.[axis];
    const name = projection.method.toLowerCase() === "pca" ? `PC${axis + 1}` : `${projection.method.toUpperCase()} ${axis + 1}`;
    return ratio !== undefined ? `${name} (${formatPercent(ratio)})` : name;
  };
  const guides: ScatterGuide[] = [];
  if (showEllipse && projection.method.toLowerCase() === "pca") {
    const vx = variance(xs, ctx.scopeOut);
    const vy = variance(ys, ctx.scopeOut);
    guides.push({
      kind: "ellipse",
      cx: vx.mean,
      cy: vy.mean,
      rx: Math.sqrt(vx.variance * CHI2_2DF_95),
      ry: Math.sqrt(vy.variance * CHI2_2DF_95),
      label: ctx.strings.ellipse,
      tone: "accent",
    });
  }
  return (
    <ScatterView
      xs={xs}
      ys={ys}
      rows={ctx.scopeOut}
      colors={ctx.colorsOut.colors}
      groups={ctx.colorsOut.groups}
      palette={ctx.mapping.palette}
      selected={ctx.selectedOut}
      hoverRow={ctx.hoverOut}
      xLabel={label(axes[0])}
      yLabel={label(axes[1])}
      guides={guides}
      onHover={(o) => ctx.setHoverRow(o === null ? null : ctx.frame.rows[o] ?? null)}
      onSelectionChange={(next) => ctx.setSelection(outputToSelection(next, ctx.frame))}
      renderTooltip={(o) => <SampleTooltip ctx={ctx} outputRow={o} />}
      icons={ctx.icons}
      ariaLabel="Score plot"
    />
  );
}

export function TargetBody({ ctx, binCount }: { ctx: PlaygroundViewContext; binCount: number | undefined }) {
  const target = ctx.target;
  const values = useMemo(() => {
    if (!target) return [];
    return Array.from(ctx.frame.rows, (row) => target.values[row] ?? null);
  }, [target, ctx.frame]);
  if (!target) return null;
  const categorical = ctx.mapping.legend?.kind === "categorical";
  return (
    <DistributionView
      values={target.kind === "classification" ? values : (values as Array<number | null>).map((v) => (typeof v === "number" ? v : Number.NaN))}
      kind={target.kind === "classification" ? "categorical" : "numeric"}
      {...(target.classes ? { categories: target.classes } : {})}
      rows={ctx.scopeOut}
      stack={categorical ? { groups: ctx.colorsOut.groups, palette: ctx.mapping.palette } : null}
      selected={ctx.selectedOut}
      binCount={binCount}
      xLabel={target.unit ? `${target.name} (${target.unit})` : target.name}
      onSelectionChange={(next) => ctx.setSelection(outputToSelection(next, ctx.frame))}
      icons={ctx.icons}
      ariaLabel={`${target.name} distribution`}
    />
  );
}

export function OutliersBody({ ctx, logScale }: { ctx: PlaygroundViewContext; logScale: boolean }) {
  const outliers = ctx.result?.outliers;
  const { xs, ys } = useMemo(() => {
    if (!outliers) return { xs: new Float64Array(0), ys: new Float64Array(0) };
    const t = (v: number) => (logScale ? Math.log10(Math.max(v, 1e-12)) : v);
    return { xs: Float64Array.from(outliers.t2, t), ys: Float64Array.from(outliers.q, t) };
  }, [outliers, logScale]);
  if (!outliers || xs.length !== ctx.frame.rows.length) return null;
  const t = (v: number) => (logScale ? Math.log10(Math.max(v, 1e-12)) : v);
  const pct = outliers.confidence !== undefined ? ` ${Math.round(outliers.confidence * 100)} %` : "";
  const guides: ScatterGuide[] = [];
  if (outliers.t2Limit !== undefined) guides.push({ kind: "vline", x: t(outliers.t2Limit), label: `T²${pct}`, tone: "warning" });
  if (outliers.qLimit !== undefined) guides.push({ kind: "hline", y: t(outliers.qLimit), label: `Q${pct}`, tone: "warning" });
  const beyond = ctx.scopeOut.filter((o) => (outliers.t2Limit !== undefined && outliers.t2[o]! > outliers.t2Limit) || (outliers.qLimit !== undefined && outliers.q[o]! > outliers.qLimit));
  return (
    <>
      <ScatterView
        xs={xs}
        ys={ys}
        rows={ctx.scopeOut}
        colors={ctx.colorsOut.colors}
        groups={ctx.colorsOut.groups}
        palette={ctx.mapping.palette}
        selected={ctx.selectedOut}
        hoverRow={ctx.hoverOut}
        xLabel={logScale ? "log₁₀ Hotelling T²" : "Hotelling T²"}
        yLabel={logScale ? "log₁₀ Q residual" : "Q residual (SPE)"}
        guides={guides}
        onHover={(o) => ctx.setHoverRow(o === null ? null : ctx.frame.rows[o] ?? null)}
        onSelectionChange={(next) => ctx.setSelection(outputToSelection(next, ctx.frame))}
        renderTooltip={(o) => (
          <>
            <SampleTooltip ctx={ctx} outputRow={o} />
            <dl className="n4wb-tip-grid">
              <dt>T²</dt>
              <dd>{formatValue(outliers.t2[o]!)}</dd>
              <dt>Q</dt>
              <dd>{formatValue(outliers.q[o]!)}</dd>
            </dl>
          </>
        )}
        icons={ctx.icons}
        ariaLabel="Outlier map"
      />
      <footer className="n4wb-view-foot">
        <span>
          <strong className="n4wb-mono">{beyond.length}</strong> beyond limits
          {outliers.components !== undefined ? <span className="n4wb-muted"> · {outliers.components} comp.</span> : null}
        </span>
        {beyond.length > 0 ? (
          <Button variant="outline" onClick={() => ctx.setSelection(outputToSelection(beyond, ctx.frame))}>
            Select them
          </Button>
        ) : null}
      </footer>
    </>
  );
}

const COMPONENT_COLORS = ["#0d9488", "#4f46e5", "#d97706", "#e11d48", "#7c3aed"];

export function LoadingsBody({ ctx, components }: { ctx: PlaygroundViewContext; components: readonly number[] }) {
  const loadings = ctx.result?.loadings;
  if (!loadings || loadings.components.length === 0) return null;
  const series: ProfileSeries[] = components
    .filter((k) => k < loadings.components.length)
    .map((k) => ({
      id: `pc${k}`,
      label: `PC${k + 1}${loadings.explained?.[k] !== undefined ? ` · ${formatPercent(loadings.explained[k]!)}` : ""}`,
      values: loadings.components[k]!,
      color: COMPONENT_COLORS[k % COMPONENT_COLORS.length]!,
    }));
  const explained = loadings.explained ?? [];
  const maxExplained = Math.max(...explained, 0.0001);
  return (
    <>
      <ProfileView x={ctx.frame.wavelengths} series={series} xLabel={`Wavelength (${ctx.frame.unit})`} yLabel="Loading" icons={ctx.icons} ariaLabel="PCA loadings" />
      {explained.length > 0 ? (
        <footer className="n4wb-view-foot n4pg-scree" aria-label="Explained variance">
          {explained.slice(0, 10).map((ratio, k) => (
            <span key={k} className="n4pg-scree-bar" title={`PC${k + 1}: ${formatPercent(ratio)}`}>
              <span style={{ height: `${Math.max(4, (ratio / maxExplained) * 100)}%`, background: components.includes(k) ? COMPONENT_COLORS[k % COMPONENT_COLORS.length] : undefined }} />
              <small>{k + 1}</small>
            </span>
          ))}
          <span className="n4wb-muted">
            Σ {formatPercent(explained.slice(0, 10).reduce((s, r) => s + r, 0))}
          </span>
        </footer>
      ) : null}
    </>
  );
}

export function CorrelationBody({ ctx, showRaw }: { ctx: PlaygroundViewContext; showRaw: boolean }) {
  const [range, setRange] = useState<readonly [number, number] | null>(null);
  const target = ctx.target;
  const outputR = useMemo(() => columnCorrelation(ctx.frame.matrix, ctx.targetOut, ctx.scopeOut), [ctx.frame.matrix, ctx.targetOut, ctx.scopeOut]);
  const rawR = useMemo(() => {
    if (!showRaw || !target || ctx.raw === ctx.frame) return null;
    const y = Float64Array.from({ length: ctx.raw.matrix.rows }, (_, row) => {
      const v = target.values[row];
      return typeof v === "number" ? v : Number.NaN;
    });
    const scope: number[] = [];
    for (let row = 0; row < ctx.raw.matrix.rows; row += 1) if (!ctx.scopeSet || ctx.scopeSet.has(row)) scope.push(row);
    return columnCorrelation(ctx.raw.matrix, y, scope);
  }, [showRaw, target, ctx.raw, ctx.frame, ctx.scopeSet]);
  if (!target || target.kind !== "regression") return null;

  const best = (r: Float32Array, axis: readonly number[]) => {
    let at = -1;
    for (let i = 0; i < r.length; i += 1) if (Number.isFinite(r[i]!) && (at < 0 || Math.abs(r[i]!) > Math.abs(r[at]!))) at = i;
    return at < 0 ? null : { r: r[at]!, x: axis[at]! };
  };
  const bestOut = best(outputR, ctx.frame.wavelengths);
  const bestRaw = rawR ? best(rawR, ctx.raw.wavelengths) : null;
  const series: ProfileSeries[] = [];
  if (rawR) series.push({ id: "raw", label: `${ctx.strings.input}`, values: rawR, x: ctx.raw.wavelengths, color: "#94a3b8", dashed: true, width: 1.3 });
  series.push({ id: "out", label: ctx.strings.output, values: outputR, color: "#0d9488", width: 1.8, area: true });

  return (
    <>
      <ProfileView
        x={ctx.frame.wavelengths}
        series={series}
        yDomain={[-1, 1]}
        xLabel={`Wavelength (${ctx.frame.unit})`}
        yLabel={`r(λ, ${target.name})`}
        regions={range ? [{ from: range[0], to: range[1] }] : undefined}
        {...(ctx.onCropRange ? { onRangeSelect: (r: readonly [number, number]) => setRange(r) } : {})}
        icons={ctx.icons}
        ariaLabel="Wavelength correlation profile"
      />
      <footer className="n4wb-view-foot">
        {bestOut ? (
          <span>
            max |r| <strong className="n4wb-mono">{formatValue(Math.abs(bestOut.r))}</strong> @ {formatValue(bestOut.x, 1)} {ctx.frame.unit}
            {bestRaw ? <span className="n4wb-muted"> · {ctx.strings.input.toLowerCase()} {formatValue(Math.abs(bestRaw.r))}</span> : null}
          </span>
        ) : null}
        <span className="n4wb-header-grow" />
        {range && ctx.onCropRange ? (
          <Chip active onRemove={() => setRange(null)}>
            <button type="button" className="n4pg-link" onClick={() => { ctx.onCropRange?.(range); setRange(null); }}>
              {ctx.strings.cropTo(formatValue(range[0], 1), formatValue(range[1], 1))} → {ctx.strings.addCrop}
            </button>
          </Chip>
        ) : ctx.onCropRange ? (
          <span className="n4wb-muted">Drag along the axis to propose a crop</span>
        ) : null}
      </footer>
    </>
  );
}

export function FoldsBody({ ctx }: { ctx: PlaygroundViewContext }) {
  const folds = ctx.result?.folds;
  const target = ctx.target;
  if (!folds || folds.folds.length === 0) return null;
  const stats = (rows: readonly number[]) => {
    const values: number[] = [];
    for (const o of rows) {
      const v = target?.values[ctx.frame.rows[o]!];
      if (typeof v === "number") values.push(v);
    }
    if (values.length === 0) return null;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, values.length - 1));
    return { mean, sd };
  };
  const total = Math.max(...folds.folds.map((f) => f.train.length + f.test.length), 1);
  const selectedSet = new Set(ctx.selectedOut);
  const pick = (rows: readonly number[], event: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }) =>
    ctx.setSelection(combineSelection(ctx.selection, outputToSelection(rows, ctx.frame), selectionModeFromModifiers(event)));
  return (
    <div className="n4pg-folds">
      <div className="n4pg-folds-head">
        <span>{folds.splitter ?? (folds.kind === "cv" ? "Cross-validation" : "Hold-out")}</span>
        <span className="n4wb-muted">
          {folds.folds.length} {folds.kind === "cv" ? "folds" : "split"} · click a bar to select its samples
        </span>
      </div>
      <ul className="n4pg-fold-list">
        {folds.folds.map((fold) => {
          const trainStats = stats(fold.train);
          const testStats = stats(fold.test);
          const selTest = fold.test.filter((o) => selectedSet.has(o)).length;
          return (
            <li key={fold.label} className="n4pg-fold">
              <span className="n4pg-fold-label">{fold.label}</span>
              <span className="n4pg-fold-bar" style={{ width: `${((fold.train.length + fold.test.length) / total) * 100}%` }}>
                <button type="button" className="n4pg-fold-train" style={{ flexGrow: fold.train.length }} title={`train · ${fold.train.length}`} onClick={(e) => pick(fold.train, e)}>
                  {fold.train.length}
                </button>
                <button type="button" className="n4pg-fold-test" style={{ flexGrow: Math.max(fold.test.length, 1) }} title={`test · ${fold.test.length}`} onClick={(e) => pick(fold.test, e)}>
                  {fold.test.length}
                  {selTest > 0 ? <em> · {selTest} sel.</em> : null}
                </button>
              </span>
              {target?.kind === "regression" ? (
                <span className="n4pg-fold-stats n4wb-mono">
                  {trainStats ? `${formatValue(trainStats.mean)} ± ${formatValue(trainStats.sd)}` : "—"}
                  <span className="n4wb-muted"> │ </span>
                  {testStats ? `${formatValue(testStats.mean)} ± ${formatValue(testStats.sd)}` : "—"}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="n4pg-folds-legend">
        <span>
          <i className="n4pg-fold-swatch is-train" /> train
        </span>
        <span>
          <i className="n4pg-fold-swatch is-test" /> test / validation
        </span>
        {target?.kind === "regression" ? <span className="n4wb-muted">{target.name}: mean ± sd (train │ test)</span> : null}
      </div>
    </div>
  );
}

export function RepetitionsBody({ ctx }: { ctx: PlaygroundViewContext }) {
  const reps = ctx.result?.repetitions;
  const model = useMemo(() => {
    if (!reps) return null;
    const groups = new Map<string, number[]>();
    reps.groups.forEach((g, o) => {
      if (g === null) return;
      const bucket = groups.get(g);
      if (bucket) bucket.push(o);
      else groups.set(g, [o]);
    });
    const ordered = [...groups.entries()]
      .map(([g, rows]) => ({ g, rows, max: Math.max(...rows.map((o) => reps.distance[o] ?? 0)) }))
      .sort((a, b) => b.max - a.max);
    const xs = new Float64Array(reps.groups.length).fill(Number.NaN);
    ordered.forEach((entry, rank) => entry.rows.forEach((o) => (xs[o] = rank)));
    return { ordered, xs, ys: Float64Array.from(reps.distance) };
  }, [reps]);
  if (!reps || !model || model.xs.length !== ctx.frame.rows.length) return null;
  const flagged = reps.threshold !== undefined ? model.ordered.filter((e) => e.max > reps.threshold!).length : 0;
  return (
    <>
      <ScatterView
        xs={model.xs}
        ys={model.ys}
        rows={ctx.scopeOut}
        colors={ctx.colorsOut.colors}
        groups={ctx.colorsOut.groups}
        palette={ctx.mapping.palette}
        selected={ctx.selectedOut}
        hoverRow={ctx.hoverOut}
        xLabel="Replicate group (sorted by worst spread)"
        yLabel={`Distance to group (${reps.metric})`}
        formatX={() => ""}
        guides={reps.threshold !== undefined ? [{ kind: "hline", y: reps.threshold, label: "threshold", tone: "danger" }] : []}
        onHover={(o) => ctx.setHoverRow(o === null ? null : ctx.frame.rows[o] ?? null)}
        onSelectionChange={(next) => ctx.setSelection(outputToSelection(next, ctx.frame))}
        renderTooltip={(o) => (
          <>
            <SampleTooltip ctx={ctx} outputRow={o} />
            <dl className="n4wb-tip-grid">
              <dt>Group</dt>
              <dd>{reps.groups[o] ?? "—"}</dd>
              <dt>Distance</dt>
              <dd>{formatValue(reps.distance[o]!)}</dd>
            </dl>
          </>
        )}
        icons={ctx.icons}
        ariaLabel="Replicate spread"
      />
      <footer className="n4wb-view-foot">
        <span>
          <strong className="n4wb-mono">{model.ordered.length}</strong> groups
        </span>
        {reps.threshold !== undefined ? (
          <span>
            <strong className={cx("n4wb-mono", flagged > 0 && "n4pg-text-danger")}>{flagged}</strong> above threshold
          </span>
        ) : null}
      </footer>
    </>
  );
}

export function SamplesBody({ ctx }: { ctx: PlaygroundViewContext }) {
  const [query, setQuery] = useState("");
  const icon = resolveIcons(ctx.icons);
  const n = ctx.raw.matrix.rows;
  const presentRows = useMemo(() => {
    const present = new Set<number>(ctx.frame.rows);
    const q = query.trim().toLowerCase();
    const out: number[] = [];
    for (let row = 0; row < n; row += 1) {
      if (ctx.scopeSet && !ctx.scopeSet.has(row)) continue;
      if (q && !sampleLabel(ctx.dataset, row).toLowerCase().includes(q)) continue;
      out.push(row);
    }
    return { rows: out, present };
  }, [ctx.frame.rows, ctx.scopeSet, ctx.dataset, query, n]);
  const selectedSet = useMemo(() => new Set(ctx.selection), [ctx.selection]);
  const metadata = (ctx.dataset.metadata ?? []).slice(0, 4);
  const columns: VirtualColumn<number>[] = [
    {
      key: "id",
      header: ctx.strings.sample,
      width: "minmax(120px, 1.4fr)",
      cell: (row) => (
        <span className="n4pg-sample-cell">
          <span className="n4wb-legend-swatch" style={{ background: ctx.mapping.colors[row] }} aria-hidden="true" />
          {sampleLabel(ctx.dataset, row)}
          {!presentRows.present.has(row) ? <span className="n4pg-badge is-danger">removed</span> : null}
        </span>
      ),
      sortValue: (row) => sampleLabel(ctx.dataset, row),
    },
  ];
  if (ctx.target) {
    const target = ctx.target;
    columns.push({
      key: "target",
      header: target.name,
      width: "90px",
      align: "end",
      cell: (row) => {
        const v = target.values[row];
        return typeof v === "number" ? formatValue(v) : String(v ?? "—");
      },
      sortValue: (row) => {
        const v = target.values[row];
        return v === undefined ? null : v;
      },
    });
  }
  if (ctx.dataset.partition) {
    const partition = ctx.dataset.partition;
    columns.push({ key: "partition", header: "Partition", width: "86px", cell: (row) => partition[row] ?? "—", sortValue: (row) => partition[row] ?? null });
  }
  for (const column of metadata) {
    columns.push({
      key: column.key,
      header: column.label,
      width: "minmax(80px, 1fr)",
      align: column.kind === "continuous" ? "end" : "start",
      cell: (row) => {
        const v = column.values[row];
        return typeof v === "number" ? formatValue(v) : String(v ?? "—");
      },
      sortValue: (row) => column.values[row] ?? null,
    });
  }
  return (
    <div className="n4pg-samples">
      <div className="n4pg-samples-bar">
        <SearchInput value={query} onChange={setQuery} placeholder="Filter by sample id…" icon={icon.search} />
        <span className="n4wb-muted">{presentRows.rows.length.toLocaleString("en-US")} rows</span>
      </div>
      <VirtualTable
        rows={presentRows.rows}
        columns={columns}
        rowKey={(row) => row}
        isSelected={(row) => selectedSet.has(row)}
        isActive={(row) => row === ctx.hoverRow}
        onRowClick={(row, event) => {
          const mode = selectionModeFromModifiers(event);
          ctx.setSelection(mode === "replace" && selectedSet.size === 1 && selectedSet.has(row) ? [] : combineSelection(ctx.selection, [row], mode));
        }}
        onRowHover={(row) => ctx.setHoverRow(row)}
        ariaLabel="Samples"
        empty="No sample matches."
      />
    </div>
  );
}

/** Mean spectrum of the selection vs the rest of the scope (drawer mini chart). */
export function SelectionSpectrum({ ctx, height = 150 }: { ctx: PlaygroundViewContext; height?: number }) {
  const { frame, selectedOut, scopeOut, strings } = ctx;
  const series = useMemo((): ProfileSeries[] => {
    if (selectedOut.length === 0) return [];
    const selected = new Set(selectedOut);
    const rest = scopeOut.filter((o) => !selected.has(o));
    const meanOf = (rows: readonly number[]) => {
      const out = new Float32Array(frame.matrix.cols);
      if (rows.length === 0) return out.fill(Number.NaN);
      for (const o of rows) {
        const offset = o * frame.matrix.cols;
        for (let c = 0; c < frame.matrix.cols; c += 1) out[c] = out[c]! + frame.matrix.data[offset + c]!;
      }
      for (let c = 0; c < out.length; c += 1) out[c] = out[c]! / rows.length;
      return out;
    };
    return [
      { id: "rest", label: strings.rest, values: meanOf(rest), color: "#94a3b8", dashed: true, width: 1.4 },
      { id: "sel", label: strings.selection, values: meanOf(selectedOut), color: "#0d9488", width: 2 },
    ];
  }, [frame, selectedOut, scopeOut, strings]);
  if (series.length === 0) return null;
  return (
    <div className="n4pg-mini-chart" style={{ height }}>
      <ProfileView x={frame.wavelengths} series={series} zeroLine={false} xLabel={undefined} yLabel={undefined} icons={ctx.icons} ariaLabel={strings.meanSpectrum} />
    </div>
  );
}

/** Rows (dataset space) of each category of the color column within the selection. */
export function selectionBreakdown(ctx: PlaygroundViewContext): Array<{ value: string; color: string; selected: number; total: number }> {
  const legend = ctx.mapping.legend;
  if (!legend || legend.kind !== "categorical") return [];
  const selected = new Set(ctx.selection);
  const totals = new Array<number>(legend.entries.length).fill(0);
  const picked = new Array<number>(legend.entries.length).fill(0);
  const n = ctx.raw.matrix.rows;
  for (let row = 0; row < n; row += 1) {
    if (ctx.scopeSet && !ctx.scopeSet.has(row)) continue;
    const g = ctx.mapping.groups[row]!;
    if (g >= totals.length) continue;
    totals[g]! += 1;
    if (selected.has(row)) picked[g]! += 1;
  }
  return legend.entries.map((entry, i) => ({ value: entry.value, color: entry.color, selected: picked[i]!, total: totals[i]! }));
}
