import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import * as componentExports from "../../src/components/index.js";
import * as datasetBuilderExports from "../../src/datasetBuilder/index.js";
import * as labExports from "../../src/lab/index.js";
import { NIRS4ALL_STYLE_ASSETS } from "../../src/styles/index.js";
import packageJson from "../../package.json" with { type: "json" };
import { TOP_LEVEL_VISUAL_ASSETS, VISUAL_ASSET_GROUPS } from "../vite.config.js";
import { App } from "./App.js";
import { CANONICAL_SITE_URL, PUBLICATION_ASSETS } from "./showcaseMetadata.js";

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(directory, "..", "..");

function readRepositoryFile(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

describe("GitHub Pages showcase", () => {
  it("renders every public component export and publication asset", () => {
    const markup = renderToStaticMarkup(<App />);

    for (const component of Object.keys(componentExports)) {
      expect(markup).toContain(component);
    }

    for (const exported of Object.keys(datasetBuilderExports)) {
      expect(markup).toContain(exported);
    }

    for (const exported of Object.keys(labExports)) {
      expect(markup).toContain(exported);
    }

    for (const propsInterface of [
      "DatasetPreviewCardProps",
      "RuntimeEngineBadgeProps",
      "RuntimeResultStatusBadgeProps",
      "RuntimeDiagnosticListProps",
      "MetricValueBadgeProps",
    ]) {
      expect(markup).toContain(propsInterface);
    }

    expect(markup).toContain("nirs4all-ui/dataset");
    expect(markup).toContain("nirs4all-ui/score");
    expect(markup).toContain("nirs4all-ui/runtime");
    expect(markup).toContain("nirs4all-ui/brand");
    expect(markup).toContain("nirs4all-ui/styles");
    expect(markup).toContain("nirs4all-ui/lab");
    expect(markup).toContain("nirs4all-ui/datasetBuilder");
    expect(markup).toContain(`v${packageJson.version}`);
    expect(markup).toContain("buildDatasetPreview");
    expect(markup).toContain("RUNTIME_RESULT_STATUS_DISPLAY");
    expect(markup).toContain("ALL_SCORE_METRICS");
    expect(markup).toContain("Custom Host Integration");
    expect(markup).toContain("nirs4all-core");
    expect(markup).toContain("nirs4all-providers");
    expect(markup).toContain("nirs4all-quality");
    expect(markup).toContain("custom app host");
    expect(markup).toContain("Consumer import surface");
    expect(markup).toContain("nirs4all-ui/assets/brand/icon.svg");
    expect(markup).toContain("assets/brands/nirs4all-core/horizontal.svg");
    expect(markup).toContain("assets/brands/nirs4all-providers/horizontal.svg");
    expect(markup).toContain("assets/brands/nirs4all-ui/horizontal.svg");
    expect(markup).toContain("assets/brands/nirs4all-quality/horizontal.svg");
    expect(markup).toContain("generateNirs4allBrandSvg");
    expect(markup).toContain("NIRS4ALL_DEFAULT_THEME");
    expect(markup).toContain("assets/styles/nirs4all-default.css");
    expect(markup).toContain("assets/datasetBuilder.css");
    expect(markup).toContain("assets/theme.css");
    expect(markup).toContain("assets/motion/nirs-spectra.svg");

    for (const asset of PUBLICATION_ASSETS) {
      expect(markup).toContain(asset.name);
      expect(markup).toContain(asset.path);
    }

    expect(markup).toContain(CANONICAL_SITE_URL);
    expect(markup).toContain("site/public/logo.svg mirrors assets/brand/horizontal.svg");
  });

  it("keeps publication metadata and mirrored brand assets coherent", () => {
    const robots = readRepositoryFile("site/public/robots.txt");
    const sitemap = readRepositoryFile("site/public/sitemap.xml");
    const indexHtml = readRepositoryFile("site/index.html");
    const manifest = JSON.parse(readRepositoryFile("site/public/site.webmanifest")) as {
      name: string;
      start_url: string;
      display: string;
      icons: Array<{ src: string }>;
    };

    expect(readRepositoryFile("site/public/logo.svg"))
      .toBe(readRepositoryFile("assets/brand/horizontal.svg"));
    expect(readRepositoryFile("site/public/favicon.svg"))
      .toBe(readRepositoryFile("assets/brand/icon.svg"));
    expect(readRepositoryFile("assets/brands/README.md"))
      .toContain("NIRS4ALL reusable brand assets");
    expect(readRepositoryFile("assets/styles/nirs4all-default.css"))
      .toContain("--n4-color-primary");
    expect(readRepositoryFile("assets/datasetBuilder.css"))
      .toContain(".dsb");
    expect(readRepositoryFile("assets/theme.css"))
      .toContain("--success");
    expect(readRepositoryFile("assets/motion/nirs-spectra.svg"))
      .toContain("Animated NIRS spectra motif");

    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain(`Sitemap: ${CANONICAL_SITE_URL}sitemap.xml`);

    expect(sitemap).toContain(`<loc>${CANONICAL_SITE_URL}</loc>`);
    expect(indexHtml).toContain(`<link rel="canonical" href="${CANONICAL_SITE_URL}" />`);
    expect(indexHtml).toContain(
      `<meta property="og:image" content="${CANONICAL_SITE_URL}assets/brand/nirs4all-ui/og.png" />`,
    );

    expect(manifest.name).toBe("nirs4all-ui");
    expect(manifest.start_url).toBe("./");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      "./favicon.svg",
      "./assets/brand/nirs4all-ui/icon-180.png",
      "./assets/brand/nirs4all-ui/icon-256.png",
      "./assets/brand/nirs4all-ui/icon-512.png",
    ]);
  });

  it("copies every showcased style asset into the Pages build", () => {
    const recursiveAssetRoots = new Set<string>([
      ...VISUAL_ASSET_GROUPS.map((group) => `assets/${group}/`),
      "assets/brand/nirs4all-ui/",
    ]);
    const topLevelAssets = new Set<string>(
      TOP_LEVEL_VISUAL_ASSETS.map((asset) => `assets/${asset}`),
    );

    for (const asset of NIRS4ALL_STYLE_ASSETS) {
      expect(readRepositoryFile(asset.path).length).toBeGreaterThan(0);
      const copiedByRecursiveGroup = [...recursiveAssetRoots].some((root) =>
        asset.path.startsWith(root),
      );
      expect(copiedByRecursiveGroup || topLevelAssets.has(asset.path)).toBe(true);
    }
  });
});
