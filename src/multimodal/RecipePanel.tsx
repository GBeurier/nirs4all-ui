import { useMemo } from "react";
import { DagGraphView } from "../dag/DagGraphView.js";
import {
  FUSION_LEVEL_LABEL,
  MULTIMODAL_STEP_CATALOG,
  MULTIMODAL_STRATEGIES,
  candidateKey,
  findStepOption,
  makeCandidate,
  representationLabel,
  sourceTag,
  stepOptionsFor,
  strategyInfo,
} from "./catalog.js";
import { NumberField } from "./fields.js";
import { describeRecipe } from "./recipeGraph.js";
import type {
  MultimodalBaseModel,
  MultimodalCandidate,
  MultimodalCnnParams,
  MultimodalConfig,
  MultimodalParamValue,
  MultimodalSource,
  MultimodalSourceChain,
  MultimodalStep,
  MultimodalStepOption,
  MultimodalStepParamSpec,
  MultimodalStrategyId,
} from "./types.js";

// ---------------------------------------------------------------------------
// Source selection + per-source preprocessing
// ---------------------------------------------------------------------------

export interface SourceChainEditorProps {
  sources: readonly MultimodalSource[];
  config: MultimodalConfig;
  onConfigChange: (next: MultimodalConfig) => void;
  catalog?: readonly MultimodalStepOption[];
  disabled?: boolean;
}

function chainOf(config: MultimodalConfig, sourceId: string): MultimodalSourceChain {
  return config.sourceChains.find((chain) => chain.sourceId === sourceId) ?? { sourceId, steps: [] };
}

function withChain(config: MultimodalConfig, chain: MultimodalSourceChain): MultimodalConfig {
  const exists = config.sourceChains.some((candidate) => candidate.sourceId === chain.sourceId);
  return {
    ...config,
    sourceChains: exists
      ? config.sourceChains.map((candidate) => (candidate.sourceId === chain.sourceId ? chain : candidate))
      : [...config.sourceChains, chain],
  };
}

function defaultParams(option: MultimodalStepOption): Record<string, MultimodalParamValue> {
  const params: Record<string, MultimodalParamValue> = {};
  for (const spec of option.params) params[spec.name] = spec.default;
  return params;
}

/** Choose the sources of the experiment, the one-source baseline and each source's own preprocessing chain. */
export function SourceChainEditor({
  sources,
  config,
  onConfigChange,
  catalog = MULTIMODAL_STEP_CATALOG,
  disabled,
}: SourceChainEditorProps) {
  const toggleSource = (sourceId: string, include: boolean) => {
    const selected = new Set(config.sourceIds);
    if (include) selected.add(sourceId);
    else selected.delete(sourceId);
    const sourceIds = sources.map((source) => source.id).filter((id) => selected.has(id));
    if (sourceIds.length === 0) return;
    const singleSourceId = sourceIds.includes(config.singleSourceId) ? config.singleSourceId : (sourceIds[0] as string);
    onConfigChange({ ...config, sourceIds, singleSourceId });
  };

  return (
    <div className="n4mm-chains">
      <p className="n4mm-note">
        Each source keeps its own preprocessing, applied before any merge. Per-sample operations have no fitted state;
        train-fitted operations learn their statistics inside every training fold and are replayed unchanged on the
        validation and test samples.
      </p>
      {sources.map((source, index) => {
        const included = config.sourceIds.includes(source.id);
        const chain = chainOf(config, source.id);
        const options = stepOptionsFor(source.representation, catalog);
        const update = (steps: readonly MultimodalStep[]) => onConfigChange(withChain(config, { sourceId: source.id, steps }));
        return (
          <fieldset key={source.id} className="n4mm-chain" disabled={disabled} data-excluded={!included || undefined}>
            <legend className="n4mm-chain__legend">
              <span className="n4mm-tag" data-source={index % 6}>
                {sourceTag(index)}
              </span>
              {source.label}
              <span className="n4mm-muted"> · {representationLabel(source.representation)}</span>
            </legend>
            <div className="n4mm-chain__toggles">
              <label className="n4mm-check">
                <input
                  type="checkbox"
                  checked={included}
                  disabled={included && config.sourceIds.length === 1}
                  onChange={(event) => toggleSource(source.id, event.currentTarget.checked)}
                />
                Use in fusion recipes
              </label>
              <label className="n4mm-check">
                <input
                  type="radio"
                  name="n4mm-single-source"
                  checked={config.singleSourceId === source.id}
                  disabled={!included}
                  onChange={() => onConfigChange({ ...config, singleSourceId: source.id })}
                />
                Baseline source for “{strategyInfo("single").name}” recipe view
              </label>
            </div>
            {chain.steps.length === 0 ? (
              <p className="n4mm-note">No preprocessing: the source enters the model as supplied.</p>
            ) : (
              <ol className="n4mm-steps">
                {chain.steps.map((step, stepIndex) => (
                  <StepEditor
                    key={`${step.methodId}-${stepIndex}`}
                    step={step}
                    option={findStepOption(step.methodId, catalog)}
                    position={stepIndex}
                    count={chain.steps.length}
                    onChange={(next) => update(chain.steps.map((candidate, i) => (i === stepIndex ? next : candidate)))}
                    onRemove={() => update(chain.steps.filter((_, i) => i !== stepIndex))}
                    onMove={(delta) => {
                      const target = stepIndex + delta;
                      if (target < 0 || target >= chain.steps.length) return;
                      const steps = [...chain.steps];
                      const [moved] = steps.splice(stepIndex, 1);
                      if (moved) steps.splice(target, 0, moved);
                      update(steps);
                    }}
                  />
                ))}
              </ol>
            )}
            {options.length > 0 ? (
              <label className="n4mm-field n4mm-field--inline">
                <span className="n4mm-field__label">Add step</span>
                <select
                  value=""
                  onChange={(event) => {
                    const option = findStepOption(event.currentTarget.value, catalog);
                    if (option) update([...chain.steps, { methodId: option.methodId, params: defaultParams(option) }]);
                  }}
                >
                  <option value="">Choose an operation…</option>
                  {options.map((option) => (
                    <option key={option.methodId} value={option.methodId}>
                      {option.label} ({option.fitScope === "train-fitted" ? "train-fitted" : "per sample"})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="n4mm-note">No preprocessing operation is offered for this representation.</p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

function StepEditor({
  step,
  option,
  position,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  step: MultimodalStep;
  option: MultimodalStepOption | undefined;
  position: number;
  count: number;
  onChange: (next: MultimodalStep) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const setParam = (name: string, value: MultimodalParamValue) => onChange({ ...step, params: { ...step.params, [name]: value } });
  const label = option?.label ?? step.methodId;
  return (
    <li className="n4mm-step">
      <div className="n4mm-step__head">
        <span className="n4mm-step__name">
          {position + 1}. {label}
        </span>
        <span className="n4mm-badge" data-tone={option?.fitScope === "train-fitted" ? "fitted" : undefined}>
          {option?.fitScope === "train-fitted" ? "fitted on training scope" : "per sample"}
        </span>
        <span className="n4mm-mono n4mm-muted">{step.methodId}</span>
        <span className="n4mm-step__actions">
          <button type="button" className="n4mm-icon" onClick={() => onMove(-1)} disabled={position === 0} aria-label={`Move ${label} up`}>
            ↑
          </button>
          <button
            type="button"
            className="n4mm-icon"
            onClick={() => onMove(1)}
            disabled={position === count - 1}
            aria-label={`Move ${label} down`}
          >
            ↓
          </button>
          <button type="button" className="n4mm-icon" onClick={onRemove} aria-label={`Remove ${label}`}>
            ×
          </button>
        </span>
      </div>
      {option?.description ? <p className="n4mm-step__text">{option.description}</p> : null}
      {option && option.params.length > 0 ? (
        <div className="n4mm-step__params">
          {option.params.map((spec) => (
            <ParamField key={spec.name} spec={spec} value={step.params[spec.name] ?? spec.default} onChange={(value) => setParam(spec.name, value)} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

function ParamField({
  spec,
  value,
  onChange,
}: {
  spec: MultimodalStepParamSpec;
  value: MultimodalParamValue;
  onChange: (value: MultimodalParamValue) => void;
}) {
  if (spec.kind === "bool") {
    return (
      <label className="n4mm-check">
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.currentTarget.checked)} />
        {spec.label}
      </label>
    );
  }
  if (spec.kind === "enum") {
    return (
      <label className="n4mm-field">
        <span className="n4mm-field__label">{spec.label}</span>
        <select value={String(value)} onChange={(event) => onChange(event.currentTarget.value)}>
          {(spec.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <NumberField
      label={spec.label}
      value={typeof value === "number" ? value : Number(value)}
      integer={spec.kind === "int"}
      {...(spec.min !== undefined ? { min: spec.min } : {})}
      {...(spec.max !== undefined ? { max: spec.max } : {})}
      {...(spec.step !== undefined ? { step: spec.step } : {})}
      onCommit={onChange}
    />
  );
}

// ---------------------------------------------------------------------------
// Strategies, comparison batch and recipe graph
// ---------------------------------------------------------------------------

const STRATEGY_ORDER: readonly MultimodalStrategyId[] = MULTIMODAL_STRATEGIES.map((info) => info.id);

/** Canonical order: baselines in source order, then strategies in teaching order. */
export function orderCandidates(
  candidates: readonly MultimodalCandidate[],
  sourceIds: readonly string[],
): MultimodalCandidate[] {
  const rank = (candidate: MultimodalCandidate): number =>
    candidate.strategy === "single"
      ? sourceIds.indexOf(candidate.singleSourceId ?? "")
      : sourceIds.length + STRATEGY_ORDER.indexOf(candidate.strategy);
  const unique = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return [...unique.values()].sort((a, b) => rank(a) - rank(b));
}

export interface StrategyPanelProps {
  sources: readonly MultimodalSource[];
  config: MultimodalConfig;
  onConfigChange: (next: MultimodalConfig) => void;
  candidates: readonly MultimodalCandidate[];
  onCandidatesChange: (next: readonly MultimodalCandidate[]) => void;
  catalog?: readonly MultimodalStepOption[];
  disabled?: boolean;
}

/** Strategy table (explain one, include several in the comparison) plus the selected recipe's branch/merge view. */
export function StrategyPanel({
  sources,
  config,
  onConfigChange,
  candidates,
  onCandidatesChange,
  catalog,
  disabled,
}: StrategyPanelProps) {
  const included = new Set(candidates.map((candidate) => candidate.id));
  const selectedSources = sources.filter((source) => config.sourceIds.includes(source.id));
  const tagOf = new Map(sources.map((source, index) => [source.id, sourceTag(index)]));
  const toggle = (candidate: MultimodalCandidate, on: boolean) => {
    const next = on ? [...candidates, candidate] : candidates.filter((existing) => existing.id !== candidate.id);
    onCandidatesChange(orderCandidates(next, config.sourceIds));
  };
  const focused = strategyInfo(config.strategy);
  const multiSource = config.sourceIds.length > 1;

  return (
    <div className="n4mm-strategies">
      <div className="n4mm-scroll">
        <table className="n4mm-table n4mm-strategy-table">
          <caption>
            Choose the recipe to explain, and tick every recipe to include in one comparison run. All included recipes share
            the same sources, preprocessing, samples and folds.
          </caption>
          <thead>
            <tr>
              <th scope="col">Explain</th>
              <th scope="col">Include in run</th>
              <th scope="col">Recipe</th>
              <th scope="col">Fusion level</th>
              <th scope="col">What is learned</th>
            </tr>
          </thead>
          <tbody>
            {MULTIMODAL_STRATEGIES.map((info) => {
              const needsSeveral = info.id !== "single" && !multiSource;
              return (
                <tr key={info.id} data-focused={info.id === config.strategy || undefined}>
                  <td>
                    <input
                      type="radio"
                      name="n4mm-strategy"
                      aria-label={`Explain ${info.name}`}
                      checked={info.id === config.strategy}
                      disabled={disabled}
                      onChange={() => onConfigChange({ ...config, strategy: info.id })}
                    />
                  </td>
                  <td>
                    {info.id === "single" ? (
                      <span className="n4mm-checks">
                        {selectedSources.map((source) => {
                          const candidate = makeCandidate("single", source.id);
                          return (
                            <label key={source.id} className="n4mm-check">
                              <input
                                type="checkbox"
                                checked={included.has(candidate.id)}
                                disabled={disabled}
                                onChange={(event) => toggle(candidate, event.currentTarget.checked)}
                              />
                              {tagOf.get(source.id)} <span className="n4mm-sr-only">{source.label} baseline</span>
                            </label>
                          );
                        })}
                      </span>
                    ) : (
                      <label className="n4mm-check">
                        <input
                          type="checkbox"
                          checked={included.has(candidateKey(info.id))}
                          disabled={disabled || needsSeveral}
                          onChange={(event) => toggle(makeCandidate(info.id), event.currentTarget.checked)}
                        />
                        <span className="n4mm-sr-only">Include {info.name}</span>
                        {needsSeveral ? <span className="n4mm-muted">needs ≥ 2 sources</span> : null}
                      </label>
                    )}
                  </td>
                  <th scope="row">
                    <span className="n4mm-strategy__name">{info.name}</span>
                    <span className="n4mm-strategy__summary">{info.summary}</span>
                  </th>
                  <td>{FUSION_LEVEL_LABEL[info.level]}</td>
                  <td>{info.learned}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="n4mm-recipe">
        <div className="n4mm-recipe__text">
          <h3 className="n4mm-subtitle">{focused.name}</h3>
          <p>{focused.explanation}</p>
          <p className="n4mm-caveat">
            <strong>Read carefully:</strong> {focused.caveat}
          </p>
        </div>
        <RecipeGraph
          strategy={config.strategy}
          config={config}
          sources={sources}
          {...(catalog ? { catalog } : {})}
        />
      </div>
    </div>
  );
}

export interface RecipeGraphProps {
  strategy: MultimodalStrategyId;
  config: MultimodalConfig;
  sources: readonly MultimodalSource[];
  catalog?: readonly MultimodalStepOption[];
  singleSourceId?: string;
}

/** Branch-and-merge flow of a recipe (shared `dag` viewer) with the same recipe as a text outline. */
export function RecipeGraph({ strategy, config, sources, catalog, singleSourceId }: RecipeGraphProps) {
  const recipe = useMemo(
    () => describeRecipe(strategy, config, sources, catalog, singleSourceId),
    [strategy, config, sources, catalog, singleSourceId],
  );
  const hasOof = recipe.graph.edges.some((edge) => edge.oof);
  return (
    <figure className="n4mm-graph">
      {/* The viewer has a fixed pixel viewport (pan/zoom map pointer pixels 1:1),
          so narrow screens scroll it horizontally inside this region. */}
      <div
        className="n4mm-scroll n4mm-graph__scroll"
        role="region"
        aria-label={`Branch and merge diagram, scroll horizontally on narrow screens: ${strategyInfo(strategy).name}`}
        tabIndex={0}
      >
        <DagGraphView
          key={`${strategy}:${config.sourceIds.join(",")}`}
          graph={recipe.graph}
          direction="LR"
          width={920}
          height={340}
          showMinimap={false}
          showInspector={false}
          showShapes={false}
          title={`Branch and merge view: ${strategyInfo(strategy).name}`}
        />
      </div>
      <figcaption className="n4mm-caption">
        Sources on the left flow through their own preprocessing to models and merges on the right.
        {hasOof ? " Emphasised edges carry nested out-of-fold predictions." : ""} The same recipe as text:
      </figcaption>
      <ol className="n4mm-outline">
        {recipe.lines.map((line, index) => (
          <li key={index} data-depth={line.depth}>
            {line.text}
          </li>
        ))}
      </ol>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Fixed model settings
// ---------------------------------------------------------------------------

export interface ModelSettingsProps {
  config: MultimodalConfig;
  onConfigChange: (next: MultimodalConfig) => void;
  disabled?: boolean;
}

const CNN_FIELDS: ReadonlyArray<{ key: keyof MultimodalCnnParams; label: string; integer: boolean; min: number; max?: number }> = [
  { key: "filters", label: "Filters per branch", integer: true, min: 1, max: 64 },
  { key: "kernel_size", label: "Kernel size", integer: true, min: 1, max: 31 },
  { key: "embedding_dim", label: "Embedding size", integer: true, min: 1, max: 64 },
  { key: "head_hidden", label: "Head hidden units", integer: true, min: 1, max: 128 },
  { key: "epochs", label: "Epochs (fixed)", integer: true, min: 1, max: 500 },
  { key: "batch_size", label: "Batch size", integer: true, min: 1, max: 256 },
  { key: "learning_rate", label: "Learning rate", integer: false, min: 0 },
  { key: "weight_decay", label: "Weight decay", integer: false, min: 0 },
];

/** Hyper-parameters fixed a priori for every recipe in the comparison. */
export function ModelSettings({ config, onConfigChange, disabled }: ModelSettingsProps) {
  const toggleBase = (model: MultimodalBaseModel, on: boolean) => {
    const set = new Set(config.baseModels);
    if (on) set.add(model);
    else set.delete(model);
    const baseModels = (["pls", "ridge"] as const).filter((candidate) => set.has(candidate));
    if (baseModels.length === 0) return;
    onConfigChange({ ...config, baseModels });
  };
  return (
    <fieldset className="n4mm-settings" disabled={disabled}>
      <legend className="n4mm-sr-only">Fixed model settings</legend>
      <p className="n4mm-note">
        These settings are fixed before running and are not tuned. Changing them after looking at the out-of-fold results
        is exploration, not an unbiased model-selection procedure.
      </p>
      <div className="n4mm-settings__grid">
        <div className="n4mm-settings__group">
          <h4 className="n4mm-subtitle">Linear models</h4>
          <NumberField
            label="PLS components"
            value={config.nComponents}
            integer
            min={1}
            max={50}
            onCommit={(nComponents) => onConfigChange({ ...config, nComponents })}
            hint="Used by PLS, early fusion, multiblock PLS and PLS base models."
          />
          <NumberField
            label="Ridge alpha"
            value={config.ridgeAlpha}
            min={0}
            onCommit={(ridgeAlpha) => onConfigChange({ ...config, ridgeAlpha })}
            hint="Ridge base models and every meta-learner."
          />
          <label className="n4mm-check">
            <input
              type="checkbox"
              checked={config.blockScaling}
              onChange={(event) => onConfigChange({ ...config, blockScaling: event.currentTarget.checked })}
            />
            Train-fitted block RMS scaling (appended to every source chain)
          </label>
          <div className="n4mm-checks" role="group" aria-label="Base models per source in stacks">
            <span className="n4mm-field__label">Base models per source (stacks)</span>
            {(["pls", "ridge"] as const).map((model) => (
              <label key={model} className="n4mm-check">
                <input
                  type="checkbox"
                  checked={config.baseModels.includes(model)}
                  disabled={config.baseModels.length === 1 && config.baseModels.includes(model)}
                  onChange={(event) => toggleBase(model, event.currentTarget.checked)}
                />
                {model === "pls" ? "PLS" : "Ridge"}
              </label>
            ))}
          </div>
        </div>
        <div className="n4mm-settings__group">
          <h4 className="n4mm-subtitle">Trained multibranch network</h4>
          <div className="n4mm-settings__cnn">
            {CNN_FIELDS.map((field) => (
              <NumberField
                key={field.key}
                label={field.label}
                value={config.cnn[field.key]}
                integer={field.integer}
                min={field.min}
                {...(field.max !== undefined ? { max: field.max } : {})}
                onCommit={(value) => onConfigChange({ ...config, cnn: { ...config.cnn, [field.key]: value } })}
              />
            ))}
          </div>
          <p className="n4mm-note">
            Native <span className="n4mm-mono">models.neural.multibranch_regressor</span>: branches and head are trained
            jointly by backpropagation for the fixed number of epochs, without early stopping on held-out data. The seed
            comes from the validation protocol.
          </p>
        </div>
      </div>
    </fieldset>
  );
}
