import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DatasetDropzone, droppedFiles, pickedFiles } from "./DatasetDropzone.js";

const file = (name: string, relative = "") => Object.assign(new File(["x"], name), relative ? { webkitRelativePath: relative } : {});

describe("DatasetDropzone", () => {
  it("renders the idle zone with a folder picker", () => {
    const html = renderToStaticMarkup(<DatasetDropzone onFiles={() => {}} title="Drop" hint="or browse" folderLabel="choose a folder" note="Local only" />);
    expect(html).toContain("Drop");
    expect(html).toContain("choose a folder");
    expect(html).toContain("webkitdirectory");
    expect(html).toContain("Local only");
    expect(html).not.toContain("data-busy");
    // the folder picker and the inputs are siblings of the zone, never nested in its role="button"
    const zone = html.slice(html.indexOf('role="button"'), html.indexOf("</div>"));
    expect(zone).not.toContain("<button");
    expect(zone).not.toContain("<input");
    expect(html).toMatch(/<button type="button" class="n4dz-link n4dz-folder">choose a folder<\/button>/);
  });

  it("replaces the icon and text while busy and shows errors", () => {
    const html = renderToStaticMarkup(<DatasetDropzone onFiles={() => {}} busy busyTitle="Assembling…" busyHint="A few seconds" error="Import failed" />);
    expect(html).toContain("data-busy");
    expect(html).toContain("n4dz-spinner");
    expect(html).toContain('role="status"');
    expect(html).toContain("Assembling…");
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-disabled="true"');
  });

  it("keeps folder-relative names and drops hidden files", () => {
    expect(pickedFiles([file("Xtrain.csv", "Beer/Xtrain.csv"), file(".DS_Store", "Beer/.DS_Store"), file("y.csv")]).map((f) => f.name)).toEqual(["Beer/Xtrain.csv", "y.csv"]);
  });

  it("reads dropped folders recursively", async () => {
    const reads: string[] = [];
    const leaf = (path: string) => {
      const name = path.split("/").pop()!;
      return { isFile: true, name, fullPath: path, file: (ok: (f: File) => void) => { reads.push(path); ok(file(name)); } };
    };
    const dir = (path: string, children: unknown[]) => {
      let served = false;
      return {
        isFile: false, name: path.split("/").pop()!, fullPath: path,
        createReader: () => { reads.push(path); return { readEntries: (ok: (e: unknown[]) => void) => { ok(served ? [] : children); served = true; } }; },
      };
    };
    const tree = dir("/Beer", [leaf("/Beer/Xtrain.csv"), leaf("/Beer/.hidden"), dir("/Beer/.git", [leaf("/Beer/.git/HEAD")]), dir("/Beer/test", [leaf("/Beer/test/Xtest.csv")])]);
    const transfer = { items: [{ webkitGetAsEntry: () => tree }], files: [] } as unknown as DataTransfer;
    expect((await droppedFiles(transfer)).map((f) => f.name)).toEqual(["Beer/Xtrain.csv", "Beer/test/Xtest.csv"]);
    // hidden files and folders are skipped before being read
    expect(reads.filter((path) => path.includes("/."))).toEqual([]);
  });
});
