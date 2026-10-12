/**
 * View bodies of the Playground capsule. Each view reads the shared
 * {@link PlaygroundViewContext} (frames, colors, selection, hover) so every
 * gesture in one view is reflected in all others.
 */

import { useCallback, useMemo, useState } from "react";

import { cx } from "../workbench/_cx.js";
import type { ColorMapping, RowColumn } from "../workbench/colorBy.js";
import { Button, Chip, SearchInput } from "../workbench/controls.js";
import { DistributionView } from "../workbench/DistributionView.js";
import { formatPercent, formatValue } from "../workbench/format.js";
import { resolveIcons, type WorkbenchIcons } from "../workbench/icons.js";
import { CanvasPlot, type PlotGeometry } from "../workbench/CanvasPlot.js";
import { rampStops } from "../workbench/colorBy.js";
import { columnCorrelation, wavelengthStats, type SpectraMatrix } from "../workbench/matrix.js";
import { nearestAxisIndex, normalizeRect } from "../workbench/spatial.js";
import { rampAt } from "../viz/theme.js";
import { ProfileView, type ProfileSeries } from "../workbench/ProfileView.js";
import { Scatter3DView } from "../workbench/Scatter3DView.js";
import { ScatterView, type ScatterGuide } from "../workbench/ScatterView.js";
import { clickSelection, selectionModeFromModifiers, combineSelection, type Selection } from "../workbench/selection.js";
import { sampleRows, type SamplingStrategy } from "../workbench/sampling.js";
import { SpectraView, type SpectraBandGroup, type SpectraBandKind, type SpectraDisplayMode, type SpectraGhost, type SpectraStatLine } from "../workbench/SpectraView.js";
import { VirtualTable, type VirtualColumn } from "../workbench/VirtualTable.js";
import type { PlaygroundStrings } from "./locale.js";
import { outputToSelection, sampleLabel, type PlaygroundFrame } from "./model.js";
import type { PlaygroundDataset, PlaygroundProjection, PlaygroundRepetitions, PlaygroundResult, PlaygroundTarget, RepetitionMetric, RepetitionReference } from "./types.js";

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
  /** Continuous ramp of the user's color scheme (density rasters, heat maps). */
  densityStops: readonly string[];
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

function colorsFor(ctx: PlaygroundViewContext, frame: PlaygroundFrame) {
  if (frame === ctx.frame) return ctx.colorsOut;
  return { colors: ctx.mapping.colors, groups: ctx.mapping.groups };
}

export type SpectraOverlayStyle = "envelope" | "lines";

/** User options of the spectra view (owned by the capsule, persisted by hosts if they wish). */
export interface SpectraOptions {
  mode: SpectraDisplayMode;
  bandKind: SpectraBandKind;
  compare: SpectraCompareMode;
  /** `diff` compare: plot |output − input|. */
  absoluteDiff: boolean;
  /** How the input is drawn under the output in `overlay` compare. */
  overlayStyle: SpectraOverlayStyle;
  sampling: SamplingStrategy;
  /** Curves drawn in `lines` mode (0 = all). */
  sampleCount: number;
  seed: number;
  statLines: readonly SpectraStatLine[];
  /** Wavelength window (axis units), `null` = full range. */
  range: readonly [number, number] | null;
  lineWidth: number | null;
  lineOpacity: number | null;
  selectedOnly: boolean;
  /** `null` = automatic (reversed for wavenumbers). */
  invertX: boolean | null;
}

export const DEFAULT_SPECTRA_OPTIONS: SpectraOptions = {
  mode: "lines",
  bandKind: "meanStd",
  compare: "off",
  absoluteDiff: false,
  overlayStyle: "envelope",
  sampling: "random",
  sampleCount: 0,
  seed: 42,
  statLines: [],
  range: null,
  lineWidth: null,
  lineOpacity: null,
  selectedOnly: false,
  invertX: null,
};

/** Common NIR absorption regions offered as one-click wavelength windows (nm). */
export const NIR_REGIONS: ReadonlyArray<{ id: string; label: string; range: readonly [number, number] }> = [
  { id: "oh1", label: "O–H 1st overtone (water)", range: [1400, 1500] },
  { id: "ch1", label: "C–H 1st overtone", range: [1650, 1800] },
  { id: "water", label: "Water combination", range: [1900, 2000] },
  { id: "nh", label: "N–H combination (protein)", range: [2050, 2200] },
  { id: "ch", label: "C–H combination (lipid, starch)", range: [2250, 2400] },
];

function isWavenumber(unit: string): boolean {
  return /cm/i.test(unit);
}

function SpectraPane({
  ctx,
  frame,
  matrix,
  scope,
  curves,
  opts,
  ghost,
  yLabel,
  label,
}: {
  ctx: PlaygroundViewContext;
  frame: PlaygroundFrame;
  matrix: SpectraMatrix;
  scope: readonly number[];
  curves: readonly number[];
  opts: SpectraOptions;
  ghost?: SpectraGhost | null;
  yLabel: string;
  label?: string;
}) {
  const { selected, hover } = frameSelection(ctx, frame);
  const colors = colorsFor(ctx, frame);
  const bandGroups = useMemo(() => (opts.mode === "bands" ? bandGroupsFor(ctx, frame, scope) : undefined), [opts.mode, ctx, frame, scope]);
  const toDataset = (rows: readonly number[]) => (frame === ctx.frame ? outputToSelection(rows, frame) : [...rows]);
  return (
    <div className="n4wb-rel">
      {label ? <span className="n4wb-split-label">{label}</span> : null}
      <SpectraView
        matrix={matrix}
        wavelengths={frame.wavelengths}
        rows={scope}
        lineRows={curves}
        xRange={opts.range}
        lineWidth={opts.lineWidth ?? undefined}
        lineOpacity={opts.lineOpacity ?? undefined}
        statLines={opts.statLines}
        densityStops={ctx.densityStops}
        colors={colors.colors}
        groups={colors.groups}
        palette={ctx.mapping.palette}
        selected={selected}
        hoverRow={hover}
        mode={opts.mode}
        bandKind={opts.bandKind}
        bandGroups={bandGroups}
        ghost={ghost ?? null}
        unit={frame.unit}
        yLabel={yLabel}
        invertX={opts.invertX ?? isWavenumber(frame.unit)}
        onHover={(o) => ctx.setHoverRow(o === null ? null : frame.rows[o] ?? null)}
        onSelectionChange={(next) => ctx.setSelection(toDataset(next))}
        renderTooltip={(o) => (frame === ctx.frame ? <SampleTooltip ctx={ctx} outputRow={o} /> : <SampleTooltip ctx={{ ...ctx, frame }} outputRow={o} />)}
        icons={ctx.icons}
        ariaLabel={label ?? "Spectra"}
      />
    </div>
  );
}

/** Dataset rows of output rows, deduplicated in order (raw-frame rows). */
function datasetRowsOf(frame: PlaygroundFrame, outputRows: readonly number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const o of outputRows) {
    const row = frame.rows[o];
    if (row !== undefined && !seen.has(row)) {
      seen.add(row);
      out.push(row);
    }
  }
  return out;
}

/** Output rows in view and the subset drawn as curves, after "selected only" and subsampling. */
export function useSpectraRows(ctx: PlaygroundViewContext, opts: SpectraOptions) {
  return useMemo(() => {
    const selectedSet = new Set(ctx.selectedOut);
    const scope = opts.selectedOnly && selectedSet.size > 0 ? ctx.scopeOut.filter((o) => selectedSet.has(o)) : [...ctx.scopeOut];
    const curves = opts.sampleCount > 0 ? sampleRows(scope, opts.sampleCount, opts.sampling, { seed: opts.seed, values: ctx.targetOut, matrix: ctx.frame.matrix }) : scope;
    return { scope, curves };
  }, [ctx.scopeOut, ctx.selectedOut, ctx.targetOut, ctx.frame.matrix, opts.selectedOnly, opts.sampleCount, opts.sampling, opts.seed]);
}

export function SpectraBody({ ctx, opts }: { ctx: PlaygroundViewContext; opts: SpectraOptions }) {
  const { frame, raw, strings } = ctx;
  const { scope, curves } = useSpectraRows(ctx, opts);
  const sameShape =
    frame.matrix.cols === raw.matrix.cols &&
    frame.matrix.rows === raw.matrix.rows &&
    frame.rows.every((row, i) => row === i);
  const diff = useMemo(() => {
    if (opts.compare !== "diff" || !sameShape) return null;
    const data = new Float32Array(frame.matrix.data.length);
    for (let i = 0; i < data.length; i += 1) {
      const d = frame.matrix.data[i]! - raw.matrix.data[i]!;
      data[i] = opts.absoluteDiff ? Math.abs(d) : d;
    }
    return { rows: frame.matrix.rows, cols: frame.matrix.cols, data } satisfies SpectraMatrix;
  }, [opts.compare, opts.absoluteDiff, sameShape, frame, raw]);
  const rawScope = useMemo(() => datasetRowsOf(frame, scope), [frame, scope]);
  const rawCurves = useMemo(() => (curves === scope ? rawScope : datasetRowsOf(frame, curves)), [frame, curves, scope, rawScope]);

  if (opts.compare === "split") {
    return (
      <div className="n4wb-view-split">
        <SpectraPane ctx={ctx} frame={raw} matrix={raw.matrix} scope={rawScope} curves={rawCurves} opts={opts} yLabel={raw.signal} label={strings.input} />
        <SpectraPane ctx={ctx} frame={frame} matrix={frame.matrix} scope={scope} curves={curves} opts={opts} yLabel={frame.signal} label={strings.output} />
      </div>
    );
  }
  if (opts.compare === "diff") {
    if (!diff) return <p className="n4wb-note is-warning n4pg-inline-note">{strings.differenceUnavailable}</p>;
    return (
      <SpectraPane
        ctx={ctx}
        frame={frame}
        matrix={diff}
        scope={scope}
        curves={curves}
        opts={opts}
        yLabel={opts.absoluteDiff ? `|Δ ${frame.signal}|` : `Δ ${frame.signal}`}
        label={opts.absoluteDiff ? `|${strings.output} − ${strings.input}|` : `${strings.output} − ${strings.input}`}
      />
    );
  }
  const ghost: SpectraGhost | null =
    opts.compare === "overlay" && raw !== frame
      ? { matrix: raw.matrix, wavelengths: raw.wavelengths, ...(opts.overlayStyle === "lines" ? { rows: rawCurves } : {}) }
      : null;
  return <SpectraPane ctx={ctx} frame={frame} matrix={frame.matrix} scope={scope} curves={curves} opts={opts} ghost={ghost} yLabel={frame.signal} />;
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

/** Axis index meaning "the active numeric target" instead of a component. */
export const TARGET_AXIS = -1;

export type PointSizePreset = "auto" | "small" | "medium" | "large";

const POINT_SIZES: Record<Exclude<PointSizePreset, "auto">, number> = { small: 1.8, medium: 3.2, large: 5 };

export interface ScoresOptions {
  projection: "pca" | "umap";
  /** Component index per axis (x, y, z); {@link TARGET_AXIS} plots the target. */
  axes: readonly [number, number, number];
  view3d: boolean;
  ellipse: boolean;
  pointSize: PointSizePreset;
  /** Same scale on every axis (true geometry of the score space). */
  equalScale: boolean;
}

export const DEFAULT_SCORES_OPTIONS: ScoresOptions = {
  projection: "pca",
  axes: [0, 1, 2],
  view3d: false,
  ellipse: true,
  pointSize: "auto",
  equalScale: false,
};

function axisName(projection: PlaygroundProjection, axis: number, target: PlaygroundTarget | undefined): string {
  if (axis === TARGET_AXIS) return target ? `${target.name}${target.unit ? ` (${target.unit})` : ""}` : "Target";
  const ratio = projection.explained?.[axis];
  const name = projection.method.toLowerCase() === "pca" ? `PC${axis + 1}` : `${projection.method.toUpperCase()} ${axis + 1}`;
  return ratio !== undefined ? `${name} (${formatPercent(ratio)})` : name;
}

/** Ordinary least squares fit + Pearson r over finite pairs of `rows`. */
function linearFit(xs: ArrayLike<number>, ys: ArrayLike<number>, rows: readonly number[]) {
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (const row of rows) {
    const x = xs[row]!;
    const y = ys[row]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n += 1;
    sx += x;
    sy += y;
  }
  if (n < 3) return null;
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const row of rows) {
    const x = xs[row]!;
    const y = ys[row]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  if (sxx === 0 || syy === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r: sxy / Math.sqrt(sxx * syy) };
}

export function ScoresBody({ ctx, opts }: { ctx: PlaygroundViewContext; opts: ScoresOptions }) {
  const projection = ctx.result?.projection;
  const coords = projection?.coordinates;
  const [ax, ay, az] = opts.axes;
  const columns = useMemo(() => {
    const n = coords?.length ?? 0;
    const pick = (axis: number) => {
      if (axis === TARGET_AXIS) return ctx.targetOut.length === n ? ctx.targetOut : new Float64Array(n).fill(Number.NaN);
      const out = new Float64Array(n);
      for (let i = 0; i < n; i += 1) out[i] = coords![i]![axis] ?? Number.NaN;
      return out;
    };
    return { xs: pick(ax), ys: pick(ay), zs: pick(az) };
  }, [coords, ax, ay, az, ctx.targetOut]);
  if (!projection || !coords || coords.length !== ctx.frame.rows.length) return null;
  const pointSize = opts.pointSize === "auto" ? undefined : POINT_SIZES[opts.pointSize];
  const onHover = (o: number | null) => ctx.setHoverRow(o === null ? null : ctx.frame.rows[o] ?? null);
  const onSelectionChange = (next: Selection) => ctx.setSelection(outputToSelection(next, ctx.frame));
  const tooltip = (o: number) => <SampleTooltip ctx={ctx} outputRow={o} />;

  if (opts.view3d) {
    return (
      <Scatter3DView
        xs={columns.xs}
        ys={columns.ys}
        zs={columns.zs}
        rows={ctx.scopeOut}
        colors={ctx.colorsOut.colors}
        groups={ctx.colorsOut.groups}
        palette={ctx.mapping.palette}
        selected={ctx.selectedOut}
        hoverRow={ctx.hoverOut}
        labels={[axisName(projection, ax, ctx.target), axisName(projection, ay, ctx.target), axisName(projection, az, ctx.target)]}
        pointSize={pointSize}
        isotropic={opts.equalScale}
        onHover={onHover}
        onSelectionChange={onSelectionChange}
        renderTooltip={tooltip}
        icons={ctx.icons}
        ariaLabel="3D score plot"
      />
    );
  }

  const guides: ScatterGuide[] = [];
  const usesTarget = ax === TARGET_AXIS || ay === TARGET_AXIS;
  if (opts.ellipse && !usesTarget && projection.method.toLowerCase() === "pca") {
    const vx = variance(columns.xs, ctx.scopeOut);
    const vy = variance(columns.ys, ctx.scopeOut);
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
  const fit = usesTarget ? linearFit(columns.xs, columns.ys, ctx.scopeOut) : null;
  if (fit) guides.push({ kind: "line", slope: fit.slope, intercept: fit.intercept, label: `r = ${formatValue(fit.r)}`, tone: "accent" });
  return (
    <ScatterView
      xs={columns.xs}
      ys={columns.ys}
      rows={ctx.scopeOut}
      colors={ctx.colorsOut.colors}
      groups={ctx.colorsOut.groups}
      palette={ctx.mapping.palette}
      selected={ctx.selectedOut}
      hoverRow={ctx.hoverOut}
      xLabel={axisName(projection, ax, ctx.target)}
      yLabel={axisName(projection, ay, ctx.target)}
      equalAspect={opts.equalScale && !usesTarget}
      pointSize={pointSize}
      guides={guides}
      onHover={onHover}
      onSelectionChange={onSelectionChange}
      renderTooltip={tooltip}
      icons={ctx.icons}
      ariaLabel="Score plot"
    />
  );
}

export interface TargetOptions {
  bins: number | undefined;
  showMean: boolean;
  showMedian: boolean;
}

export const DEFAULT_TARGET_OPTIONS: TargetOptions = { bins: undefined, showMean: true, showMedian: false };

export function TargetBody({ ctx, opts }: { ctx: PlaygroundViewContext; opts: TargetOptions }) {
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
      binCount={opts.bins}
      showMean={opts.showMean}
      showMedian={opts.showMedian}
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

export type RepetitionDisplay = "strip" | "histogram";
export type RepetitionSort = "worst" | "mean" | "name" | "order" | "size";
export type RepetitionThreshold = "host" | "p90" | "p95" | "p99" | "manual" | "off";

export interface RepetitionOptions {
  /** Replicate group column (metadata key); `null` = dataset default. */
  groupBy: string | null;
  metric: RepetitionMetric;
  reference: RepetitionReference;
  display: RepetitionDisplay;
  sort: RepetitionSort;
  log: boolean;
  /** Distance quantile guides (0–1). */
  quantiles: readonly number[];
  threshold: RepetitionThreshold;
  manualThreshold: number;
  /** Vertical min–max segment per group in the strip plot. */
  ranges: boolean;
  /** Only show groups with a replicate above the threshold. */
  flaggedOnly: boolean;
}

export const DEFAULT_REPETITION_OPTIONS: RepetitionOptions = {
  groupBy: null,
  metric: "euclidean",
  reference: "mean",
  display: "strip",
  sort: "worst",
  log: false,
  quantiles: [],
  threshold: "host",
  manualThreshold: 0,
  ranges: true,
  flaggedOnly: false,
};

export const REPETITION_METRIC_LABELS: Readonly<Record<RepetitionMetric, string>> = {
  euclidean: "Euclidean (RMS)",
  manhattan: "Manhattan",
  cosine: "Cosine",
  spectralAngle: "Spectral angle",
  correlation: "1 − Pearson r",
  mahalanobis: "Mahalanobis",
  pca: "PCA scores",
};

export const REPETITION_REFERENCE_LABELS: Readonly<Record<RepetitionReference, string>> = {
  mean: "Group mean",
  median: "Group median",
  leaveOneOut: "Mean of the others",
  first: "First replicate",
};

const QUANTILE_TONES = ["neutral", "neutral", "warning", "warning"] as const;

function sortedQuantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = (sorted.length - 1) * q;
  const lo = Math.floor(position);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (position - lo);
}

/** Replicate groups of the output rows, ranked, with the threshold in effect. */
export function repetitionModel(
  reps: PlaygroundRepetitions,
  scope: readonly number[],
  opts: RepetitionOptions,
  colorValue: (outputRow: number) => number,
) {
  const inScope = new Set(scope);
  const groups = new Map<string, number[]>();
  reps.groups.forEach((g, o) => {
    if (g === null || !inScope.has(o) || !Number.isFinite(reps.distance[o]!)) return;
    const bucket = groups.get(g);
    if (bucket) bucket.push(o);
    else groups.set(g, [o]);
  });
  const sorted = scope.map((o) => reps.distance[o]!).filter(Number.isFinite).sort((a, b) => a - b);
  const threshold =
    opts.threshold === "host"
      ? reps.threshold
      : opts.threshold === "manual"
        ? opts.manualThreshold
        : opts.threshold === "off"
          ? undefined
          : sortedQuantile(sorted, opts.threshold === "p90" ? 0.9 : opts.threshold === "p95" ? 0.95 : 0.99);
  let entries = [...groups.entries()].map(([g, rows], order) => {
    const distances = rows.map((o) => reps.distance[o]!);
    const max = Math.max(...distances);
    return {
      g,
      rows,
      order,
      max,
      min: Math.min(...distances),
      mean: distances.reduce((s, d) => s + d, 0) / distances.length,
      color: rows.reduce((s, o) => s + colorValue(o), 0) / rows.length,
      flagged: threshold !== undefined && max > threshold,
    };
  });
  if (opts.flaggedOnly && threshold !== undefined) entries = entries.filter((e) => e.flagged);
  const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const compare: Record<RepetitionSort, (a: (typeof entries)[number], b: (typeof entries)[number]) => number> = {
    worst: (a, b) => b.max - a.max,
    mean: (a, b) => b.mean - a.mean,
    name: (a, b) => natural.compare(a.g, b.g),
    order: (a, b) => a.order - b.order,
    size: (a, b) => b.rows.length - a.rows.length || b.max - a.max,
  };
  entries.sort(compare[opts.sort]);
  const quantiles = opts.quantiles.map((q) => ({ q, value: sortedQuantile(sorted, q) }));
  return { entries, threshold, quantiles, sorted };
}

export function RepetitionsBody({ ctx, opts }: { ctx: PlaygroundViewContext; opts: RepetitionOptions }) {
  const reps = ctx.result?.repetitions;
  const model = useMemo(() => {
    if (!reps || reps.groups.length !== ctx.frame.rows.length) return null;
    const m = repetitionModel(reps, ctx.scopeOut, opts, (o) => ctx.targetOut[o] ?? Number.NaN);
    const xs = new Float64Array(reps.groups.length).fill(Number.NaN);
    const shown: number[] = [];
    m.entries.forEach((entry, rank) =>
      entry.rows.forEach((o) => {
        xs[o] = rank;
        shown.push(o);
      }),
    );
    return { ...m, xs, shown };
  }, [reps, ctx.frame.rows.length, ctx.scopeOut, ctx.targetOut, opts]);
  if (!reps || !model) return null;
  const scale = (v: number) => (opts.log ? Math.log10(Math.max(v, 1e-12)) : v);
  const ys = Float64Array.from(reps.distance, scale);
  const flaggedGroups = model.entries.filter((e) => e.flagged);
  const flaggedRows = model.threshold === undefined ? [] : model.shown.filter((o) => reps.distance[o]! > model.threshold!);
  const select = (rows: readonly number[]) => ctx.setSelection(outputToSelection(rows, ctx.frame));
  const yLabel = `${opts.log ? "log₁₀ " : ""}distance (${reps.metric})`;

  const guides: ScatterGuide[] = model.quantiles.map(({ q, value }, i) => ({
    kind: "hline" as const,
    y: scale(value),
    label: `P${Math.round(q * 100)}`,
    tone: QUANTILE_TONES[Math.min(i, QUANTILE_TONES.length - 1)]!,
  }));
  if (model.threshold !== undefined) guides.push({ kind: "hline", y: scale(model.threshold), label: "threshold", tone: "danger" });
  if (opts.ranges && opts.display === "strip" && model.entries.length <= 1500) {
    model.entries.forEach((entry, rank) => {
      if (entry.rows.length > 1) guides.push({ kind: "segment", x0: rank, y0: scale(entry.min), x1: rank, y1: scale(entry.max), tone: entry.flagged ? "danger" : "neutral" });
    });
  }

  const foot = (
    <footer className="n4wb-view-foot">
      <span>
        <strong className="n4wb-mono">{model.entries.length}</strong> groups · median <strong className="n4wb-mono">{formatValue(sortedQuantile(model.sorted, 0.5))}</strong>
      </span>
      {model.threshold !== undefined ? (
        <span>
          <strong className={cx("n4wb-mono", flaggedGroups.length > 0 && "n4pg-text-danger")}>{flaggedGroups.length}</strong> flagged
        </span>
      ) : null}
      <span className="n4wb-header-grow" />
      {flaggedRows.length > 0 ? (
        <>
          <span className="n4wb-muted">select</span>
          <Button variant="outline" onClick={() => select(flaggedRows)} title="Select the replicates above the threshold">
            {flaggedRows.length} reps
          </Button>
          <Button variant="outline" onClick={() => select(flaggedGroups.flatMap((e) => e.rows))} title="Select every replicate of the flagged groups">
            {flaggedGroups.length} groups
          </Button>
        </>
      ) : null}
    </footer>
  );

  if (opts.display === "histogram") {
    return (
      <>
        <DistributionView
          values={ys}
          rows={model.shown}
          stack={ctx.mapping.legend?.kind === "categorical" ? { groups: ctx.colorsOut.groups, palette: ctx.mapping.palette } : null}
          selected={ctx.selectedOut}
          showMean={false}
          showMedian
          xLabel={yLabel}
          onSelectionChange={(next) => select(next)}
          icons={ctx.icons}
          ariaLabel="Replicate distance distribution"
        />
        {foot}
      </>
    );
  }
  return (
    <>
      <ScatterView
        xs={model.xs}
        ys={ys}
        rows={model.shown}
        colors={ctx.colorsOut.colors}
        groups={ctx.colorsOut.groups}
        palette={ctx.mapping.palette}
        selected={ctx.selectedOut}
        hoverRow={ctx.hoverOut}
        xLabel={`Replicate group (${{ worst: "worst spread first", mean: "highest mean first", name: "by name", order: "dataset order", size: "largest first" }[opts.sort]})`}
        yLabel={yLabel}
        formatX={() => ""}
        guides={guides}
        onHover={(o) => ctx.setHoverRow(o === null ? null : ctx.frame.rows[o] ?? null)}
        onSelectionChange={(next) => select(next)}
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
      {foot}
    </>
  );
}

export type VarianceMetric = "std" | "variance" | "cv" | "snr";

export interface VarianceOptions {
  metric: VarianceMetric;
  /** Also draw the profile of the pipeline input. */
  compareInput: boolean;
  /** Add the profile of the current selection. */
  selection: boolean;
}

export const DEFAULT_VARIANCE_OPTIONS: VarianceOptions = { metric: "std", compareInput: true, selection: true };

export const VARIANCE_METRIC_LABELS: Readonly<Record<VarianceMetric, string>> = {
  std: "Standard deviation",
  variance: "Variance",
  cv: "Coefficient of variation",
  snr: "Signal / noise (|μ| / σ)",
};

function varianceProfile(matrix: SpectraMatrix, rows: readonly number[], metric: VarianceMetric): Float32Array {
  const stats = wavelengthStats(matrix, rows);
  const out = new Float32Array(matrix.cols);
  for (let c = 0; c < matrix.cols; c += 1) {
    const sd = stats.std[c]!;
    const mean = Math.abs(stats.mean[c]!);
    out[c] = metric === "std" ? sd : metric === "variance" ? sd * sd : metric === "cv" ? (mean > 1e-12 ? sd / mean : Number.NaN) : sd > 1e-12 ? mean / sd : Number.NaN;
  }
  return out;
}

function meanOf(values: ArrayLike<number>): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i]!;
    if (Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  return n ? sum / n : Number.NaN;
}

/** Per-wavelength spread of the data: where the preprocessing removes or creates variability. */
export function VarianceBody({ ctx, opts }: { ctx: PlaygroundViewContext; opts: VarianceOptions }) {
  const { frame, raw, strings } = ctx;
  const output = useMemo(() => varianceProfile(frame.matrix, ctx.scopeOut, opts.metric), [frame.matrix, ctx.scopeOut, opts.metric]);
  const input = useMemo(() => {
    if (!opts.compareInput || raw === frame) return null;
    return varianceProfile(raw.matrix, datasetRowsOf(frame, ctx.scopeOut), opts.metric);
  }, [opts.compareInput, opts.metric, raw, frame, ctx.scopeOut]);
  const selection = useMemo(
    () => (opts.selection && ctx.selectedOut.length > 1 ? varianceProfile(frame.matrix, ctx.selectedOut, opts.metric) : null),
    [opts.selection, opts.metric, frame.matrix, ctx.selectedOut],
  );
  const series: ProfileSeries[] = [];
  if (input) series.push({ id: "in", label: strings.input, values: input, x: raw.wavelengths, color: "#94a3b8", dashed: true, width: 1.3 });
  series.push({ id: "out", label: strings.output, values: output, color: "#0d9488", width: 1.8, area: true });
  if (selection) series.push({ id: "sel", label: strings.selection, values: selection, color: "#e11d48", width: 1.5 });
  const avgOut = meanOf(output);
  const avgIn = input ? meanOf(input) : Number.NaN;
  return (
    <>
      <ProfileView
        x={frame.wavelengths}
        series={series}
        xLabel={`Wavelength (${frame.unit})`}
        yLabel={VARIANCE_METRIC_LABELS[opts.metric]}
        invertX={isWavenumber(frame.unit)}
        icons={ctx.icons}
        ariaLabel="Per-wavelength variability"
      />
      <footer className="n4wb-view-foot">
        <span>
          mean {opts.metric} <strong className="n4wb-mono">{formatValue(avgOut)}</strong>
          {Number.isFinite(avgIn) ? <span className="n4wb-muted"> · {strings.input.toLowerCase()} {formatValue(avgIn)}</span> : null}
        </span>
      </footer>
    </>
  );
}

export interface GroupMeansOptions {
  /** Show each group's ±1σ envelope. */
  bands: boolean;
  /** Subtract the overall mean spectrum (difference spectra). */
  centered: boolean;
}

export const DEFAULT_GROUP_MEANS_OPTIONS: GroupMeansOptions = { bands: true, centered: false };

/** Mean spectrum (± σ) of every category of the color-by column, or of target quintiles. */
export function GroupMeansBody({ ctx, opts }: { ctx: PlaygroundViewContext; opts: GroupMeansOptions }) {
  const { frame } = ctx;
  const series = useMemo((): ProfileSeries[] => {
    const legend = ctx.mapping.legend;
    let groups: Array<{ key: string; color: string; rows: number[] }>;
    if (legend?.kind === "categorical") {
      groups = bandGroupsFor(ctx, frame, ctx.scopeOut)?.map((g) => ({ ...g, rows: [...g.rows] })) ?? [];
    } else {
      // Continuous or no color-by: quintiles of the numeric target (or one global group).
      const valued = ctx.scopeOut.filter((o) => Number.isFinite(ctx.targetOut[o]!)).sort((a, b) => ctx.targetOut[a]! - ctx.targetOut[b]!);
      if (valued.length >= 10) {
        const stops = rampStops("sequential");
        groups = Array.from({ length: 5 }, (_, k) => {
          const rows = valued.slice(Math.floor((k * valued.length) / 5), Math.floor(((k + 1) * valued.length) / 5));
          const lo = ctx.targetOut[rows[0]!]!;
          const hi = ctx.targetOut[rows[rows.length - 1]!]!;
          return { key: `${formatValue(lo)}–${formatValue(hi)}`, color: rampAt(ctx.densityStops.length ? ctx.densityStops : stops, k / 4), rows };
        });
      } else groups = [{ key: "All", color: "#0d9488", rows: [...ctx.scopeOut] }];
    }
    const overall = opts.centered ? wavelengthStats(frame.matrix, ctx.scopeOut).mean : null;
    return groups
      .filter((g) => g.rows.length > 0)
      .map((g) => {
        const stats = wavelengthStats(frame.matrix, g.rows);
        const mean = new Float32Array(frame.matrix.cols);
        const lower = new Float32Array(frame.matrix.cols);
        const upper = new Float32Array(frame.matrix.cols);
        for (let c = 0; c < frame.matrix.cols; c += 1) {
          mean[c] = stats.mean[c]! - (overall ? overall[c]! : 0);
          lower[c] = mean[c]! - stats.std[c]!;
          upper[c] = mean[c]! + stats.std[c]!;
        }
        return { id: g.key, label: `${g.key} · ${g.rows.length}`, values: mean, color: toHex(g.color), width: 1.8, ...(opts.bands ? { band: { lower, upper } } : {}) };
      });
  }, [ctx, frame, opts.centered, opts.bands]);
  return (
    <ProfileView
      x={frame.wavelengths}
      series={series}
      zeroLine={opts.centered}
      xLabel={`Wavelength (${frame.unit})`}
      yLabel={opts.centered ? `${frame.signal} − overall mean` : frame.signal}
      invertX={isWavenumber(frame.unit)}
      icons={ctx.icons}
      ariaLabel="Group mean spectra"
    />
  );
}

/** `rgb(r, g, b)` (ramp output) → `#rrggbb` so profile envelopes can be tinted. */
function toHex(color: string): string {
  const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(color);
  if (!m) return color;
  return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;
}

export type HeatmapSort = "target" | "pc1" | "color" | "order";

export interface HeatmapOptions {
  sort: HeatmapSort;
  /** Subtract the mean spectrum (shows deviations with a diverging scale). */
  centered: boolean;
}

export const DEFAULT_HEATMAP_OPTIONS: HeatmapOptions = { sort: "target", centered: false };

/** Samples × wavelengths raster of the output, rows ordered by target, PC1 or color. */
export function HeatmapBody({ ctx, opts }: { ctx: PlaygroundViewContext; opts: HeatmapOptions }) {
  const { frame } = ctx;
  const matrix = frame.matrix;
  const ordered = useMemo(() => {
    const scope = [...ctx.scopeOut];
    const coords = ctx.result?.projection?.coordinates;
    const key = (o: number): number => {
      if (opts.sort === "target") return ctx.targetOut[o] ?? Number.NaN;
      if (opts.sort === "pc1") return coords && coords.length === frame.rows.length ? coords[o]![0] ?? Number.NaN : Number.NaN;
      if (opts.sort === "color") {
        const v = ctx.colorColumn?.values[frame.rows[o]!];
        return typeof v === "number" ? v : ctx.colorsOut.groups[o] ?? 0;
      }
      return o;
    };
    return scope.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (!Number.isFinite(ka)) return Number.isFinite(kb) ? 1 : a - b;
      if (!Number.isFinite(kb)) return -1;
      return ka - kb || a - b;
    });
  }, [ctx.scopeOut, ctx.result, ctx.targetOut, ctx.colorColumn, ctx.colorsOut.groups, frame.rows, opts.sort]);
  const rankOf = useMemo(() => {
    const out = new Int32Array(matrix.rows).fill(-1);
    ordered.forEach((o, rank) => (out[o] = rank));
    return out;
  }, [ordered, matrix.rows]);
  const center = useMemo(() => (opts.centered ? wavelengthStats(matrix, ordered).mean : null), [opts.centered, matrix, ordered]);
  const range = useMemo(() => {
    const sample: number[] = [];
    const step = Math.max(1, Math.floor((ordered.length * matrix.cols) / 20000));
    let k = 0;
    for (const o of ordered) {
      for (let c = 0; c < matrix.cols; c += 1) {
        k += 1;
        if (k % step) continue;
        const v = matrix.data[o * matrix.cols + c]! - (center ? center[c]! : 0);
        if (Number.isFinite(v)) sample.push(v);
      }
    }
    sample.sort((a, b) => a - b);
    if (sample.length === 0) return { lo: 0, hi: 1 };
    let lo = sample[Math.floor(sample.length * 0.01)]!;
    let hi = sample[Math.floor(sample.length * 0.99)]!;
    if (center) {
      const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
      lo = -m;
      hi = m;
    }
    return { lo, hi: hi > lo ? hi : lo + 1 };
  }, [ordered, matrix, center]);
  const stops = opts.centered ? rampStops("coolwarm") : ctx.densityStops;
  const lut = useMemo(
    () =>
      Array.from({ length: 256 }, (_, i) => {
        const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(rampAt(stops, i / 255));
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [13, 148, 136];
      }),
    [stops],
  );
  const xDomain = useMemo((): readonly [number, number] => {
    const w = frame.wavelengths;
    return w.length ? [Math.min(w[0]!, w[w.length - 1]!), Math.max(w[0]!, w[w.length - 1]!)] : [0, 1];
  }, [frame.wavelengths]);
  const n = ordered.length;

  const drawBase = useCallback(
    (g: CanvasRenderingContext2D, geo: PlotGeometry) => {
      if (n === 0 || typeof document === "undefined") return;
      const W = Math.max(1, Math.floor(geo.width));
      const H = Math.max(1, Math.floor(geo.height));
      const image = new ImageData(W, H);
      const colAt = new Int32Array(W);
      for (let px = 0; px < W; px += 1) colAt[px] = nearestAxisIndex(frame.wavelengths, geo.x.invert(geo.left + px + 0.5));
      const span = range.hi - range.lo;
      for (let py = 0; py < H; py += 1) {
        const rank = Math.floor(geo.y.invert(geo.top + py + 0.5));
        if (rank < 0 || rank >= n) continue;
        const offset = ordered[rank]! * matrix.cols;
        for (let px = 0; px < W; px += 1) {
          const c = colAt[px]!;
          const v = matrix.data[offset + c]! - (center ? center[c]! : 0);
          if (!Number.isFinite(v)) continue;
          const rgb = lut[Math.max(0, Math.min(255, Math.round(((v - range.lo) / span) * 255)))]!;
          const i = (py * W + px) * 4;
          image.data[i] = rgb[0]!;
          image.data[i + 1] = rgb[1]!;
          image.data[i + 2] = rgb[2]!;
          image.data[i + 3] = 255;
        }
      }
      const off = document.createElement("canvas");
      off.width = W;
      off.height = H;
      off.getContext("2d")?.putImageData(image, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(off, geo.left, geo.top, W, H);
    },
    [n, frame.wavelengths, range, ordered, matrix, center, lut],
  );
  const drawHighlight = useCallback(
    (g: CanvasRenderingContext2D, geo: PlotGeometry) => {
      const band = (o: number, color: string, full: boolean) => {
        const rank = rankOf[o]!;
        if (rank < 0) return;
        const y0 = geo.y(rank);
        const y1 = geo.y(rank + 1);
        g.fillStyle = color;
        if (full) g.strokeRect(geo.left + 0.5, Math.min(y0, y1), geo.width - 1, Math.max(1, Math.abs(y1 - y0)));
        else g.fillRect(geo.left, Math.min(y0, y1), 5, Math.max(1, Math.abs(y1 - y0)));
      };
      for (const o of ctx.selectedOut) band(o, "#0f172a", false);
      if (ctx.hoverOut !== null) {
        g.strokeStyle = "#0f172a";
        g.lineWidth = 1.5;
        band(ctx.hoverOut, "#0f172a", true);
      }
    },
    [rankOf, ctx.selectedOut, ctx.hoverOut],
  );
  const hit = (py: number, geo: PlotGeometry) => {
    const rank = Math.floor(geo.y.invert(py));
    return rank >= 0 && rank < n ? ordered[rank]! : null;
  };
  const legend = `linear-gradient(90deg, ${stops.join(", ")})`;
  return (
    <>
      <CanvasPlot
        xDomain={xDomain}
        yDomain={[n, 0]}
        xLabel={`Wavelength (${frame.unit})`}
        yLabel={`Samples (by ${opts.sort === "pc1" ? "PC1" : opts.sort === "color" ? ctx.colorColumn?.label ?? "color" : opts.sort === "target" ? ctx.target?.name ?? "target" : "order"})`}
        formatY={() => ""}
        invertX={isWavenumber(frame.unit)}
        zoomAxes="xy"
        tools={["select", "zoom", "pan"]}
        drawBase={drawBase}
        drawHighlight={drawHighlight}
        hitTest={(_, py, geo) => hit(py, geo)}
        hoverRow={ctx.hoverOut}
        onHover={(o) => ctx.setHoverRow(o === null ? null : frame.rows[o] ?? null)}
        onClickRow={(o, mods) => {
          const next = clickSelection(ctx.selectedOut, o, mods);
          if (next) ctx.setSelection(outputToSelection(next, frame));
        }}
        onSelectRect={(rect, geo, mods) => {
          const r = normalizeRect(rect);
          const a = Math.max(0, Math.floor(geo.y.invert(r.y0)));
          const b = Math.min(n - 1, Math.floor(geo.y.invert(r.y1)));
          const hits = ordered.slice(Math.min(a, b), Math.max(a, b) + 1);
          ctx.setSelection(outputToSelection(combineSelection(ctx.selectedOut, hits, selectionModeFromModifiers(mods)), frame));
        }}
        renderTooltip={(o) => <SampleTooltip ctx={ctx} outputRow={o} />}
        crosshair
        ariaLabel="Spectral heat map"
        description={`${n} samples × ${matrix.cols} wavelengths.`}
        icons={ctx.icons}
      />
      <footer className="n4wb-view-foot">
        <span className="n4wb-mono">{formatValue(range.lo)}</span>
        <span className="n4pg-heat-ramp" style={{ background: legend }} aria-hidden="true" />
        <span className="n4wb-mono">{formatValue(range.hi)}</span>
        <span className="n4wb-muted">{opts.centered ? `${frame.signal} − mean` : frame.signal} · 1–99 % clipped</span>
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
