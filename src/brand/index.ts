/**
 * Shared NIRS4ALL brand definitions and deterministic SVG generators.
 *
 * This module is pure TypeScript: no DOM, no React, no filesystem access.
 * Hosts can use the asset paths for packaged files or generate inline SVG
 * strings when they need app-local marks.
 */

export type Nirs4allBrandId =
  | "nirs4all"
  | "nirs4all-core"
  | "nirs4all-ui"
  | "nirs4all-providers"
  | "nirs4all-quality";

export type Nirs4allBrandVariant = "icon" | "horizontal" | "stacked";

export interface Nirs4allBrandPalette {
  primary: string;
  secondary: string;
  accent: string;
  dark: string;
  surface: string;
}

export interface Nirs4allBrandAssets {
  icon: string;
  horizontal: string;
  stacked: string;
}

export interface Nirs4allBrandDefinition {
  id: Nirs4allBrandId;
  name: string;
  shortName: string;
  packageName: string;
  role: string;
  description: string;
  palette: Nirs4allBrandPalette;
  assets: Nirs4allBrandAssets;
  tags: readonly string[];
}

export interface GenerateNirs4allBrandSvgOptions {
  variant?: Nirs4allBrandVariant;
  title?: string;
  dark?: boolean;
  animated?: boolean;
}

const NIRS4ALL_TEAL = "#058E96";
const NIRS4ALL_RED = "#E9362D";

const SHARED_TEAL_PALETTE = {
  primary: NIRS4ALL_TEAL,
  secondary: "#00A5D2",
  accent: NIRS4ALL_RED,
  dark: "#0f172a",
  surface: "#ffffff",
} as const satisfies Nirs4allBrandPalette;

export const NIRS4ALL_BRANDS = [
  {
    id: "nirs4all",
    name: "NIRS4ALL",
    shortName: "n4a",
    packageName: "nirs4all",
    role: "Ecosystem umbrella",
    description: "Shared identity for NIRS4ALL applications, docs, releases, and custom hosts.",
    palette: SHARED_TEAL_PALETTE,
    assets: {
      icon: "assets/brands/nirs4all/icon.svg",
      horizontal: "assets/brands/nirs4all/horizontal.svg",
      stacked: "assets/brands/nirs4all/stacked.svg",
    },
    tags: ["ecosystem", "docs", "custom-host"],
  },
  {
    id: "nirs4all-core",
    name: "nirs4all-core",
    shortName: "n4o",
    packageName: "nirs4all",
    role: "Portable aggregate runtime",
    description: "Low-level aggregate used by native, Python, R, WASM, Rust, MATLAB, and custom hosts.",
    palette: {
      primary: NIRS4ALL_RED,
      secondary: NIRS4ALL_TEAL,
      accent: NIRS4ALL_RED,
      dark: "#10233a",
      surface: "#ffffff",
    },
    assets: {
      icon: "assets/brands/nirs4all-core/icon.svg",
      horizontal: "assets/brands/nirs4all-core/horizontal.svg",
      stacked: "assets/brands/nirs4all-core/stacked.svg",
    },
    tags: ["core", "runtime", "bindings"],
  },
  {
    id: "nirs4all-ui",
    name: "nirs4all-ui",
    shortName: "n4u",
    packageName: "nirs4all-ui",
    role: "Reusable visual system",
    description: "Shared React components, visual tokens, brand assets, and app-host UI contracts.",
    palette: {
      primary: "#2563eb",
      secondary: NIRS4ALL_TEAL,
      accent: NIRS4ALL_RED,
      dark: "#172554",
      surface: "#ffffff",
    },
    assets: {
      icon: "assets/brands/nirs4all-ui/icon.svg",
      horizontal: "assets/brands/nirs4all-ui/horizontal.svg",
      stacked: "assets/brands/nirs4all-ui/stacked.svg",
    },
    tags: ["ui", "studio", "web"],
  },
  {
    id: "nirs4all-providers",
    name: "nirs4all-providers",
    shortName: "n4v",
    packageName: "nirs4all-providers",
    role: "Soft-import provider bridge",
    description: "Optional provider clients for datasets, repositories, archives, and publication surfaces.",
    palette: {
      primary: "#D946EF",
      secondary: NIRS4ALL_TEAL,
      accent: NIRS4ALL_RED,
      dark: "#2e1065",
      surface: "#ffffff",
    },
    assets: {
      icon: "assets/brands/nirs4all-providers/icon.svg",
      horizontal: "assets/brands/nirs4all-providers/horizontal.svg",
      stacked: "assets/brands/nirs4all-providers/stacked.svg",
    },
    tags: ["providers", "datasets", "repository"],
  },
  {
    id: "nirs4all-quality",
    name: "nirs4all-quality",
    shortName: "n4q",
    packageName: "nirs4all-quality",
    role: "Quality/lab custom host",
    description: "Reusable quality-control brand for lab workflows built on nirs4all-ui/lab contracts.",
    palette: {
      primary: "#4F46E5",
      secondary: NIRS4ALL_TEAL,
      accent: NIRS4ALL_RED,
      dark: "#1e1b4b",
      surface: "#ffffff",
    },
    assets: {
      icon: "assets/brands/nirs4all-quality/icon.svg",
      horizontal: "assets/brands/nirs4all-quality/horizontal.svg",
      stacked: "assets/brands/nirs4all-quality/stacked.svg",
    },
    tags: ["quality", "lab", "custom-host"],
  },
] as const satisfies readonly Nirs4allBrandDefinition[];

const BRAND_ID_SET: ReadonlySet<string> = new Set(NIRS4ALL_BRANDS.map((brand) => brand.id));

export function isNirs4allBrandId(value: string): value is Nirs4allBrandId {
  return BRAND_ID_SET.has(value);
}

export function getNirs4allBrandDefinition(id: Nirs4allBrandId): Nirs4allBrandDefinition {
  const brand = NIRS4ALL_BRANDS.find((candidate) => candidate.id === id);
  if (!brand) {
    throw new Error(`Unknown NIRS4ALL brand: ${id}`);
  }
  return brand;
}

export function listNirs4allBrands(): readonly Nirs4allBrandDefinition[] {
  return NIRS4ALL_BRANDS;
}

export function getNirs4allBrandAssetPath(
  brand: Nirs4allBrandId | Nirs4allBrandDefinition,
  variant: Nirs4allBrandVariant,
): string {
  return resolveBrand(brand).assets[variant];
}

export function generateNirs4allBrandSvg(
  brand: Nirs4allBrandId | Nirs4allBrandDefinition,
  options: GenerateNirs4allBrandSvgOptions = {},
): string {
  const resolved = resolveBrand(brand);
  const variant = options.variant ?? "horizontal";

  if (variant === "icon") {
    return buildIconSvg(resolved, options);
  }
  if (variant === "stacked") {
    return buildStackedSvg(resolved, options);
  }
  return buildHorizontalSvg(resolved, options);
}

function resolveBrand(brand: Nirs4allBrandId | Nirs4allBrandDefinition): Nirs4allBrandDefinition {
  return typeof brand === "string" ? getNirs4allBrandDefinition(brand) : brand;
}

// --- Canonical nirs4all mark (verbatim geometry from nirs4all-org) ---------
// Filled "squircle" tile in the brand accent color, a white NIRS spectrum
// curve, and a white peak dot; only the tile fill changes per brand. Mirrors
// scripts/generate-brand-assets.mjs (kept in sync by src/brand/index.test.ts).
const ICON_VIEWBOX = "0 0 307.2823 308.2614";
const ICON_GROUP_TRANSFORM = "translate(-0.25127103,1.1057433)";
const CLIP_D = "M 75.196094,-0.47997507 H 381.42019 V 303.18425 H 75.196094 Z";
const TILE_D =
  "M 1.5315373,35.750606 C 1.5315373,16.791591 16.89074,1.4323885 35.849755,1.4323885 H 269.47762 c 18.91901,0 34.27821,15.3592025 34.27821,34.3182175 V 269.53846 c 0,18.91902 -15.3592,34.27822 -34.27821,34.27822 H 35.849755 c -18.959015,0 -34.3182177,-15.3592 -34.3182177,-34.27822 z";
const TILE_TRANSFORM = "matrix(1.0163665,0,0,1.019436,-1.1937273,-2.5659717)";
const SPECTRUM_D =
  "m 78.350886,215.76355 c 4.917688,0.027 13.251861,-0.0312 22.323884,-1.53468 6.67965,-1.47992 11.15942,-3.51981 16.79913,-8.67955 5.6797,-5.15973 10.19947,-8.15957 17.11911,-22.35883 6.95964,-14.15927 19.159,-49.59743 24.47873,-62.67675 5.27972,-13.11932 3.63981,-9.91948 7.31962,-15.83918 3.67981,-5.959687 11.4794,-8.59955 16.51914,-6.839641 5.03974,1.759908 9.39951,4.999741 13.71929,17.319101 4.35977,12.35936 6.23967,27.03859 9.4795,37.67804 3.27983,10.67945 4.39978,18.47904 10.11948,26.35863 5.6797,7.87959 12.48129,8.96263 20.43894,4.99974 6.87614,-5.69367 24.35873,-49.63742 26.59862,-51.67731 2.23988,-2.0399 14.71923,-18.23906 34.23822,6.47966 8.91953,11.39941 25.55867,37.55805 38.79798,52.55727";
const SPECTRUM_TRANSFORM = "translate(-78.046472,1.0051295)";
const DOT_D =
  "m 245.65157,200.51477 c 0,-13.5593 10.99943,-24.55873 24.55873,-24.55873 13.59929,0 24.55872,10.99943 24.55872,24.55873 0,13.59929 -10.95943,24.55872 -24.55872,24.55872 -13.5593,0 -24.55873,-10.95943 -24.55873,-24.55872 z";
const WORDMARK_RED = "#E9362D";
const DISPLAY_FONT = "'IBM Plex Sans', 'Inter', system-ui, -apple-system, sans-serif";

function iconGeometry(
  brand: Nirs4allBrandDefinition,
  variant: Nirs4allBrandVariant,
  options: GenerateNirs4allBrandSvgOptions,
): string {
  const clipId = `${brand.id}-${variant}-clip`;
  const waveId = `${brand.id}-${variant}-wave`;
  const waveDash = options.animated ? ' stroke-dasharray="42 38"' : "";
  const animation = options.animated ? waveAnimation() : "";
  return `<defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><path d="${CLIP_D}"/></clipPath></defs>
    <g transform="${ICON_GROUP_TRANSFORM}">
      <path fill="${brand.palette.primary}" fill-rule="evenodd" d="${TILE_D}" transform="${TILE_TRANSFORM}"/>
      <path id="${waveId}" fill="none" stroke="#ffffff" stroke-width="19.359" stroke-linecap="butt" stroke-miterlimit="8" clip-path="url(#${clipId})" d="${SPECTRUM_D}" transform="${SPECTRUM_TRANSFORM}"${waveDash}>${animation}</path>
      <path fill="#ffffff" fill-rule="evenodd" d="${DOT_D}"/>
    </g>`;
}

function wordmarkTspans(brand: Nirs4allBrandDefinition, dark: boolean): string {
  const suffix = brand.id.slice("nirs4all".length);
  const ink = dark ? "#ffffff" : "#0f172a";
  const muted = dark ? "#cbd5e1" : "#64748b";
  const parts = [
    `<tspan fill="${ink}">nirs</tspan>`,
    `<tspan fill="${WORDMARK_RED}">4</tspan>`,
    `<tspan fill="${brand.palette.primary}">all</tspan>`,
  ];
  if (suffix) parts.push(`<tspan fill="${muted}">${escapeXml(suffix)}</tspan>`);
  return parts.join("");
}

function estTextWidth(text: string, fontSize: number): number {
  return Math.round(text.length * fontSize * 0.62);
}

function buildIconSvg(brand: Nirs4allBrandDefinition, options: GenerateNirs4allBrandSvgOptions): string {
  const title = escapeXml(options.title ?? brand.name);
  const titleId = `${brand.id}-icon-title`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ICON_VIEWBOX}" role="img" aria-labelledby="${titleId}">
  <title id="${titleId}">${title}</title>
  ${iconGeometry(brand, "icon", options)}
</svg>`;
}

function buildHorizontalSvg(
  brand: Nirs4allBrandDefinition,
  options: GenerateNirs4allBrandSvgOptions,
): string {
  const title = escapeXml(options.title ?? brand.name);
  const titleId = `${brand.id}-horizontal-title`;
  const mutedColor = options.dark ? "#cbd5e1" : "#64748b";
  const textX = 136;
  const width = textX + estTextWidth(brand.id, 40) + 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 132" role="img" aria-labelledby="${titleId}">
  <title id="${titleId}">${title}</title>
  <g transform="translate(18 18) scale(0.311427)">${iconGeometry(brand, "horizontal", options)}</g>
  <text x="${textX}" y="73" font-family="${DISPLAY_FONT}" font-size="40" font-weight="700" letter-spacing="-0.5">${wordmarkTspans(brand, options.dark ?? false)}</text>
  <text x="${textX}" y="99" font-family="'Inter', system-ui, sans-serif" font-size="15" font-weight="600" fill="${mutedColor}">${escapeXml(brand.role)}</text>
</svg>`;
}

function buildStackedSvg(brand: Nirs4allBrandDefinition, options: GenerateNirs4allBrandSvgOptions): string {
  const title = escapeXml(options.title ?? brand.name);
  const titleId = `${brand.id}-stacked-title`;
  const mutedColor = options.dark ? "#cbd5e1" : "#64748b";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 236" role="img" aria-labelledby="${titleId}">
  <title id="${titleId}">${title}</title>
  <g transform="translate(80 24) scale(0.389284)">${iconGeometry(brand, "stacked", options)}</g>
  <text x="140" y="188" text-anchor="middle" font-family="${DISPLAY_FONT}" font-size="26" font-weight="700" letter-spacing="-0.4">${wordmarkTspans(brand, options.dark ?? false)}</text>
  <text x="140" y="212" text-anchor="middle" font-family="'Inter', system-ui, sans-serif" font-size="13" font-weight="600" fill="${mutedColor}">${escapeXml(brand.role)}</text>
</svg>`;
}

function waveAnimation(): string {
  return `<animate attributeName="stroke-dashoffset" values="0;-80" dur="9s" repeatCount="indefinite"/>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
