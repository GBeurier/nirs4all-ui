# Shared UI migration backlog — Studio & Web → `nirs4all-ui`

Status: **planning**. This document is the backlog for making `nirs4all-ui` the
single source of truth for **presentational display** across `nirs4all-studio`
and `nirs4all-web` (which powers `web.nirs4all.org`). It is a plan, not a change:
no app code is modified by adding this file.

## Why

Today each app re-implements the same scientific visualizations locally. The
Studio charts are built on **recharts / three.js / regl / Radix / Tailwind**; the
Web charts on **recharts + a custom WebGL renderer**. That is duplicated work and
lets the two UIs drift. `nirs4all-ui` exists to end that: *"Presentational
components and pure view-model helpers consumed by Studio and the standalone
Web/WASM client; no routing, backend calls, storage, parsing, or runtime
execution."*

## Guardrails (do not break these while migrating)

1. **`nirs4all-ui` stays dependency-free** — React is the only peer dependency.
   No recharts, three, regl, Radix, Tailwind, CVA, or app state in the package.
2. **Only presentational *leaves* move.** Pages (`Inspector`, `Playground`,
   `VariableImportance`, `SpectraSynthesis`, `TransferAnalysis`, `Predictions`,
   `Results`, `RunProgress`, …) keep their routing, data fetching, WebSockets,
   and app state in the app. They render shared leaves instead of local ones.
3. **Charts are inline-SVG reproductions.** An app replaces its recharts/three
   chart with the shared SVG component and passes it already-computed numeric
   arrays + `className`/color props. Pixel-parity is a per-chart design sign-off.
4. **3D / high-cardinality WebGL stays app-local** (`ScatterPlot3D`,
   `SpectraWebGL`, `ScatterWebGL3D`, `regl` renderers). `nirs4all-ui` offers a 2D
   fallback (`PcaScatter`) only.
5. **Interactivity stays app-owned.** Shared components render static output;
   hover/tooltip/selection/lasso/zoom/dnd are re-added by the app (by wrapping, or
   via the component's `render*` props / `data-*` hooks). Decide per component.

## Current state

- **Shared already (Phase 0, done):** Studio and Web both consume
  `nirs4all-ui/score` and `nirs4all-ui/runtime` view-models, and the runtime
  badges `RuntimeEngineBadge`, `RuntimeDiagnosticList`, `RuntimeResultStatusBadge`.
- **Shipped this change (Phase 1, done):** the presentational leaves below are now
  in `nirs4all-ui` and shown in the showroom, on fake data.

### `nirs4all-ui` inventory the migration targets

- `nirs4all-ui/viz` (inline-SVG charts): `SpectraPlot`, `Histogram`, `PcaScatter`,
  `PredictionScatter`, `ResidualPlot`, `ConfusionMatrix`, `BoxPlot`,
  `ScoreHeatmap`, `FeatureImportanceBar`, `ShapBeeswarm`, `WaterfallChart`,
  `FoldStabilityLines`, `BiasVarianceBars`, `PipelineFlow`, `ScoreSummary`.
- `nirs4all-ui/components` (headless cards/tables/badges): `DatasetPreviewCard`,
  `DatasetResultCard`, `PredictionCard`, `ScoreCardTree`, `PerClassTable`,
  `RankingsTable`, `MetricValueBadge`, `RuntimeEngineBadge`,
  `RuntimeResultStatusBadge`, `RuntimeDiagnosticList`.
- `nirs4all-ui/lab`, `/dataset`, `/datasetBuilder`, `/brand`, `/styles`.

## Mapping — `nirs4all-studio`

Legend: ✅ shared component available now · 🟡 partial (covers most, some feature gap) ·
🆕 needs a new shared component (see backlog) · 🔒 stays app-local by design.

### Inspector (`pages/Inspector.tsx`, `components/inspector/*`)
| Studio local | → `nirs4all-ui` | Status |
| --- | --- | --- |
| `PredVsObsChart` | `viz.PredictionScatter` | ✅ |
| `ResidualsChart` | `viz.ResidualPlot` | ✅ |
| `ScoreHistogramPlot` | `viz.Histogram` | ✅ |
| `ConfusionMatrixSvg` | `viz.ConfusionMatrix` | ✅ |
| `PerformanceHeatmapSvg` | `viz.ScoreHeatmap` | ✅ |
| `CandlestickSvg` | `viz.BoxPlot` | ✅ |
| `FoldStabilitySvg` | `viz.FoldStabilityLines` | ✅ |
| `BiasVarianceBarChart` | `viz.BiasVarianceBars` | ✅ |
| `RankingsTable` | `components.RankingsTable` | ✅ |
| `BranchTopologySvg` | `viz.PipelineFlow` | 🟡 single-spine; multi-branch DAG layout is 🆕 |
| `BranchComparisonSvg` (CI error bars) | — | 🆕 `BranchComparison` |
| `HyperparameterSensitivityPlot` | — | 🆕 `HyperparameterSensitivity` |
| `PreprocessingImpact` | `viz.BoxPlot` / `viz.Histogram` | 🟡 |
| per-class metrics | `components.PerClassTable` | ✅ |

### Playground (`pages/Playground.tsx`, `components/playground/*`)
| Studio local | → `nirs4all-ui` | Status |
| --- | --- | --- |
| `SpectraChart` / `BaseSpectraChart` | `viz.SpectraPlot` | ✅ |
| `TargetHistogram` | `viz.Histogram` | ✅ |
| `DimensionReductionChart` (2D) | `viz.PcaScatter` | ✅ |
| `ScatterPlot3D`, `SpectraWebGL` | — | 🔒 three/regl, stays local |
| `FoldDistributionChart`, `RepetitionsChart` | `viz.Histogram` / `viz.BoxPlot` | 🟡 |

### Variable importance / SHAP (`pages/VariableImportance.tsx`)
| Studio local | → `nirs4all-ui` | Status |
| --- | --- | --- |
| `FeatureImportanceBar` | `viz.FeatureImportanceBar` | ✅ |
| `WaterfallChart` | `viz.WaterfallChart` | ✅ |
| `BeeswarmChart` | `viz.ShapBeeswarm` | ✅ |
| `PredictionScatter` | `viz.PredictionScatter` | ✅ |
| `SpectralImportanceChart` (dual-axis SHAP + mean spectrum + reference bands) | — | 🆕 `SpectralImportanceChart` |

### Spectra synthesis (`pages/SpectraSynthesis.tsx`)
| `SpectraChart` | `viz.SpectraPlot` | ✅ |

### Transfer analysis (`pages/TransferAnalysis.tsx`)
| Studio local | → `nirs4all-ui` | Status |
| --- | --- | --- |
| `TransferPCAScatter` | `viz.PcaScatter` (`colorMode="group"`) | ✅ |
| `DistanceMatrixHeatmap` | `viz.ScoreHeatmap` (symmetric) | 🟡 |
| `MetricConvergenceChart`, `PreprocessingRankingChart` (diverging bars) | `viz.FeatureImportanceBar` | 🟡 diverging axis is 🆕 |

### Predictions / Results / Datasets (`pages/Predictions.tsx`, `Results.tsx`, `Datasets.tsx`)
| Studio local | → `nirs4all-ui` | Status |
| --- | --- | --- |
| `ScoreCardTree` | `components.ScoreCardTree` | ✅ |
| `DatasetCard` / `datasetResultCardData` | `components.DatasetResultCard` | ✅ |
| prediction id card (`components/predictions/*`) | `components.PredictionCard` | ✅ |
| `MetricsCard`, `ResultMetricCardGrid` | `viz.ScoreSummary` + `components.MetricValueBadge` | ✅ |
| predictions viewer (scatter/residuals/confusion/histogram) | `viz.PredictionScatter` / `ResidualPlot` / `ConfusionMatrix` / `Histogram` | ✅ |

### Run progress (`pages/RunProgress.tsx`)
| status/step cards | `components.RuntimeResultStatusBadge` + `viz.ScoreSummary` | ✅ |

## Mapping — `nirs4all-web` (web.nirs4all.org)

| Web local (`web-app/src/components/…`) | → `nirs4all-ui` | Status |
| --- | --- | --- |
| `results/ResultsVisualization` → ParityChart | `viz.PredictionScatter` | ✅ |
| … → ResidualChart | `viz.ResidualPlot` | ✅ |
| … → FoldsChart | `viz.Histogram` / `viz.BoxPlot` | 🟡 |
| … → ConfusionMatrix | `viz.ConfusionMatrix` | ✅ |
| … → PerClassTable | `components.PerClassTable` | ✅ |
| `results/PredictionPanel` histograms / class bars | `viz.Histogram` | ✅ |
| … validation parity / confusion | `viz.PredictionScatter` / `viz.ConfusionMatrix` | ✅ |
| … score cards | `viz.ScoreSummary` | ✅ |
| `dataset/DatasetView` spectra (`ComposedChart`) | `viz.SpectraPlot` | ✅ |
| … PCA (2D) | `viz.PcaScatter` | ✅ |
| … target distribution | `viz.Histogram` | ✅ |
| `dataset/scatter3d/ScatterWebGL3D` | — | 🔒 WebGL, stays local (2D fallback = `viz.PcaScatter`) |
| `results/ResultsList` score cards | `viz.ScoreSummary` + `components.ScoreCardTree` | ✅ |
| `pipeline/CanvasFlow` (read-only view) | `viz.PipelineFlow` | 🟡 editing/dnd stays local |

## Phased plan

- **Phase 0 — done.** View-models + runtime badges shared in both apps.
- **Phase 1 — done (this change).** Ship the `viz` charts and `components`
  cards/tables in `nirs4all-ui`; demonstrate on fake data in the showroom.
- **Phase 2 — Studio adoption, page by page** (suggested order: Inspector →
  Predictions/Results → SHAP → Playground 2D → Synthesis → Transfer). For each:
  replace the local chart/card with the shared one, pass data + classes, delete
  the local duplicate + its data helper if now unused, keep its recharts import
  only where a shared equivalent is still 🆕.
- **Phase 3 — Web adoption.** Same, dropping recharts usage where covered; keep
  the WebGL 3D renderer local.
- **Phase 4 — backfill 🆕 components** (`SpectralImportanceChart`,
  `BranchComparison`, `HyperparameterSensitivity`, diverging-bar mode, multi-branch
  `PipelineFlow` layout), then remove the last duplicates.
- **Phase 5 — lock it in.** Add an import-guard test in each app that fails if a
  local module re-implements a chart that `nirs4all-ui` now owns.

## `nirs4all-ui` "needs-new" backlog (Phase 4)

- [ ] `SpectralImportanceChart` — dual-axis: SHAP importance line + dashed mean
      spectrum + highlighted `ReferenceArea` wavelength bands, with a binned bar row.
- [ ] `BranchComparison` — grouped CI error-bar chart (mean ± interval per branch).
- [ ] `HyperparameterSensitivity` — param-vs-score scatter (optional log x).
- [ ] Diverging horizontal-bar mode for `FeatureImportanceBar` (signed values,
      zero reference) to cover `MetricConvergence` / `PreprocessingRanking`.
- [ ] Multi-branch DAG layout for `PipelineFlow` (current is a single vertical
      spine) to fully cover `BranchTopologySvg`.

## Cross-cutting decisions to make before Phase 2

- **Theming bridge.** Studio uses `hsl(var(--token))`; Web/org use `--chart-*`
  teal tokens; `nirs4all-ui` components take explicit color props and read
  `--n4-*`/plain fallbacks. Agree on one bridge (e.g. each app maps its tokens to
  the components' color props once, in a thin adapter).
- **Interactivity contract.** Decide, per chart, whether the shared component
  exposes hover/selection via `render*` props + `data-*`, or whether the app
  overlays its own interaction layer.
- **Test ownership.** Pure geometry/formatting tests live in `nirs4all-ui`;
  integration/interaction tests stay in the apps.

## Brand kit — single source

**Done.** The real, designer-made mark for **every** ecosystem project is now
vendored in `nirs4all-ui/assets/brands/<id>/` (`icon` + `horizontal`/`stacked` +
dark variants — 19 projects × 5 SVGs), with the manifest in `src/brand/index.ts`.
The previous procedural generator — which invented a *different, fake* mark for
only 5 projects — is retired; `scripts/generate-brand-assets.mjs` now imports the
marks from the flagship master and verifies them (`npm run brand:check`). This is
the single home the `gen-brand.mjs` header comment always intended
(*"the shared UI package = the logical home"*). Each project's mark is distinct
(its own wordmark + accent tile); the shared red `#E9362D` and teal `#058E96` are
constant.

**Also done (raster kit + distribution tooling):**
- Vendored the full raster set for all 19 projects — `icon-32/180/256/512.png`,
  `favicon.ico`, `og.png` (+ `horizontal/stacked.png` where the master has them):
  245 files total. Exposed via `getNirs4allBrandRasterPath` + `Nirs4allBrandRaster`
  in the manifest; `brand:check` verifies the required rasters.
- `scripts/sync-ecosystem-brands.mjs` (`npm run brand:sync`): drift-check by
  default (read-only), `--write` distributes ui's kit into each sibling repo's
  `assets/brand/`. This is the de-dup mechanism — one authored source + sync.

**Open — needs a canonical decision before distributing (`brand:sync --write`):**
- The drift check proved the ecosystem is NOT uniformly consistent. The `nirs4all`
  flagship repo carries a NEWER horizontal mark (gradient wordmark, viewBox
  976×266) than the org master ui vendored (flat, 889×312), and ~6 repos have a
  divergent `og.png`. There is no single clean master yet. **Decide the canonical
  version per drifted asset** (recommendation: adopt the newest — the repo's
  gradient horizontal for `nirs4all` — and reconcile the `og` cards), re-vendor it
  into ui, then `brand:sync --write` to make every repo a mirror.
- After that: sibling repos should only ever sync from ui, never author locally.
  (Non-JS repos — Rust, static, Python — can't npm-consume, so a synced physical
  copy stays; the single source is the *authoring point* + `brand:sync`, not
  physical removal.)

**Superseded — not folded in, by design:**
- The recolor+rasterize generator (`nirs4all-quality/app/scripts/gen-brand.mjs`)
  is NOT folded into ui: the per-project marks are DISTINCT (each its own
  wordmark), not recolors of one master, so they are vendored, not generated. The
  only pure-recolor variant (quali) is already vendored. That script stays a one-off
  for minting a brand-new recolored variant (needs `@resvg/resvg-js` + `png-to-ico`).
