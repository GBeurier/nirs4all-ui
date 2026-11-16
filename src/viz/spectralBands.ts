/**
 * Reference absorption bands for spectral charts: a static, literature-cited
 * catalog of commonly assigned near-infrared (NIR) absorption regions, unit
 * mapping to a chart's own spectral axis, and the pure layout helpers that
 * `SpectralImportanceChart` uses to overlay bands as labelled spans.
 *
 * Framework-free and deterministic. The catalog is reference annotation data,
 * not a model output or a scientific computation: it never attributes model
 * importance to a chemical constituent, it only shows where commonly cited
 * absorptions lie so a reader can relate an importance curve to them.
 *
 * Positions are approximate. Real band positions and widths depend on the
 * sample matrix, hydrogen bonding, temperature, moisture and instrument
 * resolution, and neighbouring assignments overlap heavily in the NIR. Each
 * entry is therefore a window (`startNm`–`endNm`) around commonly cited
 * centres rather than an exact line, and only well-established assignments
 * are listed. Sources:
 *
 * - J. Workman Jr. and L. Weyer, *Practical Guide and Spectral Atlas for
 *   Interpretive Near-Infrared Spectroscopy*, 2nd ed., CRC Press, 2012.
 * - B. G. Osborne, T. Fearn and P. H. Hindle, *Practical NIR Spectroscopy with
 *   Applications in Food and Beverage Analysis*, 2nd ed., Longman, 1993.
 * - H. W. Siesler, Y. Ozaki, S. Kawata and H. M. Heise (eds.), *Near-Infrared
 *   Spectroscopy: Principles, Instruments, Applications*, Wiley-VCH, 2002.
 *
 * Unit handling never guesses: an axis whose unit is not a recognised
 * wavelength or wavenumber unit (feature indices, empty or unknown units)
 * receives no bands, so nanometre positions are never invented for it.
 */

/** One band drawn on a chart, expressed in the chart's own axis unit. */
export interface SpectralBand {
  /** Lower bound in axis units (bands with `start > end` are normalized for display). */
  start: number;
  /** Upper bound in axis units. */
  end: number;
  /** Short display label, e.g. "O–H 1st overtone". */
  label: string;
  /** Chemical assignment shown in readouts and the data table. */
  assignment?: string;
  /** Grouping such as "water", "C–H", "protein" or "carbohydrate". */
  family?: string;
}

/** A catalog entry expressed in nanometres. */
export interface NirReferenceBand {
  startNm: number;
  endNm: number;
  label: string;
  assignment: string;
  family: string;
}

/**
 * Commonly cited NIR absorption regions (approximately 900–2360 nm), ordered by
 * wavelength. Windows are approximate and matrix-dependent; see the module
 * documentation for sources.
 */
export const NIR_REFERENCE_BANDS: readonly NirReferenceBand[] = Object.freeze([
  {
    startNm: 900,
    endNm: 940,
    label: "C–H 3rd overtone",
    assignment: "C–H stretch third overtone of CH₃/CH₂ groups (~910–930 nm)",
    family: "C–H",
  },
  {
    startNm: 950,
    endNm: 990,
    label: "O–H 2nd overtone",
    assignment: "Water O–H stretch second overtone (~970 nm)",
    family: "water",
  },
  {
    startNm: 1170,
    endNm: 1230,
    label: "C–H 2nd overtone",
    assignment: "C–H stretch second overtone of CH₃/CH₂ groups (~1195–1215 nm)",
    family: "C–H",
  },
  {
    startNm: 1360,
    endNm: 1420,
    label: "C–H 2ν+δ comb.",
    assignment: "C–H stretch overtone + C–H deformation combination of CH₃/CH₂ groups (~1360–1415 nm)",
    family: "C–H",
  },
  {
    startNm: 1400,
    endNm: 1460,
    label: "O–H 1st overtone",
    assignment: "O–H stretch first overtone of water and hydroxyl groups (~1410–1450 nm)",
    family: "O–H",
  },
  {
    startNm: 1490,
    endNm: 1540,
    label: "N–H 1st overtone",
    assignment: "N–H stretch first overtone of amides and amines, protein (~1500–1530 nm)",
    family: "protein",
  },
  {
    startNm: 1670,
    endNm: 1690,
    label: "Aromatic C–H",
    assignment: "Aromatic C–H stretch first overtone (~1685 nm)",
    family: "aromatic C–H",
  },
  {
    startNm: 1690,
    endNm: 1780,
    label: "C–H 1st overtone",
    assignment: "C–H stretch first overtone (CH₃ ~1695 nm; CH₂ ~1725 and ~1765 nm, prominent in lipids)",
    family: "C–H",
  },
  {
    startNm: 1900,
    endNm: 1960,
    label: "H₂O combination",
    assignment: "Water O–H stretch + H–O–H bend combination (~1940 nm)",
    family: "water",
  },
  {
    startNm: 2040,
    endNm: 2070,
    label: "N–H combination",
    assignment: "Protein N–H stretch + amide II combination (~2050–2060 nm)",
    family: "protein",
  },
  {
    startNm: 2080,
    endNm: 2120,
    label: "O–H + C–O comb.",
    assignment: "O–H bend + C–O stretch combination of carbohydrates, starch and cellulose (~2100 nm)",
    family: "carbohydrate",
  },
  {
    startNm: 2160,
    endNm: 2200,
    label: "Amide combination",
    assignment: "Protein amide combination band (N–H bend, C=O and C–N stretch; ~2180 nm)",
    family: "protein",
  },
  {
    startNm: 2280,
    endNm: 2360,
    label: "C–H ν+δ comb.",
    assignment: "C–H stretch + C–H deformation combinations of CH₂ (~2310 and ~2350 nm, prominent in lipids)",
    family: "C–H",
  },
]);

/** Spectral axis unit families the band overlay can map to. */
export type SpectralAxisUnitKind = "nm" | "um" | "cm-1" | "unknown";

const NM_UNITS = new Set(["nm", "nanometer", "nanometers", "nanometre", "nanometres"]);
const UM_UNITS = new Set([
  "µm",
  "μm",
  "um",
  "micrometer",
  "micrometers",
  "micrometre",
  "micrometres",
  "micron",
  "microns",
]);
const WAVENUMBER_UNITS = new Set([
  "cm-1",
  "cm^-1",
  "cm^{-1}",
  "cm⁻¹",
  "1/cm",
  "wavenumber",
  "wavenumbers",
]);

/**
 * Classify a spectral axis unit string. Recognises nanometres, micrometres and
 * wavenumbers (cm⁻¹); anything else — feature indices, empty or unknown units —
 * is `"unknown"`.
 */
export function spectralAxisUnitKind(unit: string | null | undefined): SpectralAxisUnitKind {
  if (typeof unit !== "string") return "unknown";
  // Typographic minus signs are accepted as hyphens ("cm−1"); whitespace is ignored.
  const normalized = unit.trim().toLowerCase().replace(/\s+/g, "").replace(/[−–]/g, "-");
  if (normalized.length === 0) return "unknown";
  if (NM_UNITS.has(normalized)) return "nm";
  if (UM_UNITS.has(normalized)) return "um";
  if (WAVENUMBER_UNITS.has(normalized)) return "cm-1";
  return "unknown";
}

function nmToAxis(kind: Exclude<SpectralAxisUnitKind, "unknown">, nm: number): number {
  if (kind === "nm") return nm;
  if (kind === "um") return nm / 1000;
  return 1e7 / nm;
}

/**
 * Map catalog bands (nanometres) to the chart's own axis unit and clip them to
 * `[axisMin, axisMax]` (either order). Wavenumber conversion (1e7 / nm)
 * reverses the order of the bounds, which are swapped back so that
 * `start < end`. Bands entirely outside the axis are dropped. Unknown units
 * return `[]`: no wavelength is ever assumed for feature indices.
 */
export function referenceBandsForAxis(
  unit: string | null | undefined,
  axisMin: number,
  axisMax: number,
  catalog: readonly NirReferenceBand[] = NIR_REFERENCE_BANDS,
): SpectralBand[] {
  const kind = spectralAxisUnitKind(unit);
  if (kind === "unknown" || !Number.isFinite(axisMin) || !Number.isFinite(axisMax)) return [];
  const low = Math.min(axisMin, axisMax);
  const high = Math.max(axisMin, axisMax);
  const out: SpectralBand[] = [];
  for (const band of catalog) {
    if (!(band.startNm > 0) || !(band.endNm > 0)) continue;
    const a = nmToAxis(kind, band.startNm);
    const b = nmToAxis(kind, band.endNm);
    const start = Math.max(Math.min(a, b), low);
    const end = Math.min(Math.max(a, b), high);
    if (!(end > start)) continue;
    out.push({ start, end, label: band.label, assignment: band.assignment, family: band.family });
  }
  return out.sort((x, y) => x.start - y.start || x.end - y.end);
}

/**
 * Bands with finite bounds that overlap `[min, max]`, normalized so that
 * `start <= end` and ordered along the axis. Bounds are kept as given (not
 * clipped) so readouts and tables report the band's own range.
 */
export function visibleSpectralBands(bands: readonly SpectralBand[], min: number, max: number): SpectralBand[] {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return bands
    .filter((band) => Number.isFinite(band.start) && Number.isFinite(band.end))
    .map((band) => ({ ...band, start: Math.min(band.start, band.end), end: Math.max(band.start, band.end) }))
    .filter((band) => band.end >= low && band.start <= high)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Bands whose inclusive range covers `x`. */
export function spectralBandsAt(bands: readonly SpectralBand[], x: number): SpectralBand[] {
  if (!Number.isFinite(x)) return [];
  return bands.filter((band) => x >= Math.min(band.start, band.end) && x <= Math.max(band.start, band.end));
}

/** Readout fragment naming the bands that cover the cursor, or `null` when none does. */
export function spectralBandReadout(bands: readonly SpectralBand[], bandsLabel: string): string | null {
  if (bands.length === 0) return null;
  const parts = bands.map((band) => (band.assignment ? `${band.label} (${band.assignment})` : band.label));
  return `${bandsLabel}: ${parts.join("; ")}`;
}

/** Horizontal pixel extent of a band span and its display label. */
export interface BandLabelSpan {
  left: number;
  right: number;
  label: string;
}

/** Where a band label is drawn: centre `x`, stacked `row` (0 = top) and possibly truncated `text`. */
export interface BandLabelPlacement {
  x: number;
  row: number;
  text: string;
}

export interface BandLabelLayoutOptions {
  /** Plot bounds the labels must stay within. */
  minX: number;
  maxX: number;
  /** Number of stacked label rows (default 2). */
  rows?: number;
  /** Estimated average glyph width in pixels (default 5.2, for ~9px text). */
  charWidth?: number;
  /** Spans narrower than this many pixels get no label (default 4). */
  minSpan?: number;
  /** Longer labels are truncated with an ellipsis (default 18 characters). */
  maxChars?: number;
  /** Minimum horizontal gap between labels on the same row (default 4). */
  gap?: number;
}

/**
 * Greedy, deterministic label placement: labels are centred on their span
 * (clamped inside the plot), processed left to right and put on the first row
 * where they do not overlap the previous label. Labels that fit no row, or
 * whose span is narrower than `minSpan`, are hidden (`null`); the span itself
 * and the readout/table still carry the information.
 */
export function layoutBandLabels(
  spans: readonly BandLabelSpan[],
  { minX, maxX, rows = 2, charWidth = 5.2, minSpan = 4, maxChars = 18, gap = 4 }: BandLabelLayoutOptions,
): Array<BandLabelPlacement | null> {
  const out: Array<BandLabelPlacement | null> = spans.map(() => null);
  const rowEnds = Array.from({ length: Math.max(0, Math.trunc(rows)) }, () => -Infinity);
  const order = spans
    .map((span, index) => ({ index, center: (span.left + span.right) / 2 }))
    .sort((a, b) => a.center - b.center || a.index - b.index);
  for (const { index, center } of order) {
    const span = spans[index]!;
    if (Math.abs(span.right - span.left) < minSpan || span.label.length === 0) continue;
    const text = span.label.length > maxChars ? `${span.label.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…` : span.label;
    const half = (text.length * charWidth) / 2;
    if (2 * half > maxX - minX) continue;
    const x = Math.min(Math.max(center, minX + half), maxX - half);
    const row = rowEnds.findIndex((end) => x - half >= end + gap);
    if (row < 0) continue;
    rowEnds[row] = x + half;
    out[index] = { x, row, text };
  }
  return out;
}
