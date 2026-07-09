#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");

const consumers = [
  {
    label: "react-18",
    dependencies: {
      "@types/react": "18.3.31",
      "@types/react-dom": "18.3.7",
      "react": "18.3.1",
      "react-dom": "18.3.1",
      "typescript": "5.8.3",
    },
  },
  {
    label: "react-19",
    dependencies: {
      "@types/react": "19.2.17",
      "@types/react-dom": "19.2.3",
      "react": "19.2.7",
      "react-dom": "19.2.7",
      "typescript": "5.8.3",
    },
  },
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? packageRoot,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.status !== 0) {
    if (options.capture) {
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }

  return result.stdout ?? "";
}

function parsePackOutput(stdout) {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Unable to parse npm pack --json output:\n${stdout}`);
  }

  const [entry] = JSON.parse(stdout.slice(start, end + 1));
  if (!entry?.filename) {
    throw new Error(`npm pack did not report a tarball filename:\n${stdout}`);
  }
  return entry.filename;
}

function dependencySpecs(dependencies) {
  return Object.entries(dependencies).map(([name, version]) => `${name}@${version}`);
}

async function writeConsumerProject(consumerDir, label) {
  await mkdir(path.join(consumerDir, "src"), { recursive: true });

  await writeFile(
    path.join(consumerDir, "package.json"),
    `${JSON.stringify({
      name: `nirs4all-ui-${label}-packed-consumer-smoke`,
      private: true,
      type: "module",
      scripts: {
        typecheck: "tsc --noEmit",
        smoke: "node src/runtime-smoke.mjs",
      },
    }, null, 2)}\n`,
  );

  await writeFile(
    path.join(consumerDir, "tsconfig.json"),
    `${JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        jsx: "react-jsx",
        skipLibCheck: false,
        forceConsistentCasingInFileNames: true,
        verbatimModuleSyntax: true,
      },
      include: ["src/**/*.ts", "src/**/*.tsx"],
    }, null, 2)}\n`,
  );

  await writeFile(
    path.join(consumerDir, "src", "type-smoke.tsx"),
    `import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
	import { brand, components, dataset, datasetBuilder, lab, runtime, score, styles } from "nirs4all-ui";
	import {
	  generateNirs4allBrandSvg,
	  type Nirs4allBrandDefinition,
	} from "nirs4all-ui/brand";
	import {
	  DatasetPreviewCard,
	  MetricValueBadge,
	  RuntimeDiagnosticList,
	  RuntimeEngineBadge,
	  RuntimeResultStatusBadge,
	  type DatasetPreviewCardProps,
	  type MetricValueBadgeProps,
	} from "nirs4all-ui/components";
	import {
	  buildDatasetPreview,
	  type DatasetPreviewView,
	} from "nirs4all-ui/dataset";
	import {
	  autoDetectSource,
	  buildExportConfig,
	  type DatasetSource,
	} from "nirs4all-ui/datasetBuilder";
	import {
	  buildDecisionView,
	  getSampleStatusDisplay,
	  type DecisionView,
	} from "nirs4all-ui/lab";
	import {
	  buildRuntimeResultStatusView,
  normalizeRuntimeDiagnostics,
  type RuntimeDiagnosticItem,
  type RuntimeResultStatusView,
} from "nirs4all-ui/runtime";
import {
  formatMetricValue,
  getMetricDefinition,
  type MetricDefinition,
} from "nirs4all-ui/score";
import {
  getNirs4allStyleAsset,
  type Nirs4allStyleAsset,
} from "nirs4all-ui/styles";

	const metric: MetricDefinition | undefined = getMetricDefinition("accuracy");
	const formatted: string = formatMetricValue(0.91234, metric?.key);
	const rootFormatted: string = score.formatMetricValue(0.12345, "rmse");
	const uiBrand: Nirs4allBrandDefinition = brand.getNirs4allBrandDefinition("nirs4all-ui");
	const brandSvg: string = generateNirs4allBrandSvg(uiBrand, { variant: "icon" });
	const styleAsset: Nirs4allStyleAsset = getNirs4allStyleAsset("default-theme");
	const builderStyleAsset: Nirs4allStyleAsset = getNirs4allStyleAsset("dataset-builder");
	const labStyleAsset: Nirs4allStyleAsset = getNirs4allStyleAsset("quality-lab-theme");
	const primaryVariable: string = styles.getNirs4allCssVariable("n4-color-primary");
	const builderSource: DatasetSource = {
	  id: "spectra",
	  name: "packed-consumer.csv",
	  kind: "file",
	  fileType: "csv",
	  signalType: "spectra",
	  status: "parsed",
	  rowCount: 4,
	  columnCount: 4,
	  parsing: { separator: ",", decimal: ".", headerMode: "horizontal" },
	  usage: { useAs: "x_train" },
	  columns: [
	    { id: "sample_id", name: "sample_id", detectedType: "text", assignedRole: "ignored" },
	    { id: "target", name: "protein", detectedType: "float", assignedRole: "y" },
	    { id: "wl_1000", name: "1000", detectedType: "float", assignedRole: "x" },
	    { id: "wl_1001", name: "1001", detectedType: "float", assignedRole: "x" },
	  ],
	};
	const detectedSource: DatasetSource = autoDetectSource(builderSource);
	const exportConfigName: string = buildExportConfig("packed_consumer", [detectedSource]).name;
	const rootExportConfigName: string = datasetBuilder.buildExportConfig("root_consumer", [detectedSource]).name;
	const decision: DecisionView = buildDecisionView({ applicabilityScore: 0.2 }, null, "en");
	const rootDecision: DecisionView = lab.buildDecisionView({ gateRejected: true }, null, "en");
	const sampleStatusLabel: string = getSampleStatusDisplay("integrated").label;
	const datasetPreview: DatasetPreviewView | null = buildDatasetPreview({
	  name: "Packed consumer dataset",
	  taskType: "regression",
	  sampleCount: 12,
	  wavelengthCount: 64,
	});
	const rootDatasetPreview: DatasetPreviewView | null = dataset.buildDatasetPreview({
	  name: "Root namespace dataset",
	  taskType: "classification",
	  classCount: 3,
	});
	const status: RuntimeResultStatusView = buildRuntimeResultStatusView("running", 42);
const rootStatus: RuntimeResultStatusView = runtime.buildRuntimeResultStatusView("completed");
const diagnostics: RuntimeDiagnosticItem[] = normalizeRuntimeDiagnostics([
  { message: "GPU unavailable", cause: "unsupported_capability" },
]);

const defaultIcon: ReactNode = createElement("span", null, "D");
const badgeProps: MetricValueBadgeProps = {
  metric: metric?.key ?? "accuracy",
  value: formatted,
  compareTo: "0.9000",
};
const datasetCardProps: DatasetPreviewCardProps = {
  view: datasetPreview,
};

const datasetCard: ReactElement = createElement(DatasetPreviewCard, datasetCardProps);
const metricBadge: ReactElement = createElement(MetricValueBadge, badgeProps);
const rootDatasetCard: ReactElement = createElement(components.DatasetPreviewCard, { view: rootDatasetPreview });
const rootMetricBadge: ReactElement = createElement(components.MetricValueBadge, {
  metric: "rmse",
  value: rootFormatted,
});
const statusBadge: ReactElement = createElement(RuntimeResultStatusBadge, { view: status });
const engineBadge: ReactElement = createElement(RuntimeEngineBadge, {
  status: {
    engine: "dag-ml",
    engineLabel: "DAG-ML",
    requestedEngine: null,
    requestedEngineLabel: null,
    badgeLabel: rootStatus.label,
    detailLabel: null,
    isFallback: false,
    tone: "success",
    diagnostics,
  },
  defaultIcon,
});
const diagnosticsList: ReactElement = createElement(RuntimeDiagnosticList, { diagnostics });
	const visualMetadata: ReactElement = createElement(
	  "span",
	  null,
	  uiBrand.name,
	  brandSvg.length,
	  styleAsset.path,
	  builderStyleAsset.path,
	  labStyleAsset.path,
	  primaryVariable,
	  exportConfigName,
	  rootExportConfigName,
	  decision.label,
	  rootDecision.color,
	  sampleStatusLabel,
	);

renderToString(createElement("section", null, datasetCard, metricBadge, rootDatasetCard, rootMetricBadge, statusBadge, engineBadge, diagnosticsList, visualMetadata));
`,
  );

  await writeFile(
    path.join(consumerDir, "src", "runtime-smoke.mjs"),
    `import React from "react";
import { renderToString } from "react-dom/server";
import { brand, components, dataset, datasetBuilder, lab, runtime, score, styles } from "nirs4all-ui";
import { generateNirs4allBrandSvg, getNirs4allBrandDefinition } from "nirs4all-ui/brand";
import { DatasetPreviewCard, MetricValueBadge, RuntimeResultStatusBadge } from "nirs4all-ui/components";
import { buildDatasetPreview } from "nirs4all-ui/dataset";
import { buildExportConfig } from "nirs4all-ui/datasetBuilder";
import { buildDecisionView } from "nirs4all-ui/lab";
import { buildRuntimeResultStatusView } from "nirs4all-ui/runtime";
import { canonicalMetricKey, formatMetricValue } from "nirs4all-ui/score";
import { getNirs4allCssVariable, getNirs4allStyleAsset } from "nirs4all-ui/styles";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(score.canonicalMetricKey("r2-score") === "r2", "root score namespace import failed");
assert(canonicalMetricKey("r2_score") === "r2", "score subpath import failed");
assert(dataset.buildDatasetPreview({ name: "Root dataset" })?.title === "Root dataset", "root dataset namespace import failed");
assert(brand.getNirs4allBrandDefinition("nirs4all-core").shortName === "n4o", "root brand namespace import failed");
assert(getNirs4allBrandDefinition("nirs4all-ui").role === "Reusable visual system", "brand subpath import failed");
assert(generateNirs4allBrandSvg("nirs4all-ui", { variant: "icon" }).includes("nirs4all-ui"), "brand generator failed");
assert(styles.getNirs4allStyleAsset("default-theme").path.endsWith("nirs4all-default.css"), "root styles namespace import failed");
assert(styles.getNirs4allStyleAsset("quality-lab-theme").path.endsWith("theme.css"), "root lab theme asset import failed");
assert(getNirs4allStyleAsset("spectra-motion").path.endsWith("nirs-spectra.svg"), "styles subpath import failed");
assert(getNirs4allStyleAsset("dataset-builder").path.endsWith("datasetBuilder.css"), "dataset builder style asset failed");
assert(getNirs4allCssVariable("n4-color-primary") === "var(--n4-color-primary)", "style token helper failed");
assert(lab.buildDecisionView({ applicabilityScore: 0.1 }, null, "en").color === "reliable", "root lab namespace import failed");
assert(buildDecisionView({ gateRejected: true }, null, "en").color === "out_of_domain", "lab subpath import failed");

const builderSource = {
  id: "spectra",
  name: "packed-consumer.csv",
  kind: "file",
  fileType: "csv",
  signalType: "spectra",
  status: "parsed",
  rowCount: 4,
  columnCount: 4,
  parsing: { separator: ",", decimal: ".", headerMode: "horizontal" },
  usage: { useAs: "x_train" },
  columns: [
    { id: "sample_id", name: "sample_id", detectedType: "text", assignedRole: "id" },
    { id: "target", name: "protein", detectedType: "float", assignedRole: "y" },
    { id: "wl_1000", name: "1000", detectedType: "float", assignedRole: "x" },
    { id: "wl_1001", name: "1001", detectedType: "float", assignedRole: "x" },
  ],
};
assert(datasetBuilder.buildExportConfig("root_consumer", [builderSource]).name === "root_consumer", "root datasetBuilder namespace import failed");
assert(buildExportConfig("packed_consumer", [builderSource]).targets.length === 1, "datasetBuilder subpath import failed");

const datasetPreview = buildDatasetPreview({
  name: "Packed consumer dataset",
  taskType: "regression",
  sampleCount: 12,
  wavelengthCount: 64,
});
assert(datasetPreview?.sampleCountLabel === "12 samples", "dataset subpath import failed");

const status = buildRuntimeResultStatusView("running", 33);
assert(runtime.buildRuntimeResultStatusView("completed").label === "Completed", "runtime root namespace import failed");
assert(status.progress === 33, "runtime subpath import failed");

const html = renderToString(React.createElement("section", null,
  React.createElement(DatasetPreviewCard, { view: datasetPreview }),
  React.createElement(MetricValueBadge, { metric: "accuracy", value: 0.95, compareTo: 0.9 }),
  React.createElement(RuntimeResultStatusBadge, { view: status }),
  React.createElement(components.DatasetPreviewCard, { dataset: { name: "Root component dataset" } }),
  React.createElement(components.MetricValueBadge, { metric: "rmse", value: 1.2345 }),
));

assert(html.includes("Packed consumer dataset"), "dataset component subpath render failed");
assert(html.includes("Acc"), "component subpath render failed");
assert(html.includes(formatMetricValue(1.2345, "rmse")), "root component namespace render failed");
console.log("${label}: packed consumer imports, render, and types passed");
`,
  );
}

async function smokeConsumer(rootDir, tarballPath, consumer) {
  const consumerDir = path.join(rootDir, consumer.label);
  await writeConsumerProject(consumerDir, consumer.label);

  run("npm", [
    "install",
    "--no-audit",
    "--fund=false",
    "--package-lock=false",
    "--ignore-scripts",
    "--save-exact",
    ...dependencySpecs(consumer.dependencies),
    tarballPath,
  ], { cwd: consumerDir });

  run("npm", ["run", "typecheck"], { cwd: consumerDir });
  run("npm", ["run", "smoke"], { cwd: consumerDir });
}

const tempRoot = await mkdtemp(path.join(tmpdir(), "nirs4all-ui-react-smoke-"));

try {
  console.log("Packing nirs4all-ui...");
  const packOutput = run("npm", ["pack", "--json", "--pack-destination", tempRoot], { capture: true });
  const tarballPath = path.join(tempRoot, parsePackOutput(packOutput));

  for (const consumer of consumers) {
    console.log(`Testing packed consumer with ${consumer.label}...`);
    await smokeConsumer(tempRoot, tarballPath, consumer);
  }

  console.log("React 18/19 packed-consumer smoke passed.");
} finally {
  if (process.env.NIRS4ALL_UI_SMOKE_KEEP_TEMP === "1") {
    console.log(`Keeping smoke temp directory: ${tempRoot}`);
  } else {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
