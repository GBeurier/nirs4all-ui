import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";

const configDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(configDirectory, "..");

export const VISUAL_ASSET_GROUPS = ["brands", "styles", "motion"] as const;
export const TOP_LEVEL_VISUAL_ASSETS = ["conformal.css", "dag.css", "datasetBuilder.css", "theme.css", "viz.css"] as const;

function copyVisualAssets(): Plugin {
  let outputDirectory = "";

  return {
    name: "nirs4all-ui-visual-assets",
    apply: "build",
    configResolved(config) {
      outputDirectory = isAbsolute(config.build.outDir)
        ? config.build.outDir
        : resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const packageBrandSource = resolve(repositoryRoot, "assets", "brand");
      const packageBrandTarget = resolve(outputDirectory, "assets", "brand", "nirs4all-ui");

      if (!existsSync(packageBrandSource)) {
        throw new Error(`Missing nirs4all-ui brand assets at ${packageBrandSource}`);
      }

      rmSync(packageBrandTarget, { recursive: true, force: true });
      mkdirSync(packageBrandTarget, { recursive: true });
      cpSync(packageBrandSource, packageBrandTarget, { recursive: true });

      for (const group of VISUAL_ASSET_GROUPS) {
        const source = resolve(repositoryRoot, "assets", group);
        const target = resolve(outputDirectory, "assets", group);
        if (!existsSync(source)) {
          throw new Error(`Missing nirs4all-ui visual assets at ${source}`);
        }
        rmSync(target, { recursive: true, force: true });
        mkdirSync(target, { recursive: true });
        cpSync(source, target, { recursive: true });
      }

      for (const asset of TOP_LEVEL_VISUAL_ASSETS) {
        const source = resolve(repositoryRoot, "assets", asset);
        const target = resolve(outputDirectory, "assets", asset);
        if (!existsSync(source)) {
          throw new Error(`Missing nirs4all-ui visual asset at ${source}`);
        }
        mkdirSync(dirname(target), { recursive: true });
        cpSync(source, target);
      }
    },
  };
}

export default defineConfig({
  base: process.env.NIRS4ALL_UI_BASE ?? "/nirs4all-ui/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  plugins: [copyVisualAssets()],
  publicDir: "public",
  root: "site",
});
