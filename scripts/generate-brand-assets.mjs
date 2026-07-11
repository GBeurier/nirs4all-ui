#!/usr/bin/env node

// NIRS4ALL ecosystem brand kit — vendoring + verification.
//
// The real, designer-made marks are NOT generated: each ecosystem project has a
// distinct SVG (colored squircle tile + white NIRS spectrum + peak dot + a
// project wordmark). `nirs4all-ui` is the single home for the shared kit, so the
// marks are vendored verbatim under `assets/brands/<id>/` from the flagship
// (`nirs4all-org`). Keep this in sync with the manifest in `src/brand/index.ts`.
//
//   node scripts/generate-brand-assets.mjs           # import the marks from the org master (dev)
//   node scripts/generate-brand-assets.mjs --check   # verify the vendored kit (CI); no org needed

import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brandsRoot = path.join(repositoryRoot, "assets", "brands");
const ORG = "/home/delete/nirs4all/nirs4all-org/assets/brand";
const QUALI = path.join(repositoryRoot, "assets", "brand", "quali");

const VARIANTS = ["icon", "horizontal", "horizontal-dark", "stacked", "stacked-dark"];

// id → accent (the squircle tile color, present in icon.svg) + source dir to import from.
const brands = [
  { id: "nirs4all", accent: "#058E96", source: `${ORG}/nirs4all` },
  { id: "nirs4all-core", accent: "#E9362D", source: `${ORG}/nirs4all-core` },
  { id: "nirs4all-ui", accent: "#2563EB", source: `${ORG}/nirs4all-ui` },
  { id: "nirs4all-studio", accent: "#96C800", source: `${ORG}/nirs4all-studio` },
  { id: "nirs4all-web", accent: "#FF6400", source: `${ORG}/nirs4all-web` },
  { id: "nirs4all-formats", accent: "#6732B9", source: `${ORG}/nirs4all-formats` },
  { id: "nirs4all-io", accent: "#CC99FF", source: `${ORG}/nirs4all-io` },
  { id: "nirs4all-methods", accent: "#00A5D2", source: `${ORG}/nirs4all-methods` },
  { id: "nirs4all-datasets", accent: "#FFBE00", source: `${ORG}/nirs4all-datasets` },
  { id: "nirs4all-providers", accent: "#D946EF", source: `${ORG}/nirs4all-providers` },
  { id: "nirs4all-benchmarks", accent: "#00704A", source: `${ORG}/nirs4all-benchmarks` },
  { id: "nirs4all-repository", accent: "#AC564A", source: `${ORG}/nirs4all-repository` },
  { id: "nirs4all-tools", accent: "#475569", source: `${ORG}/nirs4all-tools` },
  { id: "nirs4all-papers", accent: "#C2255C", source: `${ORG}/nirs4all-papers` },
  { id: "nirs4all-device", accent: "#10B981", source: `${ORG}/nirs4all-device` },
  { id: "nirs4all-cluster", accent: "#1B5789", source: `${ORG}/nirs4all-cluster` },
  { id: "nirs4all-quality", accent: "#4F46E5", source: QUALI },
  { id: "dag-ml", accent: "#058E96", source: `${ORG}/dag-ml` },
  { id: "dag-ml-data", accent: "#FFBE00", source: `${ORG}/dag-ml-data` },
];

function generatedReadme() {
  return `# NIRS4ALL reusable brand assets

The shared, canonical brand kit for the whole NIRS4ALL ecosystem. \`nirs4all-ui\`
is the single home; each project's real mark (icon + horizontal/stacked + dark
variants) is vendored verbatim here so apps and docs consume one source instead
of copying their own.

Re-import from the flagship master with \`npm run brand:generate\`, verify with
\`npm run brand:check\`. Keep the ids in sync with \`src/brand/index.ts\`.

Brands:
${brands.map((brand) => `- \`${brand.id}\` (${brand.accent})`).join("\n")}
`;
}

async function importAssets() {
  for (const brand of brands) {
    const directory = path.join(brandsRoot, brand.id);
    await mkdir(directory, { recursive: true });
    for (const variant of VARIANTS) {
      await copyFile(path.join(brand.source, `${variant}.svg`), path.join(directory, `${variant}.svg`));
    }
  }
  await writeFile(path.join(brandsRoot, "README.md"), generatedReadme());
  console.log(`✓ vendored ${brands.length} ecosystem brands into assets/brands/`);
}

async function checkAssets() {
  const problems = [];
  for (const brand of brands) {
    const directory = path.join(brandsRoot, brand.id);
    for (const variant of VARIANTS) {
      const assetPath = path.join(directory, `${variant}.svg`);
      try {
        await access(assetPath, constants.R_OK);
        const svg = await readFile(assetPath, "utf8");
        if (!svg.includes("<svg")) problems.push(`${path.relative(repositoryRoot, assetPath)}: not an SVG`);
        if (variant === "icon" && !svg.toLowerCase().includes(brand.accent.toLowerCase())) {
          problems.push(`${path.relative(repositoryRoot, assetPath)}: missing accent ${brand.accent}`);
        }
      } catch {
        problems.push(`${path.relative(repositoryRoot, assetPath)}: missing`);
      }
    }
  }
  try {
    if ((await readFile(path.join(brandsRoot, "README.md"), "utf8")) !== generatedReadme()) {
      problems.push("assets/brands/README.md: stale (run npm run brand:generate)");
    }
  } catch {
    problems.push("assets/brands/README.md: missing");
  }

  if (problems.length > 0) {
    console.error(`Brand kit is out of sync:\n${problems.join("\n")}`);
    return false;
  }
  console.log(`✓ verified ${brands.length} ecosystem brands (${brands.length * VARIANTS.length} SVGs)`);
  return true;
}

if (process.argv.includes("--check")) {
  const ok = await checkAssets();
  if (!ok) process.exitCode = 1;
} else {
  await importAssets();
}
