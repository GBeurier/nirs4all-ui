import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";

const configDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(configDirectory, "..");

function copyBrandAssets(): Plugin {
  let outputDirectory = "";

  return {
    name: "nirs4all-ui-brand-assets",
    apply: "build",
    configResolved(config) {
      outputDirectory = isAbsolute(config.build.outDir)
        ? config.build.outDir
        : resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const source = resolve(repositoryRoot, "assets", "brand");
      const target = resolve(outputDirectory, "assets", "brand", "nirs4all-ui");

      if (!existsSync(source)) {
        throw new Error(`Missing nirs4all-ui brand assets at ${source}`);
      }

      rmSync(target, { recursive: true, force: true });
      mkdirSync(target, { recursive: true });
      const files = readdirSync(source, { withFileTypes: true }).filter((entry) => entry.isFile());

      if (files.length === 0) {
        throw new Error(`Missing nirs4all-ui brand asset files at ${source}`);
      }

      for (const file of files) {
        copyFileSync(resolve(source, file.name), resolve(target, file.name));
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
  plugins: [copyBrandAssets()],
  publicDir: "public",
  root: "site",
});
