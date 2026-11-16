import { useEffect, useMemo, useState } from "react";

import { PipelineChainEditor, toCanonicalPipeline, type PipelineChainDocument } from "../../../src/pipelineEditor/index.js";
import { DEMO_CATALOG, pipelineChainExamples } from "./pipelineChainExamples.js";

interface History {
  past: PipelineChainDocument[];
  present: PipelineChainDocument;
  future: PipelineChainDocument[];
}

/**
 * Trial host for `PipelineChainEditor`: owns the document, a small undo
 * history and the theme. Nothing is executed, validated or stored.
 */
export function PipelineChainDemo() {
  const examples = useMemo(() => pipelineChainExamples(), []);
  const [exampleId, setExampleId] = useState(examples[1]!.id);
  const [history, setHistory] = useState<History>(() => ({ past: [], present: structuredClone(examples[1]!.document), future: [] }));
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [view, setView] = useState<"none" | "document" | "canonical">("none");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const load = (id: string) => {
    const example = examples.find((candidate) => candidate.id === id);
    if (!example) return;
    setExampleId(id);
    setHistory({ past: [], present: structuredClone(example.document), future: [] });
  };
  const change = (next: PipelineChainDocument) =>
    setHistory((current) => ({ past: [...current.past.slice(-99), current.present], present: next, future: [] }));
  const undo = () =>
    setHistory((current) => {
      const previous = current.past[current.past.length - 1];
      return previous ? { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] } : current;
    });
  const redo = () =>
    setHistory((current) => {
      const next = current.future[0];
      return next ? { past: [...current.past, current.present], present: next, future: current.future.slice(1) } : current;
    });

  const example = examples.find((candidate) => candidate.id === exampleId);
  const shown = view === "canonical" ? toCanonicalPipeline(history.present) : history.present;

  return (
    <div className="chain-demo">
      <header className="chain-demo__bar">
        <h1>Pipeline chain editor</h1>
        <nav className="chain-demo__examples" aria-label="Example pipelines">
          {examples.map((candidate) => (
            <button key={candidate.id} type="button" aria-pressed={candidate.id === exampleId} title={candidate.hint} onClick={() => load(candidate.id)}>
              {candidate.label}
            </button>
          ))}
        </nav>
        <div className="chain-demo__tools">
          <button type="button" aria-pressed={view === "document"} onClick={() => setView(view === "document" ? "none" : "document")}>Document</button>
          <button type="button" aria-pressed={view === "canonical"} onClick={() => setView(view === "canonical" ? "none" : "canonical")}>Canonical</button>
          <button type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? "Dark theme" : "Light theme"}</button>
        </div>
      </header>
      <p className="chain-demo__hint">
        {example?.hint} Trial page with a mock catalogue: edits change the local document only, nothing runs.
      </p>
      <main className="chain-demo__stage" data-json={view !== "none" || undefined}>
        <PipelineChainEditor
          key={exampleId}
          value={history.present}
          onChange={change}
          catalog={DEMO_CATALOG}
          onUndo={undo}
          onRedo={redo}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          inputLabel="Dataset"
          inputDetail="spectra X, target y"
        />
        {view !== "none" ? (
          <aside className="chain-demo__json" aria-label={view === "canonical" ? "Canonical pipeline" : "Edited document"}>
            <h2>{view === "canonical" ? "Canonical pipeline" : "Edited document"}</h2>
            <p>
              {view === "canonical"
                ? "toCanonicalPipeline(document): what a runtime receives. Bypassed elements are left out."
                : "The value the host holds. A bypassed element is wrapped as { \"_bypassed_\": … }."}
            </p>
            <pre>{JSON.stringify(shown, null, 2)}</pre>
          </aside>
        ) : null}
      </main>
    </div>
  );
}
