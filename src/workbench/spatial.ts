/**
 * Pure hit-testing helpers for the canvas views: a uniform-grid point index
 * (nearest point / rectangle queries in O(cell) instead of O(n)), polygon
 * containment for lasso selection, and spectral decimation.
 */

export interface PixelPoint {
  x: number;
  y: number;
}

export interface GridIndex {
  cell: number;
  cols: number;
  rows: number;
  /** Row indices bucketed by cell. */
  buckets: Map<number, number[]>;
  xs: Float32Array;
  ys: Float32Array;
}

/** Bucket pixel-space points (NaN skipped) into square cells of `cell` px. */
export function buildGridIndex(xs: Float32Array, ys: Float32Array, width: number, height: number, cell = 24): GridIndex {
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < xs.length; i += 1) {
    const x = xs[i]!;
    const y = ys[i]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
    const key = cy * cols + cx;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(i);
    else buckets.set(key, [i]);
  }
  return { cell, cols, rows, buckets, xs, ys };
}

/** Nearest indexed point within `radius` px of `(x, y)`, optionally filtered. */
export function nearestPoint(
  index: GridIndex,
  x: number,
  y: number,
  radius = 10,
  accept?: (row: number) => boolean,
): number | null {
  const span = Math.ceil(radius / index.cell);
  const cx = Math.floor(x / index.cell);
  const cy = Math.floor(y / index.cell);
  let best: number | null = null;
  let bestDistance = radius * radius;
  for (let gy = cy - span; gy <= cy + span; gy += 1) {
    if (gy < 0 || gy >= index.rows) continue;
    for (let gx = cx - span; gx <= cx + span; gx += 1) {
      if (gx < 0 || gx >= index.cols) continue;
      const bucket = index.buckets.get(gy * index.cols + gx);
      if (!bucket) continue;
      for (const row of bucket) {
        if (accept && !accept(row)) continue;
        const dx = index.xs[row]! - x;
        const dy = index.ys[row]! - y;
        const distance = dx * dx + dy * dy;
        if (distance <= bestDistance) {
          bestDistance = distance;
          best = row;
        }
      }
    }
  }
  return best;
}

export interface PixelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function normalizeRect(rect: PixelRect): PixelRect {
  return {
    x0: Math.min(rect.x0, rect.x1),
    y0: Math.min(rect.y0, rect.y1),
    x1: Math.max(rect.x0, rect.x1),
    y1: Math.max(rect.y0, rect.y1),
  };
}

/** Indices of the points inside an axis-aligned pixel rectangle. */
export function pointsInRect(xs: Float32Array, ys: Float32Array, rect: PixelRect, accept?: (row: number) => boolean): number[] {
  const r = normalizeRect(rect);
  const out: number[] = [];
  for (let i = 0; i < xs.length; i += 1) {
    if (accept && !accept(i)) continue;
    const x = xs[i]!;
    const y = ys[i]!;
    if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) out.push(i);
  }
  return out;
}

/** Even-odd ray-casting containment test. */
export function pointInPolygon(x: number, y: number, polygon: readonly PixelPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1e-12) + a.x) inside = !inside;
  }
  return inside;
}

/** Indices of the points inside a lasso polygon (bbox prefilter first). */
export function pointsInPolygon(
  xs: Float32Array,
  ys: Float32Array,
  polygon: readonly PixelPoint[],
  accept?: (row: number) => boolean,
): number[] {
  if (polygon.length < 3) return [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of polygon) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const out: number[] = [];
  for (let i = 0; i < xs.length; i += 1) {
    if (accept && !accept(i)) continue;
    const x = xs[i]!;
    const y = ys[i]!;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    if (pointInPolygon(x, y, polygon)) out.push(i);
  }
  return out;
}

/**
 * Column indices to draw so a spectrum of `length` points keeps at most
 * ~`target` vertices. NIR spectra are smooth, so a uniform stride preserves
 * the shape; the last index is always kept so the curve reaches the axis end.
 */
export function decimationIndices(length: number, target: number): Uint32Array {
  if (length <= 0) return new Uint32Array(0);
  const count = Math.max(2, Math.min(length, Math.floor(target)));
  if (count >= length) return Uint32Array.from({ length }, (_, i) => i);
  const out = new Uint32Array(count);
  const step = (length - 1) / (count - 1);
  for (let i = 0; i < count; i += 1) out[i] = Math.round(i * step);
  return out;
}

/** Index of the axis value closest to `value` in a monotonic axis. */
export function nearestAxisIndex(axis: ArrayLike<number>, value: number): number {
  const n = axis.length;
  if (n === 0) return -1;
  const ascending = axis[n - 1]! >= axis[0]!;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const v = axis[mid]!;
    if (ascending ? v < value : v > value) lo = mid;
    else hi = mid;
  }
  return Math.abs(axis[lo]! - value) <= Math.abs(axis[hi]! - value) ? lo : hi;
}
