#!/usr/bin/env node

// Distribute the canonical brand kit from nirs4all-ui (the single home) to the
// sibling ecosystem repos, so each repo's `assets/brand/` is a mirror of ui's
// kit instead of an independently-authored copy.
//
// nirs4all-ui vendors the kit under `assets/brands/<id>/`; each sibling repo
// keeps a FLAT `assets/brand/` of just its own project's files. This maps
// `assets/brands/<id>/*` → `<sibling>/assets/brand/*`.
//
//   node scripts/sync-ecosystem-brands.mjs           # drift check (read-only): report per-repo status
//   node scripts/sync-ecosystem-brands.mjs --write   # copy ui's kit into each sibling repo
//
// Dev/release tool: it reaches sibling working trees by relative path and is not
// part of the package or CI.

import { access, mkdir, readFile, readdir, copyFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ecosystemRoot = path.resolve(uiRoot, "..");
const brandsRoot = path.join(uiRoot, "assets", "brands");

// brand id → sibling repo directory name (relative to the ecosystem root).
// Skips ids without a standalone repo (device, tools) and quality (its app owns a
// generated variant); ui itself is the source, not a target.
const REPO = {
  nirs4all: "nirs4all",
  "nirs4all-core": "nirs4all-core",
  "nirs4all-studio": "nirs4all-studio",
  "nirs4all-web": "nirs4all-web",
  "nirs4all-formats": "nirs4all-formats",
  "nirs4all-io": "nirs4all-io",
  "nirs4all-methods": "nirs4all-methods",
  "nirs4all-datasets": "nirs4all-datasets",
  "nirs4all-providers": "nirs4all-providers",
  "nirs4all-benchmarks": "nirs4all-benchmarks",
  "nirs4all-repository": "nirs4all-repository",
  "nirs4all-papers": "nirs4all-papers",
  "dag-ml": "dag-ml",
  "dag-ml-data": "dag-ml-data",
};

const write = process.argv.includes("--write");

async function exists(p) {
  try {
    await access(p, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function sameBytes(a, b) {
  try {
    const [x, y] = await Promise.all([readFile(a), readFile(b)]);
    return x.equals(y);
  } catch {
    return false;
  }
}

let repos = 0;
let inSync = 0;
let drifted = 0;
let copied = 0;

for (const [id, repoName] of Object.entries(REPO)) {
  const sourceDir = path.join(brandsRoot, id);
  const targetDir = path.join(ecosystemRoot, repoName, "assets", "brand");
  if (!(await exists(path.join(ecosystemRoot, repoName)))) continue;
  repos += 1;

  const files = (await readdir(sourceDir)).filter((f) => f !== "README.md");
  const diffs = [];
  for (const file of files) {
    const src = path.join(sourceDir, file);
    const dst = path.join(targetDir, file);
    if (await sameBytes(src, dst)) continue;
    diffs.push(file);
    if (write) {
      await mkdir(targetDir, { recursive: true });
      await copyFile(src, dst);
      copied += 1;
    }
  }

  if (diffs.length === 0) {
    inSync += 1;
    console.log(`✓ ${repoName} — in sync (${files.length} files)`);
  } else {
    drifted += 1;
    console.log(`${write ? "↻" : "✗"} ${repoName} — ${diffs.length} ${write ? "updated" : "differ"}: ${diffs.join(", ")}`);
  }
}

console.log(
  write
    ? `\nSynced ${repos} repos from nirs4all-ui (${copied} files copied).`
    : `\n${inSync}/${repos} repos in sync with nirs4all-ui; ${drifted} drifted. Run with --write to distribute.`,
);
