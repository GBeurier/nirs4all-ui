#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ARTIFACT_SCHEMA = "nirs4all.ui-release-artifact/v1";
export const MANIFEST_FILENAME = "nirs4all-ui-release-artifact.v1.json";
const REQUIRED_FILES = ["LICENSE", "dist/index.d.ts", "dist/index.js", "package.json"];

function digest(algorithm, bytes, encoding = "hex") {
  return createHash(algorithm).update(bytes).digest(encoding);
}

function requireObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} keys differ: expected ${expected.join(", ")}; got ${actual.join(", ")}`);
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(`invalid argument sequence near ${flag ?? "<end>"}`);
    }
    options[flag.slice(2)] = value;
  }
  return { command, options };
}

function git(repoRoot, ...args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

async function requireRegularFile(path, label) {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  return metadata;
}

export async function buildReleaseArtifact({ repoRoot, outputDir }) {
  const root = resolve(repoRoot);
  const destination = resolve(outputDir);
  await mkdir(destination, { recursive: true });
  const existing = await readdir(destination);
  if (existing.length !== 0) {
    throw new Error(`output directory must be empty: ${destination}`);
  }

  const dirty = git(root, "status", "--porcelain", "--untracked-files=no");
  if (dirty) {
    throw new Error("release artifact source contains tracked modifications");
  }
  const commit = git(root, "rev-parse", "HEAD");
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error("git did not return an exact forty-character source commit");
  }

  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const packed = JSON.parse(
    execFileSync(npm, ["pack", "--json", "--ignore-scripts", "--pack-destination", destination], {
      cwd: root,
      encoding: "utf8",
    }),
  );
  if (!Array.isArray(packed) || packed.length !== 1) {
    throw new Error("npm pack must produce exactly one package record");
  }
  const record = packed[0];
  if (record.name !== packageJson.name || record.version !== packageJson.version) {
    throw new Error("npm pack package identity differs from package.json");
  }
  const packedFiles = new Set((record.files ?? []).map((entry) => entry.path));
  const missing = REQUIRED_FILES.filter((path) => !packedFiles.has(path));
  if (missing.length) {
    throw new Error(`release package is missing required files: ${missing.join(", ")}`);
  }

  const tarballPath = join(destination, record.filename);
  const tarballStat = await requireRegularFile(tarballPath, "release tarball");
  const bytes = await readFile(tarballPath);
  const sha1 = digest("sha1", bytes);
  const sha256 = digest("sha256", bytes);
  const integrity = `sha512-${digest("sha512", bytes, "base64")}`;
  if (record.shasum !== sha1 || record.integrity !== integrity || record.size !== tarballStat.size) {
    throw new Error("npm pack metadata differs from the produced tarball bytes");
  }

  const manifest = {
    schema_version: ARTIFACT_SCHEMA,
    package: {
      name: packageJson.name,
      version: packageJson.version,
      repository: packageJson.repository?.url ?? null,
    },
    source: {
      commit_sha: commit,
      dirty: false,
    },
    artifact: {
      filename: record.filename,
      size: tarballStat.size,
      sha256,
      npm_integrity: integrity,
      npm_shasum: sha1,
      entry_count: record.entryCount,
      required_files: REQUIRED_FILES,
    },
  };
  const manifestPath = join(destination, MANIFEST_FILENAME);
  const temporaryPath = `${manifestPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, manifestPath);
  return { manifest, manifestPath, tarballPath };
}

export async function verifyReleaseArtifact({ manifestPath, expectedCommit = null }) {
  const resolvedManifest = resolve(manifestPath);
  await requireRegularFile(resolvedManifest, "release manifest");
  const manifest = requireObject(JSON.parse(await readFile(resolvedManifest, "utf8")), "release manifest");
  requireExactKeys(manifest, ["schema_version", "package", "source", "artifact"], "release manifest");
  if (manifest.schema_version !== ARTIFACT_SCHEMA) {
    throw new Error(`unsupported release artifact schema: ${manifest.schema_version}`);
  }
  const packageIdentity = requireObject(manifest.package, "package");
  const source = requireObject(manifest.source, "source");
  const artifact = requireObject(manifest.artifact, "artifact");
  requireExactKeys(packageIdentity, ["name", "version", "repository"], "package");
  requireExactKeys(source, ["commit_sha", "dirty"], "source");
  requireExactKeys(
    artifact,
    ["filename", "size", "sha256", "npm_integrity", "npm_shasum", "entry_count", "required_files"],
    "artifact",
  );
  if (packageIdentity.name !== "nirs4all-ui" || typeof packageIdentity.version !== "string") {
    throw new Error("release artifact package identity is invalid");
  }
  if (!/^[0-9a-f]{40}$/.test(source.commit_sha) || source.dirty !== false) {
    throw new Error("release artifact source identity is invalid or dirty");
  }
  if (expectedCommit !== null && source.commit_sha !== expectedCommit) {
    throw new Error(`source commit mismatch: expected ${expectedCommit}; got ${source.commit_sha}`);
  }
  const expectedFilename = `${packageIdentity.name}-${packageIdentity.version}.tgz`;
  if (artifact.filename !== expectedFilename || basename(artifact.filename) !== artifact.filename) {
    throw new Error("release tarball filename does not match the package identity");
  }
  if (JSON.stringify(artifact.required_files) !== JSON.stringify(REQUIRED_FILES)) {
    throw new Error("release artifact required-file proof differs from the contract");
  }
  const tarballPath = join(dirname(resolvedManifest), artifact.filename);
  const tarballStat = await requireRegularFile(tarballPath, "release tarball");
  const bytes = await readFile(tarballPath);
  if (artifact.size !== tarballStat.size) {
    throw new Error("release tarball size mismatch");
  }
  if (artifact.sha256 !== digest("sha256", bytes)) {
    throw new Error("release tarball SHA-256 mismatch");
  }
  if (artifact.npm_shasum !== digest("sha1", bytes)) {
    throw new Error("release tarball npm shasum mismatch");
  }
  if (artifact.npm_integrity !== `sha512-${digest("sha512", bytes, "base64")}`) {
    throw new Error("release tarball npm integrity mismatch");
  }
  if (!Number.isSafeInteger(artifact.entry_count) || artifact.entry_count < REQUIRED_FILES.length) {
    throw new Error("release tarball entry count is invalid");
  }
  return { manifest, manifestPath: resolvedManifest, tarballPath };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (command === "build") {
    if (!options["output-dir"]) {
      throw new Error("build requires --output-dir <empty-directory>");
    }
    const result = await buildReleaseArtifact({ repoRoot, outputDir: options["output-dir"] });
    console.log(JSON.stringify({ manifest: result.manifestPath, tarball: result.tarballPath }));
    return;
  }
  if (command === "verify") {
    if (!options.manifest) {
      throw new Error("verify requires --manifest <path>");
    }
    const result = await verifyReleaseArtifact({
      manifestPath: options.manifest,
      expectedCommit: options["expected-commit"] ?? null,
    });
    console.log(JSON.stringify({ verified: result.manifestPath, tarball: result.tarballPath }));
    return;
  }
  throw new Error("usage: release-artifact.mjs build --output-dir <dir> | verify --manifest <path> [--expected-commit <sha>]");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
