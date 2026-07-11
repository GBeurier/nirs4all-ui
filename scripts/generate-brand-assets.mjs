#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const brands = [
  {
    id: "nirs4all",
    name: "NIRS4ALL",
    shortName: "n4a",
    role: "Ecosystem umbrella",
    palette: { primary: "#058E96", secondary: "#00A5D2", accent: "#E9362D", dark: "#0f172a", surface: "#ffffff" },
  },
  {
    id: "nirs4all-core",
    name: "nirs4all-core",
    shortName: "n4o",
    role: "Portable aggregate runtime",
    palette: { primary: "#E9362D", secondary: "#058E96", accent: "#E9362D", dark: "#10233a", surface: "#ffffff" },
  },
  {
    id: "nirs4all-ui",
    name: "nirs4all-ui",
    shortName: "n4u",
    role: "Reusable visual system",
    palette: { primary: "#2563eb", secondary: "#058E96", accent: "#E9362D", dark: "#172554", surface: "#ffffff" },
  },
  {
    id: "nirs4all-providers",
    name: "nirs4all-providers",
    shortName: "n4v",
    role: "Soft-import provider bridge",
    palette: { primary: "#D946EF", secondary: "#058E96", accent: "#E9362D", dark: "#2e1065", surface: "#ffffff" },
  },
  {
    id: "nirs4all-quality",
    name: "nirs4all-quality",
    shortName: "n4q",
    role: "Quality/lab custom host",
    palette: { primary: "#4F46E5", secondary: "#058E96", accent: "#E9362D", dark: "#1e1b4b", surface: "#ffffff" },
  },
];

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// --- Canonical nirs4all mark (verbatim geometry from nirs4all-org) ---------
// A filled "squircle" app tile in the brand's accent color, a white NIRS
// spectrum curve stroked through it, and a solid white peak dot. Only the tile
// fill changes per brand; the spectrum + dot are always white. The wordmark is
// drawn as tri-color text (nirs / 4 / all) in the ecosystem display face.
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

function iconGeometry(brand, variant) {
  const clipId = `${brand.id}-${variant}-clip`;
  const waveId = `${brand.id}-${variant}-wave`;
  return `<defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><path d="${CLIP_D}"/></clipPath></defs>
    <g transform="${ICON_GROUP_TRANSFORM}">
      <path fill="${brand.palette.primary}" fill-rule="evenodd" d="${TILE_D}" transform="${TILE_TRANSFORM}"/>
      <path id="${waveId}" fill="none" stroke="#ffffff" stroke-width="19.359" stroke-linecap="butt" stroke-miterlimit="8" clip-path="url(#${clipId})" d="${SPECTRUM_D}" transform="${SPECTRUM_TRANSFORM}"/>
      <path fill="#ffffff" fill-rule="evenodd" d="${DOT_D}"/>
    </g>`;
}

function wordmarkTspans(brand) {
  const suffix = brand.id.slice("nirs4all".length);
  const parts = [
    `<tspan fill="#0f172a">nirs</tspan>`,
    `<tspan fill="${WORDMARK_RED}">4</tspan>`,
    `<tspan fill="${brand.palette.primary}">all</tspan>`,
  ];
  if (suffix) parts.push(`<tspan fill="#64748b">${escapeXml(suffix)}</tspan>`);
  return parts.join("");
}

function estTextWidth(text, fontSize) {
  return Math.round(text.length * fontSize * 0.62);
}

function iconSvg(brand) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ICON_VIEWBOX}" role="img" aria-labelledby="${brand.id}-icon-title">
  <title id="${brand.id}-icon-title">${escapeXml(brand.name)}</title>
  ${iconGeometry(brand, "icon")}
</svg>
`;
}

function horizontalSvg(brand) {
  const textX = 136;
  const width = textX + estTextWidth(brand.id, 40) + 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 132" role="img" aria-labelledby="${brand.id}-horizontal-title">
  <title id="${brand.id}-horizontal-title">${escapeXml(brand.name)}</title>
  <g transform="translate(18 18) scale(0.311427)">${iconGeometry(brand, "horizontal")}</g>
  <text x="${textX}" y="73" font-family="${DISPLAY_FONT}" font-size="40" font-weight="700" letter-spacing="-0.5">${wordmarkTspans(brand)}</text>
  <text x="${textX}" y="99" font-family="'Inter', system-ui, sans-serif" font-size="15" font-weight="600" fill="#64748b">${escapeXml(brand.role)}</text>
</svg>
`;
}

function stackedSvg(brand) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 236" role="img" aria-labelledby="${brand.id}-stacked-title">
  <title id="${brand.id}-stacked-title">${escapeXml(brand.name)}</title>
  <g transform="translate(80 24) scale(0.389284)">${iconGeometry(brand, "stacked")}</g>
  <text x="140" y="188" text-anchor="middle" font-family="${DISPLAY_FONT}" font-size="26" font-weight="700" letter-spacing="-0.4">${wordmarkTspans(brand)}</text>
  <text x="140" y="212" text-anchor="middle" font-family="'Inter', system-ui, sans-serif" font-size="13" font-weight="600" fill="#64748b">${escapeXml(brand.role)}</text>
</svg>
`;
}

function generatedBrandFiles(brand) {
  return {
    "icon.svg": iconSvg(brand),
    "horizontal.svg": horizontalSvg(brand),
    "stacked.svg": stackedSvg(brand),
  };
}

function generatedReadme() {
  return `# NIRS4ALL reusable brand assets

Generated SVG brand kit for the NIRS4ALL ecosystem.

Run \`npm run brand:generate\` after editing \`scripts/generate-brand-assets.mjs\` or the mirrored definitions in \`src/brand/index.ts\`.

Current brands:
${brands.map((brand) => `- \`${brand.id}\`: ${brand.role}`).join("\n")}
`;
}

function normalizeGeneratedText(value) {
  return value.replace(/\r\n?/g, "\n");
}

async function writeGeneratedAssets() {
  const root = path.join(repositoryRoot, "assets", "brands");

  for (const brand of brands) {
    const directory = path.join(root, brand.id);
    await mkdir(directory, { recursive: true });
    for (const [filename, content] of Object.entries(generatedBrandFiles(brand))) {
      await writeFile(path.join(directory, filename), content);
    }
  }

  await writeFile(path.join(root, "README.md"), generatedReadme());
}

async function checkGeneratedAssets() {
  const root = path.join(repositoryRoot, "assets", "brands");
  const stale = [];

  for (const brand of brands) {
    const directory = path.join(root, brand.id);
    for (const [filename, expected] of Object.entries(generatedBrandFiles(brand))) {
      const assetPath = path.join(directory, filename);
      let actual = "";
      try {
        actual = await readFile(assetPath, "utf8");
      } catch {
        stale.push(path.relative(repositoryRoot, assetPath));
        continue;
      }
      if (normalizeGeneratedText(actual) !== normalizeGeneratedText(expected)) {
        stale.push(path.relative(repositoryRoot, assetPath));
      }
    }
  }

  const readmePath = path.join(root, "README.md");
  try {
    if (normalizeGeneratedText(await readFile(readmePath, "utf8")) !== normalizeGeneratedText(generatedReadme())) {
      stale.push(path.relative(repositoryRoot, readmePath));
    }
  } catch {
    stale.push(path.relative(repositoryRoot, readmePath));
  }

  if (stale.length > 0) {
    console.error(`Brand assets are stale. Run npm run brand:generate.\n${stale.join("\n")}`);
    return false;
  }
  return true;
}

if (process.argv.includes("--check")) {
  const ok = await checkGeneratedAssets();
  if (!ok) {
    process.exitCode = 1;
  }
} else {
  await writeGeneratedAssets();
}
