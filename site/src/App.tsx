import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import * as componentsExports from "../../src/components/index.js";
import * as vizExports from "../../src/viz/index.js";
import * as dagExports from "../../src/dag/index.js";
import * as labExports from "../../src/lab/index.js";
import * as datasetBuilderExports from "../../src/datasetBuilder/index.js";
import * as scoreExports from "../../src/score/index.js";
import * as runtimeExports from "../../src/runtime/index.js";
import * as datasetExports from "../../src/dataset/index.js";
import * as brandExports from "../../src/brand/index.js";
import * as stylesExports from "../../src/styles/index.js";
import { NIRS4ALL_BRANDS, getNirs4allBrandAssetPath } from "../../src/brand/index.js";
import { NIRS4ALL_CSS_TOKENS, NIRS4ALL_STYLE_ASSETS, getNirs4allCssVariable } from "../../src/styles/index.js";
import { DatasetBuilder } from "../../src/datasetBuilder/index.js";
import type { DatasetSource } from "../../src/datasetBuilder/index.js";
import { DagGraphView } from "../../src/dag/index.js";
import packageJson from "../../package.json" with { type: "json" };
import { CANONICAL_SITE_URL, PUBLICATION_ASSETS } from "./showcaseMetadata.js";
import { DEMO_DAG_GRAPH, SHOWCASE_CATEGORIES, SHOWCASE_ENTRIES, type ShowcaseEntry } from "./showcaseData.js";

const packageVersion = packageJson.version;

const EXPORT_SURFACE = [
  { entry: "nirs4all-ui/viz", title: "Scientific charts", symbols: Object.keys(vizExports) },
  { entry: "nirs4all-ui/dag", title: "Compiled-graph explorer", symbols: Object.keys(dagExports) },
  { entry: "nirs4all-ui/components", title: "Presentational components", symbols: Object.keys(componentsExports) },
  { entry: "nirs4all-ui/lab", title: "Quality / lab UI", symbols: Object.keys(labExports) },
  { entry: "nirs4all-ui/datasetBuilder", title: "Dataset builder", symbols: Object.keys(datasetBuilderExports) },
  { entry: "nirs4all-ui/dataset", title: "Dataset view models", symbols: Object.keys(datasetExports) },
  { entry: "nirs4all-ui/runtime", title: "Runtime view models", symbols: Object.keys(runtimeExports) },
  { entry: "nirs4all-ui/score", title: "Score view models", symbols: Object.keys(scoreExports) },
  { entry: "nirs4all-ui/brand", title: "Brand system", symbols: Object.keys(brandExports) },
  { entry: "nirs4all-ui/styles", title: "Default styles", symbols: Object.keys(stylesExports) },
] as const;

const ASSET_REFERENCES = [
  "assets/brands/nirs4all/icon.svg",
  "assets/brands/nirs4all-core/horizontal.svg",
  "assets/brands/nirs4all-ui/horizontal.svg",
  "assets/brands/nirs4all-providers/horizontal.svg",
  "assets/brands/nirs4all-quality/horizontal.svg",
  "assets/styles/nirs4all-default.css",
  "assets/viz.css",
  "assets/dag.css",
  "assets/datasetBuilder.css",
  "assets/theme.css",
  "assets/motion/nirs-spectra.svg",
] as const;

const HERO_STATS = [
  { value: SHOWCASE_ENTRIES.length, label: "live components" },
  { value: Object.keys(vizExports).filter((k) => /^[A-Z]/.test(k)).length, label: "chart + helper exports" },
  { value: NIRS4ALL_BRANDS.length, label: "ecosystem brands" },
  { value: `v${packageVersion}`, label: "package version" },
] as const;

const datasetBuilderSources: DatasetSource[] = [
  {
    id: "spectra",
    name: "wheat_spectra_train.csv",
    kind: "file",
    fileType: "csv",
    signalType: "spectra",
    status: "parsed",
    rowCount: 12048,
    columnCount: 238,
    sizeBytes: 24_100_000,
    parsing: { separator: ";", decimal: ".", headerMode: "horizontal" },
    usage: { useAs: "x_train" },
    columns: [
      { id: "sample_id", name: "sample_id", detectedType: "text", assignedRole: "ignored", previewValue: "S00123" },
      { id: "split", name: "split", detectedType: "text", assignedRole: "ignored", previewValue: "train" },
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `wavelength_${1000 + i}`,
        name: `wavelength_${1000 + i}`,
        detectedType: "float" as const,
        assignedRole: "ignored" as const,
        previewValue: Number((0.2 + i * 0.002).toFixed(3)),
      })),
    ],
  },
  {
    id: "metadata",
    name: "metadata.xlsx",
    kind: "file",
    fileType: "xlsx",
    signalType: "metadata",
    status: "parsed",
    rowCount: 12048,
    columnCount: 4,
    sizeBytes: 900_000,
    parsing: { sheetName: "Sheet1" },
    usage: { useAs: "metadata" },
    columns: [
      { id: "m_sample_id", name: "sample_id", detectedType: "text", assignedRole: "ignored", previewValue: "S00123" },
      { id: "protein_pct", name: "protein_pct", detectedType: "float", assignedRole: "ignored", previewValue: 13.45 },
      { id: "disease_class", name: "disease_class", detectedType: "text", assignedRole: "ignored", previewValue: "healthy" },
      { id: "cultivar", name: "cultivar", detectedType: "text", assignedRole: "ignored", previewValue: "ARINA" },
    ],
  },
];

const brandIconSvgs = import.meta.glob("../../assets/brands/*/icon.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const brandCards = NIRS4ALL_BRANDS.map((brand) => ({
  brand,
  iconSvg: brandIconSvgs[`../../assets/brands/${brand.id}/icon.svg`] ?? "",
  horizontalPath: getNirs4allBrandAssetPath(brand, "horizontal"),
}));

function Section({
  id,
  kicker,
  title,
  lead,
  children,
  variant,
}: {
  id: string;
  kicker: string;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
  variant?: "paper" | "plain" | "dark";
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      className={`section ${variant === "paper" ? "section-paper" : variant === "dark" ? "section-dark" : ""}`}
      aria-labelledby={headingId}
    >
      <div className="section-head">
        <span className="eyebrow">{kicker}</span>
        <h2 id={headingId}>{title}</h2>
        {lead ? <p className="section-lead">{lead}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ShowcaseCard({ entry, onOpen }: { entry: ShowcaseEntry; onOpen: (entry: ShowcaseEntry) => void }) {
  return (
    <button type="button" className="showcase-card" onClick={() => onOpen(entry)} aria-haspopup="dialog">
      <div className="showcase-preview" aria-hidden="false">{entry.render()}</div>
      <div className="showcase-body">
        <div className="showcase-meta">
          <span className="showcase-tag">{entry.category}</span>
          <code className="showcase-entry">{entry.entry}</code>
        </div>
        <h3 className="showcase-name">{entry.name}</h3>
        <p className="showcase-summary">{entry.summary}</p>
        <div className="showcase-foot">
          <code className="showcase-props">{entry.propsInterface}</code>
          <span className="showcase-open">Dev info →</span>
        </div>
      </div>
    </button>
  );
}

function DetailDrawer({ entry, onClose }: { entry: ShowcaseEntry; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${entry.name} developer detail`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="drawer-head">
          <div>
            <span className="showcase-tag">{entry.category}</span>
            <h3>{entry.name}</h3>
            <code className="drawer-entry">{entry.entry}</code>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="drawer-preview">{entry.render()}</div>

        <p className="drawer-summary">{entry.summary}</p>

        <dl className="drawer-facts">
          <dt>Props</dt>
          <dd><code>{entry.propsInterface}</code></dd>
          <dt>Mirrors</dt>
          <dd>{entry.mirrors}</dd>
          <dt>Host owns</dt>
          <dd>
            <ul className="drawer-host">
              {entry.hostOwned.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </dd>
        </dl>

        <div className="drawer-code-block">
          <span className="drawer-code-label">import</span>
          <pre className="drawer-code">{entry.importLine}</pre>
        </div>
        <div className="drawer-code-block">
          <span className="drawer-code-label">usage</span>
          <pre className="drawer-code">{entry.code}</pre>
        </div>
      </aside>
    </div>
  );
}

export function App() {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [selected, setSelected] = useState<ShowcaseEntry | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const filtered = useMemo(
    () => (activeCategory === "All" ? SHOWCASE_ENTRIES : SHOWCASE_ENTRIES.filter((e) => e.category === activeCategory)),
    [activeCategory],
  );

  return (
    <main className="n4-app-bg">
      <header className="topbar">
        <a href="#top" className="topbar-brand" aria-label="nirs4all-ui home">
          <img src="./logo.svg" alt="nirs4all-ui" />
        </a>
        <nav aria-label="Sections">
          <a href="#showroom">Showroom</a>
          <a href="#builder">Builder</a>
          <a href="#graph">Graph</a>
          <a href="#brand">Brand</a>
          <a href="#surface">API</a>
          <a className="topbar-repo" href="https://github.com/GBeurier/nirs4all-ui">GitHub</a>
        </nav>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          aria-label="Toggle color theme"
        >
          {theme === "light" ? "◐ Dark" : "◑ Light"}
        </button>
      </header>

      <section className="hero section-paper" id="top" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <span className="eyebrow">Shared visual system · Studio · Web · Quali</span>
          <h1 id="hero-heading">
            The nirs4all <em className="n4-gradient-text">component showroom</em>
          </h1>
          <p className="hero-lead">
            Every reusable, presentational surface the nirs4all tools render — spectra, model diagnostics,
            explainability, pipelines, quality decisions — as one dependency-free React package. Each card is a
            live component on fake data; open it for the dev contract.
          </p>
          <div className="hero-stats">
            {HERO_STATS.map((stat) => (
              <div key={stat.label} className="hero-stat">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
          <div className="n4-spectrum-strip" aria-hidden="true" />
        </div>
        <div className="hero-visual" aria-hidden="true">
          {SHOWCASE_ENTRIES[0]?.render()}
        </div>
      </section>

      <Section
        id="showroom"
        kicker="live components"
        title={<>A <em className="n4-gradient-text">showroom</em> of nirs4all visualizations</>}
        lead="Filter by tool area, then click any component to see its props, the Studio/Web surface it mirrors, the host-owned boundary, and copy-paste usage."
        variant="plain"
      >
        <div className="filter-bar" role="tablist" aria-label="Categories">
          {["All", ...SHOWCASE_CATEGORIES].map((category) => (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={activeCategory === category}
              className={`filter-chip ${activeCategory === category ? "is-active" : ""}`}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="showcase-grid">
          {filtered.map((entry) => (
            <ShowcaseCard key={entry.id} entry={entry} onOpen={setSelected} />
          ))}
        </div>
      </Section>

      <Section
        id="builder"
        kicker="datasetBuilder"
        title={<>The multimodal <em className="n4-gradient-text">Dataset Builder</em> wizard</>}
        lead={
          <>
            A self-contained, presentational wizard (Source → Rôle → Colonnes → Validation) that turns already-parsed
            source descriptors into a nirs4all dataset config. Local UI state only — the host parses files into{" "}
            <code>DatasetSource</code>s and receives the exported JSON. Ships with{" "}
            <code>nirs4all-ui/assets/datasetBuilder.css</code>.
          </>
        }
        variant="paper"
      >
        <DatasetBuilder defaultSources={datasetBuilderSources} defaultDatasetName="demo_wheat_2025" />
      </Section>

      <Section
        id="graph"
        kicker="dag · compiled-graph explorer"
        title={<>The interactive <em className="n4-gradient-text">compiled-DAG</em> explorer</>}
        lead={
          <>
            A dedicated viewer for a <em>compiled</em> DAG-ML graph (or any bound variant), readable from a handful of
            nodes to several thousand: layered layout, pan / zoom, viewport culling and level-of-detail, plus a
            collapsible <code>family → chain</code> cluster hierarchy. With <code>Shapes</code> on, feed it a (multimodal)
            dataset and every node shows the shape arriving and leaving — <code>240×2048</code> spectra + <code>240×12</code>{" "}
            metadata join to <code>240×2060 ·2src</code>, augmentation blows rows up <code>×3</code>, models emit{" "}
            <code>ŷ</code> predictions — so the pipeline's complexity is legible at a glance (see{" "}
            <code>deriveShapes()</code>). Drag to pan, scroll to zoom, click a cluster to expand it or a node to inspect
            it. Adapt a real compiled graph with <code>fromCompiledGraph()</code>; ships with{" "}
            <code>nirs4all-ui/assets/dag.css</code>.
          </>
        }
        variant="paper"
      >
        <DagGraphView
          graph={DEMO_DAG_GRAPH}
          width={1120}
          height={560}
          initialCollapseDepth={0}
          title="stacking-grid · compiled plan"
        />
      </Section>

      <Section
        id="brand"
        kicker="brand system"
        title={<>The canonical <em className="n4-gradient-text">ecosystem marks</em></>}
        lead="The real, designer-made mark for every ecosystem project — an accent-colored squircle with a white NIRS spectrum and peak dot, plus the project wordmark. nirs4all-ui is the single home; each mark is vendored here from the flagship so apps and docs consume one source instead of copying their own."
        variant="dark"
      >
        <div className="brand-grid">
          {brandCards.map(({ brand, iconSvg, horizontalPath }) => (
            <article className="brand-card" key={brand.id}>
              <div className="brand-mark">
                <img src={`data:image/svg+xml;utf8,${encodeURIComponent(iconSvg)}`} alt={`${brand.name} icon`} />
              </div>
              <div className="brand-info">
                <strong>{brand.name}</strong>
                <span>{brand.role}</span>
                <div className="brand-swatches" aria-label={`${brand.name} palette`}>
                  {Object.values(brand.palette).map((color) => (
                    <span key={color} style={{ backgroundColor: color }} title={color} />
                  ))}
                </div>
                <code>{horizontalPath}</code>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section
        id="surface"
        kicker="package surface"
        title={<>Public <em className="n4-gradient-text">export</em> map</>}
        lead="Everything above is imported from these subpath exports. Pure view-model helpers and presentational components only — no app state, routing, network, storage, or runtime execution."
        variant="paper"
      >
        <div className="surface-grid">
          {EXPORT_SURFACE.map((group) => (
            <article className="surface-panel" key={group.entry}>
              <div className="panel-head">
                <span>{group.title}</span>
                <code>{group.entry}</code>
              </div>
              <div className="symbol-cloud">
                {group.symbols.map((symbol) => <code key={symbol}>{symbol}</code>)}
              </div>
            </article>
          ))}
        </div>

        <div className="surface-grid surface-grid-secondary">
          <article className="surface-panel">
            <div className="panel-head">
              <span>Packaged assets</span>
              <code>nirs4all-ui/assets/*</code>
            </div>
            <div className="asset-list">
              {ASSET_REFERENCES.map((path) => (
                <a key={path} href={`./${path}`}>{path}</a>
              ))}
            </div>
          </article>
          <article className="surface-panel">
            <div className="panel-head">
              <span>Design tokens</span>
              <code>NIRS4ALL_CSS_TOKENS</code>
            </div>
            <div className="symbol-cloud">
              {NIRS4ALL_CSS_TOKENS.map((token) => <code key={token}>{getNirs4allCssVariable(token)}</code>)}
            </div>
          </article>
          <article className="surface-panel">
            <div className="panel-head">
              <span>Style assets</span>
              <code>NIRS4ALL_STYLE_ASSETS</code>
            </div>
            <div className="asset-list compact">
              {NIRS4ALL_STYLE_ASSETS.map((asset) => (
                <a key={asset.id} href={`./${asset.path}`}>
                  <strong>{asset.path}</strong>
                  <span>{asset.description}</span>
                </a>
              ))}
            </div>
          </article>
        </div>
      </Section>

      <footer className="site-footer">
        <div>
          <img src="./logo.svg" alt="nirs4all-ui" className="footer-logo" />
          <p>
            Shared React UI for the nirs4all ecosystem. Published to{" "}
            <a href={CANONICAL_SITE_URL}>{CANONICAL_SITE_URL}</a>.
          </p>
        </div>
        <div className="footer-assets">
          {PUBLICATION_ASSETS.map((asset) => (
            <a key={asset.name} href={asset.path} title={asset.role}>{asset.name}</a>
          ))}
        </div>
      </footer>

      {selected ? <DetailDrawer entry={selected} onClose={() => setSelected(null)} /> : null}
    </main>
  );
}
