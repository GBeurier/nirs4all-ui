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
  /** Short assignment for compact labels, e.g. "water/hydroxyl". */
  shortAssignment?: string;
  /** Grouping such as "water", "C–H", "protein" or "carbohydrate". */
  family?: string;
}

/** A catalog entry expressed in nanometres. */
export interface NirReferenceBand {
  startNm: number;
  endNm: number;
  label: string;
  assignment: string;
  /** Short assignment for compact plot labels, e.g. "water/hydroxyl". */
  shortAssignment?: string;
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
    shortAssignment: "CH₃/CH₂",
    assignment: "C–H stretch third overtone of CH₃/CH₂ groups (~910–930 nm)",
    family: "C–H",
  },
  {
    startNm: 950,
    endNm: 990,
    label: "O–H 2nd overtone",
    shortAssignment: "water",
    assignment: "Water O–H stretch second overtone (~970 nm)",
    family: "water",
  },
  {
    startNm: 1170,
    endNm: 1230,
    label: "C–H 2nd overtone",
    shortAssignment: "CH₃/CH₂",
    assignment: "C–H stretch second overtone of CH₃/CH₂ groups (~1195–1215 nm)",
    family: "C–H",
  },
  {
    startNm: 1360,
    endNm: 1420,
    label: "C–H 2ν+δ comb.",
    shortAssignment: "CH₃/CH₂",
    assignment: "C–H stretch overtone + C–H deformation combination of CH₃/CH₂ groups (~1360–1415 nm)",
    family: "C–H",
  },
  {
    startNm: 1400,
    endNm: 1460,
    label: "O–H 1st overtone",
    shortAssignment: "water/hydroxyl",
    assignment: "O–H stretch first overtone of water and hydroxyl groups (~1410–1450 nm)",
    family: "O–H",
  },
  {
    startNm: 1490,
    endNm: 1540,
    label: "N–H 1st overtone",
    shortAssignment: "protein/amines",
    assignment: "N–H stretch first overtone of amides and amines, protein (~1500–1530 nm)",
    family: "protein",
  },
  {
    startNm: 1670,
    endNm: 1690,
    label: "Aromatic C–H",
    shortAssignment: "aromatics",
    assignment: "Aromatic C–H stretch first overtone (~1685 nm)",
    family: "aromatic C–H",
  },
  {
    startNm: 1690,
    endNm: 1780,
    label: "C–H 1st overtone",
    shortAssignment: "CH₃/CH₂, lipids",
    assignment: "C–H stretch first overtone (CH₃ ~1695 nm; CH₂ ~1725 and ~1765 nm, prominent in lipids)",
    family: "C–H",
  },
  {
    startNm: 1900,
    endNm: 1960,
    label: "H₂O combination",
    shortAssignment: "water",
    assignment: "Water O–H stretch + H–O–H bend combination (~1940 nm)",
    family: "water",
  },
  {
    startNm: 2040,
    endNm: 2070,
    label: "N–H combination",
    shortAssignment: "protein",
    assignment: "Protein N–H stretch + amide II combination (~2050–2060 nm)",
    family: "protein",
  },
  {
    startNm: 2080,
    endNm: 2120,
    label: "O–H + C–O comb.",
    shortAssignment: "carbohydrates/starch",
    assignment: "O–H bend + C–O stretch combination of carbohydrates, starch and cellulose (~2100 nm)",
    family: "carbohydrate",
  },
  {
    startNm: 2160,
    endNm: 2200,
    label: "Amide combination",
    shortAssignment: "protein",
    assignment: "Protein amide combination band (N–H bend, C=O and C–N stretch; ~2180 nm)",
    family: "protein",
  },
  {
    startNm: 2280,
    endNm: 2360,
    label: "C–H ν+δ comb.",
    shortAssignment: "CH₂, lipids",
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
    out.push({
      start,
      end,
      label: band.label,
      assignment: band.assignment,
      ...(band.shortAssignment ? { shortAssignment: band.shortAssignment } : {}),
      family: band.family,
    });
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

/** Compact label naming a band and its short assignment, e.g. "O–H 1st overtone · water/hydroxyl". */
export function bandAssignmentLabel(band: SpectralBand): string {
  const short = band.shortAssignment ?? band.family;
  return short ? `${band.label} · ${short}` : band.label;
}

/** The minimal region shape the band selection needs (a resolved spectral region satisfies it). */
export interface StrengthRegion {
  /** Region bounds in axis units (inclusive, either order). */
  start: number;
  end: number;
  /** Relative strength in [0, 1], e.g. |value| / max |value|. */
  strength: number;
}

/** A band that overlaps at least one important region. */
export interface ImportantBandMatch<R extends StrengthRegion = StrengthRegion> {
  band: SpectralBand;
  /** Important regions overlapping the band, in axis order. */
  regions: R[];
  /** Largest strength among `regions`. */
  maxStrength: number;
}

/** An important region with the bands overlapping it (empty when no catalogued band does). */
export interface ImportantRegionBands<R extends StrengthRegion = StrengthRegion> {
  region: R;
  bands: SpectralBand[];
}

export interface BandImportanceSelection<R extends StrengthRegion = StrengthRegion> {
  /** Bands overlapping an important region, in axis order. */
  bands: ImportantBandMatch<R>[];
  /** Important regions, strongest first (axis order breaks ties). */
  regions: ImportantRegionBands<R>[];
}

/**
 * Select the bands that overlap an important region: one whose strength is
 * positive and at least `threshold` (a fraction of the strongest region).
 * Region and band bounds are inclusive and may be given in either order, so
 * ascending and descending axes behave alike; a band touching a region at a
 * single coordinate counts as overlapping. Bands are returned as given (same
 * objects), in axis order, with their overlapping regions and the largest
 * strength among them. Selection is presentation only: an overlap names
 * candidate assignments for a region, it does not establish which constituent
 * drives a model.
 */
/**
 * Regions re-scored by the MAGNITUDE importance curve: each region's strength is the
 * largest finite `importance` value on axis points inside its inclusive bounds, divided
 * by the largest finite importance overall (0 when unavailable). Signed region values
 * can cancel (a region pushing some predictions up and others down averages near 0),
 * so band focus uses the magnitude curve (for example mean |SHAP|) instead.
 */
export function regionsWithImportanceStrength<R extends StrengthRegion>(
  regions: readonly R[],
  axis: readonly number[],
  importance: readonly number[],
): R[] {
  let peak = 0;
  for (const value of importance) if (Number.isFinite(value) && Math.abs(value) > peak) peak = Math.abs(value);
  return regions.map((region) => {
    const low = Math.min(region.start, region.end);
    const high = Math.max(region.start, region.end);
    let best = 0;
    for (let i = 0; i < Math.min(axis.length, importance.length); i += 1) {
      const x = axis[i]!;
      const v = importance[i]!;
      if (Number.isFinite(x) && Number.isFinite(v) && x >= low && x <= high && Math.abs(v) > best) best = Math.abs(v);
    }
    return { ...region, strength: peak > 0 ? best / peak : 0 };
  });
}

export function bandsForImportantRegions<R extends StrengthRegion>(
  bands: readonly SpectralBand[],
  regions: readonly R[],
  threshold = 0.5,
): BandImportanceSelection<R> {
  const important = regions
    .map((region, order) => ({ region, order, low: Math.min(region.start, region.end), high: Math.max(region.start, region.end) }))
    .filter(
      ({ region, low, high }) =>
        Number.isFinite(low) && Number.isFinite(high) && region.strength > 0 && region.strength >= threshold,
    );
  const byAxis = [...important].sort((a, b) => a.low - b.low || a.high - b.high || a.order - b.order);
  const perRegion = new Map(important.map((entry) => [entry, [] as SpectralBand[]]));
  const matches: Array<ImportantBandMatch<R> & { low: number; high: number }> = [];
  for (const band of bands) {
    if (!Number.isFinite(band.start) || !Number.isFinite(band.end)) continue;
    const low = Math.min(band.start, band.end);
    const high = Math.max(band.start, band.end);
    const hits = byAxis.filter((entry) => high >= entry.low && low <= entry.high);
    if (hits.length === 0) continue;
    for (const hit of hits) perRegion.get(hit)!.push(band);
    matches.push({
      band,
      regions: hits.map((hit) => hit.region),
      maxStrength: Math.max(...hits.map((hit) => hit.region.strength)),
      low,
      high,
    });
  }
  matches.sort((a, b) => a.low - b.low || a.high - b.high);
  return {
    bands: matches.map(({ band, regions: hit, maxStrength }) => ({ band, regions: hit, maxStrength })),
    regions: [...important]
      .sort((a, b) => b.region.strength - a.region.strength || a.low - b.low || a.order - b.order)
      .map((entry) => ({
        region: entry.region,
        bands: [...perRegion.get(entry)!].sort((a, b) => Math.min(a.start, a.end) - Math.min(b.start, b.end)),
      })),
  };
}

/** Horizontal pixel extent of a band span and its display label. */
export interface BandLabelSpan {
  left: number;
  right: number;
  label: string;
  /** Shorter label tried when `label` fits no row. */
  fallbackLabel?: string;
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
 * where they do not overlap the previous label; a span's `fallbackLabel` is
 * tried when its full label fits no row. Labels that fit no row, or
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
    if (Math.abs(span.right - span.left) < minSpan) continue;
    for (const label of span.fallbackLabel ? [span.label, span.fallbackLabel] : [span.label]) {
      if (label.length === 0) continue;
      const text = label.length > maxChars ? `${label.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…` : label;
      const half = (text.length * charWidth) / 2;
      if (2 * half > maxX - minX) continue;
      const x = Math.min(Math.max(center, minX + half), maxX - half);
      const row = rowEnds.findIndex((end) => x - half >= end + gap);
      if (row < 0) continue;
      rowEnds[row] = x + half;
      out[index] = { x, row, text };
      break;
    }
  }
  return out;
}
