/**
 * Compact row-major spectra matrix used by the workbench canvases, plus the
 * per-wavelength display aggregates (mean, spread, quantile envelopes) the
 * spectra views draw for groups and selections.
 *
 * These are *display* summaries of already-computed host data (what is drawn
 * on screen), not scientific processing: preprocessing, PCA, models and
 * diagnostics stay in the host / nirs4all runtime.
 */

/** `rows × cols` values, row-major, one row per sample. */
export interface SpectraMatrix {
  rows: number;
  cols: number;
  data: Float32Array;
}

/** What hosts may pass: a ready matrix or one numeric array per sample. */
export type SpectraInput = SpectraMatrix | ReadonlyArray<ArrayLike<number>>;

export function isSpectraMatrix(input: SpectraInput): input is SpectraMatrix {
  return !Array.isArray(input) && (input as SpectraMatrix).data instanceof Float32Array;
}

/** Normalize host input to a matrix (no copy when already a matrix). */
export function toSpectraMatrix(input: SpectraInput): SpectraMatrix {
  if (isSpectraMatrix(input)) return input;
  const rows = input.length;
  const cols = rows > 0 ? input[0]!.length : 0;
  const data = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r += 1) {
    const row = input[r]!;
    const offset = r * cols;
    for (let c = 0; c < cols; c += 1) data[offset + c] = c < row.length ? row[c]! : Number.NaN;
  }
  return { rows, cols, data };
}

export function matrixRow(matrix: SpectraMatrix, row: number): Float32Array {
  return matrix.data.subarray(row * matrix.cols, (row + 1) * matrix.cols);
}

export interface WavelengthStats {
  count: number;
  mean: Float32Array;
  std: Float32Array;
  min: Float32Array;
  max: Float32Array;
}

/** Mean / sample-std / min / max per column over `rows` (all rows by default). */
export function wavelengthStats(matrix: SpectraMatrix, rows?: readonly number[]): WavelengthStats {
  const cols = matrix.cols;
  const mean = new Float32Array(cols);
  const m2 = new Float64Array(cols);
  const min = new Float32Array(cols).fill(Infinity);
  const max = new Float32Array(cols).fill(-Infinity);
  const counts = new Uint32Array(cols);
  const universe = rows ?? Array.from({ length: matrix.rows }, (_, i) => i);
  const meanAcc = new Float64Array(cols);
  for (const row of universe) {
    if (row < 0 || row >= matrix.rows) continue;
    const offset = row * cols;
    for (let c = 0; c < cols; c += 1) {
      const value = matrix.data[offset + c]!;
      if (!Number.isFinite(value)) continue;
      const n = (counts[c] = counts[c]! + 1);
      const delta = value - meanAcc[c]!;
      meanAcc[c] = meanAcc[c]! + delta / n;
      m2[c] = m2[c]! + delta * (value - meanAcc[c]!);
      if (value < min[c]!) min[c] = value;
      if (value > max[c]!) max[c] = value;
    }
  }
  const std = new Float32Array(cols);
  for (let c = 0; c < cols; c += 1) {
    const n = counts[c]!;
    mean[c] = n > 0 ? meanAcc[c]! : Number.NaN;
    std[c] = n > 1 ? Math.sqrt(m2[c]! / (n - 1)) : 0;
    if (n === 0) {
      min[c] = Number.NaN;
      max[c] = Number.NaN;
    }
  }
  return { count: universe.length, mean, std, min, max };
}

/**
 * Per-column quantiles over `rows`. Large groups are strided down to
 * `maxRows` rows first so the envelope stays interactive.
 */
export function wavelengthQuantiles(
  matrix: SpectraMatrix,
  quantiles: readonly number[],
  rows?: readonly number[],
  maxRows = 1500,
): Float32Array[] {
  const universe = rows ?? Array.from({ length: matrix.rows }, (_, i) => i);
  const stride = Math.max(1, Math.ceil(universe.length / maxRows));
  const sample: number[] = [];
  for (let i = 0; i < universe.length; i += stride) sample.push(universe[i]!);
  const out = quantiles.map(() => new Float32Array(matrix.cols));
  const column = new Float32Array(sample.length);
  for (let c = 0; c < matrix.cols; c += 1) {
    let n = 0;
    for (const row of sample) {
      const value = matrix.data[row * matrix.cols + c]!;
      if (Number.isFinite(value)) column[n++] = value;
    }
    const sorted = column.subarray(0, n).sort();
    quantiles.forEach((q, qi) => {
      if (n === 0) {
        out[qi]![c] = Number.NaN;
        return;
      }
      const pos = Math.max(0, Math.min(1, q)) * (n - 1);
      const lo = Math.floor(pos);
      const hi = Math.min(n - 1, lo + 1);
      out[qi]![c] = sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
    });
  }
  return out;
}

/** Finite min/max of a matrix restricted to `rows` and a column window. */
export function matrixExtent(
  matrix: SpectraMatrix,
  rows?: readonly number[],
  colStart = 0,
  colEnd = matrix.cols,
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  const visit = (row: number) => {
    const offset = row * matrix.cols;
    for (let c = colStart; c < colEnd; c += 1) {
      const value = matrix.data[offset + c]!;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  };
  if (rows) for (const row of rows) visit(row);
  else for (let row = 0; row < matrix.rows; row += 1) visit(row);
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

/**
 * Pearson correlation of every column with a per-row numeric vector `y`
 * (rows where `y` or the value is not finite are skipped per column). A
 * descriptive r(λ) profile, not a model.
 */
export function columnCorrelation(matrix: SpectraMatrix, y: ArrayLike<number>, rows?: readonly number[]): Float32Array {
  const universe = (rows ?? Array.from({ length: matrix.rows }, (_, i) => i)).filter((row) => Number.isFinite(y[row]!));
  const out = new Float32Array(matrix.cols).fill(Number.NaN);
  if (universe.length < 3) return out;
  let my = 0;
  for (const row of universe) my += y[row]!;
  my /= universe.length;
  let syy = 0;
  for (const row of universe) syy += (y[row]! - my) ** 2;
  if (syy <= 0) return out;
  const mx = new Float64Array(matrix.cols);
  for (const row of universe) {
    const offset = row * matrix.cols;
    for (let c = 0; c < matrix.cols; c += 1) mx[c] = mx[c]! + matrix.data[offset + c]!;
  }
  for (let c = 0; c < matrix.cols; c += 1) mx[c] = mx[c]! / universe.length;
  const sxy = new Float64Array(matrix.cols);
  const sxx = new Float64Array(matrix.cols);
  for (const row of universe) {
    const offset = row * matrix.cols;
    const dy = y[row]! - my;
    for (let c = 0; c < matrix.cols; c += 1) {
      const dx = matrix.data[offset + c]! - mx[c]!;
      sxy[c] = sxy[c]! + dx * dy;
      sxx[c] = sxx[c]! + dx * dx;
    }
  }
  for (let c = 0; c < matrix.cols; c += 1) out[c] = sxx[c]! > 0 ? sxy[c]! / Math.sqrt(sxx[c]! * syy) : Number.NaN;
  return out;
}
