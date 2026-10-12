/**
 * Pure camera math behind the 3D scatter: data → unit cube normalization, an
 * orbit camera (yaw / pitch / zoom / pan) with mild perspective, and screen
 * projection of every row. No DOM, so it is unit-tested directly.
 */

export interface Camera3D {
  /** Rotation around the vertical axis (radians). */
  yaw: number;
  /** Elevation (radians, clamped to ±89°). */
  pitch: number;
  /** Screen scale multiplier. */
  zoom: number;
  /** Screen-space pan in CSS pixels. */
  panX: number;
  panY: number;
}

export const DEFAULT_CAMERA_3D: Camera3D = { yaw: -0.62, pitch: 0.38, zoom: 1, panX: 0, panY: 0 };

/** Axis-aligned views (X·Y front, X·Z top, Z·Y side) plus the default oblique view. */
export const CAMERA_PRESETS_3D = {
  xy: { yaw: 0, pitch: 0 },
  xz: { yaw: 0, pitch: Math.PI / 2 - 1e-3 },
  yz: { yaw: Math.PI / 2, pitch: 0 },
  iso: { yaw: DEFAULT_CAMERA_3D.yaw, pitch: DEFAULT_CAMERA_3D.pitch },
} as const;

export type CameraPreset3D = keyof typeof CAMERA_PRESETS_3D;

const PITCH_LIMIT = Math.PI / 2 - 1e-3;
/** Camera distance in cube units; smaller = stronger perspective. */
const FOCAL = 6;

export function clampPitch(pitch: number): number {
  return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
}

export interface AxisNormalization {
  /** Data value at the cube center per axis. */
  center: [number, number, number];
  /** Data units per cube half-width per axis. */
  half: [number, number, number];
}

/**
 * Map each axis into [-1, 1] over the finite values of `rows`. With
 * `isotropic`, every axis shares the largest half-range so relative spreads
 * (e.g. explained variance of PCs) stay visible.
 */
export function normalizeAxes(
  axes: readonly [ArrayLike<number>, ArrayLike<number>, ArrayLike<number>],
  rows: readonly number[],
  isotropic: boolean,
): AxisNormalization {
  const center: [number, number, number] = [0, 0, 0];
  const half: [number, number, number] = [1, 1, 1];
  for (let a = 0; a < 3; a += 1) {
    let lo = Infinity;
    let hi = -Infinity;
    const values = axes[a]!;
    for (const row of rows) {
      const v = values[row]!;
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!Number.isFinite(lo)) continue;
    center[a] = (lo + hi) / 2;
    half[a] = (hi - lo) / 2 || 1;
  }
  if (isotropic) {
    const largest = Math.max(...half);
    half[0] = largest;
    half[1] = largest;
    half[2] = largest;
  }
  return { center, half };
}

export interface Viewport3D {
  width: number;
  height: number;
}

/** Rotate a cube-space point into camera space (x right, y up, z toward viewer). */
export function rotate(camera: Camera3D, x: number, y: number, z: number): [number, number, number] {
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);
  // Yaw around the vertical (y) axis, then pitch around the screen x axis.
  const x1 = cy * x + sy * z;
  const z1 = -sy * x + cy * z;
  const y2 = cp * y - sp * z1;
  const z2 = sp * y + cp * z1;
  return [x1, y2, z2];
}

/** Pixels per cube unit at depth 0. */
export function baseScale(viewport: Viewport3D, zoom: number): number {
  // The cube diagonal (√3) plus perspective must fit: keep the half-width well under the viewport.
  return (Math.min(viewport.width, viewport.height) / 2) * 0.46 * zoom;
}

/** Project one cube-space point to screen pixels; `depth` grows toward the viewer. */
export function projectPoint(camera: Camera3D, viewport: Viewport3D, x: number, y: number, z: number): { sx: number; sy: number; depth: number; scale: number } {
  const [rx, ry, rz] = rotate(camera, x, y, z);
  const perspective = FOCAL / (FOCAL - rz);
  const s = baseScale(viewport, camera.zoom) * perspective;
  return {
    sx: viewport.width / 2 + camera.panX + rx * s,
    sy: viewport.height / 2 + camera.panY - ry * s,
    depth: rz,
    scale: perspective,
  };
}

export interface Projected3D {
  /** Screen x / y per row (NaN when the row is not drawn). */
  sx: Float32Array;
  sy: Float32Array;
  /** Camera depth per row (larger = closer). */
  depth: Float32Array;
  /** Perspective factor per row (point size multiplier). */
  scale: Float32Array;
  /** Drawn rows sorted back to front. */
  order: Int32Array;
  depthRange: [number, number];
}

/** Project every row in `rows` and order them back to front for painting. */
export function projectRows(
  axes: readonly [ArrayLike<number>, ArrayLike<number>, ArrayLike<number>],
  rows: readonly number[],
  norm: AxisNormalization,
  camera: Camera3D,
  viewport: Viewport3D,
): Projected3D {
  const n = axes[0].length;
  const sx = new Float32Array(n).fill(Number.NaN);
  const sy = new Float32Array(n).fill(Number.NaN);
  const depth = new Float32Array(n).fill(Number.NaN);
  const scale = new Float32Array(n).fill(1);
  const drawn: number[] = [];
  let dLo = Infinity;
  let dHi = -Infinity;
  for (const row of rows) {
    const x = axes[0][row]!;
    const y = axes[1][row]!;
    const z = axes[2][row]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const p = projectPoint(
      camera,
      viewport,
      (x - norm.center[0]) / norm.half[0],
      (y - norm.center[1]) / norm.half[1],
      (z - norm.center[2]) / norm.half[2],
    );
    sx[row] = p.sx;
    sy[row] = p.sy;
    depth[row] = p.depth;
    scale[row] = p.scale;
    if (p.depth < dLo) dLo = p.depth;
    if (p.depth > dHi) dHi = p.depth;
    drawn.push(row);
  }
  drawn.sort((a, b) => depth[a]! - depth[b]!);
  return { sx, sy, depth, scale, order: Int32Array.from(drawn), depthRange: Number.isFinite(dLo) ? [dLo, dHi] : [0, 0] };
}

/** "Nice" tick values inside `[lo, hi]` (at most ~`count`). */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo;
  if (!(span > 0) || !Number.isFinite(span)) return [lo];
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => span / s <= count) ?? magnitude * 10;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}
