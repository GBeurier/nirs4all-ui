import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DataPanel } from "./DataPanel.js";
import type { MultimodalImportProfile } from "./types.js";

const PROFILE: MultimodalImportProfile = {
  id: "nir-csv",
  caseId: "spectroscopy",
  label: "Two NIR instruments",
  description: "Spectra and a sample sheet.",
  accept: ".csv",
  files: [{ role: "spectra", description: "One row per sample", required: true }],
  examples: [{ label: "example spectra", href: "/examples/nir.csv", fileName: "nir.csv" }],
};

function render(datasetBuilder?: ReactElement) {
  return renderToStaticMarkup(
    <DataPanel
      caseId="spectroscopy"
      presets={[]}
      importProfiles={[PROFILE]}
      dataOrigin={{ kind: "import", profileId: "nir-csv", fileNames: [] }}
      dataStatus={{ kind: "empty" }}
      onLoadPreset={() => undefined}
      onImportFiles={() => undefined}
      {...(datasetBuilder ? { datasetBuilder } : {})}
    />,
  );
}

describe("DataPanel import pane", () => {
  it("keeps the manifest profile cards without a host builder", () => {
    const html = render();
    expect(html).toContain("n4mm-profile");
    expect(html).toContain("Choose files…");
    expect(html).toContain('href="/examples/nir.csv"');
  });

  it("replaces the profile cards with the host builder and keeps example downloads", () => {
    const html = render(<div className="host-builder">builder</div>);
    expect(html).toContain("host-builder");
    expect(html).not.toContain("Choose files…");
    expect(html).toContain('href="/examples/nir.csv"');
    expect(html).toContain('download="nir.csv"');
  });
});
