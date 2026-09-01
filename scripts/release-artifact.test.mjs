import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ARTIFACT_SCHEMA, MANIFEST_FILENAME, verifyReleaseArtifact } from "./release-artifact.mjs";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

function digest(algorithm, bytes, encoding = "hex") {
  return createHash(algorithm).update(bytes).digest(encoding);
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "n4a-ui-release-test-"));
  const filename = "nirs4all-ui-0.1.12.tgz";
  const bytes = Buffer.from("portable tarball fixture");
  await writeFile(join(directory, filename), bytes);
  const manifest = {
    schema_version: ARTIFACT_SCHEMA,
    package: {
      name: "nirs4all-ui",
      version: "0.1.12",
      repository: "git+https://github.com/GBeurier/nirs4all-ui.git",
    },
    source: { commit_sha: COMMIT, dirty: false },
    artifact: {
      filename,
      size: bytes.length,
      sha256: digest("sha256", bytes),
      npm_integrity: `sha512-${digest("sha512", bytes, "base64")}`,
      npm_shasum: digest("sha1", bytes),
      entry_count: 4,
      required_files: ["LICENSE", "dist/index.d.ts", "dist/index.js", "package.json"],
    },
  };
  const manifestPath = join(directory, MANIFEST_FILENAME);
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  return { bytes, directory, manifest, manifestPath };
}

test("verifies exact package bytes and source commit", async () => {
  const { manifestPath } = await fixture();
  const result = await verifyReleaseArtifact({ manifestPath, expectedCommit: COMMIT });
  assert.equal(result.manifest.source.commit_sha, COMMIT);
});

test("rejects a tampered package", async () => {
  const { directory, manifest, manifestPath } = await fixture();
  await writeFile(join(directory, manifest.artifact.filename), "tampered");
  await assert.rejects(verifyReleaseArtifact({ manifestPath }), /size mismatch|SHA-256 mismatch/);
});

test("rejects a source-commit mismatch", async () => {
  const { manifestPath } = await fixture();
  await assert.rejects(
    verifyReleaseArtifact({ manifestPath, expectedCommit: "f".repeat(40) }),
    /source commit mismatch/,
  );
});

test("rejects extra manifest fields", async () => {
  const { manifest, manifestPath } = await fixture();
  manifest.untrusted = true;
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await assert.rejects(verifyReleaseArtifact({ manifestPath }), /release manifest keys differ/);
});
