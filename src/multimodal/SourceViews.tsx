import { memo, useMemo, type ReactElement } from "react";
import { SpectraPlot, type SpectraSeries } from "../viz/SpectraPlot.js";
import { modalityLabel, representationLabel, sourceTag } from "./catalog.js";
import {
  axisTitle,
  displaySubset,
  formatNumber,
  groupOf,
  imageDisplayRange,
  partitionOf,
  readRow,
  readValidityRow,
  rowWidth,
  shapeText,
  sourceRowIndex,
  targetValueOf,
} from "./data.js";
import type { MultimodalDataset, MultimodalSource } from "./types.js";

/**
 * Chart colours aligned with the canonical theme (assets/theme.css): teal
 * traces, rose for the selected sample, amber for secondary emphasis.
 */
export const N4MM_COLORS = {
  master: "#0D9488",
  red: "#E11D48",
  orange: "#D97706",
} as const;

// ---------------------------------------------------------------------------
// Sample navigator
// ---------------------------------------------------------------------------

export interface SampleNavigatorProps {
  dataset: MultimodalDataset;
  selectedSampleId: string | null;
  onSelectSample: (sampleId: string | null) => void;
}

/** Linked-selection hub: choose one sample; every source view follows. */
export function SampleNavigator({ dataset, selectedSampleId, onSelectSample }: SampleNavigatorProps) {
  const ids = dataset.sampleIds;
  const position = selectedSampleId === null ? -1 : ids.indexOf(selectedSampleId);
  const step = (delta: number) => {
    if (ids.length === 0) return;
    const next = position < 0 ? 0 : (position + delta + ids.length) % ids.length;
    onSelectSample(ids[next] ?? null);
  };
  const target = selectedSampleId ? targetValueOf(dataset, selectedSampleId) : null;
  const group = selectedSampleId ? groupOf(dataset, selectedSampleId) : null;
  const partition = selectedSampleId ? partitionOf(dataset, selectedSampleId) : null;
  return (
    <div className="n4mm-navigator">
      <label className="n4mm-field">
        <span className="n4mm-field__label">Selected sample</span>
        <select
          value={selectedSampleId ?? ""}
          onChange={(event) => onSelectSample(event.currentTarget.value === "" ? null : event.currentTarget.value)}
        >
          <option value="">— none —</option>
          {ids.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <div className="n4mm-navigator__steps">
        <button type="button" className="n4mm-button" data-variant="quiet" onClick={() => step(-1)} aria-label="Previous sample">
          ‹ Prev
        </button>
        <button type="button" className="n4mm-button" data-variant="quiet" onClick={() => step(1)} aria-label="Next sample">
          Next ›
        </button>
      </div>
      {selectedSampleId ? (
        <dl className="n4mm-facts n4mm-facts--inline" aria-live="polite">
          <div>
            <dt>Position</dt>
            <dd>
              {position + 1} / {ids.length}
            </dd>
          </div>
          <div>
            <dt>
              {dataset.target.name}
              {dataset.target.unit ? ` (${dataset.target.unit})` : ""}
            </dt>
            <dd>{formatNumber(target, 4)}</dd>
          </div>
          {group !== null ? (
            <div>
              <dt>Group</dt>
              <dd>{group}</dd>
            </div>
          ) : null}
          {partition !== null ? (
            <div>
              <dt>Partition</dt>
              <dd>{partition === "test" ? "held-out test" : "calibration"}</dd>
            </div>
          ) : null}
          <div>
            <dt>Present in</dt>
            <dd>
              {dataset.sources
                .map((source, index) => `${sourceTag(index)} ${source.sampleIds.includes(selectedSampleId) ? "yes" : "no"}`)
                .join(" · ")}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="n4mm-note">Select a sample to follow it across every source, the marker table and the gallery.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1-D signals
// ---------------------------------------------------------------------------

export interface SourceViewProps {
  dataset: MultimodalDataset;
  source: MultimodalSource;
  index: number;
  selectedSampleId: string | null;
  onSelectSample: (sampleId: string | null) => void;
}

function sourceHeading(source: MultimodalSource, index: number): string {
  return `${sourceTag(index)} ${source.label}`;
}

function valueLabelOf(source: MultimodalSource): string {
  if (source.valueLabel) return source.valueLabel;
  const declared = source.provenance?.["valueLabel"];
  return typeof declared === "string" && declared.length > 0 ? declared : "Signal (as supplied)";
}

/** One spectral source on its own axis and unit; never merged with another axis. */
export function SpectrumSourceView({ dataset, source, index, selectedSampleId, maxTraces = 24 }: SourceViewProps & { maxTraces?: number }) {
  const rows = useMemo(() => sourceRowIndex(source), [source]);
  const present = useMemo(() => dataset.sampleIds.filter((id) => rows.has(id)), [dataset.sampleIds, rows]);
  const selectedRow = selectedSampleId !== null ? rows.get(selectedSampleId) : undefined;
  const shown = useMemo(
    () => displaySubset(present, maxTraces, selectedRow !== undefined ? selectedSampleId : null),
    [present, maxTraces, selectedRow, selectedSampleId],
  );
  const width = rowWidth(source);
  const axisValues = useMemo(
    () => (source.axis && source.axis.values.length === width ? source.axis.values : Array.from({ length: width }, (_, i) => i + 1)),
    [source.axis, width],
  );
  const series = useMemo<SpectraSeries[]>(() => {
    const out: SpectraSeries[] = [];
    for (const id of shown) {
      if (id === selectedSampleId) continue;
      const row = rows.get(id);
      if (row === undefined) continue;
      out.push({ id, values: maskedRow(source, row), color: N4MM_COLORS.master, opacity: 0.28 });
    }
    if (selectedRow !== undefined && selectedSampleId !== null) {
      out.push({ id: selectedSampleId, label: selectedSampleId, values: maskedRow(source, selectedRow), color: N4MM_COLORS.red, opacity: 1 });
    }
    return out;
  }, [shown, rows, source, selectedRow, selectedSampleId]);

  const xLabel = source.axis ? axisTitle(source.axis) : "Variable index";
  const yLabel = valueLabelOf(source);
  const caption = `${sourceHeading(source, index)}: ${shown.length} of ${present.length} samples drawn (evenly spaced in identity order) on ${xLabel}.${
    selectedRow !== undefined ? ` Selected sample ${selectedSampleId} is the red trace drawn on top.` : selectedSampleId ? ` Selected sample ${selectedSampleId} is absent from this source.` : ""
  }`;

  return (
    <figure className="n4mm-view">
      <SourceViewHead source={source} index={index} />
      <SpectraPlot
        wavelengths={axisValues}
        series={series}
        unit={source.axis?.unit ?? ""}
        xLabel={xLabel}
        yLabel={yLabel}
        title={`${source.label} spectra`}
        description={caption}
        width={560}
        height={250}
      />
      <figcaption className="n4mm-caption">{caption}</figcaption>
      {selectedRow !== undefined && selectedSampleId !== null ? (
        <details className="n4mm-details">
          <summary>Exact values of {selectedSampleId}</summary>
          <div className="n4mm-scroll n4mm-scroll--short">
            <table className="n4mm-table n4mm-table--compact">
              <thead>
                <tr>
                  <th scope="col">{xLabel}</th>
                  <th scope="col" className="n4mm-num">
                    {yLabel}
                  </th>
                </tr>
              </thead>
              <tbody>
                {maskedRow(source, selectedRow).map((value, column) => (
                  <tr key={column}>
                    <td className="n4mm-mono">{formatNumber(axisValues[column], 6)}</td>
                    <td className="n4mm-num">{Number.isFinite(value) ? formatNumber(value, 5) : "NA"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </figure>
  );
}

function maskedRow(source: MultimodalSource, row: number): number[] {
  const values = readRow(source, row);
  const validity = readValidityRow(source, row);
  if (!validity) return values;
  return values.map((value, column) => (validity[column] ? value : Number.NaN));
}

function SourceViewHead({ source, index }: { source: MultimodalSource; index: number }) {
  return (
    <div className="n4mm-view__head">
      <h3 className="n4mm-view__title">
        <span className="n4mm-tag" data-source={index % 6}>
          {sourceTag(index)}
        </span>
        {source.label}
      </h3>
      <span className="n4mm-view__meta">
        {modalityLabel(source.modality)} · {representationLabel(source.representation)} · {shapeText(source.shape)}
        {source.axis ? ` · ${axisTitle(source.axis)}` : ""}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dosage / numeric tables
// ---------------------------------------------------------------------------

const DosageRow = memo(function DosageRow({
  sampleId,
  values,
  validity,
  selected,
  onSelect,
}: {
  sampleId: string;
  values: readonly number[];
  validity: readonly boolean[] | null;
  selected: boolean;
  onSelect: (sampleId: string) => void;
}) {
  return (
    <tr data-selected={selected || undefined}>
      <th scope="row">
        <button type="button" className="n4mm-rowbutton" aria-pressed={selected} onClick={() => onSelect(sampleId)}>
          {sampleId}
        </button>
      </th>
      {values.map((value, column) => {
        const missing = validity ? !validity[column] : !Number.isFinite(value);
        return (
          <td key={column} className="n4mm-num" data-dosage={missing ? "na" : String(value)}>
            {missing ? "NA" : formatNumber(value, 3)}
          </td>
        );
      })}
    </tr>
  );
});

/** Sample × marker table (dosage 0/1/2 or other numeric values); rows select the linked sample. */
export function DosageTable({ dataset, source, index, selectedSampleId, onSelectSample }: SourceViewProps) {
  const rows = useMemo(() => sourceRowIndex(source), [source]);
  const present = useMemo(() => dataset.sampleIds.filter((id) => rows.has(id)), [dataset.sampleIds, rows]);
  const table = useMemo(
    () =>
      present.map((id) => {
        const row = rows.get(id) ?? 0;
        return { id, values: readRow(source, row), validity: readValidityRow(source, row) };
      }),
    [present, rows, source],
  );
  const select = (id: string) => onSelectSample(id === selectedSampleId ? null : id);
  const selected = table.find((row) => row.id === selectedSampleId);
  const names = source.featureNames.length === rowWidth(source) ? source.featureNames : table[0]?.values.map((_, i) => `v${i + 1}`) ?? [];
  const declaredEncoding = source.provenance?.["encoding"];
  const encoding = typeof declaredEncoding === "string" ? declaredEncoding : null;
  return (
    <figure className="n4mm-view n4mm-view--wide">
      <SourceViewHead source={source} index={index} />
      <p className="n4mm-caption">
        {present.length} samples × {names.length} markers.{" "}
        {encoding ?? "Values are shown exactly as imported (biallelic dosage: count of the alternate allele, 0, 1 or 2)."} NA
        marks a missing call. Marker order is a file order, not a physical axis. Select a row to link the sample.
      </p>
      <div className="n4mm-scroll n4mm-scroll--table">
        <table className="n4mm-table n4mm-table--grid n4mm-dosage">
          <caption className="n4mm-sr-only">
            {source.label}: dosage per sample and marker
          </caption>
          <thead>
            <tr>
              <th scope="col">Sample</th>
              {names.map((name) => (
                <th key={name} scope="col" className="n4mm-num n4mm-mono">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          {selected ? (
            <tbody className="n4mm-dosage__pinned">
              <DosageRow sampleId={selected.id} values={selected.values} validity={selected.validity} selected onSelect={select} />
            </tbody>
          ) : null}
          <tbody>
            {table.map((row) => (
              <DosageRow
                key={row.id}
                sampleId={row.id}
                values={row.values}
                validity={row.validity}
                selected={row.id === selectedSampleId}
                onSelect={select}
              />
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export interface ImagePixelsProps {
  values: readonly number[];
  height: number;
  width: number;
  channels: number;
  range: readonly [number, number];
  size?: number;
  title: string;
}

function level(value: number, [low, high]: readonly [number, number]): number {
  if (!Number.isFinite(value)) return -1;
  const t = (value - low) / (high - low);
  return Math.round(Math.min(1, Math.max(0, t)) * 255);
}

/** HWC pixel grid drawn as crisp SVG cells; intensities mapped with a fixed range only. */
export const ImagePixels = memo(function ImagePixels({ values, height, width, channels, range, size = 96, title }: ImagePixelsProps) {
  const cells: ReactElement[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (y * width + x) * channels;
      let fill: string;
      if (channels >= 3) {
        const r = level(values[base] ?? Number.NaN, range);
        const g = level(values[base + 1] ?? Number.NaN, range);
        const b = level(values[base + 2] ?? Number.NaN, range);
        fill = r < 0 || g < 0 || b < 0 ? "#ff00ff" : `rgb(${r},${g},${b})`;
      } else {
        const v = level(values[base] ?? Number.NaN, range);
        fill = v < 0 ? "#ff00ff" : `rgb(${v},${v},${v})`;
      }
      cells.push(<rect key={base} x={x} y={y} width={1.02} height={1.02} fill={fill} />);
    }
  }
  return (
    <svg
      className="n4mm-pixels"
      viewBox={`0 0 ${width} ${height}`}
      width={size}
      height={(size * height) / Math.max(1, width)}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title}
      preserveAspectRatio="xMidYMid meet"
    >
      {cells}
    </svg>
  );
});

function imageGeometry(source: MultimodalSource): { height: number; width: number; channels: number } {
  const [height = 1, width = 1, channels = source.representation === "rgb_image" ? 3 : 1] = source.shape;
  return { height, width, channels };
}

/** Sample-aligned gallery with a large linked view of the selected sample. */
export function ImageGallery({
  dataset,
  source,
  index,
  selectedSampleId,
  onSelectSample,
  maxThumbnails = 24,
}: SourceViewProps & { maxThumbnails?: number }) {
  const rows = useMemo(() => sourceRowIndex(source), [source]);
  const present = useMemo(() => dataset.sampleIds.filter((id) => rows.has(id)), [dataset.sampleIds, rows]);
  const selectedRow = selectedSampleId !== null ? rows.get(selectedSampleId) : undefined;
  const shown = useMemo(
    () => displaySubset(present, maxThumbnails, selectedRow !== undefined ? selectedSampleId : null),
    [present, maxThumbnails, selectedRow, selectedSampleId],
  );
  const geometry = imageGeometry(source);
  const { range, declared } = imageDisplayRange(source);
  const rangeText = `${formatNumber(range[0])}–${formatNumber(range[1])}${declared ? " (declared)" : " (8-bit default)"}`;
  const selectedValues = useMemo(
    () => (selectedRow !== undefined ? maskedRow(source, selectedRow) : null),
    [selectedRow, source],
  );
  return (
    <figure className="n4mm-view n4mm-view--wide">
      <SourceViewHead source={source} index={index} />
      <p className="n4mm-caption">
        {shown.length} of {present.length} images shown ({geometry.height} × {geometry.width} pixels,{" "}
        {geometry.channels === 1 ? "grey" : `${geometry.channels} channels`}, HWC). Display range {rangeText}: no resizing,
        no per-image contrast stretch. Select an image to link the sample.
      </p>
      <div className="n4mm-gallery">
        {selectedValues && selectedSampleId ? (
          <div className="n4mm-gallery__focus">
            <ImagePixels
              values={selectedValues}
              {...geometry}
              range={range}
              size={200}
              title={`Image of selected sample ${selectedSampleId}`}
            />
            <span className="n4mm-gallery__label">
              Selected: <strong>{selectedSampleId}</strong> · {dataset.target.name} {formatNumber(targetValueOf(dataset, selectedSampleId), 4)}
            </span>
          </div>
        ) : null}
        <ul className="n4mm-gallery__grid">
          {shown.map((id) => {
            const row = rows.get(id);
            if (row === undefined) return null;
            const selected = id === selectedSampleId;
            return (
              <li key={id}>
                <button
                  type="button"
                  className="n4mm-thumb"
                  aria-pressed={selected}
                  onClick={() => onSelectSample(selected ? null : id)}
                >
                  <ImagePixels values={maskedRow(source, row)} {...geometry} range={range} size={72} title={`Image of ${id}`} />
                  <span className="n4mm-thumb__id">{id}</span>
                  {selected ? <span className="n4mm-thumb__flag">Selected</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {selectedValues && selectedSampleId ? (
        <details className="n4mm-details">
          <summary>Exact pixel values of {selectedSampleId}</summary>
          <div className="n4mm-scroll n4mm-scroll--short">
            <table className="n4mm-table n4mm-table--grid n4mm-table--compact">
              <thead>
                <tr>
                  <th scope="col">row \ col</th>
                  {Array.from({ length: geometry.width }, (_, x) => (
                    <th key={x} scope="col" className="n4mm-num">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: geometry.height }, (_, y) => (
                  <tr key={y}>
                    <th scope="row">{y}</th>
                    {Array.from({ length: geometry.width }, (_, x) => {
                      const base = (y * geometry.width + x) * geometry.channels;
                      const pixel = selectedValues.slice(base, base + geometry.channels);
                      return (
                        <td key={x} className="n4mm-num n4mm-mono">
                          {pixel.map((value) => (Number.isFinite(value) ? formatNumber(value, 4) : "NA")).join(",")}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export interface SourceViewsProps {
  dataset: MultimodalDataset;
  selectedSampleId: string | null;
  onSelectSample: (sampleId: string | null) => void;
}

/** Every source in recipe order, each with the view suited to its representation. */
export function SourceViews({ dataset, selectedSampleId, onSelectSample }: SourceViewsProps) {
  return (
    <div className="n4mm-views">
      {dataset.sources.map((source, index) => {
        const props = { dataset, source, index, selectedSampleId, onSelectSample };
        if (source.representation === "signal_1d") return <SpectrumSourceView key={source.id} {...props} />;
        if (source.representation === "tabular_numeric") return <DosageTable key={source.id} {...props} />;
        return <ImageGallery key={source.id} {...props} />;
      })}
    </div>
  );
}
