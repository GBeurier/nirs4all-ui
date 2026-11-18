import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AttributionHeatmap } from "./AttributionHeatmap.js";
import {
  attributionMaxAbs,
  nextAttributionCursor,
  rasterizeAttributions,
  sparseColumnTicks,
  summarizeAttributionHeatmap,
} from "./attributionHeatmapModel.js";

const columns = [{ label: "1000–1100" }, { label: "1100–1200" }, { label: "1200–1300" }];
const rows = [
  { id: "s1", label: "Sample 1", values: [0.2, -0.4, 0] },
  { id: "s2", label: "Sample 2", values: [NaN, 0.1, 0.05] },
];

describe("attribution heatmap model", () => {
  it("uses a symmetric domain from the largest finite |value|", () => {
    expect(attributionMaxAbs(rows)).toBe(0.4);
    expect(attributionMaxAbs([{ values: [NaN] }])).toBe(0);
  });

  it("maps zero to the neutral midpoint, extremes to the ends and NaN to transparent", () => {
    const pixels = rasterizeAttributions(rows, 3, 3, 0.4);
    expect(pixels).toHaveLength(3 * 2 * 4);
    // row 0, col 1 = -0.4 -> blue end
    expect([...pixels.slice(4, 8)]).toEqual([37, 99, 235, 255]);
    // row 0, col 2 = 0 -> neutral
    expect([...pixels.slice(8, 12)]).toEqual([226, 232, 240, 255]);
    // row 1, col 0 = NaN -> transparent
    expect(pixels[12 + 3]).toBe(0);
  });

  it("keeps the strongest |value| when columns outnumber pixels", () => {
    const wide = [{ values: Array.from({ length: 700 }, (_, i) => (i === 351 ? -1 : 0)) }];
    const pixels = rasterizeAttributions(wide, 700, 100, 1);
    expect(pixels).toHaveLength(100 * 4);
    const blue = [];
    for (let p = 0; p < 100; p += 1) if (pixels[p * 4] === 37) blue.push(p);
    expect(blue).toEqual([50]);
  });

  it("moves the keyboard cursor within bounds", () => {
    expect(nextAttributionCursor(null, "ArrowDown", false, 2, 3)).toEqual({ row: 0, col: 0 });
    expect(nextAttributionCursor({ row: 0, col: 0 }, "ArrowDown", false, 2, 3)).toEqual({ row: 1, col: 0 });
    expect(nextAttributionCursor({ row: 1, col: 0 }, "ArrowDown", false, 2, 3)).toEqual({ row: 1, col: 0 });
    expect(nextAttributionCursor({ row: 0, col: 0 }, "ArrowRight", true, 2, 30)).toEqual({ row: 0, col: 10 });
    expect(nextAttributionCursor({ row: 0, col: 5 }, "End", false, 2, 30)).toEqual({ row: 0, col: 29 });
    expect(nextAttributionCursor({ row: 0, col: 5 }, "Escape", false, 2, 30)).toBeNull();
    expect(nextAttributionCursor(null, "a", false, 2, 30)).toBeUndefined();
  });

  it("spreads sparse ticks including both ends", () => {
    expect(sparseColumnTicks(700, 8)).toEqual([0, 100, 200, 300, 399, 499, 599, 699]);
    expect(sparseColumnTicks(2, 8)).toEqual([0, 1]);
    expect(sparseColumnTicks(0, 8)).toEqual([]);
  });

  it("summarizes the strongest cell and sign counts", () => {
    expect(summarizeAttributionHeatmap(rows, columns, "SHAP value")).toBe(
      "SHAP value for 2 rows across 3 columns. Symmetric color scale from -0.4 to +0.4; 3 positive and 1 negative cells. Strongest -0.4 at Sample 1 / 1100–1200.",
    );
  });
});

describe("AttributionHeatmap", () => {
  it("renders a canvas raster with labelled rows, linked column and selected row", () => {
    const markup = renderToStaticMarkup(
      <AttributionHeatmap
        rows={rows}
        columns={columns}
        selectedRowId="s2"
        onRowActivate={() => undefined}
        highlightColumn={1}
        valueLabel="SHAP value"
        className="host"
      />,
    );
    expect(markup).toContain("n4viz-attr-heatmap");
    expect(markup).toContain("host");
    expect(markup).toContain("<canvas");
    expect(markup).toContain('width="3"');
    expect(markup).toContain("n4viz-attr-column");
    expect(markup).toContain("left:33.33");
    expect(markup).toContain("n4viz-attr-selected-row");
    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("Strongest -0.4 at Sample 1");
    expect(markup).toContain("-0.4");
    expect(markup).toContain("+0.4");
  });

  it("names only the selected row when rows are too short for labels", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, label: `Row ${i}`, values: Array.from({ length: 700 }, (_, c) => Math.sin(i + c)) }));
    const markup = renderToStaticMarkup(
      <AttributionHeatmap rows={many} columns={Array.from({ length: 700 }, (_, c) => ({ label: `${1000 + c * 2}` }))} selectedRowId="r42" />,
    );
    expect(markup).not.toContain("<button");
    expect(markup.match(/n4viz-attr-rowmarker/g)).toHaveLength(1);
    expect(markup).toContain("Row 42");
    expect(markup).not.toContain("Row 43<");
    expect(markup.match(/n4viz-tick-label/g)).toHaveLength(8);
    expect(markup).toContain("height:400px");
  });
});
