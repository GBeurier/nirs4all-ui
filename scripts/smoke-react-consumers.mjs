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
import { components, runtime, score } from "nirs4all-ui";
import {
  MetricValueBadge,
  RuntimeDiagnosticList,
  RuntimeEngineBadge,
  RuntimeResultStatusBadge,
  type MetricValueBadgeProps,
} from "nirs4all-ui/components";
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

const metric: MetricDefinition | undefined = getMetricDefinition("accuracy");
const formatted: string = formatMetricValue(0.91234, metric?.key);
const rootFormatted: string = score.formatMetricValue(0.12345, "rmse");
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

const metricBadge: ReactElement = createElement(MetricValueBadge, badgeProps);
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

renderToString(createElement("section", null, metricBadge, rootMetricBadge, statusBadge, engineBadge, diagnosticsList));
`,
  );

  await writeFile(
    path.join(consumerDir, "src", "runtime-smoke.mjs"),
    `import React from "react";
import { renderToString } from "react-dom/server";
import { components, runtime, score } from "nirs4all-ui";
import { MetricValueBadge, RuntimeResultStatusBadge } from "nirs4all-ui/components";
import { buildRuntimeResultStatusView } from "nirs4all-ui/runtime";
import { canonicalMetricKey, formatMetricValue } from "nirs4all-ui/score";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(score.canonicalMetricKey("r2-score") === "r2", "root score namespace import failed");
assert(canonicalMetricKey("r2_score") === "r2", "score subpath import failed");

const status = buildRuntimeResultStatusView("running", 33);
assert(runtime.buildRuntimeResultStatusView("completed").label === "Completed", "runtime root namespace import failed");
assert(status.progress === 33, "runtime subpath import failed");

const html = renderToString(React.createElement("section", null,
  React.createElement(MetricValueBadge, { metric: "accuracy", value: 0.95, compareTo: 0.9 }),
  React.createElement(RuntimeResultStatusBadge, { view: status }),
  React.createElement(components.MetricValueBadge, { metric: "rmse", value: 1.2345 }),
));

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
