import { useEffect, useState } from "react";
import { PackageGraphView, projectPackageReleases } from "../../../src/packageGraph/index.js";
import type { PackageGraph, PackageReleases, PackageReleaseTargets, PublicReleaseSnapshot } from "../../../src/packageGraph/index.js";
import "../../../assets/packageGraph.css";

const contracts = "https://raw.githubusercontent.com/GBeurier/nirs4all-ecosystem/main/docs/contracts/release";
const snapshotUrl = "https://raw.githubusercontent.com/GBeurier/nirs4all-cockpit/main/data/current.json";

async function readPublicJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export function PackageGraphDemo() {
  const [graph, setGraph] = useState<PackageGraph>();
  const [releases, setReleases] = useState<PackageReleases>();
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function load() {
      try {
        const topology = await readPublicJson<PackageGraph>(`${contracts}/artifact-graph.n4a.json`, signal);
        if (topology.schema_version !== "n4a.artifact-graph/v1") throw new Error("Unsupported package graph schema");
        setGraph(topology);
        const [targets, snapshot] = await Promise.all([
          readPublicJson<PackageReleaseTargets>(`${contracts}/artifact-release-targets.n4a.json`, signal),
          readPublicJson<PublicReleaseSnapshot>(snapshotUrl, signal),
        ]);
        setReleases(projectPackageReleases(topology, targets, snapshot));
      } catch (cause) {
        if (!signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  return <>
    {graph && <PackageGraphView graph={graph} {...(releases ? { releases } : {})} />}
    {error ? <p role="status">{graph ? "Release observations unavailable" : "Package graph unavailable"} ({error}).</p>
      : !graph && <p role="status">Loading package dependencies…</p>}
  </>;
}
