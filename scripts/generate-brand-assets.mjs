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
];

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function iconSvg(brand) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="${brand.id}-icon-title">
  <title id="${brand.id}-icon-title">${escapeXml(brand.name)}</title>
  <rect width="128" height="128" rx="24" fill="${brand.palette.surface}"/>
  <path d="M20 78C31 45 44 44 58 70s26 25 50-20" fill="none" stroke="${brand.palette.primary}" stroke-width="9" stroke-linecap="round"/>
  <path d="M20 90C36 74 48 74 64 89s29 17 44-4" fill="none" stroke="${brand.palette.secondary}" stroke-width="5" stroke-linecap="round" opacity=".82"/>
  <circle cx="98" cy="39" r="10" fill="${brand.palette.accent}"/>
  <text x="64" y="112" fill="${brand.palette.dark}" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="800" text-anchor="middle">${escapeXml(brand.shortName)}</text>
</svg>
`;
}

function horizontalSvg(brand) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 132" role="img" aria-labelledby="${brand.id}-horizontal-title">
  <title id="${brand.id}-horizontal-title">${escapeXml(brand.name)}</title>
  <rect width="520" height="132" rx="22" fill="${brand.palette.surface}"/>
  <g transform="translate(24 18)">
    <rect width="96" height="96" rx="20" fill="${brand.palette.primary}" opacity=".12"/>
    <path d="M14 58C25 28 37 28 49 54s24 26 40-15" fill="none" stroke="${brand.palette.primary}" stroke-width="8" stroke-linecap="round"/>
    <path d="M14 72C29 58 39 59 53 72s25 14 37-2" fill="none" stroke="${brand.palette.secondary}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="78" cy="28" r="8" fill="${brand.palette.accent}"/>
  </g>
  <text x="146" y="61" fill="${brand.palette.dark}" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800">${escapeXml(brand.name)}</text>
  <text x="146" y="92" fill="#475569" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="600">${escapeXml(brand.role)}</text>
</svg>
`;
}

function stackedSvg(brand) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 236" role="img" aria-labelledby="${brand.id}-stacked-title">
  <title id="${brand.id}-stacked-title">${escapeXml(brand.name)}</title>
  <rect width="280" height="236" rx="24" fill="${brand.palette.surface}"/>
  <g transform="translate(80 26)">
    <rect width="120" height="120" rx="28" fill="${brand.palette.primary}" opacity=".12"/>
    <path d="M18 73C32 36 47 35 64 68s32 33 56-18" fill="none" stroke="${brand.palette.primary}" stroke-width="10" stroke-linecap="round"/>
    <path d="M18 91C37 72 51 74 68 91s35 18 52-3" fill="none" stroke="${brand.palette.secondary}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="96" cy="38" r="10" fill="${brand.palette.accent}"/>
  </g>
  <text x="140" y="178" fill="${brand.palette.dark}" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800" text-anchor="middle">${escapeXml(brand.name)}</text>
  <text x="140" y="205" fill="#475569" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="600" text-anchor="middle">${escapeXml(brand.role)}</text>
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
      if (actual !== expected) {
        stale.push(path.relative(repositoryRoot, assetPath));
      }
    }
  }

  const readmePath = path.join(root, "README.md");
  try {
    if ((await readFile(readmePath, "utf8")) !== generatedReadme()) {
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
