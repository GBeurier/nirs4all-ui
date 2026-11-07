// SPDX-License-Identifier: CeCILL-2.1 OR AGPL-3.0-or-later
//
// Optional self-contained browser entry (`src/browser/index.tsx`). Runs after `tsc` in
// `npm run build`, writing beside tsc's declarations without erasing them:
//   dist/browser/nirs4all-ui-browser.mjs      ESM, no global assignment
//   dist/browser/nirs4all-ui-browser.iife.js  classic script, global `Nirs4allUIBrowser`
//   dist/browser/browser.css                  class-scoped styles
// React, React DOM (client) and scheduler are bundled: no externals, no dynamic chunks.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

function installedVersion(name: string): string {
  const manifest = JSON.parse(readFileSync(resolve(root, "node_modules", name, "package.json"), "utf8")) as { version: string };
  return manifest.version;
}

const banner =
  "/*! nirs4all-ui browser entry | CeCILL-2.1 OR AGPL-3.0-or-later | bundles " +
  `react ${installedVersion("react")}, react-dom ${installedVersion("react-dom")} and scheduler ${installedVersion("scheduler")} ` +
  "(MIT, Copyright (c) Meta Platforms, Inc. and affiliates); see THIRD_PARTY_NOTICES.md and LICENSES/THIRD-PARTY/ */";

export default defineConfig({
  root,
  publicDir: false,
  // React's CommonJS entries branch on process.env.NODE_ENV; library mode does not replace it.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  esbuild: { jsx: "automatic" },
  build: {
    outDir: resolve(root, "dist/browser"),
    emptyOutDir: false,
    copyPublicDir: false,
    cssCodeSplit: false,
    sourcemap: false,
    lib: {
      entry: resolve(root, "src/browser/index.tsx"),
      name: "Nirs4allUIBrowser",
      formats: ["es", "iife"],
      fileName: (format) => (format === "es" ? "nirs4all-ui-browser.mjs" : "nirs4all-ui-browser.iife.js"),
      cssFileName: "browser",
    },
    rollupOptions: {
      external: [],
      output: {
        inlineDynamicImports: true,
        banner,
      },
    },
  },
});
