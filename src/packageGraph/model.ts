// SPDX-License-Identifier: CeCILL-2.1 OR AGPL-3.0-or-later

export const packageRelationships = {
  compile: "Compile",
  bundle: "Bundle",
  runtime: "Runtime",
  review: "Admission review",
  observe: "Observe",
} as const;

export type PackageRelationship = keyof typeof packageRelationships;
export type PackageAction = "prepare" | "build" | "assemble" | "qualify" | "refresh";

export interface PackageArtifact {
  readonly repository: string;
  readonly action: PackageAction;
  readonly inputs: Readonly<Record<string, PackageRelationship>>;
}

export interface PackageGraph {
  readonly schema_version: "n4a.artifact-graph/v1";
  readonly artifacts: Readonly<Record<string, PackageArtifact>>;
}

export interface PackageRelease {
  readonly registry: string;
  readonly name: string;
  readonly version: string | null;
  readonly status: string;
}

export interface PackageReleases {
  readonly generatedAt: string;
  readonly byArtifact: Readonly<Record<string, readonly PackageRelease[]>>;
}

/** Exact public target identity. Several artifacts can share a repository. */
export interface PackageReleaseTarget {
  readonly packageId: string;
  readonly registry: string;
  readonly name: string;
}

export interface PackageReleaseTargets {
  readonly schema_version: "n4a.artifact-release-targets/v1";
  readonly artifacts: Readonly<Record<string, readonly PackageReleaseTarget[]>>;
}

/** The fields consumed from Cockpit's public snapshot. */
export interface PublicReleaseSnapshot {
  readonly schema_version: 1;
  readonly generated_at: string;
  readonly packages: readonly {
    readonly id: string;
    readonly targets: readonly {
      readonly registry: string;
      readonly name: string;
      readonly published_version: string | null;
      readonly status: string;
    }[];
  }[];
}

/** Project only declared targets. A repository tag cannot attest to an individual artifact. */
export function projectPackageReleases(
  graph: PackageGraph,
  bindings: PackageReleaseTargets,
  snapshot: PublicReleaseSnapshot,
): PackageReleases {
  if (graph.schema_version !== "n4a.artifact-graph/v1" ||
      bindings.schema_version !== "n4a.artifact-release-targets/v1" ||
      snapshot.schema_version !== 1) {
    throw new Error("Unsupported package graph or release snapshot schema");
  }
  const publicPackages = new Map(snapshot.packages.map(entry => [entry.id, entry.targets]));
  const byArtifact: Record<string, PackageRelease[]> = {};
  for (const artifact of Object.keys(graph.artifacts)) {
    const releases = (bindings.artifacts[artifact] ?? []).flatMap(({ packageId, registry, name }) => {
      const target = publicPackages.get(packageId)?.find(entry => entry.registry === registry && entry.name === name);
      return target ? [{ registry, name, version: target.published_version, status: target.status }] : [];
    });
    if (releases.length) byArtifact[artifact] = releases;
  }
  return { generatedAt: snapshot.generated_at, byArtifact };
}

export interface PackageConnection {
  readonly source: string;
  readonly target: string;
  readonly relationship: PackageRelationship;
}

/** Edges point from each input to the artifact that consumes or observes it. */
export function packageConnections(graph: PackageGraph): PackageConnection[] {
  return Object.entries(graph.artifacts).flatMap(([target, { inputs }]) =>
    Object.entries(inputs).flatMap(([source, relationship]) =>
      Object.hasOwn(graph.artifacts, source) ? [{ source, target, relationship }] : [],
    ),
  );
}

/** Follow upstream and downstream independently to exclude unrelated siblings. */
export function connectedPackages(connections: readonly PackageConnection[], focus: string): Set<string> {
  const connected = new Set([focus]);
  for (const [from, to] of [["source", "target"], ["target", "source"]] as const) {
    const visited = new Set([focus]);
    const pending = [focus];
    for (const id of pending) {
      for (const edge of connections) {
        if (edge[from] === id && !visited.has(edge[to])) {
          visited.add(edge[to]);
          connected.add(edge[to]);
          pending.push(edge[to]);
        }
      }
    }
  }
  return connected;
}
