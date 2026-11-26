// SPDX-License-Identifier: CeCILL-2.1 OR AGPL-3.0-or-later
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PackageGraphView } from "./PackageGraphView.js";
import {
  connectedPackages,
  packageConnections,
  projectPackageReleases,
  type PackageGraph,
  type PackageReleaseTargets,
  type PublicReleaseSnapshot,
} from "./model.js";

const graph: PackageGraph = {
  schema_version: "n4a.artifact-graph/v1",
  artifacts: {
    "io.core-crate": { repository: "nirs4all-io", action: "prepare", inputs: {} },
    "io.node-wasm": { repository: "nirs4all-io", action: "build", inputs: { "io.core-crate": "compile" } },
    "io.browser": { repository: "nirs4all-io", action: "build", inputs: { "io.core-crate": "compile" } },
    "web.site": { repository: "nirs4all-web", action: "assemble", inputs: { "io.browser": "bundle" } },
    "cockpit.site": { repository: "nirs4all-cockpit", action: "refresh", inputs: { "web.site": "observe" } },
  },
};

const releaseTargets: PackageReleaseTargets = {
  schema_version: "n4a.artifact-release-targets/v1",
  artifacts: {
    "io.node-wasm": [{ packageId: "nirs4all-io", registry: "npm", name: "@nirs4all/io-wasm" }],
    "web.site": [{ packageId: "nirs4all-web", registry: "pages", name: "nirs4all-web" }],
    "gone.site": [{ packageId: "nirs4all-web", registry: "pages", name: "nirs4all-web" }],
    "cockpit.site": [{ packageId: "nirs4all-cockpit", registry: "pages", name: "nirs4all-cockpit" }],
  },
};

const snapshot: PublicReleaseSnapshot = {
  schema_version: 1,
  generated_at: "2026-11-26T00:00:00Z",
  packages: [
    {
      id: "nirs4all-io",
      targets: [
        { registry: "github-release", name: "nirs4all-io", published_version: "v0.4.0", status: "green" },
        { registry: "npm", name: "@nirs4all/io-wasm", published_version: "0.3.9", status: "stale" },
      ],
    },
    { id: "nirs4all-web", targets: [{ registry: "pages", name: "nirs4all-web", published_version: null, status: "green" }] },
  ],
};

describe("package graph", () => {
  it("follows both directions without including artifacts that only share an input", () => {
    const edges = packageConnections(graph);
    expect(connectedPackages(edges, "io.browser")).toEqual(new Set(["io.core-crate", "io.browser", "web.site", "cockpit.site"]));
    expect(edges).toContainEqual({ source: "io.browser", target: "web.site", relationship: "bundle" });
  });

  it("joins exact public release targets and preserves unknown versions", () => {
    const releases = projectPackageReleases(graph, releaseTargets, snapshot);
    expect(releases.generatedAt).toBe(snapshot.generated_at);
    expect(releases.byArtifact["io.node-wasm"]).toEqual([
      { registry: "npm", name: "@nirs4all/io-wasm", version: "0.3.9", status: "stale" },
    ]);
    expect(releases.byArtifact["web.site"]?.[0]?.version).toBeNull();
    expect(Object.keys(releases.byArtifact)).toEqual(["io.node-wasm", "web.site"]);
  });

  it("refuses an unknown snapshot schema", () => {
    const futureSnapshot = { ...snapshot, schema_version: 2 };
    expect(() => projectPackageReleases(graph, releaseTargets, futureSnapshot as unknown as PublicReleaseSnapshot))
      .toThrow("Unsupported package graph or release snapshot schema");
  });

  it("renders an accessible diagram and an equivalent table with exact release states", () => {
    const html = renderToStaticMarkup(<PackageGraphView graph={graph} releases={projectPackageReleases(graph, releaseTargets, snapshot)} />);
    expect(html).toContain('role="img"');
    expect(html).toContain("5 artifacts · 3 repositories · 4 relationships");
    expect(html).toContain('data-relationship="bundle"');
    expect(html).toContain("View artifact and dependency table");
    expect(html).toContain("0.3.9");
    expect(html).toContain("Version unavailable");
    expect(html).toContain("No release observation");
    expect(html).not.toContain("v0.4.0");
  });
});
