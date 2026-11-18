import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgreementMatrix, agreementColor, summarizeAgreementMatrix } from "./AgreementMatrix.js";
import { N4_DIVERGING_STOPS, readableTextColor, viridisColor } from "./theme.js";

const labels = ["SHAP", "Coef", "VIP"];
const values = [
  [1, 0.62, -0.1],
  [0.62, 1, null],
  [-0.1, Number.NaN, 1],
];

describe("AgreementMatrix", () => {
  it("uses a zero-centred diverging scale across zero and a sequential scale otherwise", () => {
    expect(agreementColor(0, [-1, 1])).toBe("rgb(226, 232, 240)");
    expect(agreementColor(-1, [-1, 1])).toBe("rgb(37, 99, 235)");
    expect(agreementColor(5, [-1, 1])).toBe("rgb(225, 29, 72)");
    expect(agreementColor(0.5, [0, 1])).toBe(viridisColor(0.5));
    expect(N4_DIVERGING_STOPS).toHaveLength(3);
    expect(readableTextColor("rgb(37, 99, 235)")).toBe("#f8fafc");
    expect(readableTextColor("rgb(226, 232, 240)")).toBe("#0f172a");
  });

  it("prints every cell value, dashes undefined cells and summarizes off-diagonal pairs", () => {
    const markup = renderToStaticMarkup(
      <AgreementMatrix labels={labels} values={values} domain={[-1, 1]} metricLabel="Spearman ρ" showSummary />,
    );
    expect(markup).toContain("Spearman ρ agreement matrix");
    expect(markup.match(/n4viz-agreement-cell/g)).toHaveLength(9);
    expect(markup).toContain(">0.62<");
    expect(markup).toContain(">-0.10<");
    expect(markup.match(/>—</g)).toHaveLength(2);
    expect(markup).toContain("Highest agreement SHAP / Coef (0.62); lowest SHAP / VIP (-0.1).");
    expect(markup).toContain("1 pair is undefined");
    expect(markup).toContain('role="img"');
    expect(markup).not.toContain('role="button"');
    expect(markup).not.toMatch(/NaN/);
  });

  it("makes cells keyboard buttons and outlines the selected one when interactive", () => {
    const markup = renderToStaticMarkup(
      <AgreementMatrix
        labels={labels}
        values={values}
        domain={[0, 1]}
        metricLabel="Top-10 Jaccard"
        format={(v) => v.toFixed(1)}
        onCellClick={() => undefined}
        selectedCell={{ row: 0, col: 1 }}
      />,
    );
    expect(markup.match(/role="button"/g)).toHaveLength(9);
    expect(markup).toContain('aria-label="SHAP / Coef: Top-10 Jaccard 0.6"');
    expect(markup.match(/data-selected="true"/g)).toHaveLength(1);
  });

  it("describes matrices without defined pairs", () => {
    expect(summarizeAgreementMatrix(["A", "B"], [[1, null], [null, 1]], "ρ")).toBe("ρ between 2 profiles. No pair has a defined value.");
  });
});
