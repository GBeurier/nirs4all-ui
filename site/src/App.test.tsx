import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import * as componentExports from "../../src/components/index.js";
import packageJson from "../../package.json" with { type: "json" };
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

    for (const propsInterface of [
      "RuntimeEngineBadgeProps",
      "RuntimeResultStatusBadgeProps",
      "RuntimeDiagnosticListProps",
      "MetricValueBadgeProps",
    ]) {
      expect(markup).toContain(propsInterface);
    }

    expect(markup).toContain("nirs4all-ui/score");
    expect(markup).toContain("nirs4all-ui/runtime");
    expect(markup).toContain(`v${packageJson.version}`);
    expect(markup).toContain("RUNTIME_RESULT_STATUS_DISPLAY");
    expect(markup).toContain("ALL_SCORE_METRICS");

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
});
