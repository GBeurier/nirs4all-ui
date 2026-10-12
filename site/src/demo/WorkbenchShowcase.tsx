import { useEffect, useState } from "react";

import { InspectorDemo } from "./InspectorDemo.js";
import { PlaygroundDemo } from "./PlaygroundDemo.js";

type Capsule = "playground" | "inspector";

/** Tabbed, full-screen-able frame around the workbench capsule demos. */
export function WorkbenchShowcase() {
  const [capsule, setCapsule] = useState<Capsule>("playground");
  const [locale, setLocale] = useState<"en" | "fr">("en");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && event.target === document.body) setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [fullscreen]);

  return (
    <div className={`wb-showcase ${fullscreen ? "is-fullscreen" : ""}`}>
      <div className="wb-showcase-bar">
        <div className="filter-bar" role="tablist" aria-label="Capsule">
          {(["playground", "inspector"] as const).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={capsule === id} className={`filter-chip ${capsule === id ? "is-active" : ""}`} onClick={() => setCapsule(id)}>
              {id === "playground" ? "Playground" : "Inspector"}
            </button>
          ))}
        </div>
        <code className="wb-showcase-entry">{`import { ${capsule === "playground" ? "Playground" : "Inspector"} } from "nirs4all-ui/${capsule}";`}</code>
        <span className="wb-showcase-grow" />
        <button type="button" className="theme-toggle" onClick={() => setLocale((l) => (l === "en" ? "fr" : "en"))}>
          {locale === "en" ? "FR" : "EN"}
        </button>
        <button type="button" className="theme-toggle" onClick={() => setFullscreen((v) => !v)}>
          {fullscreen ? "Exit full screen" : "Full screen"}
        </button>
      </div>
      <div className="wb-showcase-stage">{capsule === "playground" ? <PlaygroundDemo key={locale} locale={locale} /> : <InspectorDemo key={locale} locale={locale} />}</div>
    </div>
  );
}
