// Engine numbers beyond the double range. Some ratios (validation-probe R² and skill)
// are published as `{significand, exponent, representation: "significand_times_2_pow_exponent"}`
// = significand × 2^exponent, exponent 0 meaning an ordinary JSON number. PURE: no React.
import type { Locale } from '../lab/locale.js';

export const SCALED_REPRESENTATION = 'significand_times_2_pow_exponent';

export type EngineNumber =
  | { kind: 'double'; value: number }
  | { kind: 'scaled'; significand: number; exponent: number };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads a plain finite number or a scaled `significand × 2^exponent` object; anything else is null. */
export function parseEngineNumber(value: unknown): EngineNumber | null {
  if (typeof value === 'number') return Number.isFinite(value) ? { kind: 'double', value } : null;
  if (!isRecord(value) || value.representation !== SCALED_REPRESENTATION) return null;
  const { significand, exponent } = value;
  if (typeof significand !== 'number' || !Number.isFinite(significand) || typeof exponent !== 'number' || !Number.isInteger(exponent)) return null;
  return exponent === 0 ? { kind: 'double', value: significand } : { kind: 'scaled', significand, exponent };
}

/** True when the value is a scaled engine number (whatever its exponent). */
export function isScaledEngineNumber(value: unknown): boolean {
  return isRecord(value) && value.representation === SCALED_REPRESENTATION;
}

/** Double value when representable, else null (never ±Infinity, never NaN). */
export function engineNumberToDouble(n: EngineNumber | null): number | null {
  if (!n) return null;
  if (n.kind === 'double') return n.value;
  // Two steps so an exponent near the limits does not overflow before the significand scales it.
  const half = Math.trunc(n.exponent / 2);
  const v = n.significand * 2 ** half * 2 ** (n.exponent - half);
  return Number.isFinite(v) && (v !== 0 || n.significand === 0) ? v : null;
}

const SUPERSCRIPT: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const sup = (k: number) => String(k).split('').map((c) => SUPERSCRIPT[c] ?? c).join('');
const MINUS = '−';

function decimal(m: number, digits: number, locale: Locale): string {
  return Number(m.toPrecision(digits)).toLocaleString(locale, { maximumSignificantDigits: digits });
}

/** Exact text of a scaled number, e.g. `−0,75 × 2¹¹⁰⁰`. */
export function formatEngineNumberExact(n: EngineNumber, locale: Locale = 'fr'): string {
  if (n.kind === 'double') return n.value.toLocaleString(locale, { maximumSignificantDigits: 17 });
  const sign = n.significand < 0 ? MINUS : '';
  return `${sign}${Math.abs(n.significand).toLocaleString(locale, { maximumSignificantDigits: 17 })} × 2${sup(n.exponent)}`;
}

/**
 * Display text: ordinary doubles with `digits` significant digits (exponent form outside
 * [1e-4, 1e6)) and values beyond the double range as `m × 10^k` rounded from their exact
 * decimal expansion (the exact `significand × 2^exponent` form is `formatEngineNumberExact`).
 * Never NaN or Infinity.
 */
export function formatEngineNumber(value: unknown, locale: Locale = 'fr', digits = 4): string | null {
  const n = parseEngineNumber(value);
  if (!n) return null;
  const v = engineNumberToDouble(n);
  if (v !== null) {
    if (v === 0) return '0';
    const abs = Math.abs(v);
    if (abs >= 1e-4 && abs < 1e6) return decimal(v, digits, locale).replace('-', MINUS);
    const k = Math.floor(Math.log10(abs));
    const m = v / 10 ** k;
    return `${decimal(m, digits, locale).replace('-', MINUS)} × 10${sup(k)}`;
  }
  // Out of the double range: |s| < 1 so s·2^53 is an exact integer and the decimal
  // expansion of s·2^e = (s·2^53)·2^(e−53) is exact with BigInt (never s * 2**e, which overflows).
  if (n.kind !== 'scaled' || n.significand === 0) return '0';
  return scientificFromDigits(exactDigits(n), n.significand < 0, digits, locale);
}

/** Decimal digits of |significand × 2^exponent| for exponent ≥ 53 (exact). */
function exactDigits(n: { significand: number; exponent: number }): string {
  const scaled = BigInt(Math.abs(n.significand) * 2 ** 53);
  return (n.exponent >= 53 ? scaled * 2n ** BigInt(n.exponent - 53) : scaled >> BigInt(53 - n.exponent)).toString();
}

/** `m × 10^k` from an exact digit string, rounded half up to `digits` significant digits. */
function scientificFromDigits(d: string, negative: boolean, digits: number, locale: Locale): string {
  let k = d.length - 1;
  let head = d.slice(0, digits).padEnd(digits, '0');
  if ((d[digits] ?? '0') >= '5') {
    head = (BigInt(head) + 1n).toString();
    if (head.length > digits) {
      head = head.slice(0, digits);
      k += 1;
    }
  }
  const m = Number(`${head[0]}.${head.slice(1)}`);
  return `${negative ? MINUS : ''}${m.toLocaleString(locale, { maximumSignificantDigits: digits })} × 10${sup(k)}`;
}
