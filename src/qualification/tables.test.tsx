import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChartDataTable, EigenvalueScree, PopulationFlow, SpectraExplorer, TargetDistribution, type FlowStage } from "./index.js";

const tables = (html: string) => html.match(/<table\b/g)?.length ?? 0;

describe("chart data tables", () => {
  it("exposes raw cell values and leaves absent cells empty with an explicit label", () => {
    const html = renderToStaticMarkup(<ChartDataTable caption="C" columns={["a", "b"]} rows={[[0.1234567890123, null], ["x", 3]]} locale="en" />);
    expect(html).toContain('data-value="0.1234567890123"');
    expect(html).toContain('data-value=""');
    expect(html).toContain("not available");
    expect(html).toContain('data-value="x"');
  });

  it("PopulationFlow keeps every count in its table when the aggregate total is hidden", () => {
    const stage: FlowStage = { id: "s", label: "Calibration", unit: "samples", segments: [{ id: "a", label: "Kept", count: 20, tone: "primary" }, { id: "b", label: "Excluded", count: 4, tone: "warning" }] };
    const shown = renderToStaticMarkup(<PopulationFlow stages={[stage]} title="Flow" locale="en" />);
    const hidden = renderToStaticMarkup(<PopulationFlow stages={[stage]} title="Flow" locale="en" showTotal={false} />);
    expect(shown).toContain('<tspan class="n4q-flow-total">24</tspan>');
    expect(hidden).not.toContain('<tspan class="n4q-flow-total">24</tspan>');
    for (const html of [shown, hidden]) {
      expect(tables(html)).toBe(1);
      expect(html).toContain('data-value="20"');
      expect(html).toContain('data-value="4"');
    }
  });

  it("EigenvalueScree tabulates eigenvalues and adds shares only when the trace is reported", () => {
    const withTrace = renderToStaticMarkup(<EigenvalueScree eigenvalues={[3, 1]} totalVariance={5} title="Scree" locale="en" />);
    const without = renderToStaticMarkup(<EigenvalueScree eigenvalues={[3, 1]} title="Scree" locale="en" />);
    expect(tables(withTrace)).toBe(1);
    expect(withTrace).toContain("Variance share");
    expect(withTrace).toContain("PC2");
    expect(without).toContain("Cumulative value");
    expect(without).not.toContain("Variance share");
  });

  it("TargetDistribution has one visible data table and no second hidden one", () => {
    const html = renderToStaticMarkup(
      <TargetDistribution summary={null} points={[{ id: "a", value: 1, status: "exact" }, { id: "b", value: 2, status: "censored" }, { id: "c", value: Number.NaN, status: "exact" }]} title="Target" locale="en" />,
    );
    expect(tables(html)).toBe(1);
    expect(html).not.toContain("n4q-visually-hidden");
    expect(html).not.toContain("NaN");
  });
});

describe("SpectraExplorer data table", () => {
  const base = { axis: [1000, 1100], series: [{ id: "o1", label: "s1", values: [1, Number.NaN], color: "#000" }, { id: "o2", values: [2, 2], color: "#111" }], title: "E", axisUnit: "nm", locale: "en" as const };

  it("renders one table at the first band with the unit in its caption", () => {
    const html = renderToStaticMarkup(<SpectraExplorer {...base} />);
    expect(tables(html)).toBe(1);
    expect(html).toContain("E · 1000 nm");
    expect(html).toContain('max="2"');
  });

  it("keeps the caption free of a dangling unit when none is declared", () => {
    const { axisUnit: _unit, ...noUnit } = base;
    expect(renderToStaticMarkup(<SpectraExplorer {...noUnit} />)).toContain("E · 1000<");
  });

  it("does not pass NaN through to the table and still flags the gap on the axis", () => {
    const html = renderToStaticMarkup(<SpectraExplorer {...base} axis={[1000]} series={[{ id: "o1", values: [Number.NaN], color: "#000" }]} />);
    expect(html).not.toContain("NaN");
    expect(html).toContain('data-value=""');
    expect(html.match(/n4q-explorer-missing/g)).toHaveLength(1);
  });

  it("has no band to tabulate on an empty axis", () => {
    const html = renderToStaticMarkup(<SpectraExplorer {...base} axis={[]} series={[]} />);
    expect(tables(html)).toBe(1);
    expect(html).toContain("E: no bands");
    expect(html).toContain("disabled");
  });
});
