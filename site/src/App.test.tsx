import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "./App.js";

describe("GitHub Pages showcase", () => {
  it("renders every public component export and publication asset", () => {
    const markup = renderToStaticMarkup(<App />);

    for (const component of [
      "RuntimeEngineBadge",
      "RuntimeResultStatusBadge",
      "RuntimeDiagnosticList",
      "MetricValueBadge",
    ]) {
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
    expect(markup).toContain("v0.1.4");
    expect(markup).toContain("RUNTIME_RESULT_STATUS_DISPLAY");
    expect(markup).toContain("ALL_SCORE_METRICS");
    expect(markup).toContain("assets/brand/nirs4all-ui/og.png");
    expect(markup).toContain("favicon.ico");
    expect(markup).toContain("site.webmanifest");
  });
});
