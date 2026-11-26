// SPDX-License-Identifier: CeCILL-2.1 OR AGPL-3.0-or-later
import { useId, useMemo, useState } from "react";

import { layoutDag } from "../dag/layout.js";
import {
  connectedPackages,
  packageConnections,
  packageRelationships,
  type PackageAction,
  type PackageConnection,
  type PackageGraph,
  type PackageRelationship,
  type PackageRelease,
  type PackageReleases,
} from "./model.js";

export interface PackageGraphViewProps {
  graph: PackageGraph;
  releases?: PackageReleases;
  title?: string;
  className?: string;
}

const actions: Record<PackageAction, string> = {
  prepare: "Prepare",
  build: "Build",
  assemble: "Assemble",
  qualify: "Qualify",
  refresh: "Refresh",
};

function graphLayout(ids: string[], connections: PackageConnection[]) {
  return layoutDag({
    nodes: ids.map(id => ({ id, label: id, category: "unknown", isGroup: false, containerId: null })),
    edges: connections.map(({ source, target }) =>
      ({ id: JSON.stringify([source, target]), source, target, oof: false, weight: 1 }),
    ),
  }, { direction: "LR" });
}

function compact(text: string): string {
  return text.length > 22 ? `${text.slice(0, 21)}…` : text;
}

function ReleaseList({ releases }: { releases: readonly PackageRelease[] }) {
  if (!releases.length) return <>No release observation</>;
  return (
    <ul className="n4pg-list">
      {releases.map(({ registry, name, version, status }) => (
        <li key={JSON.stringify([registry, name])}>
          <strong>{version ?? "Version unavailable"}</strong> · {registry} / {name} · {status}
        </li>
      ))}
    </ul>
  );
}

export function PackageGraphView({ graph, releases, title = "Package dependencies", className }: PackageGraphViewProps) {
  const baseId = useId();
  const [focus, setFocus] = useState("");
  const [relationship, setRelationship] = useState<PackageRelationship | "">("");
  const [fit, setFit] = useState(true);
  const activeFocus = Object.hasOwn(graph.artifacts, focus) ? focus : "";
  const groups = useMemo(() => {
    const byRepository = new Map<string, string[]>();
    for (const id of Object.keys(graph.artifacts).sort()) {
      const artifact = graph.artifacts[id]!;
      if (!byRepository.has(artifact.repository)) byRepository.set(artifact.repository, []);
      byRepository.get(artifact.repository)!.push(id);
    }
    return [...byRepository.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [graph]);

  const view = useMemo(() => {
    const all = packageConnections(graph);
    const edges = relationship ? all.filter(edge => edge.relationship === relationship) : all;
    const linked = activeFocus ? connectedPackages(edges, activeFocus)
      : relationship ? new Set(edges.flatMap(({ source, target }) => [source, target])) : null;
    const nodes = Object.keys(graph.artifacts).sort().filter(id => !linked || linked.has(id));
    const connections = edges.filter(({ source, target }) => !linked || (linked.has(source) && linked.has(target)));
    const relationshipByEdge = new Map(connections.map(({ source, target, relationship }) =>
      [JSON.stringify([source, target]), relationship] as const,
    ));
    return { nodes, connections, relationshipByEdge, layout: graphLayout(nodes, connections) };
  }, [graph, activeFocus, relationship]);

  const titleId = `${baseId}-title`;
  const summaryId = `${baseId}-summary`;
  const snapshotDate = releases ? new Date(releases.generatedAt) : null;
  const snapshotLabel = snapshotDate && Number.isFinite(snapshotDate.valueOf())
    ? snapshotDate.toISOString().slice(0, 16).replace("T", " ") + " UTC"
    : releases?.generatedAt;
  const repoCount = new Set(view.nodes.map(id => graph.artifacts[id]!.repository)).size;
  return (
    <section className={`n4pg${className ? ` ${className}` : ""}`} aria-labelledby={titleId}>
      <header className="n4pg-header">
        <div>
          <h2 id={titleId}>{title}</h2>
          <p id={summaryId} role="status">
            {view.nodes.length} artifacts · {repoCount} repositories · {view.connections.length} relationships
          </p>
        </div>
        {releases && <p className="n4pg-snapshot">Release snapshot <time dateTime={releases.generatedAt}>{snapshotLabel}</time></p>}
      </header>

      <div className="n4pg-controls">
        <div className="n4pg-field">
          <label htmlFor={`${baseId}-focus`}>Follow an artifact</label>
          <select id={`${baseId}-focus`} value={activeFocus} onChange={event => setFocus(event.target.value)}>
            <option value="">All artifacts</option>
            {groups.map(([repo, ids]) => (
              <optgroup key={repo} label={repo}>
                {ids.map(id => <option key={id} value={id}>{id}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="n4pg-field">
          <label htmlFor={`${baseId}-relationship`}>Relationship</label>
          <select id={`${baseId}-relationship`} value={relationship} onChange={event => setRelationship(event.target.value as PackageRelationship | "")}>
            <option value="">All relationships</option>
            {Object.entries(packageRelationships).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        <label className="n4pg-fit">
          <input type="checkbox" checked={fit} onChange={event => setFit(event.target.checked)} />
          Fit diagram
        </label>
      </div>

      {view.nodes.length > 0 ? (
        <>
          <ul className="n4pg-legend" aria-label="Relationship styles">
            {Object.entries(packageRelationships).filter(([id]) => !relationship || id === relationship).map(([id, label]) => (
              <li key={id}>
                <svg width="30" height="12" aria-hidden="true">
                  <line className="n4pg-edge" data-relationship={id} x1="1" y1="6" x2="29" y2="6" />
                </svg>
                {label}
              </li>
            ))}
          </ul>
          <p className="n4pg-direction" id={`${baseId}-direction`}>Arrows point from inputs to consumers. Release observations are listed in the table.</p>
          <div className="n4pg-stage" data-fit={fit} role="region" aria-label="Scrollable dependency diagram" tabIndex={0}>
            <svg role="img" aria-labelledby={`${baseId}-diagram`} aria-describedby={`${summaryId} ${baseId}-direction`}
              width={view.layout.width} height={view.layout.height} viewBox={`0 0 ${view.layout.width} ${view.layout.height}`}>
              <title id={`${baseId}-diagram`}>{activeFocus ? `Dependencies and consumers of ${activeFocus}` : "Ecosystem package dependencies"}</title>
              <defs>
                <marker id={`${baseId}-arrow`} viewBox="0 0 8 8" markerWidth="6" markerHeight="6" refX="8" refY="4" orient="auto">
                  <path d="M0 0 L8 4 L0 8 Z" fill="context-stroke" />
                </marker>
              </defs>
              {view.layout.edges.map(({ edge, path }) => (
                <path key={edge.id} className="n4pg-edge" data-relationship={view.relationshipByEdge.get(edge.id)}
                  d={path} markerEnd={`url(#${baseId}-arrow)`} />
              ))}
              {view.layout.nodes.map(({ node, x, y, w, h }) => {
                const channels = releases?.byArtifact[node.id] ?? [];
                const versions = new Set(channels.map(channel => channel.version));
                const caption = versions.size === 1 && channels[0]?.version
                  ? channels[0].version
                  : channels.length > 1 ? `${channels.length} release targets` : actions[graph.artifacts[node.id]!.action];
                return (
                  <g key={node.id} className="n4pg-node" data-focused={node.id === activeFocus} transform={`translate(${x} ${y})`}>
                    <title>{node.id}</title>
                    <rect width={w} height={h} rx={6} />
                    <text x={10} y={17}>{compact(node.label)}</text>
                    <text className="n4pg-node-caption" x={10} y={33}>{compact(caption)}</text>
                  </g>
                );
              })}
            </svg>
          </div>

          <details className="n4pg-details">
            <summary>View artifact and dependency table</summary>
            <div className="n4pg-table-area" role="region" aria-label="Scrollable artifact table" tabIndex={0}>
              <table>
                <caption>Artifacts, observed releases and direct inputs in this view</caption>
                <thead><tr>
                  <th scope="col">Artifact</th>
                  <th scope="col">Repository</th>
                  <th scope="col">Action</th>
                  <th scope="col">Observed releases</th>
                  <th scope="col">Input dependencies</th>
                </tr></thead>
                <tbody>{view.nodes.map(id => {
                  const artifact = graph.artifacts[id]!;
                  const inputs = view.connections.filter(edge => edge.target === id);
                  return <tr key={id}>
                    <th scope="row">{id}</th>
                    <td>{artifact.repository}</td>
                    <td>{actions[artifact.action]}</td>
                    <td><ReleaseList releases={releases?.byArtifact[id] ?? []} /></td>
                    <td>{inputs.length ? <ul className="n4pg-list">{inputs.map(edge =>
                      <li key={edge.source}>{edge.source} · {packageRelationships[edge.relationship]}</li>
                    )}</ul> : "None shown"}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          </details>
        </>
      ) : <p>No artifacts match this view.</p>}
    </section>
  );
}
