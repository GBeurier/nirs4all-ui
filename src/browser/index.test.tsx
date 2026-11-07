import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// There is no DOM in this test environment, so the React root is replaced by a recorder.
// The recorded element is the exact tree the browser entry hands to React, rendered here
// with the real components.
const roots = vi.hoisted(() => ({ renders: [] as unknown[], created: 0, unmounts: 0 }));
vi.mock("react-dom/client", () => ({
  createRoot: () => {
    roots.created += 1;
    return {
      render: (element: unknown) => {
        roots.renders.push(element);
      },
      unmount: () => {
        roots.unmounts += 1;
      },
    };
  },
}));

import { mountSpectraExplorer, type SpectraExplorerProps } from "./index.js";

const host = { nodeType: 1 } as unknown as HTMLElement;
const markup = () => renderToStaticMarkup(roots.renders.at(-1) as ReactElement);
const tables = (html: string) => html.match(/<table\b/g)?.length ?? 0;

const props: SpectraExplorerProps = {
  title: "Raw spectra",
  axis: [1000, 1100, 1200],
  axisUnit: "nm",
  yLabel: "Absorbance",
  series: [
    { id: "a", label: "sample A", values: [0.1234567890123, Number.NaN, 3], color: "#0d9488" },
    { id: "b", values: [1, 2, null], color: "#4f46e5" },
  ],
};

beforeEach(() => {
  roots.renders.length = 0;
  roots.created = 0;
  roots.unmounts = 0;
});

describe("browser spectra explorer mount", () => {
  it("renders exactly one accessible data table, owned by the explorer", () => {
    mountSpectraExplorer(host, props);
    const html = markup();
    expect(tables(html)).toBe(1);
    expect(html).toContain("Spectrum values by band");
    expect(html).toContain("Raw spectra · 1000 nm");
    expect(html).not.toContain("Table band");
    expect(html).not.toContain("n4ui-b-band");
  });

  it("keeps raw values exact and shows non-finite or absent cells as not available", () => {
    mountSpectraExplorer(host, props);
    const html = markup();
    expect(html).toContain('data-value="0.1234567890123"');
    expect(html).toContain('data-value="1"');
    expect(html).toContain("sample A");
  });

  it("tabulates a missing band as not available, never as NaN", () => {
    mountSpectraExplorer(host, { ...props, axis: [1000], series: [{ id: "a", label: "A", values: [Number.NaN], color: "#000" }, { id: "b", label: "B", values: [null], color: "#111" }] });
    const html = markup();
    expect(tables(html)).toBe(1);
    expect(html).not.toContain("NaN");
    expect(html.match(/data-value=""/g)).toHaveLength(2);
    expect(html.match(/not available/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("defaults to English and honours an explicit locale", () => {
    mountSpectraExplorer(host, props);
    expect(markup()).toContain("Chart data");
    mountSpectraExplorer(host, { ...props, locale: "fr" });
    expect(markup()).toContain("Données du graphique");
  });

  it("keeps the selection host-controlled", () => {
    const handle = mountSpectraExplorer(host, { ...props, selected: ["b"], onSelect: () => undefined });
    expect(markup().match(/n4q-explorer-focus/g)).toHaveLength(1);
    handle.update({ ...props, selected: [] });
    expect(markup()).not.toContain("n4q-explorer-focus");
  });

  it("reports an empty axis as a table with no rows instead of failing", () => {
    mountSpectraExplorer(host, { ...props, axis: [], series: [] });
    const html = markup();
    expect(tables(html)).toBe(1);
    expect(html).toContain("Raw spectra: no bands");
    expect(html).not.toContain("<tr><td");
  });
});

describe("browser mount lifecycle", () => {
  it("creates one root, replaces props completely on update and unmounts once", () => {
    const handle = mountSpectraExplorer(host, props);
    expect(roots.created).toBe(1);
    handle.update({ title: "Second", axis: [5, 6], series: [{ id: "z", values: [1, 2], color: "#000" }] });
    expect(roots.renders).toHaveLength(2);
    const html = markup();
    expect(html).toContain("Second");
    expect(html).not.toContain("Raw spectra");
    handle.unmount();
    handle.unmount();
    expect(roots.unmounts).toBe(1);
  });

  it("refuses update after unmount and a non-element host", () => {
    const handle = mountSpectraExplorer(host, props);
    handle.unmount();
    expect(() => handle.update(props)).toThrow(/after unmount/);
    expect(() => mountSpectraExplorer(null as unknown as HTMLElement, props)).toThrow(TypeError);
    expect(roots.created).toBe(1);
  });
});
