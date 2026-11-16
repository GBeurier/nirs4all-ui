import { useId, useMemo, useState } from "react";
import { PredictionScatter, type PredictionPoint } from "../viz/PredictionScatter.js";
import { ResidualPlot, type ResidualPoint } from "../viz/ResidualPlot.js";
import { SpectraPlot } from "../viz/SpectraPlot.js";
import { sourceTag, strategyInfo } from "./catalog.js";
import { formatDuration, formatMetric, formatNumber, shortFingerprint } from "./data.js";
import { candidateLabel } from "./RunPanel.js";
import { N4MM_COLORS } from "./SourceViews.js";
import type {
  MultimodalCandidateResult,
  MultimodalDataset,
  MultimodalRunResult,
  MultimodalScopeResult,
} from "./types.js";

type Scope = "oof" | "holdout";

const SCOPE_LABEL: Readonly<Record<Scope, string>> = {
  oof: "Out-of-fold (calibration, outer folds)",
  holdout: "Held-out test (after refit)",
};

export interface ResultsPanelProps {
  dataset: MultimodalDataset;
  results: MultimodalRunResult;
  selectedSampleId: string | null;
  onSelectSample: (sampleId: string | null) => void;
}

/** Owner-scored comparison: metrics by scope, observed/predicted, residuals, folds and provenance. */
export function ResultsPanel({ dataset, results, selectedSampleId, onSelectSample }: ResultsPanelProps) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("oof");
  if (results.dataFingerprint !== dataset.fingerprint) {
    return (
      <p className="n4mm-alert" role="note">
        These results were produced on different data (fingerprint {shortFingerprint(results.dataFingerprint)}). Run the
        comparison again for the data loaded now.
      </p>
    );
  }
  const focus = results.candidates.find((candidate) => candidate.candidateId === focusId) ?? results.candidates[0] ?? null;
  const tagOf = new Map(dataset.sources.map((source, index) => [source.id, sourceTag(index)]));
  const scopeResult = focus ? (scope === "holdout" ? focus.holdout : focus.oof) : null;

  return (
    <div className="n4mm-results">
      <p className="n4mm-note">
        All values are computed by the native owners and displayed as received. Rows follow the run order; no ranking is
        computed here. Compare recipes on the out-of-fold scope. The held-out test is a single final check after refit and
        must not be used to choose a recipe. R² shows n/a when it is undefined (for example, a constant target).
      </p>
      <div className="n4mm-scroll">
        <table className="n4mm-table n4mm-metrics">
          <caption>
            {results.candidates.length} recipes on the same samples and folds
            {results.counts
              ? ` · ${results.counts.calibration} calibration and ${results.counts.holdout} held-out samples${
                  results.counts.groups !== undefined ? `, ${results.counts.groups} groups` : ""
                }`
              : ""}
            . Hyper-parameters fixed a priori.
          </caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>
                Plot
              </th>
              <th scope="col" rowSpan={2}>
                Recipe
              </th>
              <th scope="colgroup" colSpan={4} className="n4mm-metrics__group">
                Out-of-fold
              </th>
              <th scope="colgroup" colSpan={4} className="n4mm-metrics__group">
                Held-out test
              </th>
              <th scope="col" rowSpan={2} className="n4mm-num">
                Time
              </th>
            </tr>
            <tr>
              {["n", "RMSE", "MAE", "R²", "n", "RMSE", "MAE", "R²"].map((label, index) => (
                <th key={index} scope="col" className="n4mm-num">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.candidates.map((candidate) => {
              const focused = focus?.candidateId === candidate.candidateId;
              return (
                <tr key={candidate.candidateId} data-focused={focused || undefined}>
                  <td>
                    <input
                      type="radio"
                      name="n4mm-result-focus"
                      aria-label={`Plot ${candidateLabel(candidate, dataset)}`}
                      checked={focused}
                      onChange={() => setFocusId(candidate.candidateId)}
                    />
                  </td>
                  <th scope="row">
                    <span className="n4mm-strategy__name">{candidateLabel(candidate, dataset)}</span>
                    <span className="n4mm-strategy__summary">
                      {candidate.algorithm} · {candidate.sourceIds.map((id) => tagOf.get(id) ?? id).join(" + ")}
                    </span>
                  </th>
                  <ScopeCells scope={candidate.oof} />
                  <ScopeCells scope={candidate.holdout} />
                  <td className="n4mm-num">{formatDuration(candidate.elapsedMs)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {results.refusals && results.refusals.length > 0 ? (
        <div className="n4mm-alert" role="note">
          <strong>Recipes refused by an owner</strong>
          <ul>
            {results.refusals.map((refusal) => (
              <li key={refusal.candidateId}>
                {candidateLabel(refusal, dataset)}: {refusal.name} — {refusal.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <MetricBars dataset={dataset} candidates={results.candidates} />

      {focus ? (
        <div className="n4mm-focus">
          <div className="n4mm-focus__head">
            <h3 className="n4mm-subtitle">{candidateLabel(focus, dataset)}</h3>
            <div className="n4mm-segmented" role="group" aria-label="Prediction scope">
              {(["oof", "holdout"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={scope === key}
                  disabled={key === "holdout" && focus.holdout === null}
                  onClick={() => setScope(key)}
                >
                  {SCOPE_LABEL[key]}
                </button>
              ))}
            </div>
          </div>
          <p className="n4mm-caveat">
            <strong>Exact algorithm:</strong> {focus.algorithm}. {strategyInfo(focus.strategy).caveat}
          </p>
          {scopeResult ? (
            <ScopeDetail
              dataset={dataset}
              candidate={focus}
              scope={scope}
              result={scopeResult}
              selectedSampleId={selectedSampleId}
              onSelectSample={onSelectSample}
            />
          ) : (
            <p className="n4mm-note">No held-out test set was declared or constructed for this run.</p>
          )}
          {focus.trainingCurve ? <TrainingCurve curve={focus.trainingCurve} /> : null}
          {focus.diagnostics && focus.diagnostics.length > 0 ? (
            <dl className="n4mm-facts n4mm-facts--inline">
              {focus.diagnostics.map((entry) => (
                <div key={entry.label}>
                  <dt>{entry.label}</dt>
                  <dd>{entry.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}

      <details className="n4mm-details">
        <summary>Provenance of this run</summary>
        <dl className="n4mm-facts">
          <div>
            <dt>Data fingerprint</dt>
            <dd className="n4mm-mono">{results.dataFingerprint}</dd>
          </div>
          <div>
            <dt>Configuration fingerprint</dt>
            <dd className="n4mm-mono">{results.configFingerprint}</dd>
          </div>
          <div>
            <dt>Folds fingerprint</dt>
            <dd className="n4mm-mono">{results.foldsFingerprint}</dd>
          </div>
          <div>
            <dt>Protocol</dt>
            <dd>
              seed <span className="n4mm-mono">{results.validation.seed}</span>, {results.validation.outerFolds} outer ×{" "}
              {results.validation.innerFolds} inner folds
              {results.validation.holdoutFraction !== null ? `, held-out fraction ${results.validation.holdoutFraction}` : ", declared held-out"}
            </dd>
          </div>
          <div>
            <dt>Total time</dt>
            <dd>{formatDuration(results.elapsedMs)}</dd>
          </div>
          {Object.entries(results.ownerVersions).map(([owner, version]) => (
            <div key={owner}>
              <dt>{owner}</dt>
              <dd className="n4mm-mono">{version}</dd>
            </div>
          ))}
          {results.candidates.map((candidate) => (
            <div key={candidate.candidateId}>
              <dt>{candidateLabel(candidate, dataset)} recipe</dt>
              <dd className="n4mm-mono">
                {candidate.recipeFingerprint} · folds {shortFingerprint(candidate.foldsFingerprint)} · hyper-parameters{" "}
                {candidate.hyperparameters}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

function ScopeCells({ scope }: { scope: MultimodalScopeResult | null }) {
  if (!scope) {
    return (
      <>
        <td className="n4mm-num n4mm-muted" colSpan={4}>
          no held-out set
        </td>
      </>
    );
  }
  return (
    <>
      <td className="n4mm-num">{scope.n}</td>
      <td className="n4mm-num">{formatMetric(scope.rmse)}</td>
      <td className="n4mm-num">{formatMetric(scope.mae)}</td>
      <td className="n4mm-num" title={scope.r2 === null ? "Undefined for this scope" : undefined}>
        {formatMetric(scope.r2)}
      </td>
    </>
  );
}

/** Supplied RMSE per recipe in run order: bar = out-of-fold, diamond = held-out. */
function MetricBars({ dataset, candidates }: { dataset: MultimodalDataset; candidates: readonly MultimodalCandidateResult[] }) {
  const descriptionId = useId();
  const values = candidates.flatMap((candidate) => [candidate.oof.rmse, candidate.holdout?.rmse ?? Number.NaN]).filter(Number.isFinite);
  if (candidates.length === 0 || values.length === 0) return null;
  const max = Math.max(...values);
  const rowHeight = 26;
  const labelWidth = 230;
  const plotWidth = 420;
  const width = labelWidth + plotWidth + 70;
  const height = candidates.length * rowHeight + 34;
  const x = (value: number) => labelWidth + (max > 0 ? (value / max) * plotWidth : 0);
  const description = `RMSE per recipe in run order, out-of-fold as bars and held-out test as diamonds: ${candidates
    .map(
      (candidate) =>
        `${candidateLabel(candidate, dataset)} OOF ${formatMetric(candidate.oof.rmse)}${
          candidate.holdout ? `, held-out ${formatMetric(candidate.holdout.rmse)}` : ""
        }`,
    )
    .join("; ")}.`;
  return (
    <figure className="n4mm-bars">
      <svg className="n4viz" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={descriptionId}>
        <desc id={descriptionId}>{description}</desc>
        <line className="n4viz-axis" x1={labelWidth} x2={labelWidth} y1={4} y2={height - 26} />
        {candidates.map((candidate, index) => {
          const y = 8 + index * rowHeight;
          const oof = candidate.oof.rmse;
          const held = candidate.holdout?.rmse;
          return (
            <g key={candidate.candidateId}>
              <text className="n4mm-bars__label" x={labelWidth - 8} y={y + 13} textAnchor="end">
                {candidateLabel(candidate, dataset)}
              </text>
              {Number.isFinite(oof) ? (
                <rect x={labelWidth} y={y + 3} width={Math.max(0, x(oof) - labelWidth)} height={14} rx={2} fill={N4MM_COLORS.master} opacity={0.85} />
              ) : null}
              {held !== undefined && Number.isFinite(held) ? (
                <path
                  d={`M ${x(held)} ${y + 2} l 6 8 l -6 8 l -6 -8 z`}
                  fill={N4MM_COLORS.orange}
                  stroke="#7a3000"
                  strokeWidth={0.8}
                />
              ) : null}
              <text
                className="n4viz-tick"
                x={Math.max(Number.isFinite(oof) ? x(oof) : labelWidth, held !== undefined && Number.isFinite(held) ? x(held) : labelWidth) + 10}
                y={y + 14}
              >
                {formatMetric(oof)}
                {held !== undefined ? ` / ${formatMetric(held)}` : ""}
              </text>
            </g>
          );
        })}
        <text className="n4viz-axis-label" x={labelWidth} y={height - 8}>
          RMSE ({dataset.target.unit || "target units"}) · bar = out-of-fold · diamond = held-out test · axis starts at 0
        </text>
      </svg>
      <figcaption className="n4mm-caption">
        Same values as the table, in run order. Lower RMSE is better within one scope; do not compare an out-of-fold value
        with a held-out value from another recipe.
      </figcaption>
    </figure>
  );
}

function ScopeDetail({
  dataset,
  candidate,
  scope,
  result,
  selectedSampleId,
  onSelectSample,
}: {
  dataset: MultimodalDataset;
  candidate: MultimodalCandidateResult;
  scope: Scope;
  result: MultimodalScopeResult;
  selectedSampleId: string | null;
  onSelectSample: (sampleId: string | null) => void;
}) {
  const parity = useMemo<PredictionPoint[]>(
    () =>
      result.rows.map((row) =>
        row.sampleId === selectedSampleId
          ? { actual: row.observed, predicted: row.predicted, color: N4MM_COLORS.red, label: row.sampleId }
          : { actual: row.observed, predicted: row.predicted, color: N4MM_COLORS.master },
      ),
    [result.rows, selectedSampleId],
  );
  const residuals = useMemo<ResidualPoint[]>(
    () =>
      result.rows.map((row) => ({
        predicted: row.predicted,
        residual: row.residual,
        color: row.sampleId === selectedSampleId ? N4MM_COLORS.red : N4MM_COLORS.master,
      })),
    [result.rows, selectedSampleId],
  );
  const selectedRow = result.rows.find((row) => row.sampleId === selectedSampleId);
  const unit = dataset.target.unit ? ` (${dataset.target.unit})` : "";
  const scopeText = SCOPE_LABEL[scope].toLowerCase();
  const name = candidateLabel(candidate, dataset);
  const metrics = result.r2 === null ? { rmse: result.rmse } : { rmse: result.rmse, r2: result.r2 };
  return (
    <div className="n4mm-scope">
      <p className="n4mm-caption" aria-live="polite">
        {name}, {scopeText}: n = {result.n}, RMSE {formatMetric(result.rmse)}, MAE {formatMetric(result.mae)}, R²{" "}
        {formatMetric(result.r2)}.{" "}
        {selectedSampleId
          ? selectedRow
            ? `Selected sample ${selectedSampleId} (red): observed ${formatNumber(selectedRow.observed, 4)}, predicted ${formatNumber(selectedRow.predicted, 4)}, residual ${formatNumber(selectedRow.residual, 4)}${selectedRow.foldId ? `, fold ${selectedRow.foldId}` : ""}.`
            : `Selected sample ${selectedSampleId} is not in this scope.`
          : "Select a sample to highlight it."}
      </p>
      <div className="n4mm-scope__plots">
        <PredictionScatter
          points={parity}
          metrics={metrics}
          xLabel={`Observed ${dataset.target.name}${unit}`}
          yLabel={`Predicted${unit}`}
          title={`Predicted vs observed, ${scopeText}`}
          description={`${name}: ${result.n} ${scopeText} predictions against observed values; dashed line is identity.`}
          width={340}
          height={320}
        />
        <ResidualPlot
          points={residuals}
          sigmaBand={false}
          xLabel={`Predicted${unit}`}
          yLabel={`Residual (observed − predicted)${unit}`}
          title={`Residuals, ${scopeText}`}
          description={`${name}: supplied residuals of ${result.n} ${scopeText} predictions against the prediction; solid line is zero.`}
          width={440}
          height={320}
        />
      </div>
      {result.folds && result.folds.length > 0 ? (
        <table className="n4mm-table n4mm-table--compact">
          <caption>Per-fold owner scores ({scopeText})</caption>
          <thead>
            <tr>
              <th scope="col">Fold</th>
              <th scope="col" className="n4mm-num">
                n
              </th>
              <th scope="col" className="n4mm-num">
                RMSE
              </th>
              <th scope="col" className="n4mm-num">
                MAE
              </th>
              <th scope="col" className="n4mm-num">
                R²
              </th>
            </tr>
          </thead>
          <tbody>
            {result.folds.map((fold) => (
              <tr key={fold.foldId}>
                <th scope="row" className="n4mm-mono">
                  {fold.foldId}
                </th>
                <td className="n4mm-num">{fold.n}</td>
                <td className="n4mm-num">{formatMetric(fold.rmse)}</td>
                <td className="n4mm-num">{formatMetric(fold.mae)}</td>
                <td className="n4mm-num">{formatMetric(fold.r2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <details className="n4mm-details">
        <summary>
          All {result.rows.length} {scopeText} predictions
        </summary>
        <div className="n4mm-scroll n4mm-scroll--table">
          <table className="n4mm-table n4mm-table--compact">
            <thead>
              <tr>
                <th scope="col">Sample</th>
                <th scope="col" className="n4mm-num">
                  Observed
                </th>
                <th scope="col" className="n4mm-num">
                  Predicted
                </th>
                <th scope="col" className="n4mm-num">
                  Residual
                </th>
                <th scope="col">Fold</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => {
                const selected = row.sampleId === selectedSampleId;
                return (
                  <tr key={row.sampleId} data-selected={selected || undefined}>
                    <th scope="row">
                      <button
                        type="button"
                        className="n4mm-rowbutton"
                        aria-pressed={selected}
                        onClick={() => onSelectSample(selected ? null : row.sampleId)}
                      >
                        {row.sampleId}
                      </button>
                    </th>
                    <td className="n4mm-num">{formatNumber(row.observed, 5)}</td>
                    <td className="n4mm-num">{formatNumber(row.predicted, 5)}</td>
                    <td className="n4mm-num">{formatNumber(row.residual, 5)}</td>
                    <td className="n4mm-mono">{row.foldId ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function TrainingCurve({ curve }: { curve: NonNullable<MultimodalCandidateResult["trainingCurve"]> }) {
  const first = curve.loss[0];
  const last = curve.loss[curve.loss.length - 1];
  const caption = `${curve.label}: owner-reported training loss over ${curve.epochs.length} epochs${
    first !== undefined && last !== undefined ? `, from ${formatNumber(first, 4)} to ${formatNumber(last, 4)}` : ""
  }. Training samples only; no held-out data is used to stop training.`;
  return (
    <figure className="n4mm-view">
      <SpectraPlot
        wavelengths={curve.epochs}
        series={[{ id: "loss", values: curve.loss, color: N4MM_COLORS.master, opacity: 1, label: "loss" }]}
        unit="epoch"
        xLabel="Epoch"
        yLabel="Training loss"
        title={curve.label}
        description={caption}
        width={560}
        height={200}
      />
      <figcaption className="n4mm-caption">{caption}</figcaption>
    </figure>
  );
}

export interface ExportPanelProps {
  hasConfig: boolean;
  hasResults: boolean;
  onExportConfig: () => void;
  onExportResults: () => void;
}

/** Local downloads of the configuration and of the current results with provenance. */
export function ExportPanel({ hasConfig, hasResults, onExportConfig, onExportResults }: ExportPanelProps) {
  return (
    <div className="n4mm-export">
      <button type="button" className="n4mm-button" data-variant="quiet" disabled={!hasConfig} onClick={onExportConfig}>
        Download configuration (JSON)
      </button>
      <button type="button" className="n4mm-button" data-variant="quiet" disabled={!hasResults} onClick={onExportResults}>
        Download results (JSON)
      </button>
      <span className="n4mm-note">
        {hasResults
          ? "Results include every prediction row, owner scores, fingerprints and versions."
          : "Results become downloadable after a completed run."}{" "}
        Files are created in this browser; nothing is uploaded. These files document the experiment; they are not an
        executable .n4a model.
      </span>
    </div>
  );
}
