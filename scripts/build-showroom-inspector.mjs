import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const publication = join(root, "site/public/n4a-inspector");
const archive = join(publication, "source.tar.gz");
const host = join(root, "site/inspector-host");
const scratch = mkdtempSync(join(tmpdir(), "showroom-inspector-"));
const digest = bytes => ({ bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
const inventory = file => digest(readFileSync(file));

try {
  execFileSync("tar", ["-xzf", archive, "-C", scratch]);
  const source = join(scratch, "n4a-inspector-source");
  const ui = join(source, "nirs4all-ui");
  const web = join(source, "nirs4all-web/web-app");
  const core = join(source, "nirs4all-core/bindings/wasm");
  const io = join(source, "nirs4all-io/bindings/wasm");
  const dag = join(source, "dag-ml/bindings/js");
  const native = join(core, "native");
  const dagRuntime = join(web, "src/engine/wasm/dagml");
  const methodsRuntime = join(web, "src/engine/wasm/methods");
  const stagedHost = join(ui, "site/inspector-host");
  const assets = join(publication, "assets");
  const { native: nativeHashes, executionRuntimes } = JSON.parse(readFileSync(join(source, "native-provenance.json"), "utf8"));
  const oldFiles = readdirSync(assets);

  const glue = join(native, "nirs4all_core_wasm_native.js");
  // The first UI build imports the exact source glue for the already deployed Core artifact.
  if (process.argv[2]) {
    mkdirSync(native, { recursive: true });
    cpSync(process.argv[2], glue);
  }
  if (inventory(glue).sha256 !== nativeHashes["nirs4all_core_wasm_native.js"].sha256) throw new Error("Core glue digest changed");
  const wasmFiles = [
    [join(native, "nirs4all_core_wasm_native_bg.wasm"), nativeHashes["nirs4all_core_wasm_native_bg.wasm"]],
    [join(dagRuntime, "dag_ml_wasm_bg.wasm"), executionRuntimes["dagml/dag_ml_wasm_bg.wasm"]],
    [join(methodsRuntime, "n4m.wasm"), executionRuntimes["methods/n4m.wasm"]],
  ];
  for (const [destination, expected] of wasmFiles) {
    const name = oldFiles.find(file => file.endsWith(".wasm") && inventory(join(assets, file)).sha256 === expected.sha256);
    if (!name) throw new Error(`Missing deployed WASM with SHA-256 ${expected.sha256}`);
    cpSync(join(assets, name), destination);
  }

  const buildRecordPath = join(publication, "inspection-build.json");
  const record = JSON.parse(readFileSync(buildRecordPath, "utf8"));
  for (const [key, expected] of Object.entries(executionRuntimes)) {
    if (inventory(join(web, "src/engine/wasm", key)).sha256 !== expected.sha256) throw new Error(`Runtime digest changed: ${key}`);
  }
  // Package this UI source alongside the previously published owner source.
  rmSync(stagedHost, { recursive: true, force: true });
  cpSync(host, stagedHost, { recursive: true, filter: file => !file.endsWith(".test.ts") });
  const buildScript = join(ui, "scripts/build-showroom-inspector.mjs");
  mkdirSync(join(ui, "scripts"), { recursive: true });
  cpSync(fileURLToPath(import.meta.url), buildScript);
  for (const folder of [ui, web]) symlinkSync(join(root, "node_modules"), join(folder, "node_modules"), "dir");
  const aliases = [
    { find: "nirs4all-ui/n4aInspector", replacement: join(ui, "src/n4aInspector/index.ts") },
    { find: "nirs4all-ui/assets", replacement: join(ui, "assets") },
    { find: "nirs4all/actions", replacement: join(core, "src/n4a.js") },
    { find: "@nirs4all/io-wasm/inspection", replacement: join(io, "inspection.mjs") },
    { find: "@nirs4all/io-wasm/public-dataset", replacement: join(io, "public-dataset.mjs") },
    { find: "dag-ml-wasm/artifact-inspector", replacement: join(dag, "artifact_inspector.mjs") },
    { find: "dag-ml-wasm/n4m-estimator-controller", replacement: join(dagRuntime, "n4m_estimator_controller.mjs") },
    { find: /^dag-ml-wasm$/, replacement: join(dagRuntime, "dag_ml_wasm.js") },
    { find: /^@nirs4all\/methods$/, replacement: join(methodsRuntime, "index.js") },
    { find: "#web-inspection-port", replacement: join(web, "src/lib/n4a-inspection-port.ts") },
  ];
  const nativeBridge = {
    name: "showroom-selected-core",
    enforce: "pre",
    resolveId(name, importer) {
      if (name === "nirs4all") return "\0showroom-core-inspection";
      if (name === "./index.js" && ["/src/n4a.js", "/src/archive-v2.js"].some(suffix => importer?.endsWith(suffix))) {
        return join(stagedHost, "runtime.ts");
      }
    },
    load(id) {
      if (id === "\0showroom-core-inspection") {
        return ["n4a-inspection.js", "n4a-storage.js"].map(name => `export * from ${JSON.stringify(join(core, "src", name))};`).join("\n");
      }
    },
  };
  const output = join(scratch, "dist");
  await build({
    configFile: false, root: stagedHost, publicDir: false, base: "./",
    resolve: { alias: aliases, dedupe: ["react", "react-dom"] },
    plugins: [nativeBridge], worker: { format: "es", plugins: () => [nativeBridge] },
    build: { outDir: output, emptyOutDir: false, target: "es2022", assetsInlineLimit: 0 },
  });
  for (const [file, expected] of wasmFiles) {
    if (!readdirSync(join(output, "assets")).some(name => name.endsWith(".wasm") &&
      inventory(join(output, "assets", name)).sha256 === expected.sha256)) throw new Error(`Built bundle omitted ${file}`);
    rmSync(file);
  }

  for (const folder of [ui, web]) rmSync(join(folder, "node_modules"));
  const archiveReadme = join(source, "README.md");
  const readme = readFileSync(archiveReadme, "utf8");
  const archiveNote = "The published showroom UI source is under nirs4all-ui/site/inspector-host.";
  if (!readme.includes(archiveNote)) writeFileSync(archiveReadme, readme + "\n" + archiveNote + " The original Web host and owner adapters are retained for provenance. Rebuild instructions are in the UI checkout.\n");
  const nextArchive = join(scratch, "source.tar.gz");
  execFileSync("tar", ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "-czf", nextArchive, "-C", scratch, "n4a-inspector-source"]);

  for (const key of Object.keys(record.outputs)) if (key.startsWith("assets/")) delete record.outputs[key];
  for (const name of readdirSync(join(output, "assets"))) record.outputs[`assets/${name}`] = inventory(join(output, "assets", name));
  record.outputs["index.html"] = inventory(join(output, "index.html"));
  record.outputs["source.tar.gz"] = inventory(nextArchive);
  for (const name of readdirSync(stagedHost)) record.sources[`nirs4all-ui/site/inspector-host/${name}`] = inventory(join(stagedHost, name));
  record.sources["nirs4all-ui/scripts/build-showroom-inspector.mjs"] = inventory(buildScript);
  record.note = "UI showroom source built with the previously published owner WASM cohort and verified runtime hashes.";
  record.publication.note = "Existing UI GitHub Pages channel. WASM artifacts are reused byte for byte.";
  rmSync(assets, { recursive: true });
  cpSync(join(output, "assets"), assets, { recursive: true });
  cpSync(join(output, "index.html"), join(publication, "index.html"));
  cpSync(nextArchive, archive);
  writeFileSync(buildRecordPath, JSON.stringify(record, null, 2) + "\n");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
