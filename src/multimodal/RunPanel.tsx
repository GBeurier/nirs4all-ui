import { sourceTag, strategyInfo } from "./catalog.js";
import { distinctGroupCount, partitionCounts } from "./data.js";
import { NumberField, TextField } from "./fields.js";
import type {
  MultimodalCandidate,
  MultimodalConfig,
  MultimodalDataset,
  MultimodalRunState,
  MultimodalValidation,
} from "./types.js";

const U64_MAX = BigInt("18446744073709551615");

/** Validates an exact decimal u64 seed string without converting it to a JS number. */
export function seedError(draft: string): string | null {
  if (!/^(0|[1-9][0-9]*)$/.test(draft)) return "Use decimal digits without leading zeros (an unsigned 64-bit integer).";
  if (BigInt(draft) > U64_MAX) return "The seed must fit in an unsigned 64-bit integer.";
  return null;
}

export interface ValidationPanelProps {
  dataset: MultimodalDataset;
  config: MultimodalConfig;
  onConfigChange: (next: MultimodalConfig) => void;
  disabled?: boolean;
}

/** One validation protocol shared by every recipe of the comparison. */
export function ValidationPanel({ dataset, config, onConfigChange, disabled }: ValidationPanelProps) {
  const validation = config.validation;
  const set = (patch: Partial<MultimodalValidation>) =>
    onConfigChange({ ...config, validation: { ...validation, ...patch } });
  const partitions = partitionCounts(dataset);
  const groups = distinctGroupCount(dataset);
  return (
    <fieldset className="n4mm-validation" disabled={disabled}>
      <legend className="n4mm-sr-only">Validation protocol</legend>
      <ol className="n4mm-protocol">
        <li>
          <strong>Held-out test set.</strong>{" "}
          {partitions
            ? `Declared by the data: ${partitions.test} test samples are never used for fitting, preprocessing or choosing a recipe.`
            : "Built once by the native owner from the fraction below; never used for fitting, preprocessing or choosing a recipe."}
        </li>
        <li>
          <strong>Outer cross-validation</strong> on the calibration samples gives the out-of-fold (OOF) predictions used to
          compare recipes.
        </li>
        <li>
          <strong>Inner cross-validation</strong> inside each outer training scope produces the out-of-fold base predictions
          that train stacking meta-learners. The final refit repeats it on the whole calibration set.
        </li>
        <li>
          <strong>Groups.</strong>{" "}
          {groups === null
            ? "No groups declared: samples are treated as independent."
            : `${groups} declared groups; each group stays on one side of the held-out split and of every outer and inner fold.`}
        </li>
      </ol>
      <div className="n4mm-validation__fields">
        <TextField
          label="Seed"
          value={validation.seed}
          mono
          validate={seedError}
          hint="Exact decimal digits, passed to the owners as a string."
          onCommit={(seed) => set({ seed })}
        />
        <NumberField
          label="Outer folds"
          value={validation.outerFolds}
          integer
          min={2}
          max={10}
          onCommit={(outerFolds) => set({ outerFolds })}
        />
        <NumberField
          label="Inner folds (stacks)"
          value={validation.innerFolds}
          integer
          min={2}
          max={10}
          onCommit={(innerFolds) => set({ innerFolds })}
        />
        {partitions ? (
          <p className="n4mm-note">
            Held-out set declared by data ({partitions.train} calibration / {partitions.test} test).
          </p>
        ) : (
          <NumberField
            label="Held-out fraction"
            value={validation.holdoutFraction ?? 0.2}
            min={0.05}
            max={0.5}
            step={0.05}
            onCommit={(holdoutFraction) => set({ holdoutFraction })}
          />
        )}
      </div>
    </fieldset>
  );
}

export interface RunReadiness {
  ready: boolean;
  reasons: string[];
}

/** Reasons the comparison cannot start, stated in words (never a silent disabled button). */
export function runReadiness(
  dataset: MultimodalDataset | null,
  config: MultimodalConfig | null,
  candidates: readonly MultimodalCandidate[],
  runtimeReady: boolean,
): RunReadiness {
  const reasons: string[] = [];
  if (!runtimeReady) reasons.push("The local WASM runtime is not ready yet.");
  if (!dataset) reasons.push("Load a synthetic preset or import files first.");
  if (!config) reasons.push("No recipe configuration is available for the loaded data.");
  if (candidates.length === 0) reasons.push("Tick at least one recipe to include in the run.");
  if (dataset && config) {
    const selected = dataset.sources.filter((source) => config.sourceIds.includes(source.id));
    for (const source of selected) {
      const validity = source.validity;
      if (!validity) continue;
      let missing = false;
      for (let index = 0; index < validity.length && !missing; index += 1) missing = validity[index] === 0;
      if (missing) {
        reasons.push(
          `${source.label} contains missing values. The complete-data teaching profile refuses training instead of imputing; deselect this source or import complete data.`,
        );
      }
    }
    if (seedError(config.validation.seed)) reasons.push("The seed is not a valid unsigned 64-bit decimal integer.");
  }
  return { ready: reasons.length === 0, reasons };
}

export interface RunPanelProps {
  dataset: MultimodalDataset | null;
  config: MultimodalConfig | null;
  candidates: readonly MultimodalCandidate[];
  run: MultimodalRunState;
  runtimeReady: boolean;
  onRun: () => void;
  onCancel: () => void;
}

export function candidateLabel(candidate: Pick<MultimodalCandidate, "strategy" | "singleSourceId">, dataset: MultimodalDataset | null): string {
  if (candidate.strategy === "single") {
    const index = dataset ? dataset.sources.findIndex((source) => source.id === candidate.singleSourceId) : -1;
    const source = index >= 0 ? dataset?.sources[index] : undefined;
    return source ? `${sourceTag(index)} ${source.label} alone` : `Single source ${candidate.singleSourceId ?? ""}`;
  }
  return strategyInfo(candidate.strategy).name;
}

/** Run / cancel, live native progress and owner errors for the comparison batch. */
export function RunPanel({ dataset, config, candidates, run, runtimeReady, onRun, onCancel }: RunPanelProps) {
  const readiness = runReadiness(dataset, config, candidates, runtimeReady);
  const running = run.kind === "running";
  const progress = run.kind === "running" ? run.progress : null;
  const current = progress?.candidateId ? candidates.find((candidate) => candidate.id === progress.candidateId) : undefined;
  return (
    <div className="n4mm-run">
      <div className="n4mm-run__batch">
        <span className="n4mm-field__label">
          Comparison batch · {candidates.length} recipe{candidates.length === 1 ? "" : "s"}, run one after another in a
          background worker
        </span>
        <ol className="n4mm-run__list">
          {candidates.map((candidate) => (
            <li key={candidate.id} data-current={current?.id === candidate.id || undefined}>
              {candidateLabel(candidate, dataset)}
            </li>
          ))}
        </ol>
      </div>
      <div className="n4mm-run__actions">
        {running ? (
          <button type="button" className="n4mm-button" data-variant="danger" onClick={onCancel}>
            Cancel run
          </button>
        ) : (
          <button type="button" className="n4mm-button" data-variant="primary" onClick={onRun} disabled={!readiness.ready}>
            Run comparison
          </button>
        )}
        <div className="n4mm-run__status" role="status" aria-live="polite">
          {running ? (
            <>
              <span>
                Running{current ? ` ${candidateLabel(current, dataset)}` : progress?.strategy ? ` ${strategyInfo(progress.strategy).name}` : ""}
                {progress?.phase ? ` · ${progress.phase}` : ""}
                {progress?.node ? ` · ${progress.node}` : ""}
                {progress?.fold ? ` · fold ${progress.fold}` : ""}
                {progress?.message ? ` · ${progress.message}` : ""}
              </span>
              {progress?.total ? (
                <progress max={progress.total} value={progress.completed ?? 0}>
                  {progress.completed ?? 0} / {progress.total}
                </progress>
              ) : (
                <progress />
              )}
            </>
          ) : run.kind === "cancelled" ? (
            <span>Run cancelled{run.message ? `: ${run.message}` : ""}. The worker was stopped; no partial result is shown.</span>
          ) : run.kind === "done" ? (
            <span>Run complete. Results below belong to the configuration shown above.</span>
          ) : null}
        </div>
      </div>
      {!running && !readiness.ready ? (
        <ul className="n4mm-reasons">
          {readiness.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {run.kind === "error" ? (
        <div className="n4mm-alert" role="alert">
          <strong>{run.name}</strong>
          <span>{run.message}</span>
        </div>
      ) : null}
    </div>
  );
}
