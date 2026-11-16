import { useCallback } from "react";
import { cx } from "./_cx.js";
import { MULTIMODAL_CASES } from "./catalog.js";
import { AlignmentTable, DataPanel } from "./DataPanel.js";
import { CaseSelector, MultimodalHeader, Section } from "./Header.js";
import { InstructorGuide } from "./InstructorGuide.js";
import { ModelSettings, SourceChainEditor, StrategyPanel, orderCandidates } from "./RecipePanel.js";
import { ExportPanel, ResultsPanel } from "./ResultsPanel.js";
import { RunPanel, ValidationPanel } from "./RunPanel.js";
import { SampleNavigator, SourceViews } from "./SourceViews.js";
import type { MultimodalConfig, MultimodalWorkbenchProps } from "./types.js";

/**
 * The complete controlled teaching workbench. Every value comes from props and
 * every edit is reported through a callback; the host owns state, loading,
 * execution and downloads, and clears results whenever data or configuration
 * change.
 */
export function MultimodalWorkbench(props: MultimodalWorkbenchProps & { className?: string }) {
  const {
    brand,
    backHref,
    backLabel,
    runtime,
    caseId,
    cases = MULTIMODAL_CASES,
    onCaseChange,
    presets,
    importProfiles,
    dataOrigin,
    dataStatus,
    dataset,
    onLoadPreset,
    onImportFiles,
    datasetBuilder,
    selectedSampleId,
    onSelectSample,
    config,
    onConfigChange,
    onRestoreTeachingConfig,
    candidates,
    onCandidatesChange,
    stepCatalog,
    pipelineEditor,
    run,
    onRun,
    onCancel,
    results,
    onExportConfig,
    onExportResults,
    className,
  } = props;

  const locked = run.kind === "running";
  const caseInfo = cases.find((info) => info.id === caseId);

  // Keep the comparison batch consistent with the selected sources.
  const changeConfig = useCallback(
    (next: MultimodalConfig) => {
      if (config && next.sourceIds.join("\u0000") !== config.sourceIds.join("\u0000")) {
        const kept = candidates.filter((candidate) =>
          candidate.strategy === "single"
            ? candidate.singleSourceId !== undefined && next.sourceIds.includes(candidate.singleSourceId)
            : next.sourceIds.length > 1,
        );
        if (kept.length !== candidates.length) onCandidatesChange(orderCandidates(kept, next.sourceIds));
      }
      onConfigChange(next);
    },
    [config, candidates, onCandidatesChange, onConfigChange],
  );

  const ready = Boolean(dataset && config && dataset.caseId === caseId);

  return (
    <div className={cx("n4mm", "n4-app", className)}>
      <MultimodalHeader brand={brand} backHref={backHref} {...(backLabel ? { backLabel } : {})} runtime={runtime} />
      {pipelineEditor !== undefined ? <nav className="n4mm-workflow" aria-label="Laboratory sections">
        <a href="#n4mm-data">Dataset builder</a>
        <a href="#n4mm-explore">Explore sources</a>
        <a href="#n4mm-protocol">Validation</a>
        <a href="#n4mm-pipeline">Pipeline editor</a>
        <a href="#n4mm-results">Results</a>
      </nav> : null}
      <main className="n4mm-main">
        <Section
          id="n4mm-case"
          step={1}
          title="Choose a teaching case"
          lead="Every case measures the same physical samples through several sources. Sources are matched by sample identity before anything is learned."
        >
          <CaseSelector caseId={caseId} cases={cases} onCaseChange={onCaseChange} disabled={locked} />
        </Section>

        <Section
          id="n4mm-data"
          step={2}
          title="Load data"
          lead={caseInfo ? `${caseInfo.title}: ${caseInfo.modalities}.` : undefined}
        >
          <DataPanel
            key={caseId}
            caseId={caseId}
            presets={presets}
            importProfiles={importProfiles}
            dataOrigin={dataOrigin}
            dataStatus={dataStatus}
            onLoadPreset={onLoadPreset}
            onImportFiles={onImportFiles}
            {...(datasetBuilder !== undefined ? { datasetBuilder } : {})}
            disabled={locked}
          />
          {dataset && dataset.caseId === caseId ? <AlignmentTable dataset={dataset} /> : null}
        </Section>

        {ready && dataset && config ? (
          <>
            <Section
              id="n4mm-explore"
              step={3}
              title="Explore each source"
              lead="Each source keeps its own axis, unit and representation. Select one sample to follow it everywhere."
            >
              <SampleNavigator dataset={dataset} selectedSampleId={selectedSampleId} onSelectSample={onSelectSample} />
              <SourceViews dataset={dataset} selectedSampleId={selectedSampleId} onSelectSample={onSelectSample} />
            </Section>

            {pipelineEditor !== undefined ? (
              <>
                <Section
                  id="n4mm-protocol"
                  step={4}
                  title="Validation protocol"
                  lead="One protocol for every run: the same held-out samples, the same outer folds and the same inner folds."
                >
                  <ValidationPanel dataset={dataset} config={config} onConfigChange={changeConfig} disabled={locked} />
                </Section>

                <Section
                  id="n4mm-pipeline"
                  step={5}
                  title="Build and run the pipeline"
                  lead="Start from a preset, then edit branches, sources, preprocessing, models and the merge. Select any card to inspect it."
                >
                  {pipelineEditor}
                  <details className="n4mm-details">
                    <summary>Compare unedited presets</summary>
                    <p className="n4mm-note">
                      Runs the fixed teaching recipes chosen by the host with their default settings, for comparison. It does not
                      run the pipeline edited above.
                    </p>
                    <RunPanel
                      dataset={dataset}
                      config={config}
                      candidates={candidates}
                      run={run}
                      runtimeReady={runtime.state === "ready"}
                      onRun={onRun}
                      onCancel={onCancel}
                    />
                  </details>
                </Section>
              </>
            ) : (
              <>
                <Section
                  id="n4mm-preprocess"
                  step={4}
                  title="Preprocess each source"
                  lead="Choose the sources of the experiment and give each one its own preprocessing chain."
                  actions={
                    <button type="button" className="n4mm-button" data-variant="quiet" onClick={onRestoreTeachingConfig} disabled={locked}>
                      Restore teaching settings
                    </button>
                  }
                >
                  <SourceChainEditor
                    sources={dataset.sources}
                    config={config}
                    onConfigChange={changeConfig}
                    {...(stepCatalog ? { catalog: stepCatalog } : {})}
                    disabled={locked}
                  />
                </Section>

                <Section
                  id="n4mm-recipes"
                  step={5}
                  title="Choose fusion recipes"
                  lead="Where are the sources combined: variables, learned features or predictions? Pick one recipe to explain and tick the recipes to compare."
                >
                  <StrategyPanel
                    sources={dataset.sources}
                    config={config}
                    onConfigChange={changeConfig}
                    candidates={candidates}
                    onCandidatesChange={onCandidatesChange}
                    {...(stepCatalog ? { catalog: stepCatalog } : {})}
                    disabled={locked}
                  />
                  <ModelSettings config={config} onConfigChange={changeConfig} disabled={locked} />
                </Section>

                <Section
                  id="n4mm-run"
                  step={6}
                  title="Validate and run"
                  lead="One protocol for every recipe: the same held-out samples, the same outer folds and the same inner folds."
                >
                  <ValidationPanel dataset={dataset} config={config} onConfigChange={changeConfig} disabled={locked} />
                  <RunPanel
                    dataset={dataset}
                    config={config}
                    candidates={candidates}
                    run={run}
                    runtimeReady={runtime.state === "ready"}
                    onRun={onRun}
                    onCancel={onCancel}
                  />
                </Section>
              </>
            )}

            <Section id="n4mm-results" step={pipelineEditor !== undefined ? 6 : 7} title="Compare results">
              {results ? (
                <ResultsPanel
                  dataset={dataset}
                  results={results}
                  selectedSampleId={selectedSampleId}
                  onSelectSample={onSelectSample}
                />
              ) : (
                <p className="n4mm-status" role="status">
                  {run.kind === "running"
                    ? "Results will appear when the run completes."
                    : pipelineEditor !== undefined
                      ? "No results for the current draft. Run edited pipeline to produce them. Editing the data, pipeline or validation protocol clears the current result; completed drafts remain in the host's run history."
                      : "No results for the current data and settings. Results are cleared whenever data, preprocessing, recipes or protocol change; run the comparison to produce them."}
                </p>
              )}
              <ExportPanel
                hasConfig
                hasResults={results !== null}
                onExportConfig={onExportConfig}
                onExportResults={onExportResults}
              />
            </Section>
          </>
        ) : null}

        <Section id="n4mm-guide" step={ready ? (pipelineEditor !== undefined ? 7 : 8) : 3} title="Instructor guide">
          <InstructorGuide caseId={caseId} cases={cases} />
        </Section>
      </main>
      <footer className="n4mm-footer">
        <p>
          Computation runs locally in a background worker with the nirs4all WebAssembly owners (IO, Methods, DAG-ML). This
          page displays their outputs; it does not compute scores itself.
        </p>
      </footer>
    </div>
  );
}
